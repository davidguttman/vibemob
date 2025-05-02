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
        const relativePath = addMatch[1];
        const fullPath = path.join(coreState.repoPath, relativePath);

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
                    if (!coreState.contextFiles.includes(file)) {
                        coreState.contextFiles.push(file);
                        addedCount++;
                    } else {
                        skippedCount++;
                    }
                });

                log(`Added ${addedCount} files from directory ${relativePath}. Skipped ${skippedCount}. Current context:`, coreState.contextFiles);
                // Aider-style confirmation for directories
                return `Added directory ${relativePath} to the chat context`; 

            } else if (stats.isFile()) {
                // Handle single file
                if (coreState.contextFiles.includes(relativePath)) {
                    log(`File ${relativePath} is already in context.`);
                    return `${relativePath} is already in the chat context.`;
                } else {
                    coreState.contextFiles.push(relativePath);
                    log(`Added ${relativePath} to context. Current context:`, coreState.contextFiles);
                    return `Added ${relativePath} to context`;
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