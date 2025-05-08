import test from 'ava'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'
import * as coreService from '../lib/index.js'
import { fileURLToPath } from 'url'
import { dirname } from 'path'
import debug from 'debug'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const log = debug('vibemob:test:aider-qa-integration')
const logError = debug('vibemob:test:aider-qa-integration:error')
logError.log = console.error.bind(console)

let tempDir
let testRepoPath
let originalSendQAPromptToAider

const mockSendQAPromptToAider = async (options) => {
  log(`Mock sendQAPromptToAider called with options: ${JSON.stringify(options)}`)
  
  if (options.prompt.includes("Here's our conversation so far")) {
    return `I see you've provided chat history context. In response to your question: "${options.prompt.split('User: ').pop().split('\n\n')[0]}", here's my answer as a planning assistant.`
  }
  
  if (options.prompt.toLowerCase().includes('plan')) {
    return 'Here is a suggested plan for your project...'
  } else if (options.prompt.toLowerCase().includes('question')) {
    return 'The answer to your question is...'
  } else {
    return `I'm your planning assistant. You asked: "${options.prompt}". How can I help you further?`
  }
}

test.beforeEach(async (t) => {
  originalSendQAPromptToAider = coreService.aiderService.sendQAPromptToAider
  
  coreService.aiderService.sendQAPromptToAider = mockSendQAPromptToAider
  
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aider-qa-integration-test-'))
  testRepoPath = path.join(tempDir, 'repo')
  log(`Setting up test repo at ${testRepoPath}`)

  await fs.mkdir(testRepoPath, { recursive: true })
  await fs.writeFile(
    path.join(testRepoPath, 'README.md'),
    '# Test Repository\n\nThis is a test repository for aider-qa-integration tests.\n'
  )

  await t.notThrowsAsync(
    coreService.initializeCore({ repoPath: testRepoPath }),
    `Core init failed for aider-qa-integration test`,
  )
  log(`Core initialized for aider-qa-integration test at ${testRepoPath}`)
})

test.afterEach.always(async () => {
  if (originalSendQAPromptToAider) {
    coreService.aiderService.sendQAPromptToAider = originalSendQAPromptToAider
  }

  if (tempDir) {
    await fs.rm(tempDir, { recursive: true, force: true })
  }
})

test('handleIncomingMessage uses Q&A mode for planning sessions', async (t) => {
  const userId = 'qa-integration-tester'
  const threadId = 'test-thread-123'
  const testMessage = 'This is a question for planning'

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

test('handleIncomingMessage includes chat history context in subsequent messages', async (t) => {
  const userId = 'qa-integration-context-tester'
  const threadId = 'test-thread-456'
  const firstMessage = 'What is your plan for this project?'
  const secondMessage = 'Can you elaborate on that?'

  await coreService.startPlanningSession({
    userId,
    threadId,
  })

  await coreService.handleIncomingMessage({
    message: firstMessage,
    userId,
  })

  const response = await coreService.handleIncomingMessage({
    message: secondMessage,
    userId,
  })

  t.truthy(response, 'Should get a response')
  t.truthy(response.content, 'Response should have content')
  t.true(
    response.content.includes("chat history context"),
    'Response should indicate chat history was included in the prompt'
  )
  
  const userState = await coreService.getUserState(userId)
  
  t.is(userState.chatHistory.length, 4, 'Chat history should contain all messages')
  t.is(userState.chatHistory[0].type, 'user', 'First message should be from user')
  t.is(userState.chatHistory[1].type, 'ai', 'Second message should be from AI')
  t.is(userState.chatHistory[2].type, 'user', 'Third message should be from user')
  t.is(userState.chatHistory[3].type, 'ai', 'Fourth message should be from AI')
})

test('handleIncomingMessage uses regular mode for non-planning sessions', async (t) => {
  const userId = 'regular-mode-tester'
  const testMessage = 'This is a regular message'

  let usedQAMode = null
  const originalPrepareAndRunAider = coreService._prepareAndRunAider
  
  coreService._prepareAndRunAider = async (userId, prompt, useQAMode) => {
    usedQAMode = useQAMode
    return { content: 'Mock response for testing' }
  }

  try {
    await coreService.handleIncomingMessage({
      message: testMessage,
      userId,
    })
    
    t.is(usedQAMode, false, 'Should use regular mode (not Q&A mode) for non-planning sessions')
  } finally {
    if (originalPrepareAndRunAider) {
      coreService._prepareAndRunAider = originalPrepareAndRunAider
    }
  }
})
