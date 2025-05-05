import dotenv from 'dotenv' // UNCOMMENT
import path from 'path'
import { fileURLToPath } from 'url'

// ESM equivalent for __dirname
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Load .env file from the project root (one level up from lib)
const envPath = path.resolve(__dirname, '../.env') // UNCOMMENT
// Only load .env file if not in test environment
// UNCOMMENT dotenv logic block
if (process.env.NODE_ENV !== 'test') {
  const result = dotenv.config({ path: envPath })
  if (result.error) {
    console.warn(
      `Warning: Could not load .env file from ${envPath}:`,
      result.error.message,
    )
    // Don't exit, maybe vars are provided by system env
  } else {
    console.log('Loaded .env file from:', envPath)
  }
} else {
  console.log("NODE_ENV is 'test', skipping .env file load.")
}
// END UNCOMMENT

// Define default values where appropriate, but require essential ones.
const config = {
  // Discord Bot Token (Required)
  discordBotToken: process.env.DISCORD_BOT_TOKEN,
  discordBotUserId: process.env.DISCORD_BOT_USER_ID, // Read the ID here, it should be populated now
  discordGuildId: process.env.DISCORD_GUILD_ID, // Use DISCORD_GUILD_ID from .env
  discordRoleId: process.env.DISCORD_ROLE_ID, // Use DISCORD_ROLE_ID from .env (assuming this matches .env too)
  discordLoggingChannelId: process.env.LOGGING_CHANNEL_ID || null,

  // Aider/LLM Configuration
  // Use AIDER_API_BASE if set, otherwise fallback to AIDER_TARGET_API for testing,
  // otherwise default to OpenRouter.
  aiderApiBase:
    process.env.AIDER_API_BASE ||
    process.env.AIDER_TARGET_API ||
    'https://openrouter.ai/api/v1',
  // Prefer OPENROUTER_API_KEY if set (used in tests), otherwise use AIDER_API_KEY.
  aiderApiKey: process.env.OPENROUTER_API_KEY || process.env.AIDER_API_KEY,
  defaultModel: process.env.DEFAULT_MODEL || 'openai/gpt-4o',

  // Git Configuration
  repoUrl: process.env.REPO_URL, // Often set by test environment
  startingBranch: process.env.STARTING_BRANCH || 'main',
  workingBranch: process.env.WORKING_BRANCH || 'aider-bot-dev',
  // SSH Private Key Content (Base64 encoded) for deployment
  sshPrivateKeyB64: process.env.SSH_PRIVATE_KEY_B64,

  // --- NEW: Local path for the Git repository workspace ---
  repoPath: '/tmp/vibemob-repo', // Use standard temp directory

  // Echoproxia (for testing)
  echoproxiaMode: process.env.ECHOPROXIA_MODE || 'replay', // 'record' or 'replay'
  echoproxiaRecordingsDir: process.env.ECHOPROXIA_RECORDING_DIR, // Optional specific dir

  // Other
  logLevel: process.env.LOG_LEVEL || 'info',

  // --- NEW: List of models for autocomplete ---
  // TODO: Consider fetching this dynamically from the provider if possible in the future
  availableModels: [
    'openai/gpt-4o',
    'openai/gpt-4-turbo',
    'openai/gpt-3.5-turbo',
    'anthropic/claude-3-opus-20240229',
    'anthropic/claude-3-sonnet-20240229',
    'anthropic/claude-3-haiku-20240307',
    'google/gemini-pro', // Example, adjust based on actual provider
    // Add other commonly used models here
  ],
  // --- END NEW ---
}

// --- Validation ---
// Ensure required variables are present
// Add discordBotUserId back temporarily for validation, can be removed if mention logic works
const requiredVars = [
  'discordBotToken',
  'discordBotUserId',
  'aiderApiKey',
  'repoUrl',
]
const missingVars = requiredVars.filter((key) => !config[key])

// Add SSH key path validation specifically for non-test environments
// if (process.env.NODE_ENV !== 'test' && !config.sshKeyPath) {
//   missingVars.push('sshKeyPath (via SSH_PRIVATE_KEY_PATH)');
// }
// Add validation for the base64 SSH key in non-test environments
if (process.env.NODE_ENV !== 'test' && !config.sshPrivateKeyB64) {
  missingVars.push('sshPrivateKeyB64 (via SSH_PRIVATE_KEY_B64)')
}

if (missingVars.length > 0 && process.env.NODE_ENV !== 'test') {
  // Only throw error outside of test environment
  console.error(
    `Error: Missing required environment variables: ${missingVars.join(', ')}`,
  )
  console.error(`Please ensure they are set in your .env file or environment.`)
  process.exit(1)
}
// --- End Validation ---

console.log('process.env.NODE_ENV', process.env.NODE_ENV)
console.log('config', config)

export default config
