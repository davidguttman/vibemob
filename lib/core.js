import debug from 'debug';
import path from 'path';
import fs from 'fs/promises';
// import { globSync } from 'glob'; // -- REMOVE
import { gitService } from './git-service.js';
import { aiderService } from './aider.js';
import config from './config.js'; // Import the new config

// Constants (Consider making these configurable)
// Use config values instead of hardcoded constants
// const STARTING_BRANCH = 'main';
// const WORKING_BRANCH = 'aider-bot-dev';
// const DEFAULT_MODEL = 'openai/gpt-4o'; // Or fetch from config

// Environment Variables
// No longer need to read directly, use config
// const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || 'dummy-key-if-not-set'; // Use host env var or fallback to dummy

const log = debug('vibemob:core');
const logError = debug('vibemob:core:error');
logError.log = console.error.bind(console); // Direct errors to stderr

// --- Core Service State ---
// Use an object to store state per user ID
let coreStateStore = {};

// Function to get or initialize state for a user
function getUserState(userId) {
  if (!coreStateStore[userId]) {
    log(`Initializing state for new user: ${userId}`);
    coreStateStore[userId] = {
      // repoPath: null, // repoPath is global, not per-user
      // isInitialized: false, // Initialization is global
      currentModel: config.defaultModel, // Use config default
      aiderInstance: null, // Aider instance might need to be per-user if model changes often
      contextFiles: [], // Array of { path: string, readOnly: boolean }
    };
  }
  return coreStateStore[userId];
}

// Store the global repo path separately
let globalRepoPath = null;
let isCoreInitialized = false;

// --- Initialization Function ---
async function initializeCore({ repoPath }) {
  // Always reset global state on initialization call for testability
  log('Resetting core state for initialization...');
  globalRepoPath = null;
  isCoreInitialized = false;
  coreStateStore = {}; // Clear all user states

  if (!repoPath) {
    throw new Error('repoPath is required for core initialization.');
  }

  log(`Initializing core service for repo: ${repoPath}`);
  globalRepoPath = repoPath;

  try {
    // 1. Ensure repo is ready (cloned, correct branch)
    // This replicates the startup git flow from Phase 2
    await gitService.checkoutOrCreateBranch({
      localPath: repoPath,
      branchName: config.workingBranch, // Use config value
    });
    log(`Ensured repository is on branch: ${config.workingBranch}`);

    // 2. Initialize Aider Service (placeholder for now)
    // Aider instance might need to be managed per user if model changes
    // For now, we don't initialize a global aider instance here.
    // It will be initialized on first use or model change for a user.
    log('Global Aider service initialization skipped, will init per-user.');

    isCoreInitialized = true;
    log('Core service initialization complete.');
    // Return something simple indicating success, or maybe the repoPath
    return { repoPath: globalRepoPath, initialized: true };

  } catch (error) {
    logError('Core service initialization failed:', error);
    // Reset state on failure
    globalRepoPath = null;
    isCoreInitialized = false;
    coreStateStore = {};
    throw error; // Re-throw
  }
}

// --- Set Model Function ---
async function setModel({ modelName, userId }) {
  if (!isCoreInitialized) {
    throw new Error('Core service not initialized.');
  }
  if (!userId) {
    throw new Error('userId is required to set model.');
  }
  log(`Setting model for user ${userId} to: ${modelName}`);
  const userState = getUserState(userId); // Get or init user state
  userState.currentModel = modelName;

  // If we manage aider instances per user, we might re-initialize it here
  // or invalidate the existing one so it gets re-initialized on next use.
  // For simplicity now, we'll assume handleIncomingMessage handles Aider init/re-init.
  log(`User ${userId} state updated:`, userState);
  // Return confirmation or the new model name
  return { modelSet: true, modelName: userState.currentModel };
}

// --- Helper Functions for handleIncomingMessage ---

// Parses known commands from a message
function _parseCommand(message) {
  const trimmedMessage = message.trim();
  const addMatch = trimmedMessage.match(/^\/add\s+(\S+)/);
  if (addMatch) return { command: 'add', path: addMatch[1] };

  const removeMatch = trimmedMessage.match(/^\/remove\s+(\S+)/);
  if (removeMatch) return { command: 'remove', path: removeMatch[1] };

  const clearMatch = trimmedMessage.match(/^\/clear$/);
  if (clearMatch) return { command: 'clear' };

  return null; // Not a known command
}

// Handles the logic for the /add command
async function _handleAddCommand(userId, relativePath) {
  const userState = getUserState(userId);
  const fullPath = path.join(globalRepoPath, relativePath);

  // Basic path validation
  if (path.isAbsolute(relativePath) || relativePath.includes('..')) {
    logError(`Invalid file path provided for /add: ${relativePath}`);
    return `Error: Invalid file path '${relativePath}'. Please provide a relative path within the repository.`;
  }

  try {
    log(`Checking path type for: ${fullPath}`);
    const stats = await fs.stat(fullPath);
    log(`Path stats for ${relativePath}: isDirectory=${stats.isDirectory()}, isFile=${stats.isFile()}`);

    if (stats.isDirectory()) {
      log(`Reading directory recursively: ${fullPath}`);
      const dirents = await fs.readdir(fullPath, { recursive: true, withFileTypes: true });
      const files = dirents
          .filter(dirent => dirent.isFile())
          .map(dirent => path.join(dirent.path.replace(fullPath, '').substring(1), dirent.name));

      log(`Found ${files.length} files in ${relativePath}:`, files);
      const filesToAdd = files.map(f => path.join(relativePath, f).replace(/\\/g, '/'));

      if (filesToAdd.length === 0) {
        return `Directory ${relativePath} is empty or contains no files.`;
      }

      let addedCount = 0;
      let skippedCount = 0;
      filesToAdd.forEach(file => {
        if (!userState.contextFiles.some(ctxFile => ctxFile.path === file)) {
          userState.contextFiles.push({ path: file, readOnly: true }); // Add read-only by default
          addedCount++;
        } else {
          skippedCount++;
        }
      });
      log(`Added ${addedCount} files from directory ${relativePath} for user ${userId}. Skipped ${skippedCount}. Current context:`, userState.contextFiles);
      return `Added directory ${relativePath} to the chat context`;

    } else if (stats.isFile()) {
      if (userState.contextFiles.some(ctxFile => ctxFile.path === relativePath)) {
        log(`File ${relativePath} is already in context for user ${userId}.`);
        return `${relativePath} is already in the chat context.`;
      } else {
        userState.contextFiles.push({ path: relativePath, readOnly: true }); // Add read-only by default
        log(`Added ${relativePath} to context for user ${userId}. Current context:`, userState.contextFiles);
        return `Added ${relativePath} to the chat context`;
      }
    } else {
      logError(`Path is not a file or directory: ${relativePath}`);
      return `Error: Path '${relativePath}' is not a valid file or directory.`;
    }
  } catch (error) {
    if (error.code === 'ENOENT') {
      logError(`Path not found for /add: ${relativePath}`);
      return `Error: Path '${relativePath}' not found.`;
    } else {
      logError(`Error accessing path ${relativePath}:`, error);
      return `Error processing path '${relativePath}'.`;
    }
  }
}

// Handles the logic for the /remove command
async function _handleRemoveCommand(userId, relativePath) {
  const userState = getUserState(userId);
  const initialLength = userState.contextFiles.length;
  userState.contextFiles = userState.contextFiles.filter(f => f.path !== relativePath);

  if (userState.contextFiles.length < initialLength) {
    log(`Removed ${relativePath} from context for user ${userId}. Current context:`, userState.contextFiles);
    return `Removed ${relativePath} from the chat context`;
  } else {
    log(`Path ${relativePath} not found in context for user ${userId} for removal.`);
    return `${relativePath} was not found in the chat context.`;
  }
  // NOTE: Removed commented-out Aider re-initialization logic here
}

// Handles the logic for the /clear command
async function _handleClearCommand(userId) {
  const userState = getUserState(userId);
  const initialLength = userState.contextFiles.length;
  userState.contextFiles = [];
  log(`Context cleared for user ${userId}. Was ${initialLength} items, now ${userState.contextFiles.length}.`);
  return 'Chat context cleared.';
}

// Prepares options and runs the Aider interaction
async function _prepareAndRunAider(userId, prompt) {
  const userState = getUserState(userId);
  const editableFiles = userState.contextFiles.filter(f => !f.readOnly).map(f => f.path);
  const readOnlyFiles = userState.contextFiles.filter(f => f.readOnly).map(f => f.path);
  let finalPrompt = prompt;

  // Prepend read-only file content
  if (readOnlyFiles.length > 0) {
    log('Prepending read-only files to prompt:', readOnlyFiles);
    let readOnlyHeader = `\n\nIMPORTANT: The following files are provided for context ONLY. DO NOT suggest or apply any modifications to these files: ${readOnlyFiles.join(', ')}. Their content is:\n`;
    let readOnlyContent = '';
    for (const roFile of readOnlyFiles) {
      try {
        const filePath = path.join(globalRepoPath, roFile);
        const content = await fs.readFile(filePath, 'utf-8');
        readOnlyContent += `\n--- ${roFile} ---\n${content}\n--- End ${roFile} ---\n`;
      } catch (err) {
        logError(`Error reading read-only file ${roFile} for prompt:`, err);
        readOnlyContent += `\n--- ${roFile} (Error reading file) ---\n`;
      }
    }
    finalPrompt = readOnlyHeader + readOnlyContent + '\n\nUser Prompt:\n' + prompt;
  }

  const aiderOptions = {
    repoPath: globalRepoPath,
    modelName: userState.currentModel,
    apiBase: config.aiderApiBase, // Use config value
    apiKey: config.aiderApiKey, // Use config value
    prompt: finalPrompt,
    files: editableFiles, // Pass only editable files to aider-js file list
  };
  log(`>>> DETAILED Aider Options for sendPromptToAider (Core - User: ${userId}):`, aiderOptions);

  // Initialize/Re-initialize Aider instance if needed
  if (!userState.aiderInstance || userState.aiderInstance.modelName !== userState.currentModel) {
    log(`Initializing/Re-initializing Aider instance for user ${userId} with model ${userState.currentModel}`);
    try {
      const initOptions = {
        repoPath: globalRepoPath,
        modelName: userState.currentModel,
        apiBase: aiderOptions.apiBase,
        apiKey: aiderOptions.apiKey,
      };
      userState.aiderInstance = await aiderService.initializeAider(initOptions);
      userState.aiderInstance.modelName = userState.currentModel; // Store model name with instance
      log(`Aider instance ready for user ${userId}`);
    } catch (initError) {
      logError(`Failed to initialize Aider instance for user ${userId}:`, initError);
      throw new Error(`Failed to initialize Aider for user ${userId}: ${initError.message}`);
    }
  }

  // Run Aider
  try {
    const result = await aiderService.sendPromptToAider({
      ...aiderOptions,
      aiderInstance: userState.aiderInstance
    });
    log(`Received full Aider result for user ${userId}:`, result);
    return result.stdout; // Return only stdout
  } catch (error) {
    logError(`Error during Aider interaction for user ${userId}:`, error);
    throw new Error(`Aider interaction failed: ${error.message || error}`);
  }
}

// --- End Helper Functions ---

// --- Core Functions (Placeholders) ---
// Renamed from handleIncomingMessage to match plan (original name was handleIncomingMessage)
async function handleIncomingMessage({ message, userId }) {
  if (!isCoreInitialized) {
    throw new Error('Core service not initialized.');
  }
  if (!userId) {
    throw new Error('userId is required for handleIncomingMessage.');
  }
  log(`Handling message from ${userId}: ${message}`);

  const parsedCommand = _parseCommand(message);

  if (parsedCommand) {
    switch (parsedCommand.command) {
      case 'add':
        return await _handleAddCommand(userId, parsedCommand.path);
      case 'remove':
        return await _handleRemoveCommand(userId, parsedCommand.path);
      case 'clear':
        return await _handleClearCommand(userId);
      default:
        // Should not happen if _parseCommand is correct
        logError('Internal error: Unknown parsed command', parsedCommand);
        return 'Error: Internal error processing command.';
    }
  } else {
    // Not a command, treat as a prompt for Aider
    return await _prepareAndRunAider(userId, message);
  }
}

// --- Push Changes Function ---
async function pushChanges({ userId /* Optional: for logging/context */ }) {
  if (!isCoreInitialized) {
      throw new Error('Core service not initialized. Cannot push changes.');
  }
  if (!globalRepoPath) {
      // This shouldn't happen if isCoreInitialized is true, but safety check
      throw new Error('Internal Error: Repo path not set despite core being initialized.');
  }

  log(`Pushing changes for branch ${config.workingBranch} in repo ${globalRepoPath} (Triggered by user: ${userId || 'Unknown'})`);

  try {
    // Call the existing gitService function to push the working branch
    const pushResult = await gitService.pushBranch({
      localPath: globalRepoPath,
      branchName: config.workingBranch,
    });
    log('Push successful:', pushResult);
    // Return a simple confirmation or details from pushResult
    return { pushed: true, branch: config.workingBranch, details: pushResult };
  } catch (error) {
    logError(`Error pushing changes for user ${userId || 'Unknown'}:`, error);
    // Re-throw or return a structured error
    throw new Error(`Failed to push changes to ${config.workingBranch}: ${error.message || error}`);
  }
}

// --- Export Functions ---
export const coreService = {
  initializeCore,
  handleIncomingMessage,
  setModel,
  pushChanges, // Export the new push function
  // Add other functions to export as needed
}; 