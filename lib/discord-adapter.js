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

// --- Message Handling ---
client.on(Events.MessageCreate, async message => {
  // 1. Ignore messages from other bots or the bot itself
  if (message.author.bot) return;

  // 2. Check if it's a message within a bot-managed thread
  // We identify bot-managed threads by checking if the client user is the owner
  // or potentially by checking if the thread starter message was from the bot? (Less reliable)
  // Simpler check: Is it a thread, and is the bot a member (implied if it created it)?
  if (message.channel.isThread()) {
    // Check if this thread was likely created by our bot.
    // A more robust way might involve storing active thread IDs, but this is simpler:
    // Check if the bot is the owner (if it created the thread under itself)
    // OR if the thread name matches our pattern (less reliable but okay for POC)
    const thread = message.channel;
    // Fetch the owner if needed, might not be readily available
    const owner = thread.ownerId ? await client.users.fetch(thread.ownerId).catch(() => null) : null;
    const isBotOwnedThread = owner?.id === client.user?.id || thread.name.startsWith('Aider task for');

    if (isBotOwnedThread) {
      log(`Received message in thread ${thread.id} from ${message.author.tag}`);
      const userId = message.author.id; // Use the author of the message in the thread
      const followUpPrompt = message.content;

      try {
        await thread.sendTyping();
        const coreResponse = await coreService.handleIncomingMessage({
          message: followUpPrompt,
          userId: userId, // Use the ID of the user who sent the follow-up
        });
        log(`Core service processed follow-up from ${userId} in thread ${thread.id}, response length: ${coreResponse?.length}`);

        // Relay response (Steps 7.4/7.5 logic reused)
        if (coreResponse && coreResponse.trim().length > 0) {
          const diffRegex = /([\s\S]*?)^<<<<<<< SEARCH[\s\S]*?=======[\s\S]*?>>>>>>> REPLACE\s*$/gm;
          let lastIndex = 0;
          let match;
          let normalContent = '';
          const filesToSend = [];

          while ((match = diffRegex.exec(coreResponse)) !== null) {
            normalContent += coreResponse.substring(lastIndex, match.index);
            const precedingText = coreResponse.substring(0, match.index);
            const linesBeforeDiff = precedingText.split('\n').filter(line => line.trim() !== '');
            const fileNameGuess = linesBeforeDiff.length > 0 ? linesBeforeDiff[linesBeforeDiff.length - 1].trim() : 'aider_change.diff';
            const safeFileName = fileNameGuess.replace(/[^a-zA-Z0-9_.-]/g, '_') || 'aider_change.diff';
            const diffFileName = safeFileName.endsWith('.diff') ? safeFileName : `${safeFileName}.diff`;
            log(`Detected diff block in thread response, extracting as ${diffFileName}`);
            const diffContent = match[0].substring(match[1].length);
            const diffBuffer = Buffer.from(diffContent, 'utf-8');
            filesToSend.push(new AttachmentBuilder(diffBuffer, { name: diffFileName }));
            lastIndex = diffRegex.lastIndex;
          }

          normalContent += coreResponse.substring(lastIndex);

          if (normalContent.trim().length > 0) {
            const messageChunks = splitMessage(normalContent.trim());
            for (const chunk of messageChunks) {
              await thread.send(chunk);
            }
          }

          if (filesToSend.length > 0) {
            log(`Sending ${filesToSend.length} diff file(s) to thread ${thread.id}`);
            for (let i = 0; i < filesToSend.length; i += 10) {
              const fileBatch = filesToSend.slice(i, i + 10);
              await thread.send({ files: fileBatch });
            }
          }
        } else {
          await thread.send("Received empty response from core service for follow-up message.");
        }
      } catch (coreError) {
        logError(`Error processing follow-up message via coreService for user ${userId} in thread ${thread.id}:`, coreError);
        await thread.send(`Sorry, I encountered an error processing your message: ${coreError.message}`);
      }
      return; // Handled as thread message, stop further processing
    }
  }

  // 3. Check if it's the initial mention (unchanged logic)
  const mentionRegex = new RegExp(`^<@!?${BOT_USER_ID}>`);
  const wasMentioned = message.content.match(mentionRegex);
  if (!wasMentioned) return;

  // 4. Optional: Check if the message is in the allowed guild
  if (ALLOWED_GUILD_ID && message.guildId !== ALLOWED_GUILD_ID) {
    log(`Ignoring message from user ${message.author.tag} in guild ${message.guildId} (not allowed).`);
    // Optionally reply that the bot is restricted
    // await message.reply('Sorry, I can only be used in the designated guild.');
    return;
  }

  // 5. Optional: Check if the user has the required role
  if (REQUIRED_ROLE_ID) {
    // Fetch the member object to check roles
    let member;
    try {
      member = message.member ?? await message.guild?.members.fetch(message.author.id);
    } catch (err) {
      logError('Failed to fetch member:', err);
      await message.reply('Sorry, I encountered an error checking your permissions.');
      return;
    }

    if (!member || !member.roles.cache.has(REQUIRED_ROLE_ID)) {
      log(`Ignoring message from user ${message.author.tag} (missing required role ${REQUIRED_ROLE_ID}).`);
      // Optionally reply
      // await message.reply('Sorry, you do not have the required role to use me.');
      return;
    }
  }

  // 6. Create a new thread for the interaction
  log(`Mention detected from ${message.author.tag}. Creating thread and processing...`);
  let thread = null; // Define thread variable outside try block
  try {
    const threadName = `Aider task for ${message.author.username}`.substring(0, 100); // Max length 100
    thread = await message.startThread({
      name: threadName,
      autoArchiveDuration: 60, // Archive after 1 hour of inactivity (adjust as needed)
      // reason: 'Aider interaction thread', // Optional: Only visible in audit log
    });
    log(`Created thread: ${thread.name} (${thread.id})`);

    // Send an initial message to the thread
    // Remove the mention from the original message content for cleaner forwarding
    const initialPrompt = message.content.replace(mentionRegex, '').trim();
    await thread.send(`Okay, ${message.author.username}, I'll work on that. Starting with prompt: \"${initialPrompt}\"`);

    // ---> Steps 7.4 & 7.5: Relay response (text and diffs) <---
    try {
      await thread.sendTyping(); // Indicate bot is working
      const coreResponse = await coreService.handleIncomingMessage({
        message: initialPrompt,
        userId: message.author.id, // Use Discord User ID
        // Pass thread ID or other context if coreService needs it later
      });
      log(`Core service processed initial prompt from ${message.author.id}, response length: ${coreResponse?.length}`);

      if (coreResponse && coreResponse.trim().length > 0) {
        // Regex to find aider diff blocks (simplified)
        const diffRegex = /([\s\S]*?)^<<<<<<< SEARCH[\s\S]*?=======[\s\S]*?>>>>>>> REPLACE\s*$/gm;
        let lastIndex = 0;
        let match;
        let normalContent = '';
        const filesToSend = [];

        while ((match = diffRegex.exec(coreResponse)) !== null) {
          // Add text before the diff block
          normalContent += coreResponse.substring(lastIndex, match.index);

          // Extract file name (assuming it precedes the diff block)
          const precedingText = coreResponse.substring(0, match.index);
          const linesBeforeDiff = precedingText.split('\n').filter(line => line.trim() !== '');
          const fileNameGuess = linesBeforeDiff.length > 0 ? linesBeforeDiff[linesBeforeDiff.length - 1].trim() : 'aider_change.diff';
          // Sanitize filename guess
          const safeFileName = fileNameGuess.replace(/[^a-zA-Z0-9_.-]/g, '_') || 'aider_change.diff';
          const diffFileName = safeFileName.endsWith('.diff') ? safeFileName : `${safeFileName}.diff`;

          log(`Detected diff block, extracting as ${diffFileName}`);
          // Extract the full diff block content
          const diffContent = match[0].substring(match[1].length); // Get the diff part
          
          // Create buffer and attachment
          const diffBuffer = Buffer.from(diffContent, 'utf-8');
          filesToSend.push(new AttachmentBuilder(diffBuffer, { name: diffFileName }));

          lastIndex = diffRegex.lastIndex;
        }

        // Add any remaining text after the last diff block
        normalContent += coreResponse.substring(lastIndex);

        // Send normal text content (split if necessary)
        if (normalContent.trim().length > 0) {
          const messageChunks = splitMessage(normalContent.trim());
          for (const chunk of messageChunks) {
            await thread.send(chunk);
          }
        }

        // Send files if any were created
        if (filesToSend.length > 0) {
          log(`Sending ${filesToSend.length} diff file(s)`);
          // Send files in batches if needed (Discord limit is 10 per message)
          for (let i = 0; i < filesToSend.length; i += 10) {
            const fileBatch = filesToSend.slice(i, i + 10);
            await thread.send({ files: fileBatch });
          }
        }

      } else {
        await thread.send("Received empty response from the core service.");
      }
      // -----------------------------------------------------------

    } catch (coreError) {
      logError(`Error processing message via coreService for user ${message.author.id}:`, coreError);
      await thread.send(`Sorry, I encountered an error processing your request: ${coreError.message}`);
    }
    // -------------------------------------------------------------------------------------

  } catch (error) {
    logError(`Failed to create thread or process initial message ${message.id}:`, error);
    // Inform the user if thread creation or initial processing failed
    // Use message.reply if thread creation failed (thread is null)
    const replyTarget = thread || message;
    try {
      await replyTarget.reply('Sorry, I could not start a thread or process your initial request.');
    } catch (replyError) {
      logError('Failed to send reply about thread/processing failure:', replyError);
    }
  }
});

// --- Interaction (Slash Command) Handling ---
client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand()) return; // Only handle slash commands

  log(`Received command interaction: ${interaction.commandName} from ${interaction.user.tag}`);

  // Optional: Guild/Role checks similar to MessageCreate if needed
  if (ALLOWED_GUILD_ID && interaction.guildId !== ALLOWED_GUILD_ID) {
    log(`Ignoring command ${interaction.commandName} from user ${interaction.user.tag} in guild ${interaction.guildId} (not allowed).`);
    await interaction.reply({ content: 'Sorry, commands can only be used in the designated guild.', ephemeral: true });
    return;
  }
  if (REQUIRED_ROLE_ID) {
    // Fetch member if not readily available
    const member = interaction.member ?? await interaction.guild?.members.fetch(interaction.user.id).catch(err => {
      logError('Failed to fetch member for interaction check:', err);
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

  // Defer reply to avoid timeout for potentially long operations
  await interaction.deferReply({ ephemeral: true }); // Ephemeral for commands that just confirm state changes

  try {
    if (commandName === 'model') {
      const modelName = interaction.options.getString('model_name', true);
      log(`Processing /model: ${modelName} for ${userId}`);
      
      const result = await coreService.setModel({
        modelName: modelName,
        userId: userId,
      });

      log('coreService.setModel result:', result);
      await interaction.editReply(`Model set to: \`${result.modelName}\``);

    } else if (commandName === 'add') {
      const pathToAdd = interaction.options.getString('path', true);
      log(`Processing /add: ${pathToAdd} for ${userId}`);
      // Construct the message as coreService expects it
      const commandMessage = `/add ${pathToAdd}`;
      const response = await coreService.handleIncomingMessage({ message: commandMessage, userId });
      // Send the confirmation/error message from coreService back
      await interaction.editReply(response);

    } else if (commandName === 'remove') {
      const pathToRemove = interaction.options.getString('path', true);
      log(`Processing /remove: ${pathToRemove} for ${userId}`);
      const commandMessage = `/remove ${pathToRemove}`;
      const response = await coreService.handleIncomingMessage({ message: commandMessage, userId });
      await interaction.editReply(response);

    } else if (commandName === 'clear') {
      log(`Processing /clear for ${userId}`);
      const commandMessage = '/clear';
      const response = await coreService.handleIncomingMessage({ message: commandMessage, userId });
      await interaction.editReply(response);

    } else {
      logError(`Received unknown command: ${commandName}`);
      await interaction.editReply(`Unknown command: ${commandName}`);
    }

  } catch (error) {
    logError(`Error handling command ${commandName} for user ${userId}:`, error);
    // Check if already replied or deferred before editing
    if (!interaction.replied && !interaction.deferred) {
      // If something went wrong very early, might need to use .reply
      await interaction.reply({ content: `An error occurred: ${error.message}`, ephemeral: true }).catch(e => logError('Failed to send error reply', e));
    } else {
      // Otherwise, edit the deferred reply
      await interaction.editReply(`An error occurred while processing your command: ${error.message}`).catch(e => logError('Failed to edit error reply', e));
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