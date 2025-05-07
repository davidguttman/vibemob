import debug from 'debug'
import { runAider } from '@dguttman/aider-js'

const log = debug('vibemob:aider')
const logError = debug('vibemob:aider:error')
logError.log = console.error.bind(console) // Direct errors to stderr

// Wrapper around aider-js functions

// For now, initialization might just mean checking config,
// as runAider handles its own setup each time.
async function initializeAider(options) {
  log('Initializing Aider service wrapper...')
  if (
    !options.apiBase ||
    !options.apiKey ||
    !options.repoPath ||
    !options.modelName
  ) {
    throw new Error(
      'Missing required options for Aider initialization (apiBase, apiKey, repoPath, modelName)',
    )
  }
  // No persistent aider instance needed with runAider, just validation
  log('Aider service wrapper initialized.')
  return { status: 'ready', config: options }
}

// Sends a prompt and context to runAider
// Updated to accept editableFiles and readOnlyFiles separately
async function sendPromptToAider(options) {
  log(`Sending prompt to Aider: "${options.prompt}"`)
  log(`Using model: ${options.modelName}, apiBase: ${options.apiBase}`)

  // Ensure required options are present
  if (
    !options.repoPath ||
    !options.prompt ||
    !options.modelName ||
    !options.apiBase ||
    !options.apiKey
  ) {
    throw new Error(
      'Missing required options for sendPromptToAider (repoPath, prompt, modelName, apiBase, apiKey)',
    )
  }
  // Log files if present
  if (options.editableFiles && options.editableFiles.length > 0) {
    log(`With editable files: ${options.editableFiles.join(', ')}`)
  }
  if (options.readOnlyFiles && options.readOnlyFiles.length > 0) {
    log(`With read-only files: ${options.readOnlyFiles.join(', ')}`)
  }

  try {
    // Construct options for runAider, ensuring only valid ones are passed
    // Matches the options defined in @dguttman/aider-js/README.md
    const runAiderOptions = {
      repoPath: options.repoPath,
      prompt: options.prompt,
      modelName: options.modelName,
      apiBase: options.apiBase,
      apiKey: options.apiKey,
      editableFiles: options.editableFiles || [], // Pass editable files
      readOnlyFiles: options.readOnlyFiles || [], // Pass read-only files
      autoCommits: true, // Keep auto-commit enabled as before
      // Other options like showDiffs, stream, verbose could be added here if needed
    }

    // --> ADD LOGGING
    log(
      '>>> Calling runAider with options:',
      JSON.stringify(runAiderOptions, null, 2),
    ) // REMOVE DEBUG LOG

    const result = await runAider(runAiderOptions)

    // --> ADD LOGGING
    // log('<<< runAider call completed.'); // REMOVE DEBUG LOG

    log('Aider finished successfully.')
    // runAider result structure might vary, adjust as needed.
    // Log the full result object for inspection
    log('Full Aider Result:', JSON.stringify(result, null, 2))
    // Assuming it returns an object with stdout or similar.
    // For a plain text response test, we expect stdout to contain the response.
    return result // Return the full result object
  } catch (error) {
    logError('Error running Aider:', error)
    // Rethrow or handle error appropriately
    throw error
  }
}

export const aiderService = {
  initializeAider,
  sendPromptToAider,
}
