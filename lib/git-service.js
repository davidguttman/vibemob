import debug from 'debug';
import { simpleGit } from 'simple-git';
import config from './config.js'; // Import config
import fs from 'fs/promises'; // Need fs for writing temp key
import path from 'path';
import os from 'os';
import { Buffer } from 'buffer';

const log = debug('vibemob:git');
const logSsh = debug('vibemob:git:ssh');
const logError = debug('vibemob:git:error');
logError.log = console.error.bind(console); // Direct errors to stderr

// --- Centralized simple-git Instance Creator ---
let sshCommand = null; // Store generated SSH command if using key path
let tempSshKeyPath = null; // Store path to the temporary key file
let tempSshDir = null; // Store path to the temporary directory

/**
 * Creates a SimpleGit instance, configuring SSH key via GIT_SSH_COMMAND if provided in config.
 */
async function _getGitInstance(basePath) {
  const options = {
    baseDir: basePath || process.cwd(),
    binary: 'git',
    maxConcurrentProcesses: 6,
  };

  // Setup SSH command only if sshPrivateKeyB64 is configured and not in test
  if (config.sshPrivateKeyB64 && process.env.NODE_ENV !== 'test') {
    if (!sshCommand) { 
      try {
        // Create a unique temporary directory
        tempSshDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vibemob-ssh-'));
        tempSshKeyPath = path.join(tempSshDir, 'id_rsa_tmp');
        const tempSshConfigPath = path.join(tempSshDir, 'config'); // Path for the config file
        logSsh(`Creating temporary SSH directory: ${tempSshDir}`);

        // Decode and write the private key
        const keyContent = Buffer.from(config.sshPrivateKeyB64, 'base64').toString('utf8');
        await fs.writeFile(tempSshKeyPath, keyContent, { mode: 0o600 });
        logSsh(`Temporary SSH key written to: ${tempSshKeyPath}`);

        // Create the SSH config file content
        const sshConfigContent = `
Host github.com
    HostName github.com
    User git
    IdentityFile ${tempSshKeyPath}
    IdentitiesOnly yes
    StrictHostKeyChecking no
    UserKnownHostsFile /dev/null
`;
        // Write the SSH config file
        await fs.writeFile(tempSshConfigPath, sshConfigContent.trim(), { mode: 0o600 });
        logSsh(`Temporary SSH config written to: ${tempSshConfigPath}`);

        // Generate the SSH command using the temp config file
        sshCommand = `ssh -F ${tempSshConfigPath}`;
        logSsh(`Generated GIT_SSH_COMMAND using temporary config file.`);
        
      } catch (err) {
        logError('Failed to create or write temporary SSH key/config:', err);
        // Attempt cleanup if dir was created
        if (tempSshDir) {
           await fs.rm(tempSshDir, { recursive: true, force: true }).catch(e => logError('Error cleaning up temp SSH dir after write failure:', e));
        }
        // Reset state
        tempSshDir = null;
        tempSshKeyPath = null;
        sshCommand = null;
        throw new Error(`Failed to configure SSH key/config: ${err.message}`); // Re-throw
      }
    }
    // Set the environment variable for the simple-git process
    if (sshCommand) {
      process.env.GIT_SSH_COMMAND = sshCommand;
      logSsh(`Set process.env.GIT_SSH_COMMAND`);
    }
  } else if (process.env.NODE_ENV === 'test') {
    logSsh('Running in test environment, assuming SSH is handled by Docker env/config.');
  } else {
    logSsh('No SSH_PRIVATE_KEY_PATH configured, using default SSH behavior.');
  }

  return simpleGit(options);
}

// --- Git Service Functions ---

async function cloneRepo({ repoUrl, localPath }) {
  if (!repoUrl) {
    throw new Error('REPO_URL environment variable not set or passed.');
  }
  log(`Attempting to clone ${repoUrl} to ${localPath}`);
  const git = await _getGitInstance();
  try {
    await git.clone(repoUrl, localPath);
    log(`Successfully cloned ${repoUrl} to ${localPath}`);
  } catch (error) {
     logError(`Error cloning ${repoUrl}:`, error);
     throw error;
  }
}

async function getCurrentBranch({ localPath }) {
  const git = await _getGitInstance(localPath);
  try {
    const status = await git.status();
    log(`Current branch in ${localPath} is ${status.current}`);
    return status.current;
  } catch (error) {
    logError(`Error getting current branch in ${localPath}:`, error);
    throw error;
  }
}

async function checkoutBranch({ localPath, branchName }) {
  const git = await _getGitInstance(localPath);
  log(`Checking out branch '${branchName}' in ${localPath}`);
  try {
    await git.checkout(branchName);
    log(`Successfully checked out branch '${branchName}' in ${localPath}`);
  } catch (error) {
    logError(`Error checking out branch '${branchName}' in ${localPath}:`, error);
    throw error;
  }
}

async function pullBranch({ localPath, branchName }) {
  const git = await _getGitInstance(localPath);
  log(`Pulling branch '${branchName}' in ${localPath}`);
  try {
    await git.pull('origin', branchName);
    log(`Successfully pulled branch '${branchName}' in ${localPath}`);
  } catch (error) {
     logError(`Error pulling branch '${branchName}' in ${localPath}:`, error);
     throw error;
  }
}

async function listBranches({ localPath }) {
  const git = await _getGitInstance(localPath);
  try {
    log(`Fetching origin for branch list in ${localPath}`);
    await git.fetch('origin');
    const branches = await git.branch(['--list', '-a']);
    log(`Branch list in ${localPath}:`, branches.all);
    return branches; 
  } catch (error) {
    logError(`Error listing branches in ${localPath}:`, error);
    throw error;
  }
}

async function pushBranch({ localPath, branchName }) {
  const git = await _getGitInstance(localPath);
  log(`Pushing branch '${branchName}' to origin from ${localPath}`);
  try {
    await git.push(['--set-upstream', 'origin', branchName]);
    log(`Successfully pushed branch '${branchName}' to origin from ${localPath}`);
  } catch (error) {
    logError(`Error pushing branch '${branchName}' from ${localPath}:`, error);
    throw error;
  }
}

async function checkoutOrCreateBranch({ localPath, branchName }) {
  const git = await _getGitInstance(localPath);
  const remoteBranchRef = `remotes/origin/${branchName}`;
  const mainBranchRef = `origin/${config.startingBranch || 'main'}`;
  log(`Checking out or creating branch '${branchName}' in ${localPath}`);
  try {
    const branches = await listBranches({ localPath }); 
    const localExists = branches.all.includes(branchName);
    const remoteExists = branches.all.includes(remoteBranchRef);

    if (localExists) {
      log(`Branch '${branchName}' exists locally, checking state.`);
      await git.checkout(branchName); 
      if (remoteExists) {
        log(`Remote branch 'origin/${branchName}' also exists. Fetching and resetting.`);
        await git.fetch('origin'); 
        await git.reset(['--hard', `origin/${branchName}`]);
        log(`Hard reset completed to origin/${branchName}.`);
      } else {
        log(`Branch '${branchName}' exists locally but not remotely. Keeping local state.`);
      }
    } else if (remoteExists) {
      log(`Branch '${branchName}' exists remotely, checking out with tracking.`);
      await git.checkout(['--track', '-b', branchName, remoteBranchRef]);
    } else {
      log(`Branch '${branchName}' does not exist locally or remotely, creating from ${mainBranchRef}.`);
      await git.fetch('origin', config.startingBranch || 'main');
      await git.checkout(['--no-track', '-b', branchName, mainBranchRef]);
    }
    log(`Successfully on branch '${branchName}' in ${localPath}`);
  } catch (error) {
    logError(`Error during checkout/create branch '${branchName}' in ${localPath}:`, error);
    throw error;
  }
}

async function deleteRemoteBranch({ localPath, branchName }) {
  const git = await _getGitInstance(localPath);
  log(`Attempting to delete remote branch 'origin/${branchName}' from ${localPath}`);
  try {
    await git.push('origin', ['--delete', branchName]);
    log(`Successfully requested deletion of remote branch 'origin/${branchName}'`);
  } catch (error) {
    if (error.message && error.message.includes('remote ref does not exist')) {
      log(`Remote branch '${branchName}' likely did not exist or was already deleted.`);
    } else {
      logError(`Error deleting remote branch '${branchName}' from ${localPath}: ${error.message}`);
    }
  }
}

export const gitService = {
  cloneRepo,
  getCurrentBranch,
  checkoutBranch,
  pullBranch,
  listBranches,
  pushBranch,
  checkoutOrCreateBranch,
  deleteRemoteBranch,
}; 