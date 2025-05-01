import path from 'path';
import { gitService } from './git-service.js';
import { aiderService } from './aider.js';

// Constants (Consider making these configurable)
const STARTING_BRANCH = 'main';
const WORKING_BRANCH = 'aider-bot-dev';
const DEFAULT_MODEL = 'openai/gpt-4o'; // Or fetch from config

// Environment Variables
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || 'dummy-key-if-not-set';
const API_BASE = process.env.AIDER_API_BASE || 'https://openrouter.ai/api/v1'; // Default, but should be configurable for tests

// --- Core Service State ---
let coreState = {
  repoPath: null,
  isInitialized: false,
  currentModel: DEFAULT_MODEL,
  aiderInstance: null, // Placeholder for aider instance/config
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
        apiBase: API_BASE, 
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
    // TODO: Implement command parsing (/add, /model, etc.) or send to Aider

    // Placeholder: Send directly to Aider
    const aiderOptions = {
        repoPath: coreState.repoPath,
        modelName: coreState.currentModel,
        apiBase: API_BASE,
        apiKey: OPENROUTER_API_KEY,
        prompt: message,
        // TODO: Add context files based on state
    };

    try {
        const result = await aiderService.sendPromptToAider(aiderOptions);
        return result.response; // Or formatted result
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