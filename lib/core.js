import debug from 'debug';
import path from 'path';
import fs from 'fs/promises';
// import { globSync } from 'glob'; // -- REMOVE
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
// Use an object to store state per user ID
let coreStateStore = {};

// Function to get or initialize state for a user
function getUserState(userId) {
  if (!coreStateStore[userId]) {
    log(`Initializing state for new user: ${userId}`);
    coreStateStore[userId] = {
      // repoPath: null, // repoPath is global, not per-user
      // isInitialized: false, // Initialization is global
      currentModel: DEFAULT_MODEL,
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
      branchName: WORKING_BRANCH,
    });
    log(`Ensured repository is on branch: ${WORKING_BRANCH}`);

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

// --- Other Core Functions (Placeholders) ---

async function handleIncomingMessage({ message, userId }) {
    if (!isCoreInitialized) {
        throw new Error('Core service not initialized.');
    }
    if (!userId) {
        throw new Error('userId is required for handleIncomingMessage.');
    }

    log(`Handling message from ${userId}: ${message}`);
    const userState = getUserState(userId);

    // Basic command parsing
    const addMatch = message.trim().match(/^\/add\s+(\S+)/);
    const removeMatch = message.trim().match(/^\/remove\s+(\S+)/);
    const clearMatch = message.trim().match(/^\/clear$/);

    if (addMatch) {
        const relativePath = addMatch[1];
        const fullPath = path.join(globalRepoPath, relativePath);

        // Basic path validation (prevent absolute paths or directory traversal)
        if (path.isAbsolute(relativePath) || relativePath.includes('..')) {
            logError(`Invalid file path provided for /add: ${relativePath}`);
            return `Error: Invalid file path '${relativePath}'. Please provide a relative path within the repository.`;
        }

        try {
            log(`Checking path type for: ${fullPath}`);
            const stats = await fs.stat(fullPath);
            log(`Path stats for ${relativePath}: isDirectory=${stats.isDirectory()}, isFile=${stats.isFile()}`);

            if (stats.isDirectory()) {
                // Expand directory using fs.readdir
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
                    // Check if file path already exists in context
                    if (!userState.contextFiles.some(ctxFile => ctxFile.path === file)) {
                        // Add with readOnly: true by default for now
                        userState.contextFiles.push({ path: file, readOnly: true });
                        addedCount++;
                    } else {
                        skippedCount++;
                    }
                });

                log(`Added ${addedCount} files from directory ${relativePath} for user ${userId}. Skipped ${skippedCount}. Current context:`, userState.contextFiles);
                // Aider-style confirmation for directories
                return `Added directory ${relativePath} to the chat context`;

            } else if (stats.isFile()) {
                // Handle single file
                // Check if file path already exists
                if (userState.contextFiles.some(ctxFile => ctxFile.path === relativePath)) {
                    log(`File ${relativePath} is already in context for user ${userId}.`);
                    return `${relativePath} is already in the chat context.`;
                } else {
                    // Add with readOnly: true by default
                    userState.contextFiles.push({ path: relativePath, readOnly: true });
                    log(`Added ${relativePath} to context for user ${userId}. Current context:`, userState.contextFiles);
                    // Aider confirmation style:
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

    } else if (removeMatch) {
        const relativePath = removeMatch[1];
        const initialLength = userState.contextFiles.length;

        // Filter out the file/path to remove
        userState.contextFiles = userState.contextFiles.filter(f => f.path !== relativePath);

        let removalMessage = ''; // Store the message
        if (userState.contextFiles.length < initialLength) {
            log(`Removed ${relativePath} from context for user ${userId}. Current context:`, userState.contextFiles);
            // return `Removed ${relativePath} from the chat context`;
            removalMessage = `Removed ${relativePath} from the chat context`;
        } else {
            log(`Path ${relativePath} not found in context for user ${userId} for removal.`);
            // return `${relativePath} was not found in the chat context.`;
            removalMessage = `${relativePath} was not found in the chat context.`;
        }

        // Re-initialize aider service wrapper after removal to clear potential implicit context
        // log('Re-initializing Aider service wrapper after context removal...'); // COMMENT OUT
        // const aiderOptionsReinit = { // COMMENT OUT
        //     repoPath: coreState.repoPath, // COMMENT OUT
        //     modelName: coreState.currentModel, // COMMENT OUT
        //     apiBase: process.env.AIDER_API_BASE || 'https://openrouter.ai/api/v1', // COMMENT OUT
        //     apiKey: OPENROUTER_API_KEY, // COMMENT OUT
        // }; // COMMENT OUT
        // try { // COMMENT OUT
        //     coreState.aiderInstance = await aiderService.initializeAider(aiderOptionsReinit); // COMMENT OUT
        //     log('Aider service wrapper re-initialized.'); // COMMENT OUT
        // } catch (reinitError) { // COMMENT OUT
        //     logError('Failed to re-initialize Aider after removal:', reinitError); // COMMENT OUT
        //     // Decide how to handle this - maybe add to the message or throw? // COMMENT OUT
        //     removalMessage += ' (Warning: Failed to re-initialize Aider state)'; // COMMENT OUT
        // } // COMMENT OUT
        return removalMessage; // Return the message AFTER re-init attempt
    } else if (clearMatch) {
        const initialLength = userState.contextFiles.length;
        userState.contextFiles = [];
        log(`Context cleared for user ${userId}. Was ${initialLength} items, now ${userState.contextFiles.length}.`);
        // Optionally, re-initialize aider service like with /remove if needed, but likely not necessary just for clearing context
        return 'Chat context cleared.';
    }

    // If not an /add, /remove, or /clear command, assume it's a prompt for Aider

    // --- Prepare context for Aider --- 
    const editableFiles = userState.contextFiles
        .filter(f => !f.readOnly)
        .map(f => f.path);
    const readOnlyFiles = userState.contextFiles
        .filter(f => f.readOnly)
        .map(f => f.path);

    let finalPrompt = message;

    // Prepend read-only file content to the prompt if any exist
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
        finalPrompt = readOnlyHeader + readOnlyContent + '\n\nUser Prompt:\n' + message;
    }
    // ---------------------------------

    const aiderOptions = {
        repoPath: globalRepoPath, // Use global repo path
        modelName: userState.currentModel, // Use user's current model
        apiBase: process.env.AIDER_API_BASE || 'https://openrouter.ai/api/v1',
        apiKey: OPENROUTER_API_KEY,
        prompt: finalPrompt, // Use the potentially modified prompt
        files: editableFiles, // Pass editable files here
        // We might need to pass readOnlyFiles differently if aider-js supports it, 
        // or rely on the prompt injection method above.
    };

    log(`>>> DETAILED Aider Options for sendPromptToAider (Core - User: ${userId}):`, aiderOptions);

    // Initialize or get aider instance for the user if needed
    // This part depends on how aiderService manages instances (singleton vs per-config)
    // For now, we assume aiderService.sendPromptToAider handles it internally or we re-init each time
    // Let's assume a simple re-init for now if the model changes or instance is null
    // This is inefficient but simple for now.
    if (!userState.aiderInstance || userState.aiderInstance.modelName !== userState.currentModel) {
      log(`Initializing/Re-initializing Aider instance for user ${userId} with model ${userState.currentModel}`);
      try {
        // Pass only necessary options for initialization
        const initOptions = {
          repoPath: globalRepoPath,
          modelName: userState.currentModel,
          apiBase: aiderOptions.apiBase,
          apiKey: aiderOptions.apiKey,
        };
        userState.aiderInstance = await aiderService.initializeAider(initOptions);
        userState.aiderInstance.modelName = userState.currentModel; // Store model name with instance for check
        log(`Aider instance ready for user ${userId}`);
      } catch (initError) {
        logError(`Failed to initialize Aider instance for user ${userId}:`, initError);
        throw new Error(`Failed to initialize Aider for user ${userId}: ${initError.message}`);
      }
    }

    try {
      const result = await aiderService.sendPromptToAider({
        ...aiderOptions,
        aiderInstance: userState.aiderInstance // Pass the specific instance if managed
      });
      log(`Received full Aider result for user ${userId}:`, result);
      return result.stdout; // Return only stdout for now
    } catch (error) {
      logError(`Error during Aider interaction for user ${userId}:`, error);
      // Decide on error propagation - throw or return error message?
      throw new Error(`Aider interaction failed: ${error.message || error}`);
    }
}

// --- Export Functions ---
export const coreService = {
  initializeCore,
  handleIncomingMessage,
  setModel, // Export the new function
  // Add other functions to export as needed
}; 