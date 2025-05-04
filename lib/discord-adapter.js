import {
  Client,
  Events,
  GatewayIntentBits,
  AttachmentBuilder,
  SlashCommandBuilder
} from './discord/index.js'; // NEW: Correct path
import debug from 'debug';
import fs from 'fs/promises'; // <-- Add fs import
import path from 'path'; // <-- Add path import
import { coreService } from './core.js'; // Import core service
import { splitMessage } from './utils.js'; // Import utility for splitting messages
import config from './config.js'; // Import the new config

const log = debug('vibemob:discord');
const logError = debug('vibemob:discord:error');
logError.log = console.error.bind(console);
const logVerbose = debug('vibemob:discord:verbose'); // Added for more detailed flow logging

// --- Global variable for logging channel ---
let loggingChannel = null;
// --- END ---

// Environment Variables --> Use config now
const BOT_TOKEN = config.discordBotToken;
if (!BOT_TOKEN) {
  // Use console.error directly as logger might not be fully initialized
  console.error('FATAL: DISCORD_BOT_TOKEN is missing or empty in config. Cannot start.'); 
  // logError('FATAL: DISCORD_BOT_TOKEN is not set in the environment or .env file.');
  process.exit(1); // Exit if token is missing
}

// Environment Variables for Interaction Logic --> Use config now
// const BOT_USER_ID = config.discordBotUserId; // REMOVE this top-level constant
const ALLOWED_GUILD_ID = config.discordGuildId; // Make sure this exists in config.js/env
const REQUIRED_ROLE_ID = config.discordRoleId; // Make sure this exists in config.js/env

// Constants for Discord Adapter
const THREAD_AUTO_ARCHIVE_DURATION = 60; // Minutes
const THREAD_NAME_PREFIX = 'Aider task for';

// Check if BOT User ID is configured during startup for early warning
// if (!config.discordBotUserId) { // REMOVE this check, no longer needed for mentions
//   logError('WARN: config.discordBotUserId is not set. Mention detection will likely fail.');
// }

// Create a new client instance
// Need Guilds and GuildMessages intents to receive messages in guilds
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent, // Required to read message content
    // Add other intents as needed later (e.g., DirectMessages)
  ]
});

// When the client is ready, run this code (only once)
// We use 'c' for the event parameter to keep it separate from the already defined 'client'
client.once(Events.ClientReady, async c => {
  log(`Ready! Logged in as ${c.user.tag}`);
  // TODO: Potentially add logic here to ensure coreService is initialized

  // --- NEW: Fetch logging channel ---
  const loggingChannelId = config.discordLoggingChannelId;
  if (loggingChannelId) {
    try {
      loggingChannel = await c.channels.fetch(loggingChannelId);
      if (loggingChannel && (loggingChannel.isTextBased() || loggingChannel.isThread())) { // Check if channel is text-based
        log(`Successfully fetched logging channel: #${loggingChannel.name} (${loggingChannel.id})`);
        // Send a startup message using the new sendLog function
        await sendLog('info', `Bot restarted and logging initialized.`);
      } else {
        logError(`Could not find logging channel with ID: ${loggingChannelId}, or it's not a text channel.`);
        loggingChannel = null; // Ensure it's null if not found or wrong type
      }
    } catch (err) {
      logError(`Error fetching logging channel (${loggingChannelId}):`, err);
      loggingChannel = null; // Ensure it's null if fetch failed
    }
  } else {
    log('No LOGGING_CHANNEL_ID configured.');
  }
  // --- END NEW ---
});

// --- Helper Functions ---

/**
 * Splits text, extracts diffs, and sends the response to a Discord channel/thread.
 * @param {TextChannel | ThreadChannel} channel - The channel/thread to send to.
 * @param {string} coreResponse - The raw response string from coreService.
 * @param {string} userId - The user ID for logging purposes.
 */
async function _relayCoreResponse(channel, coreResponse, userId) {
  log(`Relaying core response (length ${coreResponse?.length}) to channel ${channel.id} for user ${userId}`);
  if (!coreResponse || coreResponse.trim().length === 0) {
    logWarn(`Received empty core response for user ${userId}, sending notification.`); // Renamed logWarn
    await channel.send("Received empty response from core service.");
    return;
  }

  try {
    const diffRegex = /([\s\S]*?)^<<<<<<< SEARCH[\s\S]*?=======[\s\S]*?>>>>>>> REPLACE\s*$/gm;
    let lastIndex = 0;
    let match;
    let normalContent = '';
    const filesToSend = [];

    // Extract diff blocks and prepare attachments
    while ((match = diffRegex.exec(coreResponse)) !== null) {
      normalContent += coreResponse.substring(lastIndex, match.index); // Add text before diff
      const precedingText = coreResponse.substring(0, match.index);
      const linesBeforeDiff = precedingText.split('\n').filter(line => line.trim() !== '');
      // Try to guess filename from the line before the diff marker
      const fileNameGuess = linesBeforeDiff.length > 0 ? linesBeforeDiff[linesBeforeDiff.length - 1].trim() : 'aider_change.diff';
      const safeFileName = fileNameGuess.replace(/[^a-zA-Z0-9_.-]/g, '_') || 'aider_change.diff';
      const diffFileName = safeFileName.endsWith('.diff') ? safeFileName : `${safeFileName}.diff`;
      
      log(`Detected diff block, extracting as ${diffFileName}`);
      const diffContent = match[0].substring(match.index); // Extract only the diff part
      logVerbose(`Extracted diff content (first 100 chars): ${diffContent.substring(0, 100)}...`); // Added verbose log
      const diffBuffer = Buffer.from(diffContent, 'utf-8');
      filesToSend.push(new AttachmentBuilder(diffBuffer, { name: diffFileName }));
      lastIndex = diffRegex.lastIndex;
    }
    normalContent += coreResponse.substring(lastIndex); // Add any remaining text

    // Send normal text content (split if needed)
    if (normalContent.trim().length > 0) {
      const messageChunks = splitMessage(normalContent.trim());
      log(`Sending ${messageChunks.length} text chunk(s) to channel ${channel.id}`);
      for (const chunk of messageChunks) {
        logVerbose(`Sending chunk (length ${chunk.length}): ${chunk.substring(0, 100)}...`); // Added verbose log
        await channel.send(chunk);
      }
    } else {
        log(`No normal text content found besides diffs for channel ${channel.id}`);
    }

    // Send file attachments (batched)
    if (filesToSend.length > 0) {
      log(`Sending ${filesToSend.length} diff file(s) to channel ${channel.id}`);
      // Discord allows up to 10 attachments per message
      for (let i = 0; i < filesToSend.length; i += 10) {
        const fileBatch = filesToSend.slice(i, i + 10);
        logVerbose(`Sending batch of ${fileBatch.length} files.`); // Added verbose log
        await channel.send({ files: fileBatch });
      }
    }
  } catch (error) {
    await sendLog('error', `Error relaying core response to channel ${channel.id} for user ${userId}`, error);
    // Attempt to send an error message back to the channel
    try {
        await channel.send(`Sorry, I encountered an error trying to display the response: ${error.message}`);
    } catch (sendError) {
        await sendLog('error', `Failed to send relay error message back to original channel ${channel.id}`, sendError);
    }
  }
}

/**
 * Handles messages received within a bot-managed thread.
 * @param {Message} message - The Discord message object.
 */
async function _handleThreadMessage(message) {
  const thread = message.channel;
  log(`Received message in thread ${thread.id} from ${message.author.tag}`);
  const userId = message.author.id;
  const followUpPrompt = message.content;
  logVerbose(`Thread message content: "${followUpPrompt}"`); // Added verbose log

  try {
    await thread.sendTyping();
    logVerbose(`Calling coreService.handleIncomingMessage for thread message user ${userId}`); // Added verbose log
    const coreResponse = await coreService.handleIncomingMessage({
      message: followUpPrompt,
      userId: userId,
    });
    logVerbose(`Received core response for thread message user ${userId}, relaying...`); // Added verbose log
    await _relayCoreResponse(thread, coreResponse, userId);
  } catch (coreError) {
    await sendLog('error', `Error processing follow-up message via coreService for user ${userId} in thread ${thread.id}`, coreError);
    await thread.send(`Sorry, I encountered an error processing your message: ${coreError.message}`);
  }
}

/**
 * Handles the initial mention of the bot, checks permissions, creates a thread,
 * and sends the initial prompt to the core service.
 * @param {Message} message - The Discord message object.
 */
async function _handleInitialMention(message) {
    log(`Mention detected from ${message.author.tag}. Validating and processing...`);
    
    // 1. Optional: Guild Check
    if (ALLOWED_GUILD_ID && message.guildId !== ALLOWED_GUILD_ID) {
        log(`Ignoring message from user ${message.author.tag} in guild ${message.guildId} (not allowed).`);
        // await message.reply('Sorry, I can only be used in the designated guild.'); // Optional reply
        return;
    }
    logVerbose(`Guild check passed (Guild ID: ${message.guildId}).`); // Added verbose log

    // 2. Optional: Role Check
    if (REQUIRED_ROLE_ID) {
        logVerbose(`Checking for required role ID: ${REQUIRED_ROLE_ID}`); // Added verbose log
        let member;
        try {
            member = message.member ?? await message.guild?.members.fetch(message.author.id);
            if (!member) {
                await sendLog('error', `Could not fetch member object for user ${message.author.tag} (${message.author.id})`);
                await message.reply('Sorry, I had trouble verifying your roles.');
                return;
            }
            logVerbose(`Fetched member ${member.user.tag}. Roles: [${Array.from(member.roles.cache.keys()).join(', ')}]`); // Added verbose log
            if (!member.roles.cache.has(REQUIRED_ROLE_ID)) {
                log(`Ignoring message from user ${message.author.tag} (missing required role ${REQUIRED_ROLE_ID}).`);
                // await message.reply('Sorry, you do not have the required role to use me.'); // Optional reply
                return;
            }
            logVerbose(`Role check passed for user ${message.author.tag}.`); // Added verbose log
        } catch (err) {
            await sendLog('error', `Failed to fetch member for role check for user ${message.author.tag}`, err);
            await message.reply('Sorry, I encountered an error checking your permissions.');
            return;
        }
    }
    
    // 3. Create Thread
    let thread;
    try {
        const threadName = `${THREAD_NAME_PREFIX} ${message.author.username}`.substring(0, 100);
        thread = await message.startThread({
            name: threadName,
            autoArchiveDuration: THREAD_AUTO_ARCHIVE_DURATION, 
        });
        log(`Created thread: ${thread.name} (${thread.id})`);
    } catch (threadError) {
        await sendLog('error', `Failed to create thread for message ${message.id} from user ${message.author.tag}`, threadError);
        await message.reply(`Sorry, I couldn't create a thread for our conversation.`);
        return;
    }

    // 4. Process Initial Prompt & Relay Response
    try {
        // Extract prompt by removing the first mention found (more robust)
        const botMention = message.mentions.users.find(user => user.id === client.user.id);
        const initialPrompt = botMention ? message.content.replace(`<@${botMention.id}>`, '').replace(`<@!${botMention.id}>`, '').trim() : message.content.trim();
        logVerbose(`Extracted initial prompt: "${initialPrompt}"`); // Added verbose log
        await thread.send(`Okay, ${message.author.username}, I'll work on that. Starting with prompt: \"${initialPrompt}\"`);
        await thread.sendTyping();
        
        logVerbose(`Calling coreService.handleIncomingMessage for initial mention user ${message.author.id}`); // Added verbose log
        const coreResponse = await coreService.handleIncomingMessage({
            message: initialPrompt,
            userId: message.author.id,
        });
        
        logVerbose(`Received core response for initial mention user ${message.author.id}, relaying...`); // Added verbose log
        await _relayCoreResponse(thread, coreResponse, message.author.id);

    } catch (coreError) {
        await sendLog('error', `Error processing initial prompt for user ${message.author.id} in thread ${thread?.id}`, coreError);
        await thread.send(`Sorry, I encountered an error processing your initial request: ${coreError.message}`);
    }
}

// --- Main Event Listeners ---

// Listen for messages
client.on(Events.MessageCreate, async message => {
  logVerbose(`Received message event: ID=${message.id}, Author=${message.author.tag}, Bot=${message.author.bot}, Guild=${message.guildId}, Channel=${message.channelId}, Content (start): "${message.content?.substring(0, 50)}..."`);

  // Ignore bots
  if (message.author.bot) {
    logVerbose(`Ignoring message ID ${message.id}: from bot ${message.author.tag}.`);
    return;
  }
  // Ignore messages not in guilds (e.g., DMs) for now
  if (!message.guild) { 
    logVerbose(`Ignoring message ID ${message.id}: not in a guild (DM?).`);
    return; 
  }

  // --- Mention Detection Logic ---
  // Use discord.js built-in mention check
  // const currentBotId = config.discordBotUserId; // REMOVE
  let botWasMentioned = false;
  if (client.user && message.mentions.has(client.user.id)) { 
    // Check if the bot client is ready and if its ID is in the message mentions
    botWasMentioned = true;
    logVerbose(`Bot mention detected via message.mentions.has(client.user.id) for message ${message.id}`);
  }
  /* // REMOVE Regex block
  if (currentBotId) {
    const mentionRegex = new RegExp(`^<@!?${currentBotId}>\\s*`); 
    mentionMatch = message.content.match(mentionRegex);
  } else {
    logError(`Cannot check for mention, config.discordBotUserId is not set.`);
  }
  */

  // Check if the message is in a thread managed by this bot
  if (message.channel.isThread() && message.channel.name.startsWith(THREAD_NAME_PREFIX)) {
    logVerbose(`Message ID ${message.id} is in a managed thread ${message.channel.id}. Handling as thread message.`);
    await _handleThreadMessage(message);
    return; // Message handled
  } 
  // --- Check Mention AFTER Thread Check ---
  else if (botWasMentioned) { // Use the boolean flag here
    logVerbose(`Message ID ${message.id} contains bot mention. Handling as initial mention.`);
    // Pass the message object, _handleInitialMention can extract content if needed
    // It no longer needs mentionMatch specifically
    await _handleInitialMention(message); // Pass only message
  } else {
    logVerbose(`Ignoring message ID ${message.id}: not in a managed thread and bot was not mentioned.`); // Updated log message
    // Do nothing if not a mention or in a relevant thread
  }
});

// Listen for interactions (slash commands)
client.on(Events.InteractionCreate, async interaction => {

    // --- Handle Autocomplete --- 
    if (interaction.isAutocomplete()) {
        logVerbose(`Autocomplete interaction received for command: ${interaction.commandName}`);
        const focusedOption = interaction.options.getFocused(true); // Get focused option with value
        logVerbose(`Focused option: ${focusedOption.name}, Value: "${focusedOption.value}"`);

        if (interaction.commandName === 'add' && focusedOption.name === 'path') {
            try {
                const userInput = focusedOption.value || '';
                logVerbose(`Fetching file list for /add path autocomplete, input: "${userInput}"`);
                const allFiles = await listFilesRecursive(config.repoPath);
                logVerbose(`Found ${allFiles.length} files/dirs in ${config.repoPath}`);
                
                const filteredFiles = allFiles
                    .filter(f => f.startsWith(userInput))
                    .slice(0, 25); // Limit to 25 suggestions
                
                logVerbose(`Responding with ${filteredFiles.length} suggestions.`);
                await interaction.respond(
                    filteredFiles.map(file => ({ name: file, value: file }))
                );
            } catch (error) { 
                await sendLog('error', `Error handling /add autocomplete for input "${focusedOption.value}"`, error);
                // Avoid sending error back to autocomplete, just log it
                await interaction.respond([]); // Respond with empty suggestions on error
            }
        }
        // Add other autocomplete handlers here (e.g., for /remove, /model)
        else if (interaction.commandName === 'remove' && focusedOption.name === 'path') {
             try {
                const userInput = focusedOption.value || '';
                logVerbose(`Fetching context list for /remove path autocomplete, input: "${userInput}"`);
                const contextFiles = await coreService.getContextFiles({ userId: interaction.user.id }); // Use new core function
                logVerbose(`Found ${contextFiles.length} files in context for user ${interaction.user.id}`);
                
                const filteredFiles = contextFiles
                    .map(f => f.path) // Get just the path strings
                    .filter(p => p.startsWith(userInput))
                    .slice(0, 25); // Limit to 25 suggestions
                
                logVerbose(`Responding with ${filteredFiles.length} suggestions for /remove.`);
                await interaction.respond(
                    filteredFiles.map(file => ({ name: file, value: file }))
                );
            } catch (error) {
                await sendLog('error', `Error handling /remove autocomplete for input "${focusedOption.value}"`, error);
                await interaction.respond([]); // Respond with empty suggestions on error
            }
        }
        // --- NEW: Autocomplete for /model command --- 
        else if (interaction.commandName === 'model' && focusedOption.name === 'model_name') {
            try {
                const userInput = focusedOption.value || '';
                logVerbose(`Fetching model list for /model autocomplete, input: "${userInput}"`);
                
                // Read available models from config
                const allModels = config.availableModels || []; 
                logVerbose(`Found ${allModels.length} available models in config.`);
                
                const filteredModels = allModels
                    .filter(m => m.toLowerCase().includes(userInput.toLowerCase())) // Case-insensitive filtering
                    .slice(0, 25); // Limit to 25 suggestions
                
                logVerbose(`Responding with ${filteredModels.length} suggestions for /model.`);
                await interaction.respond(
                    filteredModels.map(model => ({ name: model, value: model }))
                );
            } catch (error) {
                await sendLog('error', `Error handling /model autocomplete for input "${focusedOption.value}"`, error);
                await interaction.respond([]); // Respond with empty suggestions on error
            }
        }
        else {
            logWarn(`Unhandled autocomplete interaction for command: ${interaction.commandName}, option: ${focusedOption.name}`);
            await interaction.respond([]); // Respond with empty for unhandled cases
        }
        return; // Stop processing after handling autocomplete
    }
    // --- End Autocomplete Handling ---

	if (!interaction.isChatInputCommand()) return; // Handle only chat input commands after autocomplete

	log(`Received chat input command: ${interaction.commandName} from ${interaction.user.tag} in channel ${interaction.channelId}`);

    // Optional: Guild/Role checks (Consider refactoring these into a helper if used often)
    if (ALLOWED_GUILD_ID && interaction.guildId !== ALLOWED_GUILD_ID) {
        log(`Ignoring command ${interaction.commandName} from user ${interaction.user.tag} in guild ${interaction.guildId} (not allowed).`);
        await interaction.reply({ content: 'Sorry, commands can only be used in the designated guild.', ephemeral: true });
        return;
    }
    if (REQUIRED_ROLE_ID) {
        const member = interaction.member ?? await interaction.guild?.members.fetch(interaction.user.id).catch(err => {
            logError('Failed to fetch member for interaction role check:', err);
            return null;
        });
        if (!member || !member.roles.cache.has(REQUIRED_ROLE_ID)) {
            log(`Ignoring command ${interaction.commandName} from user ${interaction.user.tag} (missing required role ${REQUIRED_ROLE_ID}).`);
            await interaction.reply({ content: 'Sorry, you do not have the required role to use commands.', ephemeral: true });
            return;
        }
    }

    const { commandName } = interaction;
    const userId = interaction.user.id;

    try {
        if (commandName === 'model') {
            const modelName = interaction.options.getString('model_name', true);
            log(`Processing /model: ${modelName} for ${userId}`);
            await interaction.deferReply({ ephemeral: true }); // Acknowledge
            const result = await coreService.setModel({ userId, modelName });
            await interaction.editReply(`Model set to: \`${result.modelName}\``);

        } else if (commandName === 'add') {
            const pathToAdd = interaction.options.getString('path', true);
            log(`Processing /add: ${pathToAdd} for ${userId}`);
            await interaction.deferReply({ ephemeral: true });
            // Format as a message for coreService
            const commandMessage = `/add ${pathToAdd}`;
            const response = await coreService.handleIncomingMessage({ message: commandMessage, userId });
            await interaction.editReply(response); // Send core's confirmation/error back

        } else if (commandName === 'remove') {
            const pathToRemove = interaction.options.getString('path', true);
            log(`Processing /remove: ${pathToRemove} for ${userId}`);
            await interaction.deferReply({ ephemeral: true });
            const commandMessage = `/remove ${pathToRemove}`;
            const response = await coreService.handleIncomingMessage({ message: commandMessage, userId });
            await interaction.editReply(response);

        } else if (commandName === 'clear') {
            log(`Processing /clear for ${userId}`);
            await interaction.deferReply({ ephemeral: true });
            const commandMessage = '/clear';
            const response = await coreService.handleIncomingMessage({ message: commandMessage, userId });
            await interaction.editReply(response);

        } else if (commandName === 'context') {
            log(`Processing /context for ${userId}`);
            await interaction.deferReply({ ephemeral: true }); // Use ephemeral for user-specific info
            try {
                const contextFiles = await coreService.getContextFiles({ userId });
                log(`Retrieved ${contextFiles.length} context files for user ${userId}`);

                if (contextFiles.length === 0) {
                    await interaction.editReply('The chat context is currently empty.');
                } else {
                    // Format the list for display
                    const fileList = contextFiles.map(f => 
                        `- \`${f.path}\` ${f.readOnly ? '(read-only)' : ''}` // Indicate read-only status
                    ).join('\n');
                    const responseMessage = `**Current Chat Context:**\n${fileList}`;
                    
                    // Check length before sending (Discord limit 2000 chars)
                    if (responseMessage.length > 2000) {
                        await interaction.editReply('Context list is too long to display. Use /remove to manage files.'); 
                        await sendLog('warn', `Context list for user ${userId} too long to display (${contextFiles.length} files).`);
                    } else {
                        await interaction.editReply(responseMessage);
                    }
                }
            } catch (coreError) {
                await sendLog('error', `Error retrieving context for user ${userId}`, coreError);
                await interaction.editReply(`Sorry, I couldn't retrieve the context: ${coreError.message}`);
            }
        } else {
            logWarn(`Received unknown command interaction: ${commandName}`);
            if (!interaction.replied && !interaction.deferred) {
                 await interaction.reply({ content: `Unknown command '/${commandName}'.`, ephemeral: true });
            }
        }
    } catch (error) {
        await sendLog('error', `Error handling command ${commandName} for user ${userId}`, error);
        const errorMessage = `An error occurred while processing '/${commandName}': ${error.message}`;
        if (interaction.deferred || interaction.replied) {
            await interaction.editReply(errorMessage).catch(e => logError('Failed to edit error reply for interaction:', e));
        } else {
            await interaction.reply({ content: errorMessage, ephemeral: true }).catch(e => logError('Failed to send error reply for interaction:', e));
        }
    }
});

// --- Login ---
async function start() {
  // Check for token *before* trying to login
  if (!BOT_TOKEN) {
    logError('FATAL: DISCORD_BOT_TOKEN is missing. Cannot start bot.');
    process.exit(1); // Exit here instead
  }
  try {
    log('Logging in to Discord...');
    await client.login(BOT_TOKEN);
    log('Successfully logged in.');
  } catch (error) {
    logError('Failed to log in to Discord:', error);
    process.exit(1); // Also exit on login failure
  }
}

// --- Export ---
// Export the start function and potentially the client if needed elsewhere
export const discordAdapter = {
  start,
  client, // Exporting client might be useful for registering commands etc.
};

// --- Auto-start if run directly (optional) ---
// This allows running `node lib/discord-adapter.js` for quick testing
if (import.meta.url === `file://${process.argv[1]}`) {
  log('Running discord-adapter directly, attempting to start...');
  start();
}

// --- NEW: Centralized Logging Function ---
/**
 * Sends a log message to the configured Discord channel and the console.
 * @param {'info' | 'warn' | 'error'} level - The log level.
 * @param {string} message - The main log message.
 * @param {Error | string | null} [error=null] - An optional error object or additional details.
 */
async function sendLog(level, message, error = null) {
    // 1. Format for Console/Debug
    const consoleArgs = [message];
    if (error) consoleArgs.push(error);

    // 2. Log to Console/Debug via debug instances
    switch (level) {
        case 'error':
            logError(...consoleArgs);
            break;
        case 'warn':
            // Assuming logWarn exists or using log as fallback
            (debug.enabled('vibemob:discord:warn') ? debug('vibemob:discord:warn') : log)(...consoleArgs); 
            break;
        case 'info':
        default:
            log(...consoleArgs);
            break;
    }

    // 3. Format for Discord
    let discordMessage = `[${level.toUpperCase()}] ${message}`;
    if (error) {
        // Append error stack or message, truncated if necessary
        const errorString = error instanceof Error ? error.stack || error.message : String(error);
        const truncatedError = errorString.length > 1500 ? errorString.substring(0, 1500) + '...' : errorString;
        discordMessage += `\n\`\`\`${truncatedError}\`\`\``;
    }

    // 4. Send to Discord Channel (if configured and valid)
    if (loggingChannel && loggingChannel.isTextBased()) {
        try {
            // Split message if too long for Discord (limit is 2000 chars)
            const chunks = splitMessage(discordMessage, 2000); 
            for (const chunk of chunks) {
                await loggingChannel.send(chunk);
            }
        } catch (err) {
            // Log Discord send failure to console, avoid infinite loop
            logError(`Failed to send log to Discord channel ${loggingChannel.id}:`, err);
            console.error(`[FALLBACK LOG - ${level.toUpperCase()}] ${message}`, error || '');
        }
    }
}
// --- END NEW --- 

// --- NEW: Recursive File Listing Function --- 
/**
 * Recursively lists files and directories within a given path, relative to that path.
 * Ignores node_modules and .git directories.
 * @param {string} dirPath - The absolute path to the directory to scan.
 * @param {string} [currentRelativePath=''] - Internal use for tracking relative path.
 * @returns {Promise<string[]>} - A promise that resolves to an array of relative file/directory paths.
 */
async function listFilesRecursive(dirPath, currentRelativePath = '') {
    let results = [];
    try {
        const entries = await fs.readdir(dirPath, { withFileTypes: true });
        for (const entry of entries) {
            // Skip common ignores
            if (entry.name === 'node_modules' || entry.name === '.git') {
                continue;
            }
            
            const fullPath = path.join(dirPath, entry.name);
            const relativePath = path.join(currentRelativePath, entry.name);
            
            results.push(relativePath); // Add the directory or file itself

            if (entry.isDirectory()) {
                // Recursively search subdirectory
                const subResults = await listFilesRecursive(fullPath, relativePath);
                results = results.concat(subResults);
            }
        }
    } catch (error) {
        // Log error but potentially continue if it's just a permission issue on one dir?
        // Or maybe rethrow? For autocomplete, maybe just return what we have.
        logError(`Error reading directory ${dirPath} during recursive list:`, error);
        // Re-throwing might be better to signal a problem upstream
        // throw error; 
        // For autocomplete, maybe just return empty or partial results?
        // Returning partial results might be confusing.
        // Let's log and return empty for this path to avoid crashing autocomplete.
        return []; 
    }
    return results;
}
// --- END NEW --- 