import test from 'ava';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import simpleGit from 'simple-git';
// import tcpPortUsed from 'tcp-port-used'; // REMOVED

// Placeholder for the actual service - this import will fail initially
import { gitService } from '../lib/index.js'; 

// Define the starting branch
const STARTING_BRANCH = 'main';

// Define the working branch
const WORKING_BRANCH = 'aider-bot-dev';

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