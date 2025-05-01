import path from 'path';
import { gitService } from './git-service.js';
import { aiderService } from './aider.js';

// Constants (Consider making these configurable)
const STARTING_BRANCH = 'main';
const WORKING_BRANCH = 'aider-bot-dev';
const DEFAULT_MODEL = 'openai/gpt-4o'; // Or fetch from config

// Environment Variables
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || 'dummy-key-if-not-set'; // Use host env var or fallback to dummy

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
  console.log('Resetting core state for initialization...');
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

  console.log(`Initializing core service for repo: ${repoPath}`);
  coreState.repoPath = repoPath;

  try {
    // 1. Ensure repo is ready (cloned, correct branch)
    // This replicates the startup git flow from Phase 2
    await gitService.checkoutOrCreateBranch({
      localPath: repoPath,
      branchName: WORKING_BRANCH,
    });
    console.log(`Ensured repository is on branch: ${WORKING_BRANCH}`);

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
    console.log('Aider service wrapper initialized.'); // Updated log message

    coreState.isInitialized = true;
    console.log('Core service initialization complete.');
    return coreState;

  } catch (error) {
    console.error('Core service initialization failed:', error);
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
    console.log(`Handling message from ${userId}: ${message}`);

    // Basic command parsing
    const addMatch = message.trim().match(/^\/add\s+(\S+)/);

    if (addMatch) {
        const filePath = addMatch[1];
        // TODO: Add validation for filePath (exists, within repo)
        if (!coreState.contextFiles.includes(filePath)) {
            coreState.contextFiles.push(filePath);
            console.log(`Added ${filePath} to context. Current context:`, coreState.contextFiles);
            // Return confirmation ( mimicking aider stdout for now)
            // NOTE: In a real scenario, aider itself might handle this via prompt
            return `Added ${filePath} to the chat`;
        } else {
            return `${filePath} is already in the chat context.`;
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
        return result.response; 
    } catch (error) {
        console.error(`Error handling message via Aider: ${error}`);
        return 'Error processing your request.';
    }
}

// --- Export Core Service --- 
export const coreService = {
  initializeCore,
  handleIncomingMessage,
  // Add other functions as needed (setModel, addFile, pushChanges, etc.)
}; 