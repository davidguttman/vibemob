// console.log('--- app.js started ---');
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

// --- Load .env file FIRST ---
const __filename_dotenv = fileURLToPath(import.meta.url);
const __dirname_dotenv = path.dirname(__filename_dotenv);
const envPath = path.resolve(__dirname_dotenv, '.env');
dotenv.config({ path: envPath });
console.log(`Dotenv loaded from ${envPath} (exists: ${fs.existsSync(envPath)})`);
// --- End .env load ---

import debug from 'debug';
import { coreService } from './lib/core.js';
import { discordAdapter } from './lib/discord-adapter.js';
import config from './lib/config.js'; // Import config AFTER dotenv has run

const log = debug('vibemob:app');
const logError = debug('vibemob:app:error');
logError.log = console.error.bind(console);

async function main() {
  log('Starting application...');

  if (!config.repoPath) {
    log('WARN: repoPath is not defined in config. Core service features requiring a repository (like Aider) will be unavailable.');
  }

  try {
    if (config.repoPath) {
      log(`Initializing core service with repo path: ${config.repoPath}`);
      await coreService.initializeCore({ repoPath: config.repoPath });
      log('Core service initialized successfully.');
    } else {
      log('Skipping core service initialization as repoPath is not configured.');
    }

    log('Starting Discord adapter...');
    await discordAdapter.start(); // Assuming start() handles login etc.
    log('Application started successfully.');

  } catch (error) {
    logError('Application failed to start:', error);
    process.exit(1);
  }
}

main(); 