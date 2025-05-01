import test from 'ava';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import simpleGit from 'simple-git';
import { createProxy } from 'echoproxia';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
// import tcpPortUsed from 'tcp-port-used'; // REMOVED

// Placeholder for the actual service - this import will fail initially
import { gitService } from '../lib/index.js'; 
import { coreService } from '../lib/index.js';

// Define the starting branch
const STARTING_BRANCH = 'main';

// Define the working branch
const WORKING_BRANCH = 'aider-bot-dev';

// Get repo URL from environment variable set by run-tests.sh
const REPO_URL = process.env.REPO_URL;
if (!REPO_URL) {
  throw new Error('REPO_URL environment variable not set. Run tests using \'npm test\'.');
}

// ESM equivalent for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let tempDir;
let proxy = null;
let proxyUrl = null;

test.before(async () => {
  const targetApiBase = process.env.AIDER_TARGET_API || 'https://openrouter.ai/api/v1';
  const recordMode = process.env.ECHOPROXIA_MODE !== 'replay';
  const recordingsDir = path.resolve(__dirname, 'fixtures', 'recordings');

  try {
    // Ensure the host directory exists via the mount
    await fs.mkdir(recordingsDir, { recursive: true }); // Create if needed
    proxy = await createProxy({
      targetUrl: targetApiBase,
      recordingsDir: recordingsDir,
      recordMode: recordMode,
      redactHeaders: ['authorization', 'x-api-key']
    });
    proxyUrl = proxy.url;
    console.log(`Echoproxia proxy started for tests at ${proxyUrl} (Mode: ${recordMode ? 'record' : 'replay'})`);
    process.env.AIDER_API_BASE = proxyUrl;
  } catch (err) {
    console.error('Failed to start Echoproxia proxy:', err);
  }
});

test.after.always(async () => {
  if (proxy && proxy.stop) {
    await proxy.stop();
    console.log('Echoproxia proxy stopped.');
    proxy = null;
    proxyUrl = null;
  }
});

test.beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vibemob-test-'));
});

test.afterEach.always(async () => {
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

// --- Phase 2 Tests ---

test('Phase 2.1: should checkout the STARTING_BRANCH after cloning', async t => {
  const localPath = path.join(tempDir, 'repo-phase2');

  // 1. Clone the repository first
  await t.notThrowsAsync(
    gitService.cloneRepo({
      repoUrl: REPO_URL,
      localPath,
    }),
    'Clone operation failed for Phase 2.1 test'
  );

  // 2. Checkout the starting branch (this function doesn't exist yet)
  const checkoutPromise = gitService.checkoutBranch({
    localPath,
    branchName: STARTING_BRANCH,
  });

  // Assert the checkout operation *should* complete without throwing (will fail initially)
  await t.notThrowsAsync(checkoutPromise, 'Checkout operation failed');

  // 3. Verify the current branch is STARTING_BRANCH
  // This requires a new gitService function, e.g., getCurrentBranch
  const currentBranch = await gitService.getCurrentBranch({ localPath });
  t.is(currentBranch, STARTING_BRANCH, `Current branch should be ${STARTING_BRANCH}`);
}); 

test('Phase 2.2: should pull the STARTING_BRANCH after checkout', async t => {
  const localPath = path.join(tempDir, 'repo-phase2.2');

  // 1. Clone
  await t.notThrowsAsync(
    gitService.cloneRepo({ repoUrl: REPO_URL, localPath }),
    'Clone operation failed for Phase 2.2 test'
  );

  // 2. Checkout (already tested, but needed for setup)
  await t.notThrowsAsync(
    gitService.checkoutBranch({ localPath, branchName: STARTING_BRANCH }),
    'Checkout operation failed for Phase 2.2 test'
  );

  // 3. Pull the branch (this function doesn't exist yet)
  const pullPromise = gitService.pullBranch({
    localPath,
    branchName: STARTING_BRANCH,
  });

  // Assert the pull operation *should* complete without throwing (will fail initially)
  await t.notThrowsAsync(pullPromise, 'Pull operation failed');

  // Optional: Could add assertions here to check for specific file content
  // after pull if we modify the remote repo in the test setup, but for now,
  // just ensuring the pull command runs without error is sufficient for this step.
}); 

test('Phase 2.3: should create WORKING_BRANCH if it doesn\'t exist', async t => {
  const localPath = path.join(tempDir, 'repo-phase2.3');

  // 1. Clone
  await t.notThrowsAsync(
    gitService.cloneRepo({ repoUrl: REPO_URL, localPath }),
    'Clone operation failed for Phase 2.3 test'
  );

  // 2. Checkout or Create Branch (this function doesn't exist yet)
  const checkoutOrCreatePromise = gitService.checkoutOrCreateBranch({
    localPath,
    branchName: WORKING_BRANCH,
  });
  await t.notThrowsAsync(checkoutOrCreatePromise, 'Checkout or create operation failed');

  // 3. Verify current branch is WORKING_BRANCH
  const currentBranch = await gitService.getCurrentBranch({ localPath });
  t.is(currentBranch, WORKING_BRANCH, `Current branch should be ${WORKING_BRANCH}`);

  // 4. Verify branch exists locally but not remotely (listBranches doesn't exist yet)
  const branches = await gitService.listBranches({ localPath });
  t.true(branches.all.includes(WORKING_BRANCH), 'WORKING_BRANCH should exist locally');
  t.false(
    branches.all.some(b => b.startsWith('remotes/origin/') && b.endsWith(WORKING_BRANCH)),
    'WORKING_BRANCH should not exist on remote origin yet'
  );
}); 

test('Phase 2.4: should checkout existing remote WORKING_BRANCH', async t => {
  // Use a single local path for setup, execution, and cleanup
  const localPath = path.join(tempDir, 'repo-phase2.4');
  let branchPushed = false;

  try {
    // --- Setup ---
    // 1. Clone repository
    await gitService.cloneRepo({ repoUrl: REPO_URL, localPath });
    const git = simpleGit(localPath);

    // 2. Create branch locally
    await git.checkoutLocalBranch(WORKING_BRANCH);

    // 3. Make a commit (needed to push the branch)
    await fs.writeFile(path.join(localPath, 'phase2.4.txt'), 'test');
    await git.add('.');
    await git.addConfig('user.name', 'Test Bot 2.4', true, 'local');
    await git.addConfig('user.email', 'test2.4@vibemob.invalid', true, 'local');
    await git.commit('feat: add phase 2.4 test file');

    // 4. Push the branch
    await gitService.pushBranch({ localPath, branchName: WORKING_BRANCH });
    branchPushed = true;

    // --- Execution --- 
    // 5. Simulate a fresh start: Switch back to main and delete local WORKING_BRANCH
    await git.checkout(STARTING_BRANCH);
    await git.deleteLocalBranch(WORKING_BRANCH, true); // Force delete

    // 6. Run the function under test: checkoutOrCreateBranch
    // It should detect the remote branch and check it out locally with tracking
    const checkoutOrCreatePromise = gitService.checkoutOrCreateBranch({
      localPath,
      branchName: WORKING_BRANCH,
    });
    await t.notThrowsAsync(checkoutOrCreatePromise, 'Checkout or create operation failed for existing remote branch');

    // --- Assertions ---
    // 7. Verify current branch is WORKING_BRANCH
    const currentBranch = await gitService.getCurrentBranch({ localPath });
    t.is(currentBranch, WORKING_BRANCH, `Current branch should be ${WORKING_BRANCH}`);

    // 8. Verify branch exists locally and remotely (and tracks)
    const branches = await gitService.listBranches({ localPath }); // Fetches origin
    const remoteBranchName = `remotes/origin/${WORKING_BRANCH}`;
    t.true(branches.all.includes(WORKING_BRANCH), 'WORKING_BRANCH should exist locally after checkout/create');
    t.true(
      branches.all.some(b => b.startsWith('remotes/origin/') && b.endsWith(WORKING_BRANCH)),
      `WORKING_BRANCH should exist on remote origin (${remoteBranchName})`
    );
    const status = await git.status();
    t.is(status.tracking, `origin/${WORKING_BRANCH}`, 'Local branch should track remote branch');

  } catch (err) {
    t.fail(`Test failed for Phase 2.4: ${err}`);
  } finally {
    // --- Cleanup ---
    // Delete the remote branch if it was pushed
    if (branchPushed && localPath) {
        try {
            // Need simple-git instance for cleanup in case setup failed partially
            const gitCleanup = simpleGit(localPath); 
            // Ensure user identity is set for cleanup operations
            await gitCleanup.addConfig('user.name', 'Cleanup Bot 2.4', true, 'local').catch(()=>{}); // Ignore config errors during cleanup
            await gitCleanup.addConfig('user.email', 'cleanup2.4@vibemob.invalid', true, 'local').catch(()=>{});
            await gitService.deleteRemoteBranch({ localPath, branchName: WORKING_BRANCH });
        } catch (cleanupErr) {
            console.warn(`Phase 2.4: Warning during remote branch cleanup: ${cleanupErr.message}`);
        }
    }
    // Local directory cleanup happens in test.afterEach.always
  }
}); 

test('Phase 2.5: should hard reset local WORKING_BRANCH if it exists remotely and locally diverged', async t => {
  const localPath = path.join(tempDir, 'repo-phase2.5');
  const testFileName = 'phase2.5.txt';
  const initialContent = 'initial remote content';
  const localChangeContent = 'local change';
  let branchPushed = false;

  try {
    // --- Setup ---
    // 1. Clone repository
    await gitService.cloneRepo({ repoUrl: REPO_URL, localPath });
    const git = simpleGit(localPath);

    // 2. Create and push the initial state of WORKING_BRANCH
    await git.checkoutLocalBranch(WORKING_BRANCH);
    await fs.writeFile(path.join(localPath, testFileName), initialContent);
    await git.add('.');
    await git.addConfig('user.name', 'Test Bot 2.5 Setup', true, 'local');
    await git.addConfig('user.email', 'test2.5_setup@vibemob.invalid', true, 'local');
    await git.commit('feat: add initial phase 2.5 test file');
    await gitService.pushBranch({ localPath, branchName: WORKING_BRANCH });
    branchPushed = true;

    // 3. Make a local diverging commit
    await fs.writeFile(path.join(localPath, testFileName), localChangeContent);
    await git.add('.');
    // Use different user config for the local commit for clarity if needed
    await git.addConfig('user.name', 'Test Bot 2.5 Local', true, 'local'); 
    await git.addConfig('user.email', 'test2.5_local@vibemob.invalid', true, 'local');
    await git.commit('chore: local divergent modification');

    // Verify local change exists before reset
    const contentBeforeReset = await fs.readFile(path.join(localPath, testFileName), 'utf-8');
    t.is(contentBeforeReset, localChangeContent, 'Local change should exist before reset');
    const logBeforeReset = await git.log();
    t.true(logBeforeReset.latest.message.includes('local divergent modification'), 'Local commit should exist before reset');

    // --- Execution ---
    // 4. Run checkoutOrCreateBranch again - this should trigger the reset
    const resetPromise = gitService.checkoutOrCreateBranch({
      localPath,
      branchName: WORKING_BRANCH,
    });
    await t.notThrowsAsync(resetPromise, 'Reset operation (via checkoutOrCreateBranch) failed');

    // --- Assertions ---
    // 5. Verify local change is gone (hard reset successful)
    const contentAfterReset = await fs.readFile(path.join(localPath, testFileName), 'utf-8');
    t.not(contentAfterReset, localChangeContent, 'Local change should be gone after reset');
    // Trim comparison for safety against newline inconsistencies
    t.is(contentAfterReset.trim(), initialContent.trim(), 'File content should match initial remote state after reset');

    // 6. Verify the local commit is gone
    const logAfterReset = await git.log();
    t.false(logAfterReset.latest.message.includes('local divergent modification'), 'Local commit should be gone after reset');
    t.true(logAfterReset.latest.message.includes('initial phase 2.5'), 'Latest commit should be the initial one after reset');

  } catch (err) {
    t.fail(`Test failed for Phase 2.5: ${err}`);
  } finally {
     // --- Cleanup ---
    // Delete the remote branch if it was pushed
    if (branchPushed && localPath) {
      try {
         const gitCleanup = simpleGit(localPath); 
         await gitCleanup.addConfig('user.name', 'Cleanup Bot 2.5', true, 'local').catch(()=>{}); 
         await gitCleanup.addConfig('user.email', 'cleanup2.5@vibemob.invalid', true, 'local').catch(()=>{});
         await gitService.deleteRemoteBranch({ localPath, branchName: WORKING_BRANCH });
      } catch (cleanupErr) {
         console.warn(`Phase 2.5: Warning during remote branch cleanup: ${cleanupErr.message}`);
      }
    }
    // Local directory cleanup happens in test.afterEach.always
  }
}); 

test('Phase 2.6: should keep local WORKING_BRANCH if remote doesn\'t exist', async t => {
  const localPath = path.join(tempDir, 'repo-phase2.6');
  const testFileName = 'phase2.6.txt';
  const localContent = 'local only content';

  try {
    // --- Setup ---
    // 1. Clone repository
    await gitService.cloneRepo({ repoUrl: REPO_URL, localPath });
    const git = simpleGit(localPath);

    // 2. Create WORKING_BRANCH locally ONLY (do not push)
    await git.checkoutLocalBranch(WORKING_BRANCH);

    // 3. Make a local commit
    await fs.writeFile(path.join(localPath, testFileName), localContent);
    await git.add('.');
    await git.addConfig('user.name', 'Test Bot 2.6', true, 'local');
    await git.addConfig('user.email', 'test2.6@vibemob.invalid', true, 'local');
    await git.commit('feat: add local-only phase 2.6 test file');

    // Verify local state before the call
    const contentBefore = await fs.readFile(path.join(localPath, testFileName), 'utf-8');
    t.is(contentBefore, localContent, 'Local content should exist before call');
    const logBefore = await git.log();
    t.true(logBefore.latest.message.includes('local-only'), 'Local commit should exist before call');

    // --- Execution ---
    // 4. Run checkoutOrCreateBranch - should detect local branch but no remote
    const checkoutPromise = gitService.checkoutOrCreateBranch({
      localPath,
      branchName: WORKING_BRANCH,
    });
    await t.notThrowsAsync(checkoutPromise, 'Checkout or create operation failed for local-only branch');

    // --- Assertions ---
    // 5. Verify current branch is still WORKING_BRANCH
    const currentBranch = await gitService.getCurrentBranch({ localPath });
    t.is(currentBranch, WORKING_BRANCH, `Current branch should still be ${WORKING_BRANCH}`);

    // 6. Verify local content and commit are preserved
    const contentAfter = await fs.readFile(path.join(localPath, testFileName), 'utf-8');
    t.is(contentAfter, localContent, 'Local content should be preserved after call');
    const logAfter = await git.log();
    t.true(logAfter.latest.message.includes('local-only'), 'Local commit should be preserved after call');

    // 7. Verify remote branch still doesn't exist
    const branches = await gitService.listBranches({ localPath }); // Fetches origin
    t.false(
      branches.all.some(b => b.startsWith('remotes/origin/') && b.endsWith(WORKING_BRANCH)),
      `WORKING_BRANCH should still not exist on remote origin`
    );

  } catch (err) {
    t.fail(`Test failed for Phase 2.6: ${err}`);
  } 
  // No specific remote cleanup needed as we didn't push
  // Local directory cleanup happens in test.afterEach.always
}); 

// --- Phase 3 Tests ---

test('Phase 3.1: should initialize the core service successfully', async t => {
  const localPath = path.join(tempDir, 'repo-phase3.1');

  // 1. Clone the repository first (required for core init)
  await t.notThrowsAsync(
    gitService.cloneRepo({
      repoUrl: REPO_URL,
      localPath,
    }),
    'Clone operation failed for Phase 3.1 test'
  );

  // 2. Initialize the core service (this is the function under test)
  // It should ensure the correct branch and initialize aider (placeholder for now)
  const initializePromise = coreService.initializeCore({ repoPath: localPath });

  // Assert initialization doesn't throw
  await t.notThrowsAsync(initializePromise, 'Core service initialization failed');

  // Assert repo is on the correct branch after initialization
  const currentBranch = await gitService.getCurrentBranch({ localPath });
  t.is(currentBranch, WORKING_BRANCH, `Repo should be on ${WORKING_BRANCH} after core init`);

  // TODO: Add assertions for aider initialization state once implemented
}); 

// Test 3.2 & 3.3 merged: Send message and verify non-placeholder response
test('Phase 3.2 & 3.3: should handle message and receive response via core service', async t => {
  const localPath = path.join(tempDir, 'repo-phase3.2');
  const testPrompt = 'Just say hello.'; // Simple prompt for basic interaction
  const testUserId = 'user-123';

  // 1. Clone & Initialize Core
  await t.notThrowsAsync(
    gitService.cloneRepo({ repoUrl: REPO_URL, localPath }),
    'Clone failed for Phase 3.2'
  );
  await t.notThrowsAsync(
    coreService.initializeCore({ repoPath: localPath }),
    'Core init failed for Phase 3.2'
  );

  // Ensure proxy is running before setting sequence
  t.truthy(proxy, 'Echoproxia proxy should be running');

  // 2. Set Echoproxia sequence for recording/replaying this interaction
  proxy.setSequence('phase3.2-handle-message');

  // 3. Send message to core service
  const handleMessagePromise = coreService.handleIncomingMessage({
    message: testPrompt,
    userId: testUserId,
  });

  // Assert message handling doesn't throw (now using real aiderService call)
  await t.notThrowsAsync(handleMessagePromise, 'handleIncomingMessage failed');

  // 4. Verify response is NOT the placeholder (Step 3.3 verification)
  const result = await handleMessagePromise;
  t.not(result, 'Placeholder response.', 'Should receive a real response, not the placeholder');
  t.truthy(result, 'Should receive a non-empty response from Aider interaction');
  console.log('Received Aider response (truncated): ', result.substring(0, 100) + '...');
  // Check for the specific expected plain text response
  t.true(result.includes('Hello!'), 'Response should include \'Hello!\''); 

  // 5. Verify recordings were written (check host path via mount)
  const recordingsDir = path.resolve(__dirname, 'fixtures', 'recordings'); // Use host path for verification
  const sequenceDir = path.join(recordingsDir, 'phase3.2-handle-message');
  try {
      const files = await fs.readdir(sequenceDir);
      console.log(`Files found in container recording directory (${sequenceDir}):`, files);
      t.true(files.length > 0, 'Expected recording files to be present in container');
      // Check for a specific file pattern if needed
      t.true(files.some(f => f.endsWith('.json')), 'Expected at least one .json recording file');
  } catch (err) {
      t.fail(`Failed to read recordings directory in container (${sequenceDir}): ${err.message}`);
  }

  // TODO: In future steps, assert specific file changes or response content.
}); 

// --- Phase 3.4: Real Aider Edit ---
test('Phase 3.4: should use Aider to add a PATCH endpoint to server.js', async t => {
  // Use a unique directory for this test
  const testRepoPath = path.join(tempDir, 'repo-phase3.4');

  // 1. Initialize Core Service (clones repo, sets up branches)
  const core = await coreService.init({
    repoUrl: REPO_URL,
    localPath: testRepoPath,
    startingBranch: STARTING_BRANCH,
    workingBranch: WORKING_BRANCH,
    // Aider config (API key, etc.) is expected to be in env vars
    // or handled internally by core/Aider client
    aiderApiBase: proxyUrl, // Use Echoproxia
  });
  t.truthy(core, 'Core service should initialize');

  // Set Echoproxia sequence for this specific test
  const recordingDir = path.join(__dirname, 'fixtures', 'recordings', 'phase3.4-aider-edit');
  await fs.mkdir(recordingDir, { recursive: true }); // Ensure dir exists
  proxy.setSequence('phase3.4-aider-edit');
  proxy.currentSequenceRecordingsDir = recordingDir; // Explicitly set dir for recording

  // 2. Add the server file to Aider's context
  const addResponse = await core.handleIncomingMessage(
    {
      userId: 'test-user-3.4',
      channelId: 'test-channel-3.4',
      messageId: 'msg-add-3.4',
      content: '/add src/server.js'
    });
  // We expect a confirmation message, adjust based on actual Aider output if needed
  // Use optional chaining and nullish coalescing for safety
  t.true(addResponse?.content?.includes('Added `src/server.js`') ?? false, 'Aider should confirm adding the file');

  // 3. Send the edit prompt to Aider
  const editPrompt = 'add a PATCH endpoint to /widgets/:id that allows partial updates. for example, only updating the color.';
  const editResponse = await core.handleIncomingMessage(
    {
      userId: 'test-user-3.4',
      channelId: 'test-channel-3.4',
      messageId: 'msg-edit-3.4',
      content: editPrompt
    });
  // We expect Aider to respond, possibly with a diff or confirmation
  t.truthy(editResponse, 'Aider should respond to the edit prompt');
  // Check if the response indicates changes applied to server.js
  const editApplied = editResponse?.content?.includes('Applied edit to `src/server.js`') || editResponse?.files?.some(f => f.filename === 'src/server.js');
  t.true(editApplied ?? false, 'Aider response should indicate changes to server.js');

  // 4. Verify the file content in the cloned repo
  const serverJsPath = path.join(testRepoPath, 'src', 'server.js');
  const serverJsContent = await fs.readFile(serverJsPath, 'utf-8');

  // Basic check for the PATCH method route definition (Corrected line)
  t.true(serverJsContent.includes('app.patch('/widgets/:id')'), 'server.js should contain the PATCH endpoint definition');
  // Check for partial update logic (e.g., checking for existence of name/color)
  t.true(serverJsContent.includes('if (name !== undefined)'), 'server.js should handle partial name update');
  t.true(serverJsContent.includes('if (color !== undefined)'), 'server.js should handle partial color update');
});

// --- Phase 4 Tests ---
// ... existing code ...