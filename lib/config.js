import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// ESM equivalent for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env file from the project root (one level up from lib)
const envPath = path.resolve(__dirname, '../.env');
dotenv.config({ path: envPath });

// Define default values where appropriate, but require essential ones.
const config = {
  // Discord Bot Token (Required)
  discordBotToken: process.env.DISCORD_BOT_TOKEN,

  // Aider/LLM Configuration
  // Use AIDER_API_BASE if set, otherwise fallback to AIDER_TARGET_API for testing,
  // otherwise default to OpenRouter.
  aiderApiBase: process.env.AIDER_API_BASE || process.env.AIDER_TARGET_API || 'https://openrouter.ai/api/v1',
  // Prefer OPENROUTER_API_KEY if set (used in tests), otherwise use AIDER_API_KEY.
  aiderApiKey: process.env.OPENROUTER_API_KEY || process.env.AIDER_API_KEY,
  defaultModel: process.env.DEFAULT_MODEL || 'openai/gpt-4o',

  // Git Configuration
  repoUrl: process.env.REPO_URL, // Often set by test environment
  startingBranch: process.env.STARTING_BRANCH || 'main',
  workingBranch: process.env.WORKING_BRANCH || 'aider-bot-dev',
  // SSH key path might be needed if not handled by agent or default locations
  // sshKeyPath: process.env.SSH_PRIVATE_KEY_PATH,

  // Echoproxia (for testing)
  echoproxiaMode: process.env.ECHOPROXIA_MODE || 'replay', // 'record' or 'replay'
  echoproxiaRecordingsDir: process.env.ECHOPROXIA_RECORDING_DIR, // Optional specific dir

  // Other
  logLevel: process.env.LOG_LEVEL || 'info',
};

// --- Validation ---
// Ensure required variables are present
const requiredVars = ['discordBotToken', 'aiderApiKey', 'repoUrl'];
const missingVars = requiredVars.filter(key => !config[key]);

if (missingVars.length > 0 && process.env.NODE_ENV !== 'test') {
  // Only throw error outside of test environment, as tests might mock/set these differently
  console.error(`Error: Missing required environment variables: ${missingVars.join(', ')}`);
  console.error(`Please ensure they are set in your .env file or environment.`);
  process.exit(1);
}
// --- End Validation ---


export default config; 