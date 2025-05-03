import { Client, Events, GatewayIntentBits, AttachmentBuilder, SlashCommandBuilder } from 'discord.js';
import debug from 'debug';
import { coreService } from './core.js'; // Import core service
import { splitMessage } from './utils.js'; // Import utility for splitting messages

const log = debug('vibemob:discord');
const logError = debug('vibemob:discord:error');
logError.log = console.error.bind(console);

// Environment Variables
const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
if (!BOT_TOKEN) {
  logError('FATAL: DISCORD_BOT_TOKEN environment variable is not set.');
  process.exit(1); // Exit if token is missing
}

// Environment Variables for Interaction Logic
const BOT_USER_ID = process.env.DISCORD_BOT_USER_ID; // Need bot's own ID to check mentions
const ALLOWED_GUILD_ID = process.env.DISCORD_GUILD_ID; // Optional: Restrict to specific guild
const REQUIRED_ROLE_ID = process.env.DISCORD_ROLE_ID; // Optional: Restrict to specific role

// Constants for Discord Adapter
const THREAD_AUTO_ARCHIVE_DURATION = 60; // Minutes
const THREAD_NAME_PREFIX = 'Aider task for';

if (!BOT_USER_ID) {
  logError('WARN: DISCORD_BOT_USER_ID environment variable is not set. Mention detection might not work correctly.');
  // Consider exiting if this is critical: process.exit(1);
}

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
client.once(Events.ClientReady, c => {
  log(`Ready! Logged in as ${c.user.tag}`);
  // TODO: Potentially add logic here to ensure coreService is initialized
});

// --- Command Definitions (Placeholder) ---
const commands = {
  model: new SlashCommandBuilder()
    .setName('model')
    .setDescription('Sets the LLM model for subsequent Aider interactions.')
    .addStringOption(option =>
      option.setName('model_name')
        .setDescription('The name of the model (e.g., openai/gpt-4o)')
        .setRequired(true)),
  add: new SlashCommandBuilder()
    .setName('add')
    .setDescription('Adds a file or directory to the Aider context.')
    .addStringOption(option =>
      option.setName('path')
        .setDescription('Relative path to the file/directory')
        .setRequired(true)),
  remove: new SlashCommandBuilder()
    .setName('remove')
    .setDescription('Removes a file or directory from the Aider context.')
    .addStringOption(option =>
      option.setName('path')
        .setDescription('Relative path to remove')
        .setRequired(true)),
  clear: new SlashCommandBuilder()
    .setName('clear')
    .setDescription('Clears the entire Aider context.'),
};

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
    logWarn(`Received empty core response for user ${userId}, sending notification.`);
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
      const diffContent = match[0].substring(match[1].length); // Extract only the diff part
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
        await channel.send({ files: fileBatch });
      }
    }
  } catch (error) {
    logError(`Error relaying core response to channel ${channel.id} for user ${userId}:`, error);
    // Attempt to send an error message back to the channel
    try {
        await channel.send(`Sorry, I encountered an error trying to display the response: ${error.message}`);
    } catch (sendError) {
        logError(`Failed to send relay error message to channel ${channel.id}:`, sendError);
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

  try {
    await thread.sendTyping();
    const coreResponse = await coreService.handleIncomingMessage({
      message: followUpPrompt,
      userId: userId,
    });
    await _relayCoreResponse(thread, coreResponse, userId);
  } catch (coreError) {
    logError(`Error processing follow-up message via coreService for user ${userId} in thread ${thread.id}:`, coreError);
    await thread.send(`Sorry, I encountered an error processing your message: ${coreError.message}`);
  }
}

/**
 * Handles the initial mention of the bot, checks permissions, creates a thread,
 * and sends the initial prompt to the core service.
 * @param {Message} message - The Discord message object.
 * @param {RegExpMatchArray} mentionMatch - The result of the mention regex match.
 */
async function _handleInitialMention(message, mentionMatch) {
    log(`Mention detected from ${message.author.tag}. Validating and processing...`);
    
    // 1. Optional: Guild Check
    if (ALLOWED_GUILD_ID && message.guildId !== ALLOWED_GUILD_ID) {
        log(`Ignoring message from user ${message.author.tag} in guild ${message.guildId} (not allowed).`);
        // await message.reply('Sorry, I can only be used in the designated guild.'); // Optional reply
        return;
    }

    // 2. Optional: Role Check
    if (REQUIRED_ROLE_ID) {
        let member;
        try {
            member = message.member ?? await message.guild?.members.fetch(message.author.id);
            if (!member || !member.roles.cache.has(REQUIRED_ROLE_ID)) {
                log(`Ignoring message from user ${message.author.tag} (missing required role ${REQUIRED_ROLE_ID}).`);
                // await message.reply('Sorry, you do not have the required role to use me.'); // Optional reply
                return;
            }
        } catch (err) {
            logError('Failed to fetch member for role check:', err);
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
        logError(`Failed to create thread for message ${message.id}:`, threadError);
        await message.reply('Sorry, I couldn't create a thread for our conversation.');
        return;
    }

    // 4. Process Initial Prompt & Relay Response
    try {
        const initialPrompt = message.content.replace(mentionMatch[0], '').trim(); // Use mentionMatch[0] for the full mention
        await thread.send(`Okay, ${message.author.username}, I'll work on that. Starting with prompt: \"${initialPrompt}\"`);
        await thread.sendTyping();
        
        const coreResponse = await coreService.handleIncomingMessage({
            message: initialPrompt,
            userId: message.author.id,
        });
        
        await _relayCoreResponse(thread, coreResponse, message.author.id);

    } catch (coreError) {
        logError(`Error processing initial prompt via coreService for user ${message.author.id} in thread ${thread.id}:`, coreError);
        await thread.send(`Sorry, I encountered an error processing your initial request: ${coreError.message}`);
    }
}

// --- Main Event Listeners ---

// Listen for ready event
client.once(Events.ClientReady, c => {
  log(`Ready! Logged in as ${c.user.tag}`);
});

// Listen for messages
client.on(Events.MessageCreate, async message => {
  // Ignore bots
  if (message.author.bot) return;
  // Ignore messages not in guilds (e.g., DMs) for now
  if (!message.guild) return; 

  // Check if it's a message within a potential bot thread
  if (message.channel.isThread()) {
    // Simpler check: Is the bot the owner? Assumes bot creates threads.
    // Fetch owner if needed (might be null if bot left guild temporarily)
    const thread = message.channel;
    const owner = thread.ownerId ? await client.users.fetch(thread.ownerId).catch(() => null) : null;
    const isBotOwnedThread = owner?.id === client.user?.id; 

    // Add name check as fallback/alternative? Less reliable.
    // const isBotNamedThread = thread.name.startsWith('Aider task for');
    
    if (isBotOwnedThread) {
      await _handleThreadMessage(message);
      return; // Handled as thread message
    } else {
        log(`Received message in non-bot-owned thread ${thread.id}, ignoring.`);
    }
  }

  // Check for initial mention (only if not handled as a thread message)
  const mentionRegex = new RegExp(`^<@!?${BOT_USER_ID}>`); // Match mention at the start
  const mentionMatch = message.content.match(mentionRegex);
  if (mentionMatch) {
    await _handleInitialMention(message, mentionMatch);
    return; // Handled as initial mention
  }
  
  // If not a bot thread message or an initial mention, ignore.
});

// Listen for interactions (slash commands)
client.on(Events.InteractionCreate, async interaction => {
	if (!interaction.isChatInputCommand()) return;

	log(`Received interaction: ${interaction.commandName} from ${interaction.user.tag} in channel ${interaction.channelId}`);

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

        } else {
            logWarn(`Received unknown command interaction: ${commandName}`);
            if (!interaction.replied && !interaction.deferred) {
                 await interaction.reply({ content: `Unknown command '/${commandName}'.`, ephemeral: true });
            }
        }
    } catch (error) {
        logError(`Error handling command ${commandName} for user ${userId}:`, error);
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
  try {
    log('Logging in to Discord...');
    await client.login(BOT_TOKEN);
    log('Successfully logged in.');
  } catch (error) {
    logError('Failed to log in to Discord:', error);
    process.exit(1); // Exit if login fails
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