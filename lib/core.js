import debug from 'debug';
import path from 'path';
import { gitService } from './git-service.js';
import { aiderService } from './aider.js';

// Constants (Consider making these configurable)
const STARTING_BRANCH = 'main';
const WORKING_BRANCH = 'aider-bot-dev';
const DEFAULT_MODEL = 'openai/gpt-4o'; // Or fetch from config

// Environment Variables
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || 'dummy-key-if-not-set'; // Use host env var or fallback to dummy

const log = debug('vibemob:core');
const logError = debug('vibemob:core:error');
logError.log = console.error.bind(console); // Direct errors to stderr

// --- Core Service State ---
let coreState = {
  repoPath: null,
  isInitialized: false,
  currentModel: DEFAULT_MODEL,
  aiderInstance: null, // Placeholder for aider instance/config
  contextFiles: [], // Track files added to context
};

// --- Initialization Function ---
async function initializeCore({ repoPath }) {
  // Always reset state on initialization call for testability
  log('Resetting core state for initialization...');
  coreState = {
    repoPath: null,
    isInitialized: false,
    currentModel: DEFAULT_MODEL,
    aiderInstance: null,
    contextFiles: [],
  };

  if (!repoPath) {
    throw new Error('repoPath is required for core initialization.');
  }

  log(`Initializing core service for repo: ${repoPath}`);
  coreState.repoPath = repoPath;

  try {
    // 1. Ensure repo is ready (cloned, correct branch)
    // This replicates the startup git flow from Phase 2
    await gitService.checkoutOrCreateBranch({
      localPath: repoPath,
      branchName: WORKING_BRANCH,
    });
    log(`Ensured repository is on branch: ${WORKING_BRANCH}`);

    // 2. Initialize Aider Service (placeholder for now)
    // In a real scenario, this might involve more setup
    // We need to pass apiBase and apiKey
    const aiderOptions = {
        repoPath: coreState.repoPath, 
        modelName: coreState.currentModel,
        apiBase: process.env.AIDER_API_BASE || 'https://openrouter.ai/api/v1', // Read env var here
        apiKey: OPENROUTER_API_KEY, 
    };
    coreState.aiderInstance = await aiderService.initializeAider(aiderOptions);
    log('Aider service wrapper initialized.');

    coreState.isInitialized = true;
    log('Core service initialization complete.');
    return coreState;

  } catch (error) {
    logError('Core service initialization failed:', error);
    // Reset state on failure
    coreState.repoPath = null;
    coreState.isInitialized = false;
    coreState.aiderInstance = null;
    throw error; // Re-throw
  }
}

// --- Other Core Functions (Placeholders) ---

async function handleIncomingMessage({ message, userId }) {
    if (!coreState.isInitialized) {
        throw new Error('Core service not initialized.');
    }
    log(`Handling message from ${userId}: ${message}`);

    // Basic command parsing
    const addMatch = message.trim().match(/^\/add\s+(\S+)/);

    if (addMatch) {
        const filePath = addMatch[1];

        // Basic path validation (prevent absolute paths or directory traversal)
        if (path.isAbsolute(filePath) || filePath.includes('..')) {
            logError(`Invalid file path provided for /add: ${filePath}`);
            return `Error: Invalid file path '${filePath}'. Please provide a relative path within the repository.`;
        }

        // Check if file already in context
        if (coreState.contextFiles.includes(filePath)) {
            log(`File ${filePath} is already in context.`);
            return `${filePath} is already in the chat context.`; // Keep this message
        } else {
            // TODO: Add proper validation (fs.stat) to ensure file exists within repoPath
            coreState.contextFiles.push(filePath);
            log(`Added ${filePath} to context. Current context:`, coreState.contextFiles);
            // Return specific confirmation message expected by test
            return `Added ${filePath} to context`;
        }
    }

    // If not an /add command, assume it's a prompt for Aider
    const aiderOptions = {
        repoPath: coreState.repoPath,
        modelName: coreState.currentModel,
        apiBase: process.env.AIDER_API_BASE || 'https://openrouter.ai/api/v1',
        apiKey: OPENROUTER_API_KEY,
        prompt: message,
        files: coreState.contextFiles, // Pass context files
    };

    try {
        // Still call aiderService, which will log the full result
        const result = await aiderService.sendPromptToAider(aiderOptions);
        // We still only return the response text for now
        log(`Received response for ${userId}:`, result.response);
        return result.response; 
    } catch (error) {
        logError(`Error handling message via Aider: ${error}`);
        return 'Error processing your request.';
    }
}

// --- Export Core Service --- 
export const coreService = {
  initializeCore,
  handleIncomingMessage,
  // Add other functions as needed (setModel, addFile, pushChanges, etc.)
}; 