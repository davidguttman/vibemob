import { runAider } from '@dguttman/aider-js';

// Wrapper around aider-js functions

// For now, initialization might just mean checking config, 
// as runAider handles its own setup each time.
async function initializeAider(options) {
  console.log('Initializing Aider service wrapper...');
  if (!options.apiBase || !options.apiKey || !options.repoPath || !options.modelName) {
    throw new Error('Missing required options for Aider initialization (apiBase, apiKey, repoPath, modelName)');
  }
  // No persistent aider instance needed with runAider, just validation
  console.log('Aider service wrapper initialized.');
  return { status: 'ready', config: options }; 
}

// Sends a prompt and context to runAider
// Add files to accepted options
async function sendPromptToAider(options) {
  console.log(`Sending prompt to Aider: "${options.prompt}"`);
  console.log(`Using model: ${options.modelName}, apiBase: ${options.apiBase}`);
  
  // Ensure required options are present
  // Add files to validation if necessary, but maybe optional?
  if (!options.repoPath || !options.prompt || !options.modelName || !options.apiBase || !options.apiKey) {
      throw new Error('Missing required options for sendPromptToAider (repoPath, prompt, modelName, apiBase, apiKey)');
  }
  // Log files if present
  if (options.files && options.files.length > 0) {
    console.log(`With files: ${options.files.join(', ')}`);
  }

  try {
    // Construct options for runAider, ensuring only valid ones are passed
    const runAiderOptions = {
        repoPath: options.repoPath,
        prompt: options.prompt,
        modelName: options.modelName,
        apiBase: options.apiBase,
        apiKey: options.apiKey,
        files: options.files || [], // Pass files to runAider
        // verbose: options.verbose || false,
    };

    const result = await runAider(runAiderOptions);
    console.log('Aider finished successfully.');
    // runAider result structure might vary, adjust as needed.
    // Log the full result object for inspection
    console.log('Full Aider Result:', JSON.stringify(result, null, 2)); 
    // Assuming it returns an object with stdout or similar.
    // For a plain text response test, we expect stdout to contain the response.
    return { response: result.stdout || 'No output from Aider.' }; 
  } catch (error) {
      console.error('Error running Aider:', error);
      // Rethrow or handle error appropriately
      throw error; 
  }
}

export const aiderService = {
  initializeAider,
  sendPromptToAider,
}; 