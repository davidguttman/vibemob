// lib/discord/commands.js
import { SlashCommandBuilder } from '@discordjs/builders'
import config from '../config.js' // Import config to get the prefix

// Helper function to apply prefix
const prefixCommandName = (baseName) => {
  return config.commandPrefix ? `${config.commandPrefix}_${baseName}` : baseName
}

// Define all slash commands using base names
const baseCommands = [
  { name: 'ping', description: 'Replies with Pong!' },
  {
    name: 'model',
    description: 'Sets the LLM model for subsequent Aider interactions.',
    options: [
      {
        type: 'string',
        name: 'model_name',
        description: 'The name of the model (e.g., openai/gpt-4o)',
        required: true,
        autocomplete: true,
      },
    ],
  },
  {
    name: 'add',
    description: 'Adds a file or directory to the Aider context.',
    options: [
      {
        type: 'string',
        name: 'path',
        description: 'Relative path to the file/directory',
        required: true,
        autocomplete: true,
      },
      {
        type: 'boolean',
        name: 'read-only',
        description: 'Add the file as read-only (default: false)',
        required: false,
      },
    ],
  },
  {
    name: 'remove',
    description: 'Removes a file or directory from the Aider context.',
    options: [
      {
        type: 'string',
        name: 'path',
        description: 'Relative path to remove',
        required: true,
        autocomplete: true,
      },
    ],
  },
  {
    name: 'clear',
    description: 'Clears the entire Aider context.',
  },
  {
    name: 'context',
    description: 'Show the current files and directories in the chat context',
  },
  {
    name: 'push',
    description: 'Pushes the current changes made by Aider to the remote repository.',
  },
  {
    name: 'config',
    description: 'Set temporary configuration overrides for your session.',
    options: [
      {
        type: 'string',
        name: 'api_base',
        description: 'Override the LLM API base URL',
        required: false,
      },
      {
        type: 'string',
        name: 'api_key',
        description: 'Override the LLM API key',
        required: false,
      },
    ],
  },
]

// Build command data with prefix applied
const commandBuilders = baseCommands.map((cmd) => {
  const builder = new SlashCommandBuilder()
    .setName(prefixCommandName(cmd.name))
    .setDescription(cmd.description)

  if (cmd.options) {
    cmd.options.forEach((opt) => {
      switch (opt.type) {
        case 'string':
          builder.addStringOption((option) => {
            option
              .setName(opt.name)
              .setDescription(opt.description)
              .setRequired(opt.required)
            if (opt.autocomplete) {
              option.setAutocomplete(true)
            }
            return option
          })
          break
        case 'boolean':
          builder.addBooleanOption((option) =>
            option
              .setName(opt.name)
              .setDescription(opt.description)
              .setRequired(opt.required),
          )
          break
        // Add other option types as needed
      }
    })
  }
  return builder
})

// Export command names *with prefix* for use in the adapter's interaction handler
export const commandNames = commandBuilders.map((cmd) => cmd.name)

// Export the JSON representation *with prefix* needed for deployment
export const commandData = commandBuilders.map((command) => command.toJSON())
