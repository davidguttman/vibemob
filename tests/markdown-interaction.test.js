import test from 'ava'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'
// Use namespace import for coreService
import * as coreService from '../lib/index.js'
import { gitService } from '../lib/index.js'
import simpleGit from 'simple-git'
import { fileURLToPath } from 'url'
import { dirname } from 'path'
import config from '../lib/config.js'
import debug from 'debug'
import { createProxy } from 'echoproxia'

// ESM equivalent for __dirname
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const log = debug('vibemob:test:markdown')
const logError = debug('vibemob:test:markdown:error')
logError.log = console.error.bind(console)

const REPO_URL = config.repoUrl
const RECORDING_NAME = 'markdown-rendering-test' // Base name for recordings

let tempDir
let testRepoPath
let testGitInstance
let proxy = null
let originalAiderApiBase = process.env.AIDER_API_BASE

// Setup similar to e2e.test.js
test.beforeEach(async (t) => {
  const targetApiBase = config.aiderApiBase
  const recordMode = true
  const recordingsDir = path.resolve(__dirname, 'fixtures', 'recordings')
  const testRecordingDir = path.join(recordingsDir, RECORDING_NAME)

  try {
    await fs.mkdir(testRecordingDir, { recursive: true })
    proxy = await createProxy({
      targetUrl: targetApiBase,
      recordingsDir: testRecordingDir,
      recordMode: recordMode,
      redactHeaders: ['authorization', 'x-api-key'],
      includePlainTextBody: true,
      proxyPort: 0,
    })
    log(`Echoproxia proxy started for test at ${proxy.url} (Mode: record)`)
    const tempUserIdForConfig = '--test-config-setter--'
    await coreService.setConfigOverrides({
      userId: tempUserIdForConfig,
      apiBase: proxy.url,
    })
    log(`Set apiBase override via coreService to ${proxy.url}`)
  } catch (err) {
    logError('Failed to start Echoproxia proxy or set config:', err)
    t.fail(`Failed to start Echoproxia or set config: ${err.message}`)
    return
  }

  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'markdown-test-'))
  testRepoPath = path.join(tempDir, 'repo')
  log(`Setting up test repo for markdown test at ${testRepoPath}`)

  await t.notThrowsAsync(
    gitService.cloneRepo({ repoUrl: REPO_URL, localPath: testRepoPath }),
    `Clone failed for markdown test`,
  )

  testGitInstance = simpleGit(testRepoPath)
  await testGitInstance.addConfig(
    'user.email',
    `test-markdown@vibemob.invalid`,
    true,
    'local',
  )
  await testGitInstance.addConfig(
    'user.name',
    `Test Markdown User`,
    true,
    'local',
  )
  log(`Git user configured for markdown test`)

  await t.notThrowsAsync(
    coreService.initializeCore({ repoPath: testRepoPath }),
    `Core init failed for markdown test`,
  )
  log(`Core initialized for markdown test at ${testRepoPath}`)
})

test.afterEach.always(async () => {
  if (proxy && proxy.stop) {
    await proxy.stop()
    log('Echoproxia proxy stopped for test.')
    proxy = null
  }
  const tempUserIdForConfig = '--test-config-setter--'
  await coreService.setConfigOverrides({
    userId: tempUserIdForConfig,
    apiBase: config.aiderApiBase,
  })
  log(`Restored apiBase override via coreService to default`)

  if (tempDir) {
    await fs.rm(tempDir, { recursive: true, force: true })
  }
})

test.serial('Generate markdown explanation', async (t) => {
  const userId = 'markdown-tester'

  const explainPrompt =
    'Explain the concept of RESTful APIs using Markdown for formatting, including headings for key concepts, bullet points for principles, and code formatting for an example endpoint.'
  log(`Sending explanation prompt: "${explainPrompt}"`)
  const response = await coreService.handleIncomingMessage({
    message: explainPrompt,
    userId: userId,
  })
  t.truthy(response, 'Did not get a response for the explanation request')
  // Check the content property of the response object
  t.truthy(response.content, 'Response content should not be empty')
  console.log('--- Explanation Response ---')
  console.log(response.content) // Log the content

  t.pass()
})

test.serial('Generate full file output', async (t) => {
  const userId = 'markdown-tester'
  const readmePath = 'README.md'

  // --- Add README.md to context ---
  log(`Adding ${readmePath} to context for user ${userId}`)
  // Use the wrapper function
  let response = await coreService.addFileToContext({
    userId: userId,
    filePath: readmePath,
    readOnly: true, // Assuming read-only for this test
  })
  // Adjust assertion based on expected core response for adding README.md
  t.true(
    response?.message?.includes('Added README.md to the chat context'),
    `Failed to add ${readmePath}. Response: ${response?.message}`,
  )
  log('--- Context Add Response ---')
  console.log(response?.message)

  // --- Ask for file content ---
  const showPrompt = `Show me the full content of \`${readmePath}\``
  log(`Sending show prompt: "${showPrompt}"`)
  response = await coreService.handleIncomingMessage({
    message: showPrompt,
    userId: userId,
  })
  t.truthy(response, 'Did not get a response for the show request')
  t.truthy(
    response.content,
    'Response content should not be empty for show request',
  )
  console.log('--- Show File Response (stdout) ---')
  console.log(response.content) // Log the raw stdout for analysis

  // We don't need to assert content here, just capture the output
  t.pass()
})
