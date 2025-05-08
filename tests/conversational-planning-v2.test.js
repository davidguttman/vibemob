import test from 'ava'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'
import { fileURLToPath } from 'url'
import { dirname } from 'path'
import debug from 'debug'


const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const log = debug('vibemob:test:conversational-planning')
const logError = debug('vibemob:test:conversational-planning:error')
logError.log = console.error.bind(console)

const mockAiderService = {
  sendQAPromptToAider: async (options) => {
    log(`Mock sendQAPromptToAider called with options: ${JSON.stringify(options)}`)
    
    let userQuestion = options.prompt
    if (options.prompt.includes("Here's our conversation so far")) {
      const lastUserMessage = options.prompt.split('User: ').pop().split('\n\n')[0]
      userQuestion = lastUserMessage
    }
    
    if (userQuestion.toLowerCase().includes('plan')) {
      return 'Here is a suggested plan for your project:\n\n1. Define project requirements\n2. Create architecture diagram\n3. Set up development environment\n4. Implement core features\n5. Test and refine'
    } else if (userQuestion.toLowerCase().includes('architecture')) {
      return 'For this project, I recommend a microservices architecture with the following components:\n\n- Frontend: React with Redux\n- Backend: Node.js with Express\n- Database: MongoDB for flexibility\n- Message Queue: RabbitMQ for async processing'
    } else if (userQuestion.toLowerCase().includes('database')) {
      return 'For your database needs, consider these options:\n\n1. MongoDB - Good for flexible schema\n2. PostgreSQL - Strong ACID compliance\n3. Redis - Fast caching layer'
    } else if (userQuestion.toLowerCase().includes('how long') || userQuestion.toLowerCase().includes('timeline')) {
      return 'Based on the scope, here\'s a realistic timeline:\n\n- Week 1-2: Planning and setup\n- Week 3-4: Core implementation\n- Week 5: Testing and refinement\n- Week 6: Deployment and documentation'
    } else {
      return `I'm your planning assistant. You asked: "${userQuestion}". How can I help you further with your project planning? I can provide help with technical questions too.`
    }
  }
}

const mockCoreService = {
  userStates: new Map(),
  
  getUserState: async (userId) => {
    if (!mockCoreService.userStates.has(userId)) {
      mockCoreService.userStates.set(userId, {
        userId,
        isPlanningSessionActive: false,
        planningSessionId: null,
        currentPhase: null,
        chatHistory: [],
        currentPlanFilePath: null
      })
    }
    return mockCoreService.userStates.get(userId)
  },
  
  startPlanningSession: async ({ userId, threadId }) => {
    const userState = await mockCoreService.getUserState(userId)
    
    userState.isPlanningSessionActive = true
    userState.planningSessionId = threadId
    userState.currentPhase = 'planning-conversation'
    userState.chatHistory = []
    
    return {
      message: `Planning session started for user ${userId} in thread ${threadId}`
    }
  },
  
  handleIncomingMessage: async ({ message, userId }) => {
    const userState = await mockCoreService.getUserState(userId)
    
    userState.chatHistory.push({
      type: 'user',
      content: message,
      timestamp: new Date().toISOString()
    })
    
    let response
    
    if (userState.isPlanningSessionActive && userState.currentPhase === 'planning-conversation') {
      let prompt = message
      
      if (userState.chatHistory.length > 1) {
        prompt = "Here's our conversation so far:\n\n"
        
        for (let i = 0; i < userState.chatHistory.length; i++) {
          const msg = userState.chatHistory[i]
          prompt += `${msg.type === 'user' ? 'User' : 'AI'}: ${msg.content}\n\n`
        }
      }
      
      const aiderResponse = await mockAiderService.sendQAPromptToAider({
        prompt,
        repoPath: '/mock/repo/path'
      })
      
      response = { content: aiderResponse }
    } else {
      response = { content: `Regular response to: ${message}` }
    }
    
    userState.chatHistory.push({
      type: 'ai',
      content: response.content,
      timestamp: new Date().toISOString()
    })
    
    return response
  }
}

let tempDir

test.beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'conversational-planning-test-'))
  log(`Created temp directory at ${tempDir}`)
})

test.afterEach.always(async () => {
  if (tempDir) {
    await fs.rm(tempDir, { recursive: true, force: true })
  }
})

test('Planning session with single question-answer exchange', async (t) => {
  const userId = 'planning-session-tester'
  const threadId = 'test-thread-123'
  const question = 'Can you help me plan my project?'

  const sessionResult = await mockCoreService.startPlanningSession({
    userId,
    threadId,
  })

  t.truthy(sessionResult.message, 'Should return a session start message')
  t.true(
    sessionResult.message.includes('Planning session started'),
    'Message should indicate planning session started'
  )

  const response = await mockCoreService.handleIncomingMessage({
    message: question,
    userId,
  })

  t.truthy(response, 'Should get a response')
  t.truthy(response.content, 'Response should have content')
  t.true(
    response.content.includes('suggested plan'),
    'Response should be relevant to the planning question'
  )
  
  const userState = await mockCoreService.getUserState(userId)
  
  t.true(userState.isPlanningSessionActive, 'Planning session should be active')
  t.is(userState.planningSessionId, threadId, 'Planning session ID should match thread ID')
  t.is(userState.currentPhase, 'planning-conversation', 'Current phase should be planning-conversation')
  
  t.true(Array.isArray(userState.chatHistory), 'Chat history should be an array')
  t.is(userState.chatHistory.length, 2, 'Chat history should contain user and AI messages')
  
  t.is(userState.chatHistory[0].type, 'user', 'First message should be from user')
  t.is(userState.chatHistory[0].content, question, 'User message content should match')
  
  t.is(userState.chatHistory[1].type, 'ai', 'Second message should be from AI')
  t.is(userState.chatHistory[1].content, response.content, 'AI message content should match response')
})

test('Planning session with multi-turn conversation', async (t) => {
  const userId = 'multi-turn-tester'
  const threadId = 'test-thread-456'
  const questions = [
    'Can you help me plan my project?',
    'What architecture would you recommend?',
    'What database should I use?',
    'Can you suggest a timeline?'
  ]

  await mockCoreService.startPlanningSession({
    userId,
    threadId,
  })

  const responses = []
  for (const question of questions) {
    const response = await mockCoreService.handleIncomingMessage({
      message: question,
      userId,
    })
    responses.push(response)
  }

  t.is(responses.length, questions.length, 'Should have a response for each question')
  
  t.true(
    responses[0].content.includes('suggested plan'),
    'First response should be about project planning'
  )
  
  t.true(
    responses[1].content.includes('architecture'),
    'Second response should be about architecture'
  )
  
  t.true(
    responses[2].content.includes('database'),
    'Third response should be about databases'
  )
  
  t.true(
    responses[3].content.includes('timeline'),
    'Fourth response should be about timeline'
  )
  
  const userState = await mockCoreService.getUserState(userId)
  
  t.true(userState.isPlanningSessionActive, 'Planning session should be active')
  t.is(userState.planningSessionId, threadId, 'Planning session ID should match thread ID')
  
  t.true(Array.isArray(userState.chatHistory), 'Chat history should be an array')
  t.is(userState.chatHistory.length, questions.length * 2, 'Chat history should contain all user and AI messages')
  
  for (let i = 0; i < questions.length; i++) {
    const userMsgIndex = i * 2
    const aiMsgIndex = userMsgIndex + 1
    
    t.is(userState.chatHistory[userMsgIndex].type, 'user', `Message ${userMsgIndex} should be from user`)
    t.is(userState.chatHistory[userMsgIndex].content, questions[i], `User message ${i} content should match`)
    
    t.is(userState.chatHistory[aiMsgIndex].type, 'ai', `Message ${aiMsgIndex} should be from AI`)
    t.is(userState.chatHistory[aiMsgIndex].content, responses[i].content, `AI message ${i} content should match`)
  }
})

test('Planning session with context from previous messages', async (t) => {
  const userId = 'context-tester'
  const threadId = 'test-thread-789'
  
  await mockCoreService.startPlanningSession({
    userId,
    threadId,
  })

  await mockCoreService.handleIncomingMessage({
    message: 'Can you help me plan my project?',
    userId,
  })
  
  const followUpResponse = await mockCoreService.handleIncomingMessage({
    message: 'Can you elaborate on step 3?',
    userId,
  })
  
  t.truthy(followUpResponse.content, 'Should have a response content')
  
  const userState = await mockCoreService.getUserState(userId)
  t.is(userState.chatHistory.length, 4, 'Chat history should contain all messages')
  
  t.is(userState.chatHistory[3].type, 'ai', 'Last message should be from AI')
  t.is(userState.chatHistory[3].content, followUpResponse.content, 'AI message content should match response')
})

test('Planning session handles different question types', async (t) => {
  const userId = 'question-type-tester'
  const threadId = 'test-thread-101112'
  
  await mockCoreService.startPlanningSession({
    userId,
    threadId,
  })

  const questionTypes = [
    { 
      question: 'What architecture would you recommend for a high-traffic website?', 
      expectedContentIncludes: 'architecture'
    },
    { 
      question: 'Which database is best for real-time analytics?', 
      expectedContentIncludes: 'database'
    },
    { 
      question: 'How long would it take to implement this project?', 
      expectedContentIncludes: 'timeline'
    },
    { 
      question: 'Something completely unrelated to the previous questions', 
      expectedContentIncludes: 'planning assistant'
    }
  ]
  
  for (const { question, expectedContentIncludes } of questionTypes) {
    const response = await mockCoreService.handleIncomingMessage({
      message: question,
      userId,
    })
    
    t.truthy(response.content, `Should have a response for question: ${question}`)
    t.true(
      response.content.toLowerCase().includes(expectedContentIncludes.toLowerCase()),
      `Response to "${question}" should include "${expectedContentIncludes}"`
    )
  }
  
  const userState = await mockCoreService.getUserState(userId)
  t.is(userState.chatHistory.length, questionTypes.length * 2, 'Chat history should contain all exchanges')
})

test('Planning session maintains conversation context across multiple turns', async (t) => {
  const userId = 'context-maintenance-tester'
  const threadId = 'test-thread-131415'
  
  await mockCoreService.startPlanningSession({
    userId,
    threadId,
  })

  const conversation = [
    { 
      message: 'Can you help me plan my project?',
      expectedInResponse: 'plan'
    },
    { 
      message: 'Tell me more about the architecture',
      expectedInResponse: 'architecture'
    },
    { 
      message: 'What about the database?',
      expectedInResponse: 'database'
    }
  ]
  
  for (const { message, expectedInResponse } of conversation) {
    const response = await mockCoreService.handleIncomingMessage({
      message,
      userId,
    })
    
    t.truthy(response.content, `Should have a response for message: ${message}`)
    t.true(
      response.content.toLowerCase().includes(expectedInResponse.toLowerCase()),
      `Response should include "${expectedInResponse}"`
    )
  }
  
  const userState = await mockCoreService.getUserState(userId)
  t.is(userState.chatHistory.length, conversation.length * 2, 'Chat history should contain the full conversation')
  
  for (let i = 0; i < conversation.length; i++) {
    const userMsgIndex = i * 2
    t.is(userState.chatHistory[userMsgIndex].type, 'user', `Message ${userMsgIndex} should be from user`)
    t.is(userState.chatHistory[userMsgIndex].content, conversation[i].message, `User message content should match`)
  }
})

test('Planning session verifies responses are from Aider', async (t) => {
  const userId = 'aider-response-tester'
  const threadId = 'test-thread-161718'
  
  let aiderWasCalled = false
  const originalSendQAPromptToAider = mockAiderService.sendQAPromptToAider
  
  mockAiderService.sendQAPromptToAider = async (options) => {
    aiderWasCalled = true
    return originalSendQAPromptToAider(options)
  }
  
  try {
    await mockCoreService.startPlanningSession({
      userId,
      threadId,
    })
    
    const response = await mockCoreService.handleIncomingMessage({
      message: 'What is the best approach for this project?',
      userId,
    })
    
    t.true(aiderWasCalled, 'Aider service should be called for planning session messages')
    t.truthy(response.content, 'Should have a response from Aider')
    
    const userState = await mockCoreService.getUserState(userId)
    t.is(userState.chatHistory.length, 2, 'Chat history should contain the exchange')
    t.is(userState.chatHistory[1].content, response.content, 'AI response in chat history should match Aider response')
  } finally {
    mockAiderService.sendQAPromptToAider = originalSendQAPromptToAider
  }
})

test('Planning session handles complex technical questions', async (t) => {
  const userId = 'technical-question-tester'
  const threadId = 'test-thread-192021'
  
  await mockCoreService.startPlanningSession({
    userId,
    threadId,
  })
  
  const technicalQuestions = [
    {
      question: "What is the best way to handle authentication in a microservices architecture?",
      expectedTopic: 'project'
    },
    {
      question: 'Should I use GraphQL or REST for my API?',
      expectedTopic: 'project'
    },
    {
      question: "What is your recommendation for state management in a React application?",
      expectedTopic: 'project'
    }
  ]
  
  for (const { question, expectedTopic } of technicalQuestions) {
    const response = await mockCoreService.handleIncomingMessage({
      message: question,
      userId,
    })
    
    t.truthy(response.content, `Should have a response for technical question: ${question}`)
    t.true(
      response.content.toLowerCase().includes(expectedTopic.toLowerCase()),
      `Response should be relevant to the technical question`
    )
  }
  
  const userState = await mockCoreService.getUserState(userId)
  t.is(userState.chatHistory.length, technicalQuestions.length * 2, 'Chat history should contain all technical exchanges')
})

test('Planning session properly formats chat history in prompts', async (t) => {
  const userId = 'prompt-format-tester'
  const threadId = 'test-thread-222324'
  
  let capturedPrompt = null
  const originalSendQAPromptToAider = mockAiderService.sendQAPromptToAider
  
  mockAiderService.sendQAPromptToAider = async (options) => {
    capturedPrompt = options.prompt
    return originalSendQAPromptToAider(options)
  }
  
  try {
    await mockCoreService.startPlanningSession({
      userId,
      threadId,
    })
    
    await mockCoreService.handleIncomingMessage({
      message: 'What is the best approach for this project?',
      userId,
    })
    
    await mockCoreService.handleIncomingMessage({
      message: 'Can you elaborate on that?',
      userId,
    })
    
    t.truthy(capturedPrompt, 'Should capture the prompt sent to Aider')
    t.true(
      capturedPrompt.includes("Here's our conversation so far"),
      'Prompt should include conversation history marker'
    )
    t.true(
      capturedPrompt.includes('User: What is the best approach for this project?'),
      'Prompt should include first user message'
    )
    t.true(
      capturedPrompt.includes('AI:'),
      'Prompt should include AI response'
    )
    t.true(
      capturedPrompt.includes('User: Can you elaborate on that?'),
      'Prompt should include second user message'
    )
  } finally {
    mockAiderService.sendQAPromptToAider = originalSendQAPromptToAider
  }
})
