const { runAider } = require('@dguttman/aider-js');
const path = require('path');
const fs = require('fs').promises;
const { execSync } = require('child_process');
const { createProxy } = require('echoproxia');

const REPO_DIR = path.resolve('/test-app/temp-repo');
const RECORDINGS_DIR = path.join(__dirname, 'recordings');

// Determine mode (record or replay)
// Default to record, can override with ECHOPROXIA_MODE=replay
const recordMode = process.env.ECHOPROXIA_MODE !== 'replay';

async function setupRepo() {
    try {
        await fs.rm(REPO_DIR, { recursive: true, force: true });
        await fs.mkdir(REPO_DIR, { recursive: true });
        execSync('git init', { cwd: REPO_DIR, stdio: 'inherit' });
        execSync('git config user.email "test@example.com"', { cwd: REPO_DIR, stdio: 'inherit' });
        execSync('git config user.name "Test User"', { cwd: REPO_DIR, stdio: 'inherit' });
        await fs.writeFile(path.join(REPO_DIR, 'test.txt'), 'Initial content.');
        execSync('git add .', { cwd: REPO_DIR, stdio: 'inherit' });
        execSync('git commit -m "Initial commit"', { cwd: REPO_DIR, stdio: 'inherit' });
        console.log(`Temporary repo initialized at ${REPO_DIR}`);
    } catch (error) {
        console.error('Error setting up temporary repo:', error);
        process.exit(1);
    }
}

// Proxy instance variable
let proxy = null;

async function runTest() {
    const targetApiBase = process.env.AIDER_TARGET_API; // e.g., 'https://openrouter.ai/api/v1'
    const apiKey = process.env.OPENROUTER_API_KEY;

    if (!targetApiBase) {
        console.error('Error: AIDER_TARGET_API environment variable is not set.');
        process.exit(1);
    }
    if (!apiKey) {
        console.error('Error: OPENROUTER_API_KEY environment variable is not set.');
        process.exit(1);
    }
    // Don't need apiKey if replaying
    // if (!apiKey && recordMode) {
    //     console.error('Error: OPENROUTER_API_KEY environment variable is not set (required for record mode).');
    //     process.exit(1);
    // }

    try {
        // Create and start the proxy
        proxy = await createProxy({
            targetUrl: targetApiBase,
            recordingsDir: RECORDINGS_DIR,
            recordMode: recordMode,
            redactHeaders: ['authorization', 'x-api-key'] // Redact sensitive headers
        });
        console.log(`Echoproxia running in ${recordMode ? 'record' : 'replay'} mode on ${proxy.url}`);

        await setupRepo();

        const options = {
            repoPath: REPO_DIR,
            files: ['test.txt'], // Specify a file for aider to look at
            modelName: 'openai/gpt-4o', // Use modelName instead of model
            apiBase: proxy.url, // Point aider to the proxy
            apiKey: apiKey,
        };

        const promptText = 'Add a comment line to test.txt';

        console.log(`Running aider with prompt: "${promptText}"`);

        // Set the recording sequence name
        proxy.setSequence('aider-test-sequence');

        // Pass prompt inside options object
        const finalOptions = {
            ...options,
            prompt: promptText,
        };
        console.log('Final Options:', finalOptions);

        // Call runAider with only the options object
        const result = await runAider(finalOptions);
        console.log('Aider finished successfully.');
        console.log('Result:', result);

        // Optional: Check file content
        const finalContent = await fs.readFile(path.join(REPO_DIR, 'test.txt'), 'utf-8');
        console.log('Final content of test.txt:\n---', finalContent, '\n---');

    } catch (error) {
        console.error('Aider failed:');
        // Log specific properties if available
        if (error.message) console.error('Message:', error.message);
        if (error.stdout) console.error('Stdout:', error.stdout);
        if (error.stderr) console.error('Stderr:', error.stderr);
        if (!error.message && !error.stdout && !error.stderr) {
             console.error(error); // Log the whole error if no specific fields
        }
        process.exitCode = 1; // Indicate failure
    } finally {
        // Clean up the temporary repo
        // await fs.rm(REPO_DIR, { recursive: true, force: true });
        // console.log('Cleaned up temporary repo.');
        // Keep repo for inspection for now

        // Stop the proxy server
        if (proxy && proxy.stop) {
            await proxy.stop();
            console.log('Echoproxia stopped.');
        }
    }
}

runTest(); 