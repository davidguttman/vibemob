import { runAider } from '@dguttman/aider-js';
import debug from 'debug';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { gitService } from '../lib/git-service.js'; // Adjust path

const log = debug('test:runAider');
const REPO_URL = process.env.GIT_REPO_URL || 'ssh://git@git-server/repos/test-repo.git'; // Use the same repo as tests

async function main() {
  let tempDir = '';
  try {
    // Create temp directory
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vibemob-debug-aider-'));
    log(`Created temp directory: ${tempDir}`);

    // Clone repo
    await gitService.cloneRepo({ repoUrl: REPO_URL, localPath: tempDir });
    log(`Cloned repo to: ${tempDir}`);

    const options = {
      repoPath: tempDir, // Use the cloned repo path
      modelName: 'openai/gpt-4o',
      apiBase: process.env.AIDER_API_BASE || 'http://localhost:5000', // Use proxy by default
      apiKey: process.env.OPENROUTER_API_KEY || 'dummy-key-if-not-set', // Use env var or dummy
      prompt: 'Say hi',
      files: [],
    };

    log('>>> Calling runAider with options:', JSON.stringify(options, null, 2));
    
    const result = await runAider(options);
    
    log('<<< runAider call completed.');
    log('Result:', JSON.stringify(result, null, 2));

  } catch (error) {
    log('!!! runAider call failed:', error);
  } finally {
    // Cleanup temp directory
    if (tempDir) {
      try {
        await fs.rm(tempDir, { recursive: true, force: true });
        log(`Cleaned up temp directory: ${tempDir}`);
      } catch (cleanupError) {
        log(`Error cleaning up temp directory ${tempDir}:`, cleanupError);
      }
    }
  }
}

main(); 