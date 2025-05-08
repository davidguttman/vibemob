import {
  Client,
  Events,
  GatewayIntentBits,
  Partials,
  ChannelType,
  ThreadAutoArchiveDuration,
} from 'discord.js'
import fs from 'node:fs/promises'
import path from 'node:path'
import config from './config.js'
// Changed to named import namespace
import * as coreService from './core.js'
import { splitMessage } from './utils.js'

// --- Discord Client Setup ---
let client

// --- Utility Functions ---

// Helper to get base command name by stripping prefix
const getBaseCommandName = (prefixedName) => {
  if (
    config.commandPrefix &&
    prefixedName.startsWith(config.commandPrefix + '_')
  ) {
    return prefixedName.substring(config.commandPrefix.length + 1)
  }
  return prefixedName
}

// Removed sendLog function, will use console directly

async function listFilesRecursive(dirPath, currentRelativePath = '') {
  let results = []
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue // Skip common large/irrelevant dirs
      const full = path.join(dirPath, entry.name)
      const rel = path.join(currentRelativePath, entry.name)
      results.push(rel) // Add both files and directories initially
      if (entry.isDirectory()) {
        const subFiles = await listFilesRecursive(full, rel)
        results = results.concat(subFiles)
      }
    }
  } catch (error) {
    // Log error but continue, maybe the directory is inaccessible
    console.error(
      `Error reading directory ${dirPath} during recursive list`,
      error,
    )
  }
  return results
}

// --- Core Logic Wrappers ---

async function _isAllowedUser(interactionOrMessage) {
  if (!config.allowedGuildId || !config.allowedRoleId) {
    console.warn(
      'allowedGuildId or allowedRoleId not configured. Allowing all users.',
    )
    return true // Allow if not configured (useful for testing)
  }

  if (interactionOrMessage.guildId !== config.allowedGuildId) {
    console.log(
      `Interaction/message denied: Guild ${interactionOrMessage.guildId} not allowed.`,
    )
    return false
  }

  const member =
    interactionOrMessage.member ||
    (await interactionOrMessage.guild?.members.fetch(
      interactionOrMessage.author?.id || interactionOrMessage.user?.id,
    ))
  if (!member) {
    console.warn(
      `Could not fetch member for user ${
        interactionOrMessage.author?.id || interactionOrMessage.user?.id
      } in guild ${interactionOrMessage.guildId}`,
    )
    return false // Cannot verify roles
  }

  const hasRole = member.roles.cache.has(config.allowedRoleId)
  if (!hasRole) {
    console.log(
      `Interaction/message denied: User ${member.id} lacks role ${config.allowedRoleId}.`,
    )
  }
  return hasRole
}

async function _relayCoreResponse(response, target) {
  console.log(`Relaying core response to target ${target.id}`)
  if (!response || !response.content) {
    console.warn('Core response was empty or invalid.')
    await target.send('Sorry, something went wrong and I received no response.')
    return
  }

  const chunks = splitMessage(response.content) // Use utility for splitting
  for (const chunk of chunks) {
    try {
      await target.send(chunk)
    } catch (error) {
      console.error(`Failed to send message chunk to ${target.id}`, error)
      // Decide if we should stop or continue sending chunks
      break // Stop sending chunks on error
    }
  }
}

// --- Event Handlers ---

async function _handleInitialMention(message) {
  console.log(`Handling initial mention from user ${message.author.id}`)
  if (message.channel.type !== ChannelType.GuildText) {
    console.warn('Mention received in non-text channel, ignoring.')
    return
  }

  // Extract the prompt (remove the bot mention)
  const prompt = message.content.replace(/<@!?\d+>/, '').trim()
  if (!prompt) {
    await message.reply('Please provide an initial prompt after mentioning me.')
    return
  }

  let thread
  try {
    // Create a thread for the conversation
    thread = await message.channel.threads.create({
      name: `Aider convo with ${message.author.username} (${message.author.id})`,
      autoArchiveDuration: ThreadAutoArchiveDuration.OneHour, // Adjust as needed
      startMessage: message, // Associate thread with the initial message
      reason: `Aider interaction started by ${message.author.tag}`,
    })
    console.log(`Created thread ${thread.id} for user ${message.author.id}`)
    await thread.sendTyping()
  } catch (error) {
    console.error('Failed to create thread', error)
    await message.reply(
      'Sorry, I encountered an error trying to start a conversation thread.',
    )
    return
  }

  try {
    const response = await coreService.handleIncomingMessage({
      message: prompt,
      userId: message.author.id,
    })
    await _relayCoreResponse(response, thread)
  } catch (error) {
    console.error('Error processing initial mention in core service', error)
    await thread.send(
      'Sorry, I encountered an internal error processing your request.',
    )
  }
}

async function _handleThreadMessage(message) {
  console.log(
    `Handling thread message in ${message.channel.id} from user ${message.author.id}`,
  )
  if (!message.channel.isThread()) {
    console.warn('Received message in non-thread channel, ignoring.') // Should not happen if logic is correct
    return
  }

  // Basic check: Is the thread related to our bot? (e.g., based on name or stored mapping)
  // For now, assume any message in a thread the bot is part of is for the bot.
  // More robust: Check if thread was created by the bot or map thread IDs to users.

  await message.channel.sendTyping()
  try {
    // Ensure mentions are stripped from thread messages as well
    const finalMessageContent = message.content.replace(/<@!?\d+>/, '').trim();
    if (!finalMessageContent && message.attachments.size === 0) { // Also check for attachments
        console.log(`Empty message content in thread ${message.channel.id} after stripping mention, ignoring.`);
        // Optionally, reply to the user if they send an empty message after stripping.
        // await message.reply("Your message was empty after removing my mention.");
        return;
    }

    const response = await coreService.handleIncomingMessage({
      message: finalMessageContent, // Use stripped message
      userId: message.author.id, // Assuming thread participation implies interaction
    })
    await _relayCoreResponse(response, message.channel)
  } catch (error) {
    console.error('Error processing thread message in core service', error)
    await message.channel.send(
      'Sorry, I encountered an internal error processing your message.',
    )
  }
}

async function _handleCommand(interaction) {
  // Get the base command name by stripping the prefix
  const baseCommandName = getBaseCommandName(interaction.commandName)
  console.log(
    `Handling command ${interaction.commandName} (base: ${baseCommandName}) from user ${interaction.user.id}`,
  )
  const userId = interaction.user.id

  await interaction.deferReply({ ephemeral: true }) // Defer for potentially long operations

  try {
    let responseContent = 'Command processed.' // Default response

    // Use baseCommandName for comparisons
    if (baseCommandName === 'ping') {
      responseContent = 'Pong!'
    } else if (baseCommandName === 'context') {
      const files = coreService.getContextFiles({ userId })
      if (files.length === 0) {
        responseContent = 'Your context is currently empty.'
      } else {
        responseContent =
          '**Current Context:**\\n' +
          files
            .map((f) => `- \\\`${f.path}\\\`${f.readOnly ? ' (read-only)' : ''}`)
            .join('\\n')
      }
    } else if (baseCommandName === 'add') {
      const filePath = interaction.options.getString('path', true)
      const readOnly =
        interaction.options.getBoolean('read-only', false) ?? false // Default to false if not provided
      const result = await coreService.addFileToContext({
        userId,
        filePath,
        readOnly,
      })
      responseContent = result.message
    } else if (baseCommandName === 'remove') {
      const filePath = interaction.options.getString('path', true)
      const result = await coreService.removeFileFromContext({
        userId,
        filePath,
      })
      responseContent = result.message
    } else if (baseCommandName === 'clear') {
      await coreService.clearContext({ userId })
      responseContent = 'Context cleared.'
    } else if (baseCommandName === 'model') {
      const modelName = interaction.options.getString('model_name', true) // Corrected option name
      await coreService.setModel({ userId, modelName })
      responseContent = `Model set to \\\`${modelName}\\\`.`
    } else if (baseCommandName === 'push') {
      const result = await coreService.pushChanges({ userId })
      responseContent = result.message // Should contain success or error message
    } else if (baseCommandName === 'config') {
      const apiBase = interaction.options.getString('api_base')
      const apiKey = interaction.options.getString('api_key')
      if (!apiBase && !apiKey) {
        responseContent = 'You must provide at least `api_base` or `api_key`.'
      } else {
        await coreService.setConfigOverrides({ userId, apiBase, apiKey })
        responseContent = 'Configuration overrides applied for this session.'
      }
    } else {
      responseContent = 'Unknown command.'
      console.warn(
        `Received unknown command: ${interaction.commandName} (base: ${baseCommandName})`,
      )
    }

    // Split potentially long responses (like large context lists)
    const chunks = splitMessage(responseContent)
    await interaction.editReply(chunks[0]) // Send first chunk via editReply
    for (let i = 1; i < chunks.length; i++) {
      await interaction.followUp({ content: chunks[i], ephemeral: true }) // Send subsequent chunks via followUp
    }
  } catch (error) {
    console.error(`Error executing command ${interaction.commandName}`, error)
    const errorMessage =
      'Sorry, I encountered an internal error trying to execute that command.'
    // Try to edit the deferred reply, otherwise follow up
    try {
      await interaction.editReply({ content: errorMessage, ephemeral: true })
    } catch (editError) {
      console.error(
        'Failed to edit deferred reply after command error',
        editError,
      )
      try {
        await interaction.followUp({ content: errorMessage, ephemeral: true })
      } catch (followUpError) {
        console.error(
          'Failed to send followUp after command error and edit error',
          followUpError,
        )
      }
    }
  }
}

async function _handleAutocomplete(interaction) {
  // Get the base command name by stripping the prefix
  const baseCommandName = getBaseCommandName(interaction.commandName)
  const { options } = interaction
  const focusedOption = options.getFocused(true)
  const focusedValue = focusedOption.value
  const userId = interaction.user.id

  // Log the interaction object/options for inspection
  console.log(
    `Autocomplete triggered for command: ${interaction.commandName} (base: ${baseCommandName}), option: ${focusedOption.name}, value: "${focusedValue}", user: ${userId}`,
  )
  try {
    // Log the raw options object for deeper inspection if needed
    console.log(
      `Autocomplete interaction options: ${JSON.stringify(interaction.options, null, 2)}`,
    )
  } catch (stringifyError) {
    console.warn(
      'Could not stringify interaction options for logging',
      stringifyError,
    )
  }

  try {
    let choices = []

    // Use baseCommandName for comparisons
    if (baseCommandName === 'add' && focusedOption.name === 'path') {
      console.log('Autocomplete for /add path: Listing files...')
      // Use config.repoPath directly
      const repoPath = config.repoPath
      if (!repoPath) {
        console.warn(
          'Repo path not available for autocomplete (config.repoPath is not set).',
        )
        // Respond with empty or error message? Empty for now.
      } else {
        const allFiles = await listFilesRecursive(repoPath)
        console.log(
          `Found ${allFiles.length} potential files/dirs for autocomplete.`,
        )
        choices = allFiles
          .filter((file) =>
            file.toLowerCase().includes(focusedValue.toLowerCase()),
          )
          .slice(0, 25) // Limit to Discord's max choices
          .map((file) => ({ name: file, value: file }))
        console.log(`Filtered choices for /add: ${choices.length}`)
      }
    } else if (baseCommandName === 'remove' && focusedOption.name === 'path') {
      console.log('Autocomplete for /remove path: Getting context files...')
      const contextFiles = coreService.getContextFiles({ userId }) // Get {path, readOnly} objects
      console.log(
        `Found ${contextFiles.length} context files for user ${userId}.`,
      )
      choices = contextFiles
        .filter((file) =>
          file.path.toLowerCase().includes(focusedValue.toLowerCase()),
        )
        .slice(0, 25)
        .map((file) => ({ name: file.path, value: file.path })) // Map to name/value pairs
      console.log(`Filtered choices for /remove: ${choices.length}`)
    } else if (
      baseCommandName === 'model' &&
      focusedOption.name === 'model_name'
    ) {
      // Corrected option name
      console.log('Autocomplete for /model name: Providing default models...')
      // Use availableModels from config
      const availableModels = config.availableModels || []
      choices = availableModels
        .filter((model) =>
          model.toLowerCase().includes(focusedValue.toLowerCase()),
        )
        .slice(0, 25)
        .map((model) => ({ name: model, value: model }))
      console.log(`Filtered choices for /model: ${choices.length}`)
    }
    // Add more autocomplete logic for other commands/options here

    console.log(`Responding to autocomplete with ${choices.length} choices.`)
    await interaction.respond(choices)
    console.log(
      `Successfully responded to autocomplete for ${interaction.commandName}:${focusedOption.name}`,
    )
  } catch (error) {
    // Enhanced logging in catch block
    console.error('!!! Error caught in _handleAutocomplete:', error); // Raw console log before direct log
    // Log using console.error directly now
    console.error('Autocomplete handling failed', error)
    console.error('!!! Logged error via console.error in _handleAutocomplete') // Raw console log after direct log
    // It's generally recommended NOT to respond in the catch for autocomplete
    // as Discord might show a generic failure message anyway.
    // Responding with [] might suppress useful errors from Discord side.
    // If you must respond, uncomment below:
    // try {
    //   await interaction.respond([]);
    // } catch (respondError) {
    //   console.error('!!! Failed to send empty response in autocomplete catch:', respondError);
    // }
  }
}

// --- Main Function ---

const discordAdapter = {
  async start() {
    // Wrap the core logic in a promise
    return new Promise(async (resolve, reject) => {
      // Corrected property name: discordBotToken (capital B)
      if (!config.discordBotToken) {
        // Updated error message to match .env.example variable name
        return reject(
          new Error('DISCORD_BOT_TOKEN is not set in the environment.'),
        )
      }

      client = new Client({
        intents: [
          GatewayIntentBits.Guilds,
          GatewayIntentBits.GuildMessages,
          GatewayIntentBits.MessageContent, // Required for reading message content
          GatewayIntentBits.GuildMembers, // Required for checking roles
        ],
        partials: [Partials.Message, Partials.Channel, Partials.GuildMember], // Necessary for uncached events
      })

      client.once(Events.ClientReady, (readyClient) => {
        console.log(`Ready! Logged in as ${readyClient.user.tag}`)
        // Initialize core service AFTER bot is ready, ensuring repo path is set
        // Assuming initializeCore is a named export in core.js
        coreService
          .initializeCore({ repoPath: config.repoPath })
          .then(() => {
            console.log(
              'Core service initialized successfully after Discord login.',
            )
            resolve() // Resolve the main promise ONLY after core init succeeds
          })
          .catch((err) => {
            console.error('FATAL: Core service initialization failed:', err)
            // Reject the main promise if core init fails
            reject(err)
            // Consider exiting or alerting - process.exit might still be appropriate here
            // depending on desired behavior, but rejecting allows await-ers to handle it.
            process.exit(1)
          })
      })

      client.on(Events.MessageCreate, async (message) => {
        // Ignore messages from bots
        if (message.author.bot) return
        if (!client.user) return; // Basic check for client readiness

        // Check if user is allowed
        if (!(await _isAllowedUser(message))) {
          console.log(
            `Ignoring message from disallowed user ${message.author.id}`,
          )
          // Optionally reply that the user is not allowed
          // await message.reply({ content: "Sorry, you don't have permission to use this bot.", ephemeral: true });
          return
        }

        const isThread = message.channel.isThread();
        const mentionedBot = message.mentions.has(client.user.id);

        // Determine if it's an initial mention or a thread message
        if (isThread) {
          // If in a thread the bot is already participating in (presumably created by the bot or one it joined).
          // We assume messages here are intended for the bot.
          // _isAllowedUser check is already done above.
          // _handleThreadMessage will strip mentions if any are present.
          await _handleThreadMessage(message)
        } else if (mentionedBot) {
          // Handle initial mention in a non-thread channel
          await _handleInitialMention(message)
        }
        // Other messages (not in a relevant thread, not mentioning the bot) are ignored.
      })

      client.on(Events.InteractionCreate, async (interaction) => {
        // Log interaction receipt
        console.log(
          `Interaction received: type=${interaction.type}, id=${interaction.id}, user=${interaction.user.id}, commandName=${interaction.commandName || 'N/A'}`,
        )
        try {
          // Check if user is allowed (important for interactions too)
          if (!(await _isAllowedUser(interaction))) {
            console.log(
              `Ignoring interaction from disallowed user ${interaction.user.id}`,
            )
            // Interactions need specific replies if denied
            if (interaction.isRepliable()) {
              await interaction.reply({
                content: "Sorry, you don't have permission to use this bot.",
                ephemeral: true,
              })
            }
            return
          }

          if (interaction.isChatInputCommand()) {
            await _handleCommand(interaction)
          } else if (interaction.isAutocomplete()) {
            console.log(
              `Interaction is Autocomplete, calling _handleAutocomplete...`,
            ) // Log before calling handler
            await _handleAutocomplete(interaction)
          } else {
            console.warn(
              `Received unhandled interaction type: ${interaction.type}`,
            )
          }
        } catch (error) {
          // Top-level catch for interaction handling
          console.error('Interaction handling failed at top level', error)
          // Try to inform the user if possible
          if (interaction.isRepliable()) {
            try {
              // Use followUp if reply/editReply might have already been used or failed
              await interaction
                .followUp({
                  content:
                    'An unexpected error occurred while processing your request.',
                  ephemeral: true,
                })
                .catch((e) =>
                  console.error(
                    'Failed to send followUp error reply in top-level catch',
                    e,
                  ),
                )
            } catch (replyError) {
              // If followUp also fails, log it.
              console.error(
                'Failed to send any error reply in top-level catch',
                replyError,
              )
            }
          }
        }
      })

      try {
        // Corrected property name: discordBotToken (capital B)
        await client.login(config.discordBotToken)
        // Don't resolve here; resolve happens inside ClientReady after core init
      } catch (loginError) {
        console.error('Discord client login failed:', loginError)
        reject(loginError) // Reject the main promise if login fails
      }
    }) // End of Promise constructor
  }, // End of start method

  stop() {
    console.log('Stopping Discord client...')
    return client?.destroy() // Gracefully disconnect
  },

  // Expose client for potential external use (e.g., testing, specific commands)
  getClient() {
    return client
  },
}

export default discordAdapter
