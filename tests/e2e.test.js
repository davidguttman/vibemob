import test from 'ava';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

// Placeholder for the actual service - this import will fail initially
import { gitService } from '../lib/index.js'; 

const REPO_URL = 'ssh://git@git-server/home/git/repo.git';
let tempDir;

test.beforeEach(async () => {
  // Create a unique temporary directory for each test run
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vibemob-test-'));
});

test.afterEach.always(async () => {
  // Clean up the temporary directory
  if (tempDir) {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('Phase 1.2: should clone remote repository via SSH', async t => {
  const localPath = path.join(tempDir, 'repo');

  // This is the action we are testing. It's expected to fail initially.
  const clonePromise = gitService.cloneRepo({
	repoUrl: REPO_URL, 
	localPath,
	// We'll need to pass the SSH key path later
}); 

  // Assert that the clone operation *should* complete without throwing
  await t.notThrowsAsync(clonePromise, 'Clone operation failed');

  // Future assertions (from Step 1.3) will go here
  // e.g., t.true(await fs.stat(path.join(localPath, 'README.md')).then(s => s.isFile()));
}); 