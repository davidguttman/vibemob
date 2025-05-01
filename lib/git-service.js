import { simpleGit } from 'simple-git';
import os from 'os';
import path from 'path';
import fs from 'fs/promises';
import { Buffer } from 'buffer';

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
    console.warn(`Preemptive cleanup warning for ${sshDir}:`, err.message);
  });
  // ------------------------------------------------

  try {
    await fs.mkdir(sshDir, { mode: 0o700, recursive: true }); // Keep recursive for safety
    await fs.writeFile(keyPath, keyContent, { mode: 0o600 });
    console.log(`Temporary SSH key written to ${keyPath}`);
    return keyPath;
  } catch (error) {
    console.error('Error writing temporary SSH key:', error);
    // Attempt cleanup even if creation failed partially
    await fs.rm(sshDir, { recursive: true, force: true }).catch(err => console.error('Error during cleanup after key write failure:', err));
    throw error; // Re-throw the original error
  }
}

// Actual implementation for cloneRepo
async function cloneRepo({ repoUrl, localPath }) {
  if (!repoUrl) {
    throw new Error('REPO_URL environment variable not set or passed.');
  }
  console.log(`Attempting to clone ${repoUrl} to ${localPath}`);

  let sshKeyPath;
  const originalGitSshCommand = process.env.GIT_SSH_COMMAND; // Store original value

  try {
    sshKeyPath = await setupSshKey();
    
    // --- Configure SSH via environment variable --- 
    const sshCommand = `ssh -i ${sshKeyPath} -o IdentitiesOnly=yes -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null`;
    process.env.GIT_SSH_COMMAND = sshCommand;
    console.log(`Set GIT_SSH_COMMAND`);
    // ---------------------------------------------
    
    // Use default simpleGit instance, relies on GIT_SSH_COMMAND env var
    const git = simpleGit(); 

    await git.clone(repoUrl, localPath);
    console.log(`Successfully cloned ${repoUrl} to ${localPath}`);

  } catch (error) {
    console.error(`Failed to clone repository: ${error}`);
    throw error; // Re-throw to allow test failure
  } finally {
    // --- Restore original GIT_SSH_COMMAND --- 
    if (originalGitSshCommand) {
      process.env.GIT_SSH_COMMAND = originalGitSshCommand;
    } else {
      delete process.env.GIT_SSH_COMMAND; 
    }
    console.log(`Restored GIT_SSH_COMMAND`);
    // ----------------------------------------
    
    // Cleanup the temporary SSH key directory
    if (sshKeyPath) {
      const sshDir = path.dirname(sshKeyPath);
      console.log(`Cleaning up temporary SSH key directory: ${sshDir}`);
      await fs.rm(sshDir, { recursive: true, force: true }).catch(err => console.error('Error cleaning up SSH key:', err));
    }
  }
}

// Function to get the current branch name
async function getCurrentBranch({ localPath }) {
  const git = simpleGit(localPath); // Operate on the specific local repo
  try {
    const status = await git.status();
    return status.current;
  } catch (error) {
    console.error(`Error getting current branch in ${localPath}:`, error);
    throw error;
  }
}

// Function to checkout a specific branch
async function checkoutBranch({ localPath, branchName }) {
  const git = simpleGit(localPath); // Operate on the specific local repo
  console.log(`Checking out branch '${branchName}' in ${localPath}`);
  try {
    await git.checkout(branchName);
    console.log(`Successfully checked out branch '${branchName}' in ${localPath}`);
  } catch (error) {
    console.error(`Error checking out branch '${branchName}' in ${localPath}:`, error);
    throw error;
  }
}

// Function to pull a specific branch
async function pullBranch({ localPath, branchName }) {
  const git = simpleGit(localPath);
  console.log(`Pulling branch '${branchName}' in ${localPath}`);

  let sshKeyPath;
  const originalGitSshCommand = process.env.GIT_SSH_COMMAND; // Store original value

  try {
    // Setup SSH key environment for the pull operation
    sshKeyPath = await setupSshKey();
    const sshCommand = `ssh -i ${sshKeyPath} -o IdentitiesOnly=yes -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null`;
    process.env.GIT_SSH_COMMAND = sshCommand;
    console.log(`Set GIT_SSH_COMMAND for pull`);

    // Perform the pull operation
    await git.pull('origin', branchName);
    console.log(`Successfully pulled branch '${branchName}' in ${localPath}`);

  } catch (error) {
    console.error(`Error pulling branch '${branchName}' in ${localPath}:`, error);
    throw error;
  } finally {
    // Restore original GIT_SSH_COMMAND
    if (originalGitSshCommand) {
      process.env.GIT_SSH_COMMAND = originalGitSshCommand;
    } else {
      delete process.env.GIT_SSH_COMMAND;
    }
    console.log(`Restored GIT_SSH_COMMAND after pull`);

    // Cleanup the temporary SSH key
    if (sshKeyPath) {
      const sshDir = path.dirname(sshKeyPath);
      console.log(`Cleaning up temporary SSH key directory after pull: ${sshDir}`);
      await fs.rm(sshDir, { recursive: true, force: true }).catch(err => console.error('Error cleaning up SSH key after pull:', err));
    }
  }
}

// Function to list local and remote branches
async function listBranches({ localPath }) {
  const git = simpleGit(localPath);
  try {
    // Fetch remote branches first to get an up-to-date list
    await git.fetch('origin'); 
    // Use -a to list both local and remote branches
    const branches = await git.branch(['--list', '-a']);
    return branches; // branches object contains `all` array, `current`, etc.
  } catch (error) {
    console.error(`Error listing branches in ${localPath}:`, error);
    throw error;
  }
}

// Function to push a specific branch to origin
async function pushBranch({ localPath, branchName }) {
  const git = simpleGit(localPath);
  console.log(`Pushing branch '${branchName}' to origin from ${localPath}`);

  let sshKeyPath;
  const originalGitSshCommand = process.env.GIT_SSH_COMMAND; // Store original value

  try {
    // Setup SSH key environment for the push operation
    sshKeyPath = await setupSshKey();
    const sshCommand = `ssh -i ${sshKeyPath} -o IdentitiesOnly=yes -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null`;
    process.env.GIT_SSH_COMMAND = sshCommand;
    console.log(`Set GIT_SSH_COMMAND for push`);

    // Perform the push operation, setting upstream for the first time if needed (-u)
    await git.push(['--set-upstream', 'origin', branchName]);
    console.log(`Successfully pushed branch '${branchName}' to origin from ${localPath}`);

  } catch (error) {
    console.error(`Error pushing branch '${branchName}' from ${localPath}:`, error);
    throw error;
  } finally {
    // Restore original GIT_SSH_COMMAND
    if (originalGitSshCommand) {
      process.env.GIT_SSH_COMMAND = originalGitSshCommand;
    } else {
      delete process.env.GIT_SSH_COMMAND;
    }
    console.log(`Restored GIT_SSH_COMMAND after push`);

    // Cleanup the temporary SSH key
    if (sshKeyPath) {
      const sshDir = path.dirname(sshKeyPath);
      console.log(`Cleaning up temporary SSH key directory after push: ${sshDir}`);
      await fs.rm(sshDir, { recursive: true, force: true }).catch(err => console.error('Error cleaning up SSH key after push:', err));
    }
  }
}

// Function to checkout a branch, creating it if it doesn't exist locally,
// and setting up tracking if it exists remotely.
async function checkoutOrCreateBranch({ localPath, branchName }) {
  const git = simpleGit(localPath);
  const remoteBranchRef = `remotes/origin/${branchName}`;
  console.log(`Checking out or creating branch '${branchName}' in ${localPath}`);
  try {
    const branches = await listBranches({ localPath });
    const localExists = branches.all.includes(branchName);
    const remoteExists = branches.all.includes(remoteBranchRef);

    if (localExists) {
      // Branch exists locally, check remote and potentially reset
      console.log(`Branch '${branchName}' exists locally, checking state.`);
      await git.checkout(branchName); // Ensure we are on the branch first
      if (remoteExists) {
        console.log(`Remote branch 'origin/${branchName}' also exists. Fetching and resetting.`);
        // Setup SSH for fetch/reset
        let sshKeyPath;
        const originalGitSshCommand = process.env.GIT_SSH_COMMAND;
        try {
          sshKeyPath = await setupSshKey();
          const sshCommand = `ssh -i ${sshKeyPath} -o IdentitiesOnly=yes -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null`;
          process.env.GIT_SSH_COMMAND = sshCommand;

          await git.fetch('origin');
          await git.reset(['--hard', `origin/${branchName}`]);
          console.log(`Hard reset completed to origin/${branchName}.`);

        } finally {
          // Restore original GIT_SSH_COMMAND
          if (originalGitSshCommand) {
            process.env.GIT_SSH_COMMAND = originalGitSshCommand;
          } else {
            delete process.env.GIT_SSH_COMMAND;
          }
          // Cleanup the temporary SSH key
          if (sshKeyPath) {
            const sshDir = path.dirname(sshKeyPath);
            await fs.rm(sshDir, { recursive: true, force: true }).catch(err => console.error('Error cleaning up SSH key during reset:', err));
          }
        }
      } else {
        console.log(`Branch '${branchName}' exists locally but not remotely. Keeping local state.`);
        // No reset needed, keep local branch as is
      }
    } else if (remoteExists) {
      // Branch exists remotely but not locally, checkout with tracking
      console.log(`Branch '${branchName}' exists remotely, checking out with tracking.`);
      await git.checkout(['--track', '-b', branchName, remoteBranchRef]);
    } else {
      // Branch doesn't exist locally or remotely, create locally without tracking
      console.log(`Branch '${branchName}' does not exist locally or remotely, creating.`);
      // Fetch main first to ensure we branch off the latest
      await git.fetch('origin', 'main'); 
      await git.checkout(['--no-track', '-b', branchName, 'origin/main']); 
    }
    console.log(`Successfully on branch '${branchName}' in ${localPath}`);
  } catch (error) {
    console.error(`Error during checkout/create branch '${branchName}' in ${localPath}:`, error);
    throw error;
  }
}

// Function to delete a remote branch
async function deleteRemoteBranch({ localPath, branchName }) {
  const git = simpleGit(localPath);
  console.log(`Attempting to delete remote branch 'origin/${branchName}' from ${localPath}`);

  let sshKeyPath;
  const originalGitSshCommand = process.env.GIT_SSH_COMMAND; // Store original value

  try {
    // Setup SSH key environment for the push (delete) operation
    sshKeyPath = await setupSshKey();
    const sshCommand = `ssh -i ${sshKeyPath} -o IdentitiesOnly=yes -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null`;
    process.env.GIT_SSH_COMMAND = sshCommand;
    console.log(`Set GIT_SSH_COMMAND for remote branch delete`);

    // Perform the push operation with --delete flag
    // The syntax is `git push <remote> :<branchName>` or `git push <remote> --delete <branchName>`
    // Using the latter for clarity
    await git.push('origin', ['--delete', branchName]);
    console.log(`Successfully requested deletion of remote branch 'origin/${branchName}'`);

  } catch (error) {
    // It's possible the branch doesn't exist remotely, which might cause an error.
    // Check if the error message indicates the remote ref doesn't exist.
    if (error.message && error.message.includes('remote ref does not exist')) {
      console.warn(`Remote branch '${branchName}' likely did not exist or was already deleted.`);
    } else {
      // Log other errors more prominently but still don't throw from cleanup
      console.error(`Error deleting remote branch '${branchName}' from ${localPath}: ${error.message}`);
    }
    // Don't throw error during cleanup
  } finally {
    // Restore original GIT_SSH_COMMAND
    if (originalGitSshCommand) {
      process.env.GIT_SSH_COMMAND = originalGitSshCommand;
    } else {
      delete process.env.GIT_SSH_COMMAND;
    }
    console.log(`Restored GIT_SSH_COMMAND after remote branch delete`);

    // Cleanup the temporary SSH key
    if (sshKeyPath) {
      const sshDir = path.dirname(sshKeyPath);
      console.log(`Cleaning up temporary SSH key directory after remote branch delete: ${sshDir}`);
      await fs.rm(sshDir, { recursive: true, force: true }).catch(err => console.error('Error cleaning up SSH key after remote branch delete:', err));
    }
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