import debug from 'debug';
import { simpleGit } from 'simple-git';
import os from 'os';
import path from 'path';
import fs from 'fs/promises';
import { Buffer } from 'buffer';

const log = debug('vibemob:git');
const logSsh = debug('vibemob:git:ssh');
const logError = debug('vibemob:git:error');
logError.log = console.error.bind(console); // Direct errors to stderr

// Function to safely create and write the SSH key
async function setupSshKey() {
  const keyB64 = process.env.SSH_PRIVATE_KEY_B64;
  if (!keyB64) {
    throw new Error('SSH_PRIVATE_KEY_B64 environment variable not set.');
  }

  const keyContent = Buffer.from(keyB64, 'base64').toString('utf8');
  const sshDir = path.join(os.tmpdir(), 'git-service-ssh');
  const keyPath = path.join(sshDir, 'id_rsa');

  // --- Ensure directory is clean before starting --- 
  await fs.rm(sshDir, { recursive: true, force: true }).catch(err => {
    // Ignore errors during preemptive cleanup (e.g., directory doesn't exist)
    logSsh(`Preemptive cleanup warning for ${sshDir}:`, err.message);
  });
  // ------------------------------------------------

  try {
    await fs.mkdir(sshDir, { mode: 0o700, recursive: true }); // Keep recursive for safety
    await fs.writeFile(keyPath, keyContent, { mode: 0o600 });
    logSsh(`Temporary SSH key written to ${keyPath}`);
    return keyPath;
  } catch (error) {
    logError('Error writing temporary SSH key:', error);
    // Attempt cleanup even if creation failed partially
    await fs.rm(sshDir, { recursive: true, force: true }).catch(err => logError('Error during cleanup after key write failure:', err));
    throw error; // Re-throw the original error
  }
}

// --- Helper for SSH Environment ---
// Takes an async function (gitOperation) and executes it with GIT_SSH_COMMAND set.
async function withSshEnv(operationName, gitOperation) {
  let sshKeyPath;
  const originalGitSshCommand = process.env.GIT_SSH_COMMAND;
  logSsh(`Setting up SSH environment for: ${operationName}`);
  try {
    sshKeyPath = await setupSshKey();
    const sshCommand = `ssh -i ${sshKeyPath} -o IdentitiesOnly=yes -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null`;
    process.env.GIT_SSH_COMMAND = sshCommand;
    logSsh(`Set GIT_SSH_COMMAND for ${operationName}`);
    
    // Execute the provided git operation
    const result = await gitOperation();
    logSsh(`Completed ${operationName} within SSH environment.`);
    return result; 

  } catch (error) {
    logError(`Error during ${operationName} with SSH environment:`, error);
    throw error; // Re-throw the error after logging
  } finally {
    // Restore original GIT_SSH_COMMAND
    if (originalGitSshCommand) {
      process.env.GIT_SSH_COMMAND = originalGitSshCommand;
    } else {
      delete process.env.GIT_SSH_COMMAND;
    }
    logSsh(`Restored GIT_SSH_COMMAND after ${operationName}`);

    // Cleanup the temporary SSH key directory
    if (sshKeyPath) {
      const sshDir = path.dirname(sshKeyPath);
      logSsh(`Cleaning up temporary SSH key directory after ${operationName}: ${sshDir}`);
      await fs.rm(sshDir, { recursive: true, force: true }).catch(err => logError('Error cleaning up SSH key:', err));
    }
  }
}
// --- End Helper ---

// Actual implementation for cloneRepo
async function cloneRepo({ repoUrl, localPath }) {
  if (!repoUrl) {
    throw new Error('REPO_URL environment variable not set or passed.');
  }
  log(`Attempting to clone ${repoUrl} to ${localPath}`);

  await withSshEnv('clone', async () => {
    // Use default simpleGit instance, relies on GIT_SSH_COMMAND env var set by withSshEnv
    const git = simpleGit(); 
    await git.clone(repoUrl, localPath);
  });

  log(`Successfully cloned ${repoUrl} to ${localPath}`);
}

// Function to get the current branch name
async function getCurrentBranch({ localPath }) {
  const git = simpleGit(localPath); // Operate on the specific local repo
  try {
    const status = await git.status();
    log(`Current branch in ${localPath} is ${status.current}`);
    return status.current;
  } catch (error) {
    logError(`Error getting current branch in ${localPath}:`, error);
    throw error;
  }
}

// Function to checkout a specific branch
async function checkoutBranch({ localPath, branchName }) {
  const git = simpleGit(localPath); // Operate on the specific local repo
  log(`Checking out branch '${branchName}' in ${localPath}`);
  try {
    await git.checkout(branchName);
    log(`Successfully checked out branch '${branchName}' in ${localPath}`);
  } catch (error) {
    logError(`Error checking out branch '${branchName}' in ${localPath}:`, error);
    throw error;
  }
}

// Function to pull a specific branch
async function pullBranch({ localPath, branchName }) {
  const git = simpleGit(localPath);
  log(`Pulling branch '${branchName}' in ${localPath}`);

  await withSshEnv('pull', async () => {
    await git.pull('origin', branchName);
  });

  log(`Successfully pulled branch '${branchName}' in ${localPath}`);
}

// Function to list local and remote branches
async function listBranches({ localPath }) {
  const git = simpleGit(localPath);
  try {
    // Fetch remote branches first to get an up-to-date list
    log(`Fetching origin for branch list in ${localPath}`);
    // Fetch requires SSH
    await withSshEnv('fetch (for listBranches)', async () => {
       await git.fetch('origin'); 
    });
    // Use -a to list both local and remote branches
    const branches = await git.branch(['--list', '-a']);
    log(`Branch list in ${localPath}:`, branches.all);
    return branches; // branches object contains `all` array, `current`, etc.
  } catch (error) {
    logError(`Error listing branches in ${localPath}:`, error);
    throw error;
  }
}

// Function to push a specific branch to origin
async function pushBranch({ localPath, branchName }) {
  const git = simpleGit(localPath);
  log(`Pushing branch '${branchName}' to origin from ${localPath}`);

  await withSshEnv('push', async () => {
    // Perform the push operation, setting upstream for the first time if needed (-u)
    await git.push(['--set-upstream', 'origin', branchName]);
  });

  log(`Successfully pushed branch '${branchName}' to origin from ${localPath}`);
}

// Function to checkout a branch, creating it if it doesn't exist locally,
// and setting up tracking if it exists remotely.
async function checkoutOrCreateBranch({ localPath, branchName }) {
  const git = simpleGit(localPath);
  const remoteBranchRef = `remotes/origin/${branchName}`;
  log(`Checking out or creating branch '${branchName}' in ${localPath}`);
  try {
    // listBranches now includes fetch with SSH handling
    const branches = await listBranches({ localPath }); 
    const localExists = branches.all.includes(branchName);
    const remoteExists = branches.all.includes(remoteBranchRef);

    if (localExists) {
      // Branch exists locally, check remote and potentially reset
      log(`Branch '${branchName}' exists locally, checking state.`);
      await git.checkout(branchName); // Ensure we are on the branch first
      if (remoteExists) {
        log(`Remote branch 'origin/${branchName}' also exists. Fetching and resetting.`);
        // Reset needs SSH environment
        await withSshEnv('reset (in checkoutOrCreate)', async () => {
            await git.fetch('origin'); // Fetch again inside env just to be sure? Or rely on listBranches fetch? Let's keep fetch for robustness.
            await git.reset(['--hard', `origin/${branchName}`]);
        });
        log(`Hard reset completed to origin/${branchName}.`);
      } else {
        log(`Branch '${branchName}' exists locally but not remotely. Keeping local state.`);
        // No reset needed, keep local branch as is
      }
    } else if (remoteExists) {
      // Branch exists remotely but not locally, checkout with tracking
      log(`Branch '${branchName}' exists remotely, checking out with tracking.`);
      // Checkout with tracking might involve remote interaction implicitly? Needs SSH? Let's wrap it.
      await withSshEnv('checkout --track', async () => {
         await git.checkout(['--track', '-b', branchName, remoteBranchRef]);
      });
    } else {
      // Branch doesn't exist locally or remotely, create locally without tracking
      log(`Branch '${branchName}' does not exist locally or remotely, creating.`);
      // Fetch main first to ensure we branch off the latest (needs SSH)
      await withSshEnv('fetch main (for checkoutOrCreate)', async () => {
         await git.fetch('origin', 'main'); 
      });
      // Checkout locally doesn't need SSH
      await git.checkout(['--no-track', '-b', branchName, 'origin/main']); 
    }
    log(`Successfully on branch '${branchName}' in ${localPath}`);
  } catch (error) {
    logError(`Error during checkout/create branch '${branchName}' in ${localPath}:`, error);
    throw error;
  }
}

// Function to delete a remote branch
async function deleteRemoteBranch({ localPath, branchName }) {
  const git = simpleGit(localPath);
  log(`Attempting to delete remote branch 'origin/${branchName}' from ${localPath}`);

  try {
    // Delete push requires SSH
    await withSshEnv('delete remote branch', async () => {
      // Perform the push operation with --delete flag
      await git.push('origin', ['--delete', branchName]);
    });
    log(`Successfully requested deletion of remote branch 'origin/${branchName}'`);
  } catch (error) {
    // It's possible the branch doesn't exist remotely, which might cause an error.
    // Check if the error message indicates the remote ref doesn't exist.
    if (error.message && error.message.includes('remote ref does not exist')) {
      log(`Remote branch '${branchName}' likely did not exist or was already deleted.`);
    } else {
      // Log other errors more prominently but still don't throw from cleanup
      logError(`Error deleting remote branch '${branchName}' from ${localPath}: ${error.message}`);
    }
    // Don't throw error during cleanup
  }
}

export const gitService = {
  cloneRepo,
  getCurrentBranch,
  checkoutBranch,
  pullBranch,
  listBranches,
  checkoutOrCreateBranch,
  pushBranch,
  deleteRemoteBranch,
}; 