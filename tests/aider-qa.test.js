import test from 'ava'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'
import { aiderService } from '../lib/aider.js'
import { fileURLToPath } from 'url'
import { dirname } from 'path'
import config from '../lib/config.js'
import debug from 'debug'
import { createProxy } from 'echoproxia'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const log = debug('vibemob:test:aider-qa')
const logError = debug('vibemob:test:aider-qa:error')
logError.log = console.error.bind(console)

const RECORDING_NAME = 'aider-qa-test'

let tempDir
let testRepoPath
let proxy = null

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
  } catch (err) {
    logError('Failed to start Echoproxia proxy:', err)
    t.fail(`Failed to start Echoproxia: ${err.message}`)
    return
  }

  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aider-qa-test-'))
  testRepoPath = path.join(tempDir, 'repo')
  log(`Setting up test repo for aider-qa test at ${testRepoPath}`)

  await fs.mkdir(testRepoPath, { recursive: true })
  await fs.writeFile(
    path.join(testRepoPath, 'README.md'),
    '# Test Repository\n\nThis is a test repository for aider-qa tests.\n'
  )
})

test.afterEach.always(async () => {
  if (proxy && proxy.stop) {
    await proxy.stop()
    log('Echoproxia proxy stopped for test.')
    proxy = null
  }

  if (tempDir) {
    await fs.rm(tempDir, { recursive: true, force: true })
  }
})

test.serial('extractTextResponse handles different response formats', (t) => {
  const contentResponse = { content: 'This is a content response' }
  t.is(
    aiderService.extractTextResponse(contentResponse),
    'This is a content response',
    'Should extract content property'
  )

  const stdoutResponse = { stdout: 'This is a stdout response' }
  t.is(
    aiderService.extractTextResponse(stdoutResponse),
    'This is a stdout response',
    'Should extract stdout property'
  )

  const stringResponse = 'This is a string response'
  t.is(
    aiderService.extractTextResponse(stringResponse),
    'This is a string response',
    'Should return string directly'
  )

  t.is(
    aiderService.extractTextResponse(null),
    null,
    'Should handle null response'
  )

  const complexResponse = { data: { message: 'Complex response' } }
  t.is(
    aiderService.extractTextResponse(complexResponse),
    JSON.stringify(complexResponse),
    'Should stringify complex objects'
  )
})

test.serial('sendQAPromptToAider works in Q&A mode without file edits', async (t) => {
  if (!process.env.AIDER_API_KEY && !config.aiderApiKey) {
    t.pass('Skipping test due to missing API key')
    return
  }

  const apiKey = process.env.AIDER_API_KEY || config.aiderApiKey
  const apiBase = proxy.url
  const modelName = 'gpt-4o'
  const prompt = 'What is the capital of France?'

  try {
    const response = await aiderService.sendQAPromptToAider({
      repoPath: testRepoPath,
      prompt,
      modelName,
      apiBase,
      apiKey,
    })

    t.truthy(response, 'Should receive a response')
    t.true(
      typeof response === 'string',
      'Response should be a string'
    )
    t.true(
      response.length > 0,
      'Response should not be empty'
    )
    
    t.true(
      response.toLowerCase().includes('paris') || 
      response.toLowerCase().includes('france'),
      'Response should be relevant to the question'
    )
  } catch (error) {
    t.fail(`Test failed with error: ${error.message}`)
  }
})

test.serial('sendPromptToAider respects qaMode flag', async (t) => {
  
  const originalRunAider = aiderService.sendPromptToAider
  
  let capturedOptions = null
  aiderService.sendPromptToAider = async (options) => {
    capturedOptions = options
    return { content: 'Mock response' }
  }
  
  try {
    await aiderService.sendQAPromptToAider({
      repoPath: testRepoPath,
      prompt: 'Test prompt',
      modelName: 'gpt-4o',
      apiBase: 'https://example.com',
      apiKey: 'test-key',
      editableFiles: ['some-file.js'], // This should be ignored in QA mode
    })
    
    t.true(capturedOptions.qaMode, 'qaMode should be set to true')
    t.deepEqual(capturedOptions.editableFiles, [], 'editableFiles should be empty in QA mode')
  } finally {
    aiderService.sendPromptToAider = originalRunAider
  }
})
