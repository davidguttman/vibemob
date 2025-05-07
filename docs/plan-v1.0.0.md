# Vibemob v1.0.0 Implementation Plan

## 1. Overview

This document outlines the plan to implement Vibemob v1.0.0, which introduces a new interactive workflow for AI-assisted development. The core idea is to shift from direct Aider interaction to a phased approach:

1.  **Conversational Planning:** Users engage in a Q&A with Aider within a dedicated Discord thread to build up a "chat history."
2.  **Plan Generation:** The chat history is used by Aider to generate a formal Markdown plan.
3.  **Plan Review & Iteration:** The user reviews the plan (via a GitHub link) and requests edits. Aider updates the plan file.
4.  **Plan Implementation:** Once satisfied, the user directs Aider to implement the plan.
5.  **Implementation Review & Iteration:** The user reviews the implemented code (via a GitHub diff link). If changes are needed, the system automatically undoes the implementation, updates the plan based on feedback, and re-implements.

This process will leverage natural language understanding for user intents, in-memory storage for chat history (initially), and a single-branch Git workflow for commits.

## 2. Goals

*   Introduce a structured, multi-stage interaction model for using Aider.
*   Enable users to collaboratively develop a plan with AI before code generation.
*   Allow iterative refinement of both the plan and the implementation.
*   Utilize natural language for triggering key actions (plan generation, edits, implementation).
*   Maintain the plan as the source of truth for implementation.

## 3. Key Features & Workflow

1.  **Planning Session Initiation:**
    *   A user starts a new thread with the bot in Discord. This thread becomes a dedicated "planning session."

2.  **Conversational Planning (Q&A):**
    *   User messages within this thread are treated as Q&A prompts for Aider (akin to an implicit `/ask`).
    *   The system stores the user's messages and Aider's responses (the "chat history") in memory for the session.

3.  **Plan Generation:**
    *   User expresses intent to generate a plan (e.g., "Okay, let's make a plan from this").
    *   An intent recognition module (initially basic, later an LLM) identifies this.
    *   The full chat history is provided to Aider to generate a new Markdown plan file (e.g., `PLAN-[timestamp].md` or `PLAN-[thread-name].md`) in the repository.
    *   This plan file is committed and pushed to the current working branch.
    *   The user receives a GitHub preview link to this Markdown file.

4.  **Plan Review & Iteration:**
    *   User reviews the plan. If changes are needed, they provide feedback in the thread (e.g., "Change the first step to...").
    *   The intent module identifies this as a plan edit request.
    *   Aider is instructed to edit the existing plan Markdown file with the requested changes.
    *   The updated plan is committed and pushed. The user gets an updated preview link. This loop continues until the user is satisfied with the plan.

5.  **Plan Implementation:**
    *   User expresses intent to implement the plan (e.g., "The plan looks good, implement it").
    *   The intent module identifies this.
    *   The current version of the plan Markdown file is given to Aider to make code changes.
    *   Aider's code changes are committed and pushed to the same branch.
    *   The user receives a GitHub link showing the diff of changes in that commit.

6.  **Implementation Review & Iteration:**
    *   User reviews the implemented changes.
    *   **If satisfied:** The user takes no further corrective action in the bot thread. They can merge the changes or proceed with their Git workflow. The bot's active role for this cycle ends.
    *   **If NOT satisfied:** User provides feedback in the thread (e.g., "The login button should be green").
        *   The intent module identifies this as a request to revise the implementation.
        *   The system automatically:
            1.  Instructs Aider to undo the last (implementation) commit. This revert is pushed.
            2.  Treats the user's feedback as an edit request for the *plan Markdown file*.
            3.  Instructs Aider to modify the plan file. The updated plan is committed and pushed.
            4.  Re-triggers the implementation phase using the newly revised plan.
            5.  The user receives a new GitHub diff link, and the cycle returns to "Implementation Review."

## 4. Affected Components & High-Level Changes

*   **`lib/core.js`:**
    *   State management for planning sessions (current phase, chat history, plan file path).
    *   Orchestration logic for the new multi-step workflow.
    *   Integration with the intent recognition module.
    *   Logic for interacting with `aider.js` for Q&A, plan generation, plan editing, implementation, and undo.
    *   Management of in-memory chat history.
*   **`lib/discord-adapter.js`:**
    *   Detecting new thread creation to initiate planning sessions.
    *   Routing messages from planning threads to `core.js`.
    *   Sending GitHub links (plan preview, commit diff) back to the user.
*   **`lib/aider.js`:**
    *   May need new functions or modifications to existing functions to support:
        *   Pure Q&A mode (if not already distinct).
        *   Generating a Markdown file from a given chat history.
        *   Editing a specific file based on a prompt (for plan edits).
        *   Implementing changes based on a plan file.
        *   Executing an "undo" command.
*   **`lib/git-service.js`:**
    *   Ensuring commits are made correctly for plans and implementations.
    *   Potentially functions to generate GitHub preview/diff links (or this logic might reside in `core.js`).
*   **New Module: `lib/intent-recognizer.js` (or similar):**
    *   Initially, a simple keyword-based or regex-based recognizer.
    *   Later, integration with a small LLM (e.g., GPT-4o Mini) for more robust natural language intent detection.

## 5. Data Management

*   **Chat History:**
    *   Stored in-memory within `core.js` user state, associated with a planning session (e.g., by Discord thread ID).
    *   Structure: Array of objects, e.g., `[{ type: 'user', content: '...' }, { type: 'ai', content: '...' }]`.
    *   Design should allow for future migration to a persistent database.
*   **Plan File:**
    *   Stored as a Markdown file in the user's Git repository.
    *   Filename convention to be decided (e.g., `vibemob-plan-[threadId].md` or `docs/current-plan.md`).

## 6. Git Workflow

*   All operations (plan creation, plan edits, implementation, undos) occur on the user's current working branch.
*   Each significant action (plan generated, plan edited, code implemented, implementation undone) results in a separate commit.
*   Commits will be pushed automatically.
*   Commit messages should be descriptive (e.g., `feat(plan): Generate initial plan for X`, `fix(plan): Update plan based on user feedback`, `feat: Implement plan X`, `revert: Undo previous implementation based on feedback`). Adhere to `CONVENTIONS.md`.

## 7. Incremental Implementation Steps

This plan is broken down into phases to allow for incremental development and testing.

### Phase 1: Basic Planning Session & In-Memory Chat History

*   **Objective:** Establish the concept of a planning session and store basic Q&A.
*   **Tasks:**
    1.  **`lib/core.js` - User State Enhancement:**
        *   In `getUserState(userId)`, when initializing state for a new user (or an existing user without planning state), add the following fields to the `userState` object:
            *   `isPlanningSessionActive: false` (boolean)
            *   `planningSessionId: null` (string, e.g., Discord thread ID)
            *   `chatHistory: []` (Array of objects: `{ type: 'user' | 'ai', content: string, timestamp: Date }`)
            *   `currentPlanFilePath: null` (string)
            *   `currentPhase: null` (string, e.g., 'planning-conversation', 'plan-review', 'implementation-review')
    2.  **`lib/discord-adapter.js` - Detect Thread Creation:**
        *   In `discordAdapter.start()`, add a new event listener: `client.on(Events.ThreadCreate, async (thread) => { ... })`.
        *   Inside the handler, if the thread involves the bot (e.g., bot is a member or was mentioned in the parent message leading to thread creation - specifics TBD based on Discord.js capabilities):
            *   Extract `userId` (thread creator or relevant user) and `threadId`.
            *   Call a new function in `core.js`, e.g., `await coreService.startPlanningSession({ userId, threadId })`.
            *   `coreService.startPlanningSession` will set `isPlanningSessionActive = true`, `planningSessionId = threadId`, and `currentPhase = 'planning-conversation'` in the user's state.
        *   Consider how to map `threadId` back to `userId` if not directly available, potentially by inspecting thread parent or initial messages.
    3.  **`lib/core.js` - Basic Message Handling for Planning Threads:**
        *   Modify `handleIncomingMessage({ userId, messageContent, channelId })` (assuming `messageContent` and `channelId` are passed from `discord-adapter.js`).
        *   Retrieve `userState = getUserState(userId)`.
        *   If `userState.isPlanningSessionActive && userState.planningSessionId === channelId`:
            *   Add user's message: `userState.chatHistory.push({ type: 'user', content: messageContent, timestamp: new Date() })`.
            *   For now, prepare a canned response: `const botResponse = "Message received in planning session."`
            *   Add bot's response: `userState.chatHistory.push({ type: 'ai', content: botResponse, timestamp: new Date() })`.
            *   Return `botResponse` to `discord-adapter.js` to send back to the thread.
    4.  **Testing:**
        *   Manually create a thread with the bot.
        *   Verify user state is updated in `core.js`.
        *   Send messages and check if `chatHistory` is populated (via logging/debugging).

### Phase 2: Conversational Planning (Aider Q&A Integration)

*   **Objective:** Route messages from planning threads to Aider for Q&A and store responses.
*   **Tasks:**
    1.  **`lib/aider.js` - Ensure Q&A Mode:**
        *   Review `aiderService.sendPromptToAider(options)`.
        *   For Q&A, `options.contextFiles` should likely be empty or not provided.
        *   The `options.prompt` will be the user's message, potentially prefixed with a system message or prior conversation turns to maintain context for Aider.
        *   Ensure `aider-js`'s `runAider` can be invoked in a mode that primarily returns text responses without requiring file edits, or that its output can be parsed to extract just the textual reply.
    2.  **`lib/core.js` - Aider Q&A Integration:**
        *   In `handleIncomingMessage` for planning threads, when `userState.currentPhase === 'planning-conversation'`:
            *   Replace the canned response logic.
            *   Construct the `promptForAider`. This might involve taking the last N messages from `userState.chatHistory` and the current `messageContent`.
            *   Call `const aiderResponseText = await aiderService.sendPromptToAider({ prompt: promptForAider, userId, repoPath: globalRepoPath, modelName: userState.currentModel, apiBase: userState.apiBase, apiKey: userState.apiKey })`.
            *   Add Aider's response to chat history: `userState.chatHistory.push({ type: 'ai', content: aiderResponseText, timestamp: new Date() })`.
            *   Return `aiderResponseText` to `discord-adapter.js`.
    3.  **Testing:**
        *   Start a planning session.
        *   Ask Aider questions. Verify responses are from Aider and the conversation is stored.

### Phase 3: Plan Generation

*   **Objective:** Allow users to trigger plan generation from chat history.
*   **Tasks:**
    1.  **`lib/intent-recognizer.js` - Basic "Generate Plan" Intent:**
        *   Create `lib/intent-recognizer.js`.
        *   Export `function recognizeIntent(messageText) { /* ... */ }`.
        *   Initially, `if (messageText.toLowerCase().includes('generate plan') || messageText.toLowerCase().includes('make a plan')) return 'generate_plan'; return null;`.
    2.  **`lib/core.js` - Handle "Generate Plan" Intent:**
        *   In `handleIncomingMessage`, after processing Q&A (if applicable), call `const intent = recognizeIntent(messageContent)`.
        *   If `intent === 'generate_plan' && userState.currentPhase === 'planning-conversation'`:
            *   Call `return await _handleGeneratePlan({ userId })`. (Return value will be message for Discord).
    3.  **`lib/aider.js` - Plan Generation Function:**
        *   Create `async function generatePlanFromHistory(options: { chatHistory: Array<...>, repoPath: string, modelName: string, apiBase: string, apiKey: string, userId: string }): Promise<{ planContent: string, planFilePath: string }>` in `aiderService`.
        *   Format `chatHistory` into a detailed prompt for Aider, instructing it to create a Markdown plan and output it to a unique filename (e.g., `docs/plan-${userId}-${Date.now()}.md`). The prompt should specify that Aider should write the plan to this file.
        *   Use `aiderService.sendPromptToAider` or a similar call to `runAider` from `@dguttman/aider-js`, ensuring Aider is instructed to write the file.
        *   The function should resolve with the content of the plan and its path.
    4.  **`lib/core.js` - `_handleGeneratePlan` Implementation:**
        *   Create `async function _handleGeneratePlan({ userId })`.
        *   Retrieve `userState = getUserState(userId)`.
        *   Call `const { planContent, planFilePath } = await aiderService.generatePlanFromHistory({ chatHistory: userState.chatHistory, repoPath: globalRepoPath, modelName: userState.currentModel, ...userState })`.
        *   Update user state: `userState.currentPlanFilePath = planFilePath; userState.currentPhase = 'plan-review';`.
        *   Return a message like `Plan generated: ${planFilePath}. Review it and suggest edits or approve for implementation.`.
    5.  **`lib/git-service.js` - Commit Plan:**
        *   Use or create `async function commitAndPushFiles({ localPath, filesToAdd, message, branchName })`. This function would:
            *   `git.add(filesToAdd)`
            *   `git.commit(message)`
            *   `git.push(['--set-upstream', 'origin', branchName])` (as in existing `pushBranch`)
        *   In `_handleGeneratePlan`, after `aider.generatePlanFromHistory` successfully writes the file:
            *   `await gitService.commitAndPushFiles({ localPath: globalRepoPath, filesToAdd: [planFilePath], message: `feat(plan): Generate initial plan for ${userId}`, branchName: (await gitService.getCurrentBranch(globalRepoPath)) })`.
    6.  **`lib/discord-adapter.js` - Send Plan Link:**
        *   In `_relayCoreResponse` (or similar function in `discord-adapter.js` that sends messages):
            *   If the response from `core.js` indicates a plan has been generated (e.g., based on the message content or a structured response), construct the GitHub link.
            *   Link construction: `https://${config.gitRepoUrl.split('/')[2]}/${config.gitRepoUrl.substring(config.gitRepoUrl.indexOf('/') + 1).replace('.git', '')}/blob/${branchName}/${planFilePath}`. (This needs to be robust for different GitHub URL formats).
            *   Append this link to the message sent to Discord.
    7.  **Testing:**
        *   Have a conversation.
        *   Use the trigger phrase to generate a plan.
        *   Verify plan file is created in the repo, committed, pushed.
        *   Verify link is sent and works.

### Phase 4: Plan Iteration (Editing)

*   **Objective:** Allow users to request edits to the generated plan.
*   **Tasks:**
    1.  **`lib/intent-recognizer.js` - Basic "Edit Plan" Intent:**
        *   In `recognizeIntent(messageText)`, add: `if (messageText.toLowerCase().includes('edit plan') || messageText.toLowerCase().includes('change the plan')) return 'edit_plan';`.
    2.  **`lib/core.js` - Handle "Edit Plan" Intent:**
        *   In `handleIncomingMessage`:
            *   If `intent === 'edit_plan' && userState.currentPhase === 'plan-review'`:
                *   Call `return await _handleEditPlan({ userId, userEditRequest: messageContent })`.
    3.  **`lib/aider.js` - Plan Editing Function:**
        *   Create `async function editFile(options: { filePath: string, prompt: string, repoPath: string, modelName: string, apiBase: string, apiKey: string, userId: string }): Promise<string>` in `aiderService`.
        *   This function will use `aiderService.sendPromptToAider` or similar. The `options.prompt` will be the `userEditRequest`.
        *   The `filePath` (the plan file) must be added to Aider's context for editing. This might involve modifying `sendPromptToAider` to accept a file to be edited, or ensuring the prompt clearly states "edit the file X with these changes Y".
        *   It should return Aider's confirmation or summary of changes.
    4.  **`lib/core.js` - `_handleEditPlan` Implementation:**
        *   Create `async function _handleEditPlan({ userId, userEditRequest })`.
        *   Retrieve `userState = getUserState(userId)`. Ensure `userState.currentPlanFilePath` exists.
        *   Call `const aiderConfirmation = await aiderService.editFile({ filePath: userState.currentPlanFilePath, prompt: userEditRequest, repoPath: globalRepoPath, ...userState })`.
        *   Return a message like `Plan updated. ${aiderConfirmation}. Review the changes.`.
    5.  **`lib/git-service.js` - Commit Plan Edits:**
        *   In `_handleEditPlan`, after `aiderService.editFile`:
            *   `await gitService.commitAndPushFiles({ localPath: globalRepoPath, filesToAdd: [userState.currentPlanFilePath], message: `fix(plan): Update plan for ${userId} based on feedback`, branchName: (await gitService.getCurrentBranch(globalRepoPath)) })`.
    6.  **`lib/discord-adapter.js` - Send Updated Plan Link:**
        *   Same logic as in Phase 3, using `userState.currentPlanFilePath`.
    7.  **Testing:**
        *   Generate a plan.
        *   Request an edit.
        *   Verify plan file is updated, committed, pushed.
        *   Verify new link is sent.

### Phase 5: Plan Implementation

*   **Objective:** Allow users to trigger Aider to implement the current plan.
*   **Tasks:**
    1.  **`lib/intent-recognizer.js` - Basic "Implement Plan" Intent:**
        *   In `recognizeIntent(messageText)`, add: `if (messageText.toLowerCase().includes('implement plan') || messageText.toLowerCase().includes('apply this plan')) return 'implement_plan';`.
    2.  **`lib/core.js` - Handle "Implement Plan" Intent:**
        *   In `handleIncomingMessage`:
            *   If `intent === 'implement_plan' && userState.currentPhase === 'plan-review'`:
                *   Call `return await _handleImplementPlan({ userId })`.
    3.  **`lib/aider.js` - Implementation Function:**
        *   Create `async function implementPlan(options: { planFilePath: string, repoPath: string, modelName: string, apiBase: string, apiKey: string, userId: string }): Promise<string>` in `aiderService`.
        *   The prompt to Aider should be to implement the plan specified in `planFilePath`. This means Aider needs to read this file and then apply changes to other files in the `repoPath`.
        *   The `planFilePath` should be added to Aider's context. Other project files might also need to be added based on the plan's content, or Aider can be allowed to auto-select files.
        *   This will use `aiderService.sendPromptToAider` or a similar `runAider` call.
        *   It should return Aider's summary of implemented changes.
    4.  **`lib/core.js` - `_handleImplementPlan` Implementation:**
        *   Create `async function _handleImplementPlan({ userId })`.
        *   Retrieve `userState = getUserState(userId)`. Ensure `userState.currentPlanFilePath` exists.
        *   Call `const aiderSummary = await aiderService.implementPlan({ planFilePath: userState.currentPlanFilePath, repoPath: globalRepoPath, ...userState })`.
        *   Update `userState.currentPhase = 'implementation-review';`.
        *   Return a message like `Plan implementation attempted. ${aiderSummary}. Review the changes.`.
    5.  **`lib/git-service.js` - Commit Implementation:**
        *   Aider's `runAider` (via `aiderService.implementPlan`) should ideally handle its own commits if `autoCommits` is enabled in `aider-js`.
        *   After `aiderService.implementPlan` completes, explicitly push the changes:
            *   `const currentBranch = await gitService.getCurrentBranch(globalRepoPath);`
            *   `await gitService.pushBranch({ localPath: globalRepoPath, branchName: currentBranch })`.
            *   Store the latest commit SHA: `const commitSha = (await gitService.log(globalRepoPath, ['-1', '--pretty=format:"%H"'])).latest.hash;`. (Requires `log` function in `gitService`).
    6.  **`lib/discord-adapter.js` - Send Diff Link:**
        *   In `_relayCoreResponse`, if the response indicates implementation:
            *   Construct GitHub diff link: `https://${config.gitRepoUrl.split('/')[2]}/${config.gitRepoUrl.substring(config.gitRepoUrl.indexOf('/') + 1).replace('.git', '')}/commit/${commitSha}`.
            *   Append this link to the message.
    7.  **Testing:**
        *   Generate and approve a simple plan.
        *   Trigger implementation.
        *   Verify code changes are made, committed, pushed.
        *   Verify diff link is sent.

### Phase 6: Implementation Revision Cycle

*   **Objective:** Handle user feedback on implementation by undoing, updating plan, and re-implementing.
*   **Tasks:**
    1.  **`lib/intent-recognizer.js` - Basic "Revise Implementation" Intent:**
        *   In `recognizeIntent(messageText)`, add logic. For now, any message in `implementation-review` phase that isn't another recognized command could be `revise_implementation`.
        *   `if (userState.currentPhase === 'implementation-review' && !['generate_plan', 'edit_plan', 'implement_plan'].includes(recognizedIntentSoFar)) return 'revise_implementation';`
    2.  **`lib/core.js` - Handle "Revise Implementation" Intent:**
        *   In `handleIncomingMessage`:
            *   If `intent === 'revise_implementation' && userState.currentPhase === 'implementation-review'`:
                *   Call `return await _handleReviseImplementation({ userId, userFeedback: messageContent })`.
    3.  **`lib/aider.js` - Undo Function:**
        *   Create `async function undoLastCommit(options: { repoPath: string, modelName: string, ...userId: string }): Promise<string>` in `aiderService`.
        *   This function will instruct Aider to perform its undo operation (e.g., by sending `/undo` command to `aider-js`'s `runAider`).
        *   It should return Aider's confirmation.
    4.  **`lib/core.js` - `_handleReviseImplementation` Implementation:**
        *   Create `async function _handleReviseImplementation({ userId, userFeedback })`.
        *   `userState = getUserState(userId)`.
        *   `const undoConfirmation = await aiderService.undoLastCommit({ repoPath: globalRepoPath, ...userState })`.
        *   Push the revert: `await gitService.pushBranch({ localPath: globalRepoPath, branchName: (await gitService.getCurrentBranch(globalRepoPath)) })`.
        *   Update the plan: `const editConfirmation = await _handleEditPlan({ userId, userEditRequest: userFeedback })`. (This already commits and pushes the plan change).
        *   Re-implement: `const implementSummary = await _handleImplementPlan({ userId })`.
        *   Return a composite message: `Undo: ${undoConfirmation}. Plan updated: ${editConfirmation}. New implementation attempt: ${implementSummary}. Review new changes.`.
        *   The `currentPhase` will be set to `implementation-review` by `_handleImplementPlan`.
    5.  **Testing:**
        *   Implement a plan.
        *   Provide feedback ("this is wrong, change X").
        *   Verify: last commit is undone, plan is updated, new implementation occurs.
        *   Verify new diff link.

### Phase 7: Advanced Intent Recognition LLM Integration

*   **Objective:** Replace basic intent recognizer with a more robust LLM-based one.
*   **Tasks:**
    1.  **Research & Setup:**
        *   Choose a small LLM (e.g., GPT-4o Mini via OpenAI API or a model available on OpenRouter).
        *   Add new configuration to `lib/config.js` for the intent LLM (e.g., `INTENT_MODEL_NAME`, `INTENT_API_BASE`, `INTENT_API_KEY`). These might default to the main Aider LLM settings or be distinct.
    2.  **`lib/intent-recognizer.js` - LLM Integration:**
        *   Modify `recognizeIntent(messageText, chatHistory, currentPhase)` to take more context.
        *   Construct a prompt for the intent LLM. This prompt should include the user's current message, potentially the last few turns of `chatHistory`, and the `currentPhase` to help the LLM understand context.
        *   Example prompt: "Given the current phase is '{currentPhase}' and the recent conversation history is '{chatHistory}', the user just said: '{messageText}'. Classify the user's intent. Possible intents are: 'continue_chat', 'generate_plan', 'edit_plan', 'implement_plan', 'revise_implementation'. Respond with only the intent string."
        *   Call the intent LLM (this might involve a new helper function in `lib/aider.js` or a direct API call if using a different client).
        *   Parse the LLM's response to get the intent string.
    3.  **`lib/core.js` - Update Intent Usage:**
        *   When calling `recognizeIntent` from `handleIncomingMessage`, pass the necessary context: `recognizeIntent(messageContent, userState.chatHistory, userState.currentPhase)`.
        *   If intent is 'continue_chat', proceed with Phase 2 Q&A logic.
    4.  **Refinement & Testing:**
        *   Test extensively with various natural language phrases.
        *   Refine prompts and logic for accuracy.
        *   Consider confidence scores from the LLM if available.

## 8. Open Questions & Considerations (Initial Thoughts)

*   **Error Handling:** Robust error handling is needed at each step (Aider errors, Git errors, API errors). How are these communicated to the user?
*   **Security:** Ensure file paths and commands are sanitized, especially when dealing with Aider and Git.
*   **Concurrency:** How will the system handle multiple users or multiple planning sessions by the same user if Discord allows? (Current model is one active plan per user state).
*   **Plan Filename/Path:** Standardize how plan files are named and where they are stored in the repo.
*   **Context for Aider:** How much of the chat history or plan content is passed to Aider for various operations (Q&A, plan editing, implementation)? This impacts token usage and context window limits.
*   **"Implicit /ask":** How to distinguish between a general chat message meant for Q&A and a message that might contain an intent when in the `planning-conversation` phase, especially before the LLM intent recognizer is fully implemented. Initially, all messages in a planning thread might be prefixed with `/ask` internally when sent to Aider for Q&A.
*   **User Experience for Links:** Ensure GitHub links are correctly generated and provide clear value (e.g., direct link to Markdown preview, link to commit diff).
*   **Configuration:** Make aspects like Aider model for planning vs. implementation configurable.

## 9. Documentation Updates

*   Update `PROJECT.md` to reflect the new v1.0.0 features and workflow.
*   Update user-facing documentation (if any) on how to use the new planning features.

This plan provides a structured approach. Each phase should be developed, tested, and then built upon. Regular review of `CONVENTIONS.md` is essential.
