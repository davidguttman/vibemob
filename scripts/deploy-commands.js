import { REST } from '@discordjs/rest'
import { Routes } from 'discord-api-types/v10'
import config from '../lib/config.js' // Import config to get token, client ID, guild ID
import { commandData } from '../lib/discord/commands.js' // Import the potentially prefixed command data
import debug from 'debug'

const log = debug('vibemob:deploy')
const logError = debug('vibemob:deploy:error')
logError.log = console.error.bind(console)

// --- Validation ---
if (!config.discordBotToken) {
  logError('Error: DISCORD_BOT_TOKEN is missing in config.')
  process.exit(1)
}
if (!config.discordBotUserId) {
  logError('Error: DISCORD_BOT_USER_ID is missing in config.')
  process.exit(1)
}
if (!config.discordGuildId) {
  logError(
    'Error: DISCORD_GUILD_ID is missing in config. Cannot deploy guild-specific commands.',
  )
  process.exit(1)
}
// --- End Validation ---

const rest = new REST({ version: '10' }).setToken(config.discordBotToken)

;(async () => {
  try {
    log(`Imported ${commandData.length} command definitions.`)
    log(
      `Started refreshing ${commandData.length} application (/) commands for guild ${config.discordGuildId}.`,
    )

    // Use commandData directly as it now contains the prefixed names
    const data = await rest.put(
      Routes.applicationGuildCommands(
        config.discordBotUserId,
        config.discordGuildId,
      ),
      { body: commandData }, // Send the potentially prefixed command data
    )

    log(
      `Successfully reloaded ${data.length} application (/) commands.`,
    )
  } catch (error) {
    logError('Failed to deploy commands:', error)
  }
})()
