import debug from 'debug'
import path from 'path'
import fs from 'fs/promises'
// import { globSync } from 'glob'; // -- REMOVE
import { gitService } from './git-service.js'
import { aiderService } from './aider.js'
import config from './config.js' // Import the new config

// Constants (Consider making these configurable)
// Use config values instead of hardcoded constants
// const STARTING_BRANCH = 'main';
// const WORKING_BRANCH = 'aider-bot-dev';
// const DEFAULT_MODEL = 'openai/gpt-4o'; // Or fetch from config

// Environment Variables
// No longer need to read directly, use config
// const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || 'dummy-key-if-not-set'; // Use host env var or fallback to dummy

const log = debug('vibemob:core')
const logError = debug('vibemob:core:error')
logError.log = console.error.bind(console) // Direct errors to stderr

// --- Core Service State ---
// Use an object to store state per user ID
let coreStateStore = {}

// Store the global repo path separately
let globalRepoPath = null
let isCoreInitialized = false

// *** NEW: Global Overrides Object ***
let globalAiderConfigOverrides = {} // Initialize as an empty object
// *** END NEW ***

// *** NEW: Function to set global overrides ***
/**
 * Sets global overrides for Aider configuration, primarily for testing.
 * Merges the provided overrides with existing ones.
 * Setting a property to `null` effectively removes that specific override.
 * @param {{apiBase?: string | null, apiKey?: string | null}} overrides - Object containing overrides.
 */
export function setGlobalAiderConfigOverrides(overrides = {}) {
  // Merge new overrides into the existing global object
  // If a value is explicitly null, it will overwrite/remove existing override
  globalAiderConfigOverrides = { ...globalAiderConfigOverrides, ...overrides }
}
// *** END NEW ***

// Function to get or initialize state for a user
function getUserState(userId) {
  if (!coreStateStore[userId]) {
    log(`Initializing state for new user: ${userId}`)

    // *** MODIFICATION: Prioritize global overrides object, then config ***
    const effectiveApiBase =
      globalAiderConfigOverrides.apiBase !== undefined
        ? globalAiderConfigOverrides.apiBase // Use global override if set (even if null)
        : config.aiderApiBase // Otherwise, use config value

    const effectiveApiKey =
      globalAiderConfigOverrides.apiKey !== undefined
        ? globalAiderConfigOverrides.apiKey // Use global override if set (even if null)
        : config.aiderApiKey // Otherwise, use config value

    if (!effectiveApiBase || !effectiveApiKey) {
      logError(
        `WARNING: User ${userId} state initialized with missing Aider credentials (Base: ${effectiveApiBase ? 'OK' : 'MISSING'}, Key: ${effectiveApiKey ? 'OK' : 'MISSING'}). Check global overrides or config.`,
      )
    }
    // *** END MODIFICATION ***

    coreStateStore[userId] = {
      currentModel: config.defaultModel,
      apiBase: effectiveApiBase, // <-- Use the determined value
      apiKey: effectiveApiKey, // <-- Use the determined value
      aiderInstance: null,
      contextFiles: [],
      isPlanningSessionActive: false,
      planningSessionId: null,
      chatHistory: [],
      currentPlanFilePath: null,
      currentPhase: null,
    }
  }
  // Per-user overrides via setConfigOverrides will still work on the existing userState object after it's created.
  return coreStateStore[userId]
}

// --- Helper: Check if directory exists ---
async function _directoryExists(dirPath) {
  try {
    await fs.stat(dirPath)
    return true
  } catch (error) {
    if (error.code === 'ENOENT') {
      return false
    } else {
      // Rethrow other errors (e.g., permissions)
      throw error
    }
  }
}

// --- Initialization Function ---
export async function initializeCore({ repoPath }) {
  // Always reset global state on initialization call for testability
  log('Resetting core state for initialization...')
  globalRepoPath = null
  isCoreInitialized = false
  coreStateStore = {} // Clear all user states

  // Global overrides are NOT reset here, as they are typically set once per test run
  // in test.before. Resetting them here would undo the setting.

  if (!repoPath) {
    throw new Error('repoPath is required for core initialization.')
  }

  log(`Initializing core service for repo: ${repoPath}`)
  globalRepoPath = repoPath

  try {
    // --- MODIFIED: Check if repo exists, clone if not ---
    const repoExists = await _directoryExists(repoPath)
    if (!repoExists) {
      log(`Repository directory ${repoPath} does not exist. Cloning...`)
      if (!config.repoUrl) {
        throw new Error(
          'REPO_URL is required in config to clone the repository.',
        )
      }
      // Clone the repo first
      await gitService.cloneRepo({
        repoUrl: config.repoUrl,
        localPath: repoPath,
      })
      log(
        `Repository cloned successfully to ${repoPath}. Now checking out branch.`,
      )
      // After cloning, checkout the working branch (clone might leave it on default)
      await gitService.checkoutOrCreateBranch({
        localPath: repoPath,
        branchName: config.workingBranch,
        createFrom: config.startingBranch, // Ensure it bases off starting branch if created
      })
      log(
        `Ensured repository is on branch: ${config.workingBranch} after clone.`,
      )
    } else {
      log(
        `Repository directory ${repoPath} already exists. Ensuring correct branch...`,
      )
      // If repo exists, just ensure the branch is correct
      await gitService.checkoutOrCreateBranch({
        localPath: repoPath,
        branchName: config.workingBranch,
      })
      log(`Ensured repository is on branch: ${config.workingBranch}`)
    }
    // --- END MODIFICATION ---

    // 2. Initialize Aider Service (placeholder for now)
    // Aider instance might need to be managed per user if model changes
    // For now, we don't initialize a global aider instance here.
    // It will be initialized on first use or model change for a user.
    log('Global Aider service initialization skipped, will init per-user.')

    isCoreInitialized = true
    log('Core service initialization complete.')
    // Return something simple indicating success, or maybe the repoPath
    return { repoPath: globalRepoPath, initialized: true }
  } catch (error) {
    logError('Core service initialization failed:', error)
    // Reset state on failure
    globalRepoPath = null
    isCoreInitialized = false
    coreStateStore = {}
    throw error // Re-throw
  }
}

// --- Set Model Function ---
export async function setModel({ modelName, userId }) {
  if (!isCoreInitialized) {
    throw new Error('Core service not initialized.')
  }
  if (!userId) {
    throw new Error('userId is required to set model.')
  }
  log(`Setting model for user ${userId} to: ${modelName}`)
  const userState = getUserState(userId) // Get or init user state
  if (userState.currentModel !== modelName) {
    userState.currentModel = modelName
    userState.aiderInstance = null // Invalidate instance on model change
    log(`Aider instance invalidated for user ${userId} due to model change.`)
  }
  log(`User ${userId} state updated:`, userState)
  return { modelSet: true, modelName: userState.currentModel }
}

// --- NEW: Set Config Overrides Function ---
/**
 * Updates configuration overrides for a specific user.
 * @param {{userId: string, apiBase?: string, apiKey?: string}} options
 */
export async function setConfigOverrides({ userId, apiBase, apiKey }) {
  if (!userId) {
    throw new Error('userId is required to set config overrides.')
  }
  const userState = getUserState(userId)
  let updated = false

  if (apiBase !== undefined && userState.apiBase !== apiBase) {
    log(`Updating apiBase for user ${userId}`)
    userState.apiBase = apiBase
    updated = true
  }
  if (apiKey !== undefined && userState.apiKey !== apiKey) {
    log(`Updating apiKey for user ${userId}`)
    userState.apiKey = apiKey
    updated = true
  }

  if (updated) {
    log(
      `Config overrides updated for user ${userId}. Invalidating Aider instance.`,
    )
    userState.aiderInstance = null // Invalidate instance if relevant config changed
    log(`User ${userId} state updated:`, userState)
  }

  return { overridesSet: true }
}
// --- END NEW ---

// --- Helper Functions for handleIncomingMessage ---

// Parses known commands from a message
function _parseCommand(message) {
  const trimmedMessage = message.trim()
  const addMatch = trimmedMessage.match(/^\/add\s+(\S+)/)
  if (addMatch) return { command: 'add', path: addMatch[1] }

  const removeMatch = trimmedMessage.match(/^\/remove\s+(\S+)/)
  if (removeMatch) return { command: 'remove', path: removeMatch[1] }

  const clearMatch = trimmedMessage.match(/^\/clear$/)
  if (clearMatch) return { command: 'clear' }

  return null // Not a known command
}

// Handles the logic for the /add command
async function _handleAddCommand(userId, relativePath, readOnly = true) {
  // Added readOnly param
  const userState = getUserState(userId)
  const fullPath = path.join(globalRepoPath, relativePath)

  // Basic path validation
  if (path.isAbsolute(relativePath) || relativePath.includes('..')) {
    logError(`Invalid file path provided for /add: ${relativePath}`)
    return {
      message: `Error: Invalid file path '${relativePath}'. Please provide a relative path within the repository.`,
    }
  }

  try {
    log(`Checking path type for: ${fullPath}`)
    const stats = await fs.stat(fullPath)
    log(
      `Path stats for ${relativePath}: isDirectory=${stats.isDirectory()}, isFile=${stats.isFile()}`,
    )

    if (stats.isDirectory()) {
      log(`Reading directory recursively: ${fullPath}`)
      const dirents = await fs.readdir(fullPath, {
        recursive: true,
        withFileTypes: true,
      })
      const files = dirents
        .filter((dirent) => dirent.isFile())
        .map((dirent) =>
          path.join(
            dirent.path.replace(fullPath, '').substring(1),
            dirent.name,
          ),
        )

      log(`Found ${files.length} files in ${relativePath}:`, files)
      const filesToAdd = files.map((f) =>
        path.join(relativePath, f).replace(/\\/g, '/'),
      )

      if (filesToAdd.length === 0) {
        return {
          message: `Directory ${relativePath} is empty or contains no files.`,
        }
      }

      let addedCount = 0
      let skippedCount = 0
      filesToAdd.forEach((file) => {
        if (!userState.contextFiles.some((ctxFile) => ctxFile.path === file)) {
          userState.contextFiles.push({ path: file, readOnly: readOnly }) // Use readOnly param
          addedCount++
        } else {
          skippedCount++
        }
      })
      log(
        `Added ${addedCount} files from directory ${relativePath} for user ${userId}. Skipped ${skippedCount}. Current context:`,
        userState.contextFiles,
      )
      return {
        message: `Added directory ${relativePath} to the chat context${readOnly ? ' (read-only)' : ''}.`,
      }
    } else if (stats.isFile()) {
      if (
        userState.contextFiles.some((ctxFile) => ctxFile.path === relativePath)
      ) {
        log(`File ${relativePath} is already in context for user ${userId}.`)
        return { message: `${relativePath} is already in the chat context.` }
      } else {
        userState.contextFiles.push({ path: relativePath, readOnly: readOnly }) // Use readOnly param
        log(
          `Added ${relativePath} to context for user ${userId}. Current context:`,
          userState.contextFiles,
        )
        return {
          message: `Added ${relativePath} to the chat context${readOnly ? ' (read-only)' : ''}.`,
        }
      }
    } else {
      logError(`Path is not a file or directory: ${relativePath}`)
      return {
        message: `Error: Path '${relativePath}' is not a valid file or directory.`,
      }
    }
  } catch (error) {
    if (error.code === 'ENOENT') {
      logError(`Path not found for /add: ${relativePath}`)
      return { message: `Error: Path '${relativePath}' not found.` }
    } else {
      logError(`Error accessing path ${relativePath}:`, error)
      return { message: `Error processing path '${relativePath}'.` }
    }
  }
}

// Handles the logic for the /remove command
async function _handleRemoveCommand(userId, relativePath) {
  const userState = getUserState(userId)
  const initialLength = userState.contextFiles.length
  userState.contextFiles = userState.contextFiles.filter(
    (f) => f.path !== relativePath,
  )

  if (userState.contextFiles.length < initialLength) {
    log(
      `Removed ${relativePath} from context for user ${userId}. Current context:`,
      userState.contextFiles,
    )
    return { message: `Removed ${relativePath} from the chat context` }
  } else {
    log(
      `Path ${relativePath} not found in context for user ${userId} for removal.`,
    )
    return { message: `${relativePath} was not found in the chat context.` }
  }
  // NOTE: Removed commented-out Aider re-initialization logic here
}

// Handles the logic for the /clear command
async function _handleClearCommand(userId) {
  const userState = getUserState(userId)
  const initialLength = userState.contextFiles.length
  userState.contextFiles = []
  log(
    `Context cleared for user ${userId}. Was ${initialLength} items, now ${userState.contextFiles.length}.`,
  )
  return { message: 'Chat context cleared.' }
}

// Prepares options and runs the Aider interaction
async function _prepareAndRunAider(userId, prompt) {
  const userState = getUserState(userId) // Gets state potentially initialized with global overrides

  // Ensure userState has valid API credentials before proceeding
  if (!userState.apiBase || !userState.apiKey) {
    logError(
      `User ${userId} is missing API Base or API Key. Aborting Aider call.`,
    )
    return {
      content: `Error: Aider API Base or API Key is not configured for user ${userId}. Please check server configuration, global overrides, or user overrides.`,
    }
  }

  const editableFiles = userState.contextFiles
    .filter((f) => !f.readOnly)
    .map((f) => f.path)
  const readOnlyFiles = userState.contextFiles
    .filter((f) => f.readOnly)
    .map((f) => f.path)
  const allContextFiles = userState.contextFiles.map((f) => f.path)
  const finalPrompt = prompt

  log(
    `Preparing to run Aider for user ${userId} with model ${userState.currentModel}`,
  )
  log(`Context Files (Editable): ${JSON.stringify(editableFiles)}`)
  log(`Context Files (Read-Only): ${JSON.stringify(readOnlyFiles)}`)
  log(`API Base: ${userState.apiBase}`) // Log the base being used
  log(`API Key: ${userState.apiKey ? '***' : 'MISSING'}`) // Avoid logging the actual key

  // Initialize/Re-initialize Aider instance if needed
  // This part seems less relevant if aiderService.sendPromptToAider is stateless
  // or handles its own instance management based on options.
  // If aiderService *requires* an initialized instance object passed in,
  // then the logic for userState.aiderInstance needs refinement based on
  // whether apiBase/apiKey changes require re-initialization.
  // Assuming sendPromptToAider can handle options directly for now.
  /*
  if (!userState.aiderInstance) {
    log(
      `Initializing/Re-initializing Aider instance for user ${userId} with model ${userState.currentModel}`,
    )
    try {
      const initOptions = {
        repoPath: globalRepoPath,
        modelName: userState.currentModel,
        apiBase: userState.apiBase, // Use effective value from state
        apiKey: userState.apiKey,   // Use effective value from state
      }
      userState.aiderInstance = await aiderService.initializeAider(initOptions)
      log(`Aider instance ready for user ${userId}`)
    } catch (initError) {
      logError(
        `Failed to initialize Aider instance for user ${userId}:`,
        initError,
      )
      throw new Error(
        `Failed to initialize Aider for user ${userId}: ${initError.message}`,
      )
    }
  }
  */

  // Run Aider
  try {
    const aiderResult = await aiderService.sendPromptToAider({
      repoPath: globalRepoPath,
      prompt: finalPrompt,
      modelName: userState.currentModel,
      apiBase: userState.apiBase, // Pass the correct base from user state
      apiKey: userState.apiKey, // Pass the correct key from user state
      contextFiles: allContextFiles,
      editableFiles: editableFiles,
      readOnlyFiles: readOnlyFiles,
      // aiderInstance: userState.aiderInstance, // Pass instance if required by aiderService
    })
    // Log the result structure for debugging
    log(`Received raw Aider result for user ${userId}:`, aiderResult)

    // Ensure the result structure is handled correctly
    // Assuming the result object has a 'stdout' property based on previous tests
    if (typeof aiderResult?.stdout !== 'string') {
      logError(
        `Aider service returned unexpected result structure (missing stdout) for user ${userId}:`,
        aiderResult,
      )
      return {
        content: 'Error: Aider returned an unexpected response structure.',
      }
    }
    return { content: aiderResult.stdout } // Use stdout based on previous tests
  } catch (error) {
    logError(`Error during Aider interaction for user ${userId}:`, error)
    // If API base was wrong, invalidate aider instance?
    // Or maybe aiderService handles this?
    // For now, just throw.
    // throw new Error(`Aider interaction failed: ${error.message || error}`)
    // Return error structure instead of throwing to allow relaying
    return { content: `Error interacting with Aider: ${error.message}` }
  }
}

// --- End Helper Functions ---

// --- Planning Session Functions ---
/**
 * Starts a planning session for a user.
 * @param {{userId: string, threadId: string}} options
 * @returns {Promise<{message: string}>}
 */
export async function startPlanningSession({ userId, threadId }) {
  if (!isCoreInitialized) {
    throw new Error('Core service not initialized.')
  }
  if (!userId || !threadId) {
    throw new Error('userId and threadId are required to start a planning session.')
  }
  
  log(`Starting planning session for user ${userId} in thread ${threadId}`)
  const userState = getUserState(userId)
  
  userState.isPlanningSessionActive = true
  userState.planningSessionId = threadId
  userState.currentPhase = 'planning-conversation'
  userState.chatHistory = [] // Reset chat history for new session
  
  log(`Planning session started for user ${userId} in thread ${threadId}`)
  return { message: 'Planning session started. You can now discuss your requirements.' }
}

// --- Core Functions (Placeholders) ---
// Renamed from handleIncomingMessage to match plan (original name was handleIncomingMessage)
export async function handleIncomingMessage({ message, userId }) {
  if (!isCoreInitialized) {
    throw new Error('Core service not initialized.')
  }
  if (!userId) {
    throw new Error('userId is required for handleIncomingMessage.')
  }
  log(`Handling message from ${userId}: ${message}`)

  const userState = getUserState(userId)
  
  // Check if this is a message in an active planning session
  if (userState.isPlanningSessionActive) {
    log(`Processing message in planning session for user ${userId}`)
    
    userState.chatHistory.push({
      type: 'user',
      content: message,
      timestamp: new Date()
    })
    
    if (userState.currentPhase === 'planning-conversation') {
      try {
        const aiderResult = await _prepareAndRunAider(userId, message)
        
        userState.chatHistory.push({
          type: 'ai',
          content: aiderResult.content,
          timestamp: new Date()
        })
        
        return aiderResult // Return the structured response { content: ... }
      } catch (error) {
        // Log the error
        logError(`Error in planning session for user ${userId}:`, error)
        
        // Return an error structure that can be relayed
        return { content: `Error processing your request: ${error.message}` }
      }
    } else {
      return { content: `Currently in ${userState.currentPhase} phase. This functionality will be implemented in future phases.` }
    }
  } else {
    try {
      const aiderResult = await _prepareAndRunAider(userId, message)
      return aiderResult // Return the structured response { content: ... }
    } catch (error) {
      // Return an error structure that can be relayed
      return { content: `Error processing your request: ${error.message}` }
    }
  }
}

// --- NEW: Wrapper functions for slash commands ---
export async function addFileToContext({ userId, filePath, readOnly }) {
  if (!isCoreInitialized) {
    return { message: 'Error: Core service not initialized.' }
  }
  if (!userId || !filePath) {
    return { message: 'Error: User ID and file path are required.' }
  }
  // Call the internal logic function
  return await _handleAddCommand(userId, filePath, readOnly)
}

export async function removeFileFromContext({ userId, filePath }) {
  if (!isCoreInitialized) {
    return { message: 'Error: Core service not initialized.' }
  }
  if (!userId || !filePath) {
    return { message: 'Error: User ID and file path are required.' }
  }
  // Call the internal logic function
  return await _handleRemoveCommand(userId, filePath)
}

export async function clearContext({ userId }) {
  if (!isCoreInitialized) {
    return { message: 'Error: Core service not initialized.' }
  }
  if (!userId) {
    return { message: 'Error: User ID is required.' }
  }
  // Call the internal logic function
  return await _handleClearCommand(userId)
}
// --- END NEW WRAPPERS ---

// --- Push Changes Function ---
export async function pushChanges({
  userId /* Optional: for logging/context */,
}) {
  if (!isCoreInitialized) {
    throw new Error('Core service not initialized. Cannot push changes.')
  }
  if (!globalRepoPath) {
    // This shouldn't happen if isCoreInitialized is true, but safety check
    throw new Error(
      'Internal Error: Repo path not set despite core being initialized.',
    )
  }

  log(
    `Pushing changes for branch ${config.workingBranch} in repo ${globalRepoPath} (Triggered by user: ${userId || 'Unknown'})`,
  )

  try {
    // Call the existing gitService function to push the working branch
    const pushResult = await gitService.pushBranch({
      localPath: globalRepoPath,
      branchName: config.workingBranch,
    })
    log('Push successful:', pushResult)
    // Return a simple confirmation or details from pushResult
    // Return a structured message for the adapter
    return {
      message: `Successfully pushed changes to branch ${config.workingBranch}.`,
    }
  } catch (error) {
    logError(`Error pushing changes for user ${userId || 'Unknown'}:`, error)
    // Return a structured error message
    return { message: `Error pushing changes: ${error.message || error}` }
  }
}

// --- NEW: Get Context Files Function ---
/**
 * Retrieves the current list of context files for a given user.
 * @param {{userId: string}} options - Options object containing the userId.
 * @returns {Array<{path: string, readOnly: boolean}>} - The list of context files.
 */
export function getContextFiles({ userId }) {
  if (!isCoreInitialized) {
    // It might be better to throw an error, but for autocomplete,
    // returning empty might be safer to avoid breaking the interaction.
    logError('Attempted to get context files before core was initialized.')
    return []
  }
  if (!userId) {
    logError('userId is required to get context files.')
    return [] // Or throw?
  }
  const userState = getUserState(userId) // Gets or initializes state
  // Return a copy to prevent accidental modification of the internal state
  return [...userState.contextFiles]
}
// --- END NEW ---

// --- NEW: Get File Content Function ---
/**
 * Reads the content of a specified file within the repository.
 * Includes path validation to prevent directory traversal.
 * @param {{userId: string, filePath: string}} options
 * @returns {Promise<{filename: string, content: string}>}
 * @throws {Error} If path is invalid, file not found, or read fails.
 */
export async function getFileContent({ userId, filePath }) {
  if (!isCoreInitialized || !globalRepoPath) {
    throw new Error('Core service not initialized.')
  }
  if (!userId) {
    // Although not strictly needed for reading, good practice for context
    logWarn('getFileContent called without userId.')
  }
  if (!filePath) {
    throw new Error('filePath is required.')
  }

  log(`User ${userId || 'unknown'} requesting content for: ${filePath}`)

  // --- Path Validation ---
  // 1. Normalize the path (resolve . and .. components, handle slashes)
  const normalizedRelativePath = path
    .normalize(filePath)
    .replace(/^(\\.\\)?\\?/, '') // Ensure relative, normalize slashes

  // 2. Prevent absolute paths and directory traversal
  if (
    path.isAbsolute(normalizedRelativePath) ||
    normalizedRelativePath.startsWith('..')
  ) {
    logError(
      `Invalid path requested by user ${userId || 'unknown'}: ${filePath} (normalized: ${normalizedRelativePath})`,
    )
    throw new Error(
      'Invalid file path provided. Only relative paths within the repository are allowed.',
    )
  }

  // 3. Construct the full path
  const fullPath = path.resolve(globalRepoPath, normalizedRelativePath)

  // 4. Ensure the resolved path is still WITHIN the globalRepoPath
  if (
    !fullPath.startsWith(path.resolve(globalRepoPath) + path.sep) &&
    fullPath !== path.resolve(globalRepoPath)
  ) {
    // Check if it starts with the repo path + separator, OR is exactly the repo path (for root files)
    logError(
      `Path traversal attempt detected by user ${userId || 'unknown'}: ${filePath} -> ${fullPath}`,
    )
    throw new Error(
      'Access denied: Path is outside the allowed repository directory.',
    )
  }
  // --- End Path Validation ---
  try {
    // Check if it's actually a file
    const stats = await fs.stat(fullPath)
    if (!stats.isFile()) {
      throw new Error(`Path '${normalizedRelativePath}' is not a file.`)
    }

    // Read the file content
    const content = await fs.readFile(fullPath, 'utf-8')
    const filename = path.basename(normalizedRelativePath) // Get the base filename
    log(
      `Successfully read content for ${filename} (requested by ${userId || 'unknown'})`,
    )
    return { filename, content }
  } catch (error) {
    if (error.code === 'ENOENT') {
      logError(
        `File not found for /show requested by ${userId || 'unknown'}: ${normalizedRelativePath}`,
      )
      throw new Error(`File not found: '${normalizedRelativePath}'.`)
    } else {
      logError(
        `Error reading file ${normalizedRelativePath} for user ${userId || 'unknown'}:`,
        error,
      )
      throw new Error(
        `Error reading file '${normalizedRelativePath}': ${error.message}`,
      )
    }
  }
}
// --- END NEW ---

// --- Remove the old export block ---
// export const coreService = {
//   initializeCore,
//   handleIncomingMessage,
//   setModel,
//   setConfigOverrides, // <-- Export the new function
//   pushChanges,
//   getContextFiles,
//   getFileContent, // <-- Export the new function
//   // Add other functions to export as needed
// }
