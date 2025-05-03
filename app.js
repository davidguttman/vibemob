import debug from 'debug';
import { coreService } from './lib/core.js';
import { discordAdapter } from './lib/discord-adapter.js';
import config from './lib/config.js'; // Import config for repoPath

const log = debug('vibemob:app');
const logError = debug('vibemob:app:error');
logError.log = console.error.bind(console);

async function main() {
  log('Starting application...');

  if (!config.repoPath) {
    logError('FATAL: repoPath is not defined in config. Cannot initialize core service.');
    process.exit(1);
  }

  try {
    log(`Initializing core service with repo path: ${config.repoPath}`);
    await coreService.initializeCore({ repoPath: config.repoPath });
    log('Core service initialized successfully.');

    log('Starting Discord adapter...');
    await discordAdapter.start(); // Assuming start() handles login etc.
    log('Application started successfully.');

  } catch (error) {
    logError('Application failed to start:', error);
    process.exit(1);
  }
}

main(); 