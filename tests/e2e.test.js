import test from 'ava';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
// import tcpPortUsed from 'tcp-port-used'; // REMOVED

// Placeholder for the actual service - this import will fail initially
import { gitService } from '../lib/index.js'; 

// Get repo URL from environment variable set by run-tests.sh
const REPO_URL = process.env.REPO_URL;
if (!REPO_URL) {
  throw new Error('REPO_URL environment variable not set. Run tests using \'npm test\'.');
}

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

test('Phase 1.2 & 1.3: should clone remote repository via SSH and verify files', async t => {
  const localPath = path.join(tempDir, 'repo');

  /* // REMOVED PORT WAITING LOGIC
  // --- Wait for git-server SSH port --- 
  const host = 'git-server'; // Service name in docker-compose
  const port = 22;
  console.log(`Waiting for SSH port ${port} on host ${host}...`);
  try {
    await tcpPortUsed.waitUntilUsed(port, host, 500, 30000); // Retry every 500ms for 30s
    console.log(`SSH port ${port} on host ${host} is active.`);
  } catch (err) {
    console.error(`SSH port ${port} on host ${host} did not become active:`, err);
    t.fail(`Timeout waiting for git-server SSH port: ${err.message}`);
    return; // Stop the test if port doesn't open
  }
  // -------------------------------------
  */

  // await new Promise(resolve => setTimeout(resolve, 2000)); -- REMOVED as per user instruction

  // This is the action we are testing. It's expected to fail initially.
  const clonePromise = gitService.cloneRepo({
	repoUrl: REPO_URL, // Use env var
	localPath,
	// SSH key is handled internally by gitService now
}); 

  // Assert that the clone operation *should* complete without throwing
  await t.notThrowsAsync(clonePromise, 'Clone operation failed');

  // --- Step 1.3 Assertions ---
  // Verify expected files exist in the cloned directory
  const readmePath = path.join(localPath, 'README.md');
  const file1Path = path.join(localPath, 'file1.txt');
  const srcIndexPath = path.join(localPath, 'src', 'index.js');

  await t.true(await fs.stat(readmePath).then(s => s.isFile()).catch(() => false), 'README.md should exist');
  await t.true(await fs.stat(file1Path).then(s => s.isFile()).catch(() => false), 'file1.txt should exist');
  await t.true(await fs.stat(srcIndexPath).then(s => s.isFile()).catch(() => false), 'src/index.js should exist');
  // --------------------------
}); 