// lib/discord/index.js

// Conditionally export the real discord.js or the mock implementation
// based on the NODE_ENV environment variable.
let discordExports

if (process.env.NODE_ENV === 'test') {
  console.log('Using Discord Double (Test Environment)')
  // Ensure this path correctly points to the test implementation
  // Use dynamic import for conditional loading in ESM
  const testDiscord = await import('./discord-test.js')
  discordExports = testDiscord
} else {
  // Import the real discord.js library
  const realDiscord = await import('discord.js')
  discordExports = realDiscord
}

// Re-export all named exports from the chosen module
// We need to destructure and export explicitly for ESM
export const {
  Client,
  Events,
  GatewayIntentBits,
  AttachmentBuilder,
  SlashCommandBuilder,
  EmbedBuilder,
  // Add any other exports needed by the application here
} = discordExports
