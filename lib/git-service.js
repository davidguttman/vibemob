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

export const gitService = {
  cloneRepo,
}; 