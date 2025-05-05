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
import { createLogger, format, transports } from 'winston'
import config from './config.js'
import coreService from './core.js'
import { splitMessage } from './utils.js'

const { combine, timestamp, label, printf, errors } = format

// Setup logging
const logFormat = printf(({ level, message, label: lbl, timestamp: ts, stack }) => {
  return `${ts} ${lbl}:${level}: ${stack || message}`
})

const createLoggerWithOptions = (labelName) =>
  createLogger({
    level: config.logLevel,
    format: combine(
      label({ label: labelName }),
      timestamp(),
      errors({ stack: true }), // Log stack traces
      logFormat,
    ),
    transports: [new transports.Console()],
  })

const log = createLoggerWithOptions('vibemob:discord').info
const logWarn = createLoggerWithOptions('vibemob:discord').warn
const logError = createLoggerWithOptions('vibemob:discord').error

// --- Discord Client Setup ---
let client

// --- Utility Functions ---

async function sendLog(level, message, error = null) {
  const consoleArgs = [message]
  if (error) consoleArgs.push(error)
  switch (level) {
    case 'error':
      logError(...consoleArgs)
      break
    case 'warn':
      logWarn(...consoleArgs)
      break
    default:
      log(...consoleArgs)
  }
  // TODO: Add optional Discord channel logging here if needed
}

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
    sendLog(
      'error',
      `Error reading directory ${dirPath} during recursive list`,
      error,
    )
  }
  return results
}

// --- Core Logic Wrappers ---

async function _isAllowedUser(interactionOrMessage) {
  if (!config.allowedGuildId || !config.allowedRoleId) {
    logWarn(
      'allowedGuildId or allowedRoleId not configured. Allowing all users.',
    )
    return true // Allow if not configured (useful for testing)
  }

  if (interactionOrMessage.guildId !== config.allowedGuildId) {
    log(
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
    logWarn(
      `Could not fetch member for user ${
        interactionOrMessage.author?.id || interactionOrMessage.user?.id
      } in guild ${interactionOrMessage.guildId}`,
    )
    return false // Cannot verify roles
  }

  const hasRole = member.roles.cache.has(config.allowedRoleId)
  if (!hasRole) {
    log(
      `Interaction/message denied: User ${member.id} lacks role ${config.allowedRoleId}.`,
    )
  }
  return hasRole
}

async function _relayCoreResponse(response, target) {
  log(`Relaying core response to target ${target.id}`)
  if (!response || !response.content) {
    logWarn('Core response was empty or invalid.')
    await target.send('Sorry, something went wrong and I received no response.')
    return
  }

  const chunks = splitMessage(response.content) // Use utility for splitting
  for (const chunk of chunks) {
    try {
      await target.send(chunk)
    } catch (error) {
      sendLog('error', `Failed to send message chunk to ${target.id}`, error)
      // Decide if we should stop or continue sending chunks
      break // Stop sending chunks on error
    }
  }
}

// --- Event Handlers ---

async function _handleInitialMention(message) {
  log(`Handling initial mention from user ${message.author.id}`)
  if (message.channel.type !== ChannelType.GuildText) {
    logWarn('Mention received in non-text channel, ignoring.')
    return
  }

  // Extract the prompt (remove the bot mention)
  const prompt = message.content.replace(/<@!?\d+>/, '').trim()
  if (!prompt) {
    await message.reply(
      'Please provide an initial prompt after mentioning me.',
    )
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
    log(`Created thread ${thread.id} for user ${message.author.id}`)
    await thread.sendTyping()
  } catch (error) {
    sendLog('error', 'Failed to create thread', error)
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
    sendLog('error', 'Error processing initial mention in core service', error)
    await thread.send(
      'Sorry, I encountered an internal error processing your request.',
    )
  }
}

async function _handleThreadMessage(message) {
  log(
    `Handling thread message in ${message.channel.id} from user ${message.author.id}`,
  )
  if (!message.channel.isThread()) {
    logWarn('Received message in non-thread channel, ignoring.') // Should not happen if logic is correct
    return
  }

  // Basic check: Is the thread related to our bot? (e.g., based on name or stored mapping)
  // For now, assume any message in a thread the bot is part of is for the bot.
  // More robust: Check if thread was created by the bot or map thread IDs to users.

  await message.channel.sendTyping()
  try {
    const response = await coreService.handleIncomingMessage({
      message: message.content,
      userId: message.author.id, // Assuming thread participation implies interaction
    })
    await _relayCoreResponse(response, message.channel)
  } catch (error) {
    sendLog('error', 'Error processing thread message in core service', error)
    await message.channel.send(
      'Sorry, I encountered an internal error processing your message.',
    )
  }
}

async function _handleCommand(interaction) {
  log(
    `Handling command ${interaction.commandName} from user ${interaction.user.id}`,
  )
  const { commandName } = interaction
  const userId = interaction.user.id

  await interaction.deferReply({ ephemeral: true }) // Defer for potentially long operations

  try {
    let responseContent = 'Command processed.' // Default response

    if (commandName === 'ping') {
      responseContent = 'Pong!'
    } else if (commandName === 'context') {
      const files = coreService.getContextFiles({ userId })
      if (files.length === 0) {
        responseContent = 'Your context is currently empty.'
      } else {
        responseContent =
          '**Current Context:**\n' +
          files
            .map((f) => `- \`${f.path}\`${f.readOnly ? ' (read-only)' : ''}`)
            .join('\n')
      }
    } else if (commandName === 'add') {
      const filePath = interaction.options.getString('path', true)
      const readOnly =
        interaction.options.getBoolean('read-only', false) ?? false // Default to false if not provided
      const result = await coreService.addFileToContext({
        userId,
        filePath,
        readOnly,
      })
      responseContent = result.message
    } else if (commandName === 'remove') {
      const filePath = interaction.options.getString('path', true)
      const result = await coreService.removeFileFromContext({
        userId,
        filePath,
      })
      responseContent = result.message
    } else if (commandName === 'clear') {
      await coreService.clearContext({ userId })
      responseContent = 'Context cleared.'
    } else if (commandName === 'model') {
      const modelName = interaction.options.getString('name', true)
      await coreService.setModel({ userId, modelName })
      responseContent = `Model set to \`${modelName}\`.`
    } else if (commandName === 'push') {
      const result = await coreService.pushChanges({ userId })
      responseContent = result.message // Should contain success or error message
    } else if (commandName === 'config') {
      const apiBase = interaction.options.getString('api_base')
      const apiKey = interaction.options.getString('api_key')
      if (!apiBase && !apiKey) {
        responseContent =
          'You must provide at least `api_base` or `api_key`.'
      } else {
        await coreService.setConfigOverrides({ userId, apiBase, apiKey })
        responseContent = 'Configuration overrides applied for this session.'
      }
    } else {
      responseContent = 'Unknown command.'
      logWarn(`Received unknown command: ${commandName}`)
    }

    // Split potentially long responses (like large context lists)
    const chunks = splitMessage(responseContent)
    await interaction.editReply(chunks[0]) // Send first chunk via editReply
    for (let i = 1; i < chunks.length; i++) {
      await interaction.followUp({ content: chunks[i], ephemeral: true }) // Send subsequent chunks via followUp
    }
  } catch (error) {
    sendLog('error', `Error executing command ${commandName}`, error)
    const errorMessage =
      'Sorry, I encountered an internal error trying to execute that command.'
    // Try to edit the deferred reply, otherwise follow up
    try {
      await interaction.editReply({ content: errorMessage, ephemeral: true })
    } catch (editError) {
      sendLog(
        'error',
        'Failed to edit deferred reply after command error',
        editError,
      )
      try {
        await interaction.followUp({ content: errorMessage, ephemeral: true })
      } catch (followUpError) {
        sendLog(
          'error',
          'Failed to send followUp after command error and edit error',
          followUpError,
        )
      }
    }
  }
}

async function _handleAutocomplete(interaction) {
  const { commandName, options } = interaction
  const focusedOption = options.getFocused(true)
  const focusedValue = focusedOption.value
  const userId = interaction.user.id

  // Log the interaction object/options for inspection
  log(`Autocomplete triggered for command: ${commandName}, option: ${focusedOption.name}, value: "${focusedValue}", user: ${userId}`)
  try {
    // Log the raw options object for deeper inspection if needed
    log(`Autocomplete interaction options: ${JSON.stringify(interaction.options, null, 2)}`);
  } catch (stringifyError) {
    logWarn('Could not stringify interaction options for logging', stringifyError);
  }


  try {
    let choices = []

    if (commandName === 'add' && focusedOption.name === 'path') {
      log('Autocomplete for /add path: Listing files...')
      // Use the globally accessible repo path from core service
      const repoPath = coreService.getRepoPath()
      if (!repoPath) {
        logWarn('Repo path not available for autocomplete.')
        // Respond with empty or error message? Empty for now.
      } else {
        const allFiles = await listFilesRecursive(repoPath)
        log(`Found ${allFiles.length} potential files/dirs for autocomplete.`)
        choices = allFiles
          .filter((file) => file.toLowerCase().includes(focusedValue.toLowerCase()))
          .slice(0, 25) // Limit to Discord's max choices
          .map((file) => ({ name: file, value: file }))
        log(`Filtered choices for /add: ${choices.length}`)
      }
    } else if (commandName === 'remove' && focusedOption.name === 'path') {
      log('Autocomplete for /remove path: Getting context files...')
      const contextFiles = coreService.getContextFiles({ userId }) // Get {path, readOnly} objects
      log(`Found ${contextFiles.length} context files for user ${userId}.`)
      choices = contextFiles
        .filter((file) => file.path.toLowerCase().includes(focusedValue.toLowerCase()))
        .slice(0, 25)
        .map((file) => ({ name: file.path, value: file.path })) // Map to name/value pairs
      log(`Filtered choices for /remove: ${choices.length}`)
    } else if (commandName === 'model' && focusedOption.name === 'name') {
      log('Autocomplete for /model name: Providing default models...')
      const defaultModels = [
        'openai/gpt-4o',
        'openai/gpt-4-turbo',
        'anthropic/claude-3.5-sonnet',
        'anthropic/claude-3-opus',
        'google/gemini-pro-1.5',
        // Add more common/recommended models
      ]
      choices = defaultModels
        .filter((model) => model.toLowerCase().includes(focusedValue.toLowerCase()))
        .slice(0, 25)
        .map((model) => ({ name: model, value: model }))
      log(`Filtered choices for /model: ${choices.length}`)
    }
    // Add more autocomplete logic for other commands/options here

    log(`Responding to autocomplete with ${choices.length} choices.`)
    await interaction.respond(choices)
    log(`Successfully responded to autocomplete for ${commandName}:${focusedOption.name}`)

  } catch (error) {
    // Enhanced logging in catch block
    console.error('!!! Error caught in _handleAutocomplete:', error); // Raw console log before sendLog
    sendLog('error', 'Autocomplete handling failed', error);
    console.error('!!! Logged error via sendLog in _handleAutocomplete'); // Raw console log after sendLog
    // It's generally recommended NOT to respond in the catch for autocomplete
    // as Discord might show a generic failure message anyway.
    // Responding with [] might suppress useful errors from Discord side.
    // If you must respond, uncomment below:
    // try {
    //   await interaction.respond([]);
    // } catch (respondError) {
    //   console.error('!!! Failed to send empty response in autocomplete catch:', respondError);
    //   sendLog('error', 'Failed to send empty response in autocomplete catch', respondError);
    // }
  }
}


// --- Main Function ---

const discordAdapter = {
  async start() {
    if (!config.discordToken) {
      throw new Error('DISCORD_TOKEN is not set in the environment.')
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
      log(`Ready! Logged in as ${readyClient.user.tag}`)
      // Initialize core service AFTER bot is ready, ensuring repo path is set
      coreService
        .initializeCore({ repoPath: config.repoPath })
        .then(() => {
          log('Core service initialized successfully after Discord login.')
        })
        .catch((err) => {
          logError('FATAL: Core service initialization failed:', err)
          // Consider exiting or alerting
          process.exit(1)
        })
    })

    client.on(Events.MessageCreate, async (message) => {
      // Ignore messages from bots and messages not mentioning the bot directly
      if (message.author.bot) return
      if (!client.user || !message.mentions.has(client.user.id)) return

      // Check if user is allowed
      if (!(await _isAllowedUser(message))) {
        log(`Ignoring message from disallowed user ${message.author.id}`)
        // Optionally reply that the user is not allowed
        // await message.reply({ content: "Sorry, you don't have permission to use this bot.", ephemeral: true });
        return
      }

      // Determine if it's an initial mention or a thread message
      if (message.channel.isThread()) {
        // Check if it's a thread likely related to the bot (e.g., created by it)
        // For now, handle all messages in threads the bot is in
        await _handleThreadMessage(message)
      } else if (message.mentions.has(client.user.id)) {
        // Handle initial mention in a text channel
        await _handleInitialMention(message)
      }
    })

    client.on(Events.InteractionCreate, async (interaction) => {
      // Log interaction receipt
      log(`Interaction received: type=${interaction.type}, id=${interaction.id}, user=${interaction.user.id}, commandName=${interaction.commandName || 'N/A'}`);
      try {
        // Check if user is allowed (important for interactions too)
        if (!(await _isAllowedUser(interaction))) {
          log(
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
          log(`Interaction is Autocomplete, calling _handleAutocomplete...`); // Log before calling handler
          await _handleAutocomplete(interaction)
        } else {
          logWarn(`Received unhandled interaction type: ${interaction.type}`)
        }
      } catch (error) {
        // Top-level catch for interaction handling
        sendLog('error', 'Interaction handling failed at top level', error)
        // Try to inform the user if possible
        if (interaction.isRepliable()) {
          try {
            // Use followUp if reply/editReply might have already been used or failed
            await interaction.followUp({
              content: 'An unexpected error occurred while processing your request.',
              ephemeral: true,
            }).catch(e => sendLog('error', 'Failed to send followUp error reply in top-level catch', e));
          } catch (replyError) {
             // If followUp also fails, log it.
             sendLog('error', 'Failed to send any error reply in top-level catch', replyError);
          }
        }
      }
    })

    await client.login(config.discordToken)
  },

  stop() {
    log('Stopping Discord client...')
    return client?.destroy() // Gracefully disconnect
  },

  // Expose client for potential external use (e.g., testing, specific commands)
  getClient() {
    return client
  },
}

export default discordAdapter
