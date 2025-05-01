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
  const setupLocalPath = path.join(tempDir, 'repo-phase2.4-setup');
  const testLocalPath = path.join(tempDir, 'repo-phase2.4-test');

  // --- Setup: Create and push the branch from a separate clone ---
  try {
    // 1. Clone for setup
    await gitService.cloneRepo({ repoUrl: REPO_URL, localPath: setupLocalPath });

    // 2. Create branch locally
    await gitService.checkoutOrCreateBranch({ localPath: setupLocalPath, branchName: WORKING_BRANCH });

    // 3. Make a commit (needed to push the branch)
    const gitSetup = simpleGit(setupLocalPath);
    await fs.writeFile(path.join(setupLocalPath, 'phase2.4.txt'), 'test');
    await gitSetup.add('.');
    // Configure git user for the commit
    await gitSetup.addConfig('user.name', 'Test Bot');
    await gitSetup.addConfig('user.email', 'test@vibemob.invalid');
    await gitSetup.commit('feat: add phase 2.4 test file');

    // 4. Push the branch (this function doesn't exist yet)
    // Need to handle SSH key setup within pushBranch
    await gitService.pushBranch({ localPath: setupLocalPath, branchName: WORKING_BRANCH });

  } catch (err) {
    t.fail(`Setup failed for Phase 2.4: ${err}`);
    return; // Stop test if setup fails
  } finally {
    // Clean up the setup repo regardless of success/failure
    await fs.rm(setupLocalPath, { recursive: true, force: true });
  }
  // --- End Setup ---

  // --- Test Execution: Clone again and checkout/create ---
  // 1. Clone again for the actual test
  await t.notThrowsAsync(
    gitService.cloneRepo({ repoUrl: REPO_URL, localPath: testLocalPath }),
    'Clone operation failed for Phase 2.4 test execution'
  );

  // 2. Checkout or Create Branch (should find the remote branch now)
  const checkoutOrCreatePromise = gitService.checkoutOrCreateBranch({
    localPath: testLocalPath,
    branchName: WORKING_BRANCH,
  });
  await t.notThrowsAsync(checkoutOrCreatePromise, 'Checkout or create operation failed for existing remote branch');

  // 3. Verify current branch is WORKING_BRANCH
  const currentBranch = await gitService.getCurrentBranch({ localPath: testLocalPath });
  t.is(currentBranch, WORKING_BRANCH, `Current branch should be ${WORKING_BRANCH}`);

  // 4. Verify branch exists locally and remotely
  const branches = await gitService.listBranches({ localPath: testLocalPath });
  const remoteBranchName = `remotes/origin/${WORKING_BRANCH}`;
  t.true(branches.all.includes(WORKING_BRANCH), 'WORKING_BRANCH should exist locally');
  t.true(
    branches.all.some(b => b.startsWith('remotes/origin/') && b.endsWith(WORKING_BRANCH)),
    `WORKING_BRANCH should exist on remote origin (${remoteBranchName})`
  );

  // Optional: Verify upstream tracking is set correctly
  const gitTest = simpleGit(testLocalPath);
  const status = await gitTest.status();
  t.is(status.tracking, `origin/${WORKING_BRANCH}`, 'Local branch should track remote branch');

}); 