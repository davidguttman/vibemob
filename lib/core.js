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

// Function to get or initialize state for a user
function getUserState(userId) {
  if (!coreStateStore[userId]) {
    log(`Initializing state for new user: ${userId}`)
    coreStateStore[userId] = {
      currentModel: config.defaultModel,
      apiBase: config.aiderApiBase, // <-- Initialize apiBase from config
      apiKey: config.aiderApiKey, // <-- Initialize apiKey from config
      aiderInstance: null,
      contextFiles: [],
    }
  }
  return coreStateStore[userId]
}

// Store the global repo path separately
let globalRepoPath = null
let isCoreInitialized = false

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
async function initializeCore({ repoPath }) {
  // Always reset global state on initialization call for testability
  log('Resetting core state for initialization...')
  globalRepoPath = null
  isCoreInitialized = false
  coreStateStore = {} // Clear all user states

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
async function setModel({ modelName, userId }) {
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
async function setConfigOverrides({ userId, apiBase, apiKey }) {
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
async function _handleAddCommand(userId, relativePath) {
  const userState = getUserState(userId)
  const fullPath = path.join(globalRepoPath, relativePath)

  // Basic path validation
  if (path.isAbsolute(relativePath) || relativePath.includes('..')) {
    logError(`Invalid file path provided for /add: ${relativePath}`)
    return `Error: Invalid file path '${relativePath}'. Please provide a relative path within the repository.`
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
        return `Directory ${relativePath} is empty or contains no files.`
      }

      let addedCount = 0
      let skippedCount = 0
      filesToAdd.forEach((file) => {
        if (!userState.contextFiles.some((ctxFile) => ctxFile.path === file)) {
          userState.contextFiles.push({ path: file, readOnly: true }) // Add read-only by default
          addedCount++
        } else {
          skippedCount++
        }
      })
      log(
        `Added ${addedCount} files from directory ${relativePath} for user ${userId}. Skipped ${skippedCount}. Current context:`,
        userState.contextFiles,
      )
      return `Added directory ${relativePath} to the chat context`
    } else if (stats.isFile()) {
      if (
        userState.contextFiles.some((ctxFile) => ctxFile.path === relativePath)
      ) {
        log(`File ${relativePath} is already in context for user ${userId}.`)
        return `${relativePath} is already in the chat context.`
      } else {
        userState.contextFiles.push({ path: relativePath, readOnly: true }) // Add read-only by default
        log(
          `Added ${relativePath} to context for user ${userId}. Current context:`,
          userState.contextFiles,
        )
        return `Added ${relativePath} to the chat context`
      }
    } else {
      logError(`Path is not a file or directory: ${relativePath}`)
      return `Error: Path '${relativePath}' is not a valid file or directory.`
    }
  } catch (error) {
    if (error.code === 'ENOENT') {
      logError(`Path not found for /add: ${relativePath}`)
      return `Error: Path '${relativePath}' not found.`
    } else {
      logError(`Error accessing path ${relativePath}:`, error)
      return `Error processing path '${relativePath}'.`
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
    return `Removed ${relativePath} from the chat context`
  } else {
    log(
      `Path ${relativePath} not found in context for user ${userId} for removal.`,
    )
    return `${relativePath} was not found in the chat context.`
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
  return 'Chat context cleared.'
}

// Prepares options and runs the Aider interaction
async function _prepareAndRunAider(userId, prompt) {
  const userState = getUserState(userId)
  const editableFiles = userState.contextFiles
    .filter((f) => !f.readOnly)
    .map((f) => f.path)
  const readOnlyFiles = userState.contextFiles
    .filter((f) => f.readOnly)
    .map((f) => f.path)
  const finalPrompt = prompt

  // --- Read config from userState ---
  // Ensure userState has potentially been updated by setConfigOverrides
  const userApiBase = userState.apiBase
  const userApiKey = userState.apiKey
  const userModel = userState.currentModel

  // Check if values exist in userState, otherwise use global config as fallback
  // This should have been done when reading from userState above, fixing logic:
  const effectiveApiBase = userApiBase || config.aiderApiBase
  const effectiveApiKey = userApiKey || config.aiderApiKey

  const aiderOptions = {
    repoPath: globalRepoPath,
    modelName: userModel, // Already read from userState
    apiBase: effectiveApiBase, // <-- Use correctly read value
    apiKey: effectiveApiKey, // <-- Use correctly read value
    prompt: finalPrompt,
    editableFiles: editableFiles,
    readOnlyFiles: readOnlyFiles,
  }
  // Use effective values in log message too
  log(
    `>>> DETAILED Aider Options for sendPromptToAider (Core - User: ${userId}):`,
    aiderOptions,
  )

  // Initialize/Re-initialize Aider instance if needed
  if (!userState.aiderInstance) {
    log(
      `Initializing/Re-initializing Aider instance for user ${userId} with model ${userModel}`,
    )
    try {
      // Use the effective values for initialization too
      const initOptions = {
        repoPath: globalRepoPath,
        modelName: userModel,
        apiBase: effectiveApiBase, // <-- Use effective value
        apiKey: effectiveApiKey, // <-- Use effective value
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

  // Run Aider
  try {
    const result = await aiderService.sendPromptToAider({
      ...aiderOptions, // Includes effective apiBase/apiKey
      aiderInstance: userState.aiderInstance,
    })
    log(`Received full Aider result for user ${userId}:`, result)
    return result.stdout // Return only stdout
  } catch (error) {
    logError(`Error during Aider interaction for user ${userId}:`, error)
    // If API base was wrong, invalidate aider instance?
    // Or maybe aiderService handles this?
    // For now, just throw.
    throw new Error(`Aider interaction failed: ${error.message || error}`)
  }
}

// --- End Helper Functions ---

// --- Core Functions (Placeholders) ---
// Renamed from handleIncomingMessage to match plan (original name was handleIncomingMessage)
async function handleIncomingMessage({ message, userId }) {
  if (!isCoreInitialized) {
    throw new Error('Core service not initialized.')
  }
  if (!userId) {
    throw new Error('userId is required for handleIncomingMessage.')
  }
  log(`Handling message from ${userId}: ${message}`)

  const parsedCommand = _parseCommand(message)

  if (parsedCommand) {
    switch (parsedCommand.command) {
      case 'add':
        return await _handleAddCommand(userId, parsedCommand.path)
      case 'remove':
        return await _handleRemoveCommand(userId, parsedCommand.path)
      case 'clear':
        return await _handleClearCommand(userId)
      default:
        // Should not happen if _parseCommand is correct
        logError('Internal error: Unknown parsed command', parsedCommand)
        return 'Error: Internal error processing command.'
    }
  } else {
    // Not a command, treat as a prompt for Aider
    return await _prepareAndRunAider(userId, message)
  }
}

// --- Push Changes Function ---
async function pushChanges({ userId /* Optional: for logging/context */ }) {
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
    return { pushed: true, branch: config.workingBranch, details: pushResult }
  } catch (error) {
    logError(`Error pushing changes for user ${userId || 'Unknown'}:`, error)
    // Re-throw or return a structured error
    throw new Error(
      `Failed to push changes to ${config.workingBranch}: ${error.message || error}`,
    )
  }
}

// --- NEW: Get Context Files Function ---
/**
 * Retrieves the current list of context files for a given user.
 * @param {{userId: string}} options - Options object containing the userId.
 * @returns {Array<{path: string, readOnly: boolean}>} - The list of context files.
 */
function getContextFiles({ userId }) {
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
async function getFileContent({ userId, filePath }) {
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

// --- Export Functions ---
export const coreService = {
  initializeCore,
  handleIncomingMessage,
  setModel,
  setConfigOverrides, // <-- Export the new function
  pushChanges,
  getContextFiles,
  getFileContent, // <-- Export the new function
  // Add other functions to export as needed
}
