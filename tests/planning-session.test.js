import test from 'ava'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'
import * as coreService from '../lib/index.js'
import { gitService } from '../lib/index.js'
import simpleGit from 'simple-git'
import { fileURLToPath } from 'url'
import { dirname } from 'path'
import config from '../lib/config.js'
import debug from 'debug'
import { createProxy } from 'echoproxia'
import { EventEmitter } from 'events'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const log = debug('vibemob:test:planning-session')
const logError = debug('vibemob:test:planning-session:error')
logError.log = console.error.bind(console)

const REPO_URL = config.repoUrl
const RECORDING_NAME = 'planning-session-test'

let tempDir
let testRepoPath
let testGitInstance
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

  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'planning-session-test-'))
  testRepoPath = path.join(tempDir, 'repo')
  log(`Setting up test repo for planning session test at ${testRepoPath}`)

  await t.notThrowsAsync(
    gitService.cloneRepo({ repoUrl: REPO_URL, localPath: testRepoPath }),
    `Clone failed for planning session test`,
  )

  testGitInstance = simpleGit(testRepoPath)
  await testGitInstance.addConfig(
    'user.email',
    `test-planning-session@vibemob.invalid`,
    true,
    'local',
  )
  await testGitInstance.addConfig(
    'user.name',
    `Test Planning Session User`,
    true,
    'local',
  )
  log(`Git user configured for planning session test`)

  await t.notThrowsAsync(
    coreService.initializeCore({ repoPath: testRepoPath }),
    `Core init failed for planning session test`,
  )
  log(`Core initialized for planning session test at ${testRepoPath}`)
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

test.serial('startPlanningSession initializes planning session state', async (t) => {
  const userId = 'planning-session-tester'
  const threadId = 'test-thread-123'

  const result = await coreService.startPlanningSession({
    userId,
    threadId,
  })

  t.truthy(result.message, 'Should return a message')
  t.true(
    result.message.includes('Planning session started'),
    'Message should indicate planning session started'
  )

  const userState = await coreService.getUserState(userId)
  
  t.true(userState.isPlanningSessionActive, 'Planning session should be active')
  t.is(userState.planningSessionId, threadId, 'Planning session ID should match thread ID')
  t.is(userState.currentPhase, 'planning-conversation', 'Current phase should be planning-conversation')
  t.true(Array.isArray(userState.chatHistory), 'Chat history should be an array')
  t.is(userState.chatHistory.length, 0, 'Chat history should be empty initially')
})

test.serial('handleIncomingMessage stores messages in chat history during planning session', async (t) => {
  const userId = 'planning-session-message-tester'
  const threadId = 'test-thread-456'
  const testMessage = 'This is a test message for the planning session'

  await coreService.startPlanningSession({
    userId,
    threadId,
  })

  const response = await coreService.handleIncomingMessage({
    message: testMessage,
    userId,
  })

  t.truthy(response, 'Should get a response')
  t.truthy(response.content, 'Response should have content')

  const userState = await coreService.getUserState(userId)
  
  t.true(Array.isArray(userState.chatHistory), 'Chat history should be an array')
  t.is(userState.chatHistory.length, 2, 'Chat history should contain user and AI messages')
  
  t.is(userState.chatHistory[0].type, 'user', 'First message should be from user')
  t.is(userState.chatHistory[0].content, testMessage, 'User message content should match')
  
  t.is(userState.chatHistory[1].type, 'ai', 'Second message should be from AI')
  t.is(userState.chatHistory[1].content, response.content, 'AI message content should match response')
})

test.serial('Discord adapter detects thread creation and starts planning session', async (t) => {
  const mockClient = new EventEmitter()
  mockClient.user = { id: 'bot-user-id' }
  
  const mockThread = {
    id: 'mock-thread-123',
    ownerId: 'mock-user-456',
    guildId: 'mock-guild-789',
    members: {
      cache: new Map([['bot-user-id', {}]]) // Bot is a member
    },
    send: async (message) => {
      mockThread.lastMessage = message
      return { id: 'message-id' }
    }
  }
  
  const mockDiscordAdapter = {
    _isAllowedUser: async () => true,
    
    coreService
  }
  
  mockClient.on('threadCreate', async (thread) => {
    const botIsMember = thread.members.cache.has(mockClient.user.id)
    
    if (botIsMember) {
      const threadOwner = thread.ownerId
      if (await mockDiscordAdapter._isAllowedUser()) {
        try {
          const result = await mockDiscordAdapter.coreService.startPlanningSession({
            userId: threadOwner,
            threadId: thread.id
          })
          
          await thread.send(result.message)
        } catch (error) {
          await thread.send('Sorry, I encountered an error trying to start a planning session.')
        }
      }
    }
  })
  
  const userId = mockThread.ownerId
  
  mockClient.emit('threadCreate', mockThread)
  
  await new Promise(resolve => setTimeout(resolve, 100))
  
  t.truthy(mockThread.lastMessage, 'Thread should receive a message')
  t.true(
    mockThread.lastMessage.includes('Planning session started'),
    'Message should indicate planning session started'
  )
  
  const userState = await coreService.getUserState(userId)
  t.true(userState.isPlanningSessionActive, 'Planning session should be active')
  t.is(userState.planningSessionId, mockThread.id, 'Planning session ID should match thread ID')
})
