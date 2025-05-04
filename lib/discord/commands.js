// lib/discord/commands.js
import { SlashCommandBuilder } from '@discordjs/builders';

// Define all slash commands here
const commandBuilders = [
  new SlashCommandBuilder()
    .setName('model')
    .setDescription('Sets the LLM model for subsequent Aider interactions.')
    .addStringOption(option =>
      option.setName('model_name')
        .setDescription('The name of the model (e.g., openai/gpt-4o)')
        .setRequired(true)
        .setAutocomplete(true)),
  new SlashCommandBuilder()
    .setName('add')
    .setDescription('Adds a file or directory to the Aider context.')
    .addStringOption(option =>
      option.setName('path')
        .setDescription('Relative path to the file/directory')
        .setRequired(true)
        .setAutocomplete(true)), // Autocomplete enabled
  new SlashCommandBuilder()
    .setName('remove')
    .setDescription('Removes a file or directory from the Aider context.')
    .addStringOption(option =>
      option.setName('path')
        .setDescription('Relative path to remove')
        .setRequired(true)
        .setAutocomplete(true)), // Autocomplete enabled
  new SlashCommandBuilder()
    .setName('clear')
    .setDescription('Clears the entire Aider context.'),
  // Add new commands here
  new SlashCommandBuilder()
    .setName('context')
    .setDescription('Show the current files and directories in the chat context'),
];

// Export command names for use in the adapter's interaction handler
export const commandNames = commandBuilders.map(cmd => cmd.name);

// Export the JSON representation needed for deployment
export const commandData = commandBuilders.map(command => command.toJSON()); 