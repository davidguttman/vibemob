// scripts/deploy-commands.js
import { REST } from '@discordjs/rest';
import { Routes } from 'discord-api-types/v10';
import config from '../lib/config.js'; // Adjust path as needed
import { commandData } from '../lib/discord/commands.js'; // Import the command JSON data
import debug from 'debug';
import { SlashCommandBuilder } from '@discordjs/builders';

const log = debug('vibemob:deploy');
const logError = debug('vibemob:deploy:error');
logError.log = console.error.bind(console);

const token = config.discordBotToken;
const clientId = config.discordBotUserId; 
const guildId = config.discordGuildId;

// Validation
if (!token) {
    logError('FATAL: DISCORD_BOT_TOKEN is missing in config.');
    process.exit(1);
}
if (!clientId) {
    // We need the bot's user ID (client ID) to register commands
    logError('FATAL: DISCORD_BOT_USER_ID is missing in config. Cannot deploy commands.');
    process.exit(1);
}
if (!guildId) {
    logError('FATAL: GUILD_ID is missing in config. Cannot deploy guild commands.');
    process.exit(1);
}

log(`Imported ${commandData.length} command definitions.`);
// Instantiate REST client
const rest = new REST({ version: '10' }).setToken(token);

// Deploy command
(async () => {
  try {
    log(`Started refreshing ${commandData.length} application (/) commands for guild ${guildId}.`);

    // The put method is used to fully refresh all commands in the guild with the current set
    const data = await rest.put(
      Routes.applicationGuildCommands(clientId, guildId),
      { body: commandData },
    );

    log(`Successfully reloaded ${data.length} application (/) commands.`);
  } catch (error) {
    logError('Failed to deploy commands:', error);
    process.exitCode = 1; // Indicate failure
  }
})();

const showCommand = new SlashCommandBuilder()
    .setName('show')
    .setDescription('Shows the full content of a file from the repository.')
    .addStringOption(option =>
        option.setName('path')
            .setDescription('The relative path to the file within the repository.')
            .setRequired(true));

const commands = [
    ...commandData,
    showCommand.toJSON()
];

// ... rest of the script ... 