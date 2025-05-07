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
        *   Modify `getUserState` to include new fields for planning sessions:
            *   `isPlanningSessionActive: boolean`
            *   `planningSessionId: string` (e.g., Discord thread ID)
            *   `chatHistory: Array<{ type: 'user' | 'ai', content: string, timestamp: Date }>`
            *   `currentPlanFilePath: string | null`
            *   `currentPhase: string` (e.g., 'planning-conversation', 'plan-review', 'implementation-review')
        *   Initialize these appropriately.
    2.  **`lib/discord-adapter.js` - Detect Thread Creation:**
        *   Listen for Discord `threadCreate` events.
        *   When a thread is created with the bot, signal `core.js` to initialize a planning session for that thread ID and user.
        *   Store a mapping of thread IDs to user IDs if necessary.
    3.  **`lib/core.js` - Basic Message Handling for Planning Threads:**
        *   Modify `handleIncomingMessage`: If a message is from an active planning thread:
            *   Add user's message to `chatHistory`.
            *   For now, send a simple canned response or echo back (Aider Q&A integration comes next).
            *   Add this canned response to `chatHistory`.
    4.  **Testing:**
        *   Manually create a thread with the bot.
        *   Verify user state is updated in `core.js`.
        *   Send messages and check if `chatHistory` is populated (via logging/debugging).

### Phase 2: Conversational Planning (Aider Q&A Integration)

*   **Objective:** Route messages from planning threads to Aider for Q&A and store responses.
*   **Tasks:**
    1.  **`lib/aider.js` - Ensure Q&A Mode:**
        *   Verify or create a function in `aider.js` that takes a prompt and returns a textual response without attempting file modifications (Q&A mode). This might involve passing specific flags or using a different Aider command.
    2.  **`lib/core.js` - Aider Q&A Integration:**
        *   In `handleIncomingMessage` for planning threads:
            *   Instead of a canned response, call the Aider Q&A function with the user's message.
            *   The prompt to Aider should likely include relevant context from `chatHistory` to maintain conversation flow. Decide on how much history to send.
            *   Store Aider's response in `chatHistory`.
            *   Send Aider's response back to the user in the Discord thread via `discord-adapter.js`.
    3.  **Testing:**
        *   Start a planning session.
        *   Ask Aider questions. Verify responses are from Aider and the conversation is stored.

### Phase 3: Plan Generation

*   **Objective:** Allow users to trigger plan generation from chat history.
*   **Tasks:**
    1.  **`lib/intent-recognizer.js` - Basic "Generate Plan" Intent:**
        *   Create a new file `lib/intent-recognizer.js`.
        *   Implement a simple function `recognizeIntent(message: string): string | null`.
        *   Initially, use keywords (e.g., "generate plan", "make a plan").
    2.  **`lib/core.js` - Handle "Generate Plan" Intent:**
        *   In `handleIncomingMessage`, after Aider Q&A, pass the user's message to `recognizeIntent`.
        *   If "generate_plan" intent is detected:
            *   Call a new function `_handleGeneratePlan(userId)`.
    3.  **`lib/aider.js` - Plan Generation Function:**
        *   Create a function `generatePlanFromHistory(options: { chatHistory: Array<...>, repoPath: string, modelName: string, ... }): Promise<{ planContent: string, planFilePath: string }>`.
        *   This function will format the `chatHistory` into a suitable prompt for Aider, instructing it to create a Markdown plan.
        *   Aider should suggest a filename for the plan (e.g., `PLAN-[timestamp].md`) or the function can determine one.
        *   Aider writes this file to the `repoPath`.
    4.  **`lib/core.js` - `_handleGeneratePlan` Implementation:**
        *   Retrieve `chatHistory` for the user.
        *   Call `aider.generatePlanFromHistory`.
        *   Store `planFilePath` in user state.
        *   Update `currentPhase` to 'plan-review'.
    5.  **`lib/git-service.js` - Commit Plan:**
        *   Ensure `git-service.js` can commit and push a specific new file.
        *   After plan generation, call `git-service.commitAndPush({ localPath, filesToAdd: [planFilePath], message: 'feat(plan): Generate initial plan' })`.
    6.  **`lib/discord-adapter.js` - Send Plan Link:**
        *   After push, construct a GitHub preview link to the plan file. (Logic for this might be in `core.js` or `git-service.js`).
        *   Send this link to the user.
    7.  **Testing:**
        *   Have a conversation.
        *   Use the trigger phrase to generate a plan.
        *   Verify plan file is created in the repo, committed, pushed.
        *   Verify link is sent and works.

### Phase 4: Plan Iteration (Editing)

*   **Objective:** Allow users to request edits to the generated plan.
*   **Tasks:**
    1.  **`lib/intent-recognizer.js` - Basic "Edit Plan" Intent:**
        *   Add logic to detect edit requests (e.g., "change the plan", "edit step 1"). This will be very basic initially.
    2.  **`lib/core.js` - Handle "Edit Plan" Intent:**
        *   In `handleIncomingMessage`, if `currentPhase` is 'plan-review' and "edit_plan" intent is detected:
            *   Call a new function `_handleEditPlan(userId, userEditRequest)`.
    3.  **`lib/aider.js` - Plan Editing Function:**
        *   Create or adapt a function `editFile(options: { filePath: string, prompt: string, repoPath: string, modelName: string, ... }): Promise<void>`.
        *   This function instructs Aider to edit the `filePath` (the plan file) based on `prompt` (the user's edit request).
    4.  **`lib/core.js` - `_handleEditPlan` Implementation:**
        *   Retrieve `currentPlanFilePath` and the `userEditRequest`.
        *   Call `aider.editFile` with the plan file path and the user's request.
    5.  **`lib/git-service.js` - Commit Plan Edits:**
        *   After plan edit, call `git-service.commitAndPush({ localPath, filesToAdd: [currentPlanFilePath], message: 'feat(plan): Update plan based on user feedback' })`.
    6.  **`lib/discord-adapter.js` - Send Updated Plan Link:**
        *   Send the GitHub preview link for the modified plan.
    7.  **Testing:**
        *   Generate a plan.
        *   Request an edit.
        *   Verify plan file is updated, committed, pushed.
        *   Verify new link is sent.

### Phase 5: Plan Implementation

*   **Objective:** Allow users to trigger Aider to implement the current plan.
*   **Tasks:**
    1.  **`lib/intent-recognizer.js` - Basic "Implement Plan" Intent:**
        *   Add logic for "implement plan", "apply this plan".
    2.  **`lib/core.js` - Handle "Implement Plan" Intent:**
        *   In `handleIncomingMessage`, if `currentPhase` is 'plan-review' and "implement_plan" intent is detected:
            *   Call a new function `_handleImplementPlan(userId)`.
    3.  **`lib/aider.js` - Implementation Function:**
        *   Create a function `implementPlan(options: { planFilePath: string, repoPath: string, modelName: string, ... }): Promise<void>`.
        *   This instructs Aider to read `planFilePath` and apply the changes to the codebase.
    4.  **`lib/core.js` - `_handleImplementPlan` Implementation:**
        *   Retrieve `currentPlanFilePath`.
        *   Call `aider.implementPlan`.
        *   Update `currentPhase` to 'implementation-review'.
    5.  **`lib/git-service.js` - Commit Implementation:**
        *   After implementation, Aider should have made commits, or `git-service` needs to capture changes and commit. Aider's standard auto-commit should handle this. Ensure it's pushed.
        *   If Aider doesn't auto-push, add `git-service.push({ localPath, branchName })`.
    6.  **`lib/discord-adapter.js` - Send Diff Link:**
        *   Construct and send a GitHub diff link for the latest commit.
    7.  **Testing:**
        *   Generate and approve a simple plan.
        *   Trigger implementation.
        *   Verify code changes are made, committed, pushed.
        *   Verify diff link is sent.

### Phase 6: Implementation Revision Cycle

*   **Objective:** Handle user feedback on implementation by undoing, updating plan, and re-implementing.
*   **Tasks:**
    1.  **`lib/intent-recognizer.js` - Basic "Revise Implementation" Intent:**
        *   This is more complex. Initially, any message after implementation could be treated as a revision request if not an explicit approval (which we are not waiting for).
    2.  **`lib/core.js` - Handle "Revise Implementation" Intent:**
        *   In `handleIncomingMessage`, if `currentPhase` is 'implementation-review' and a message is received (interpreted as feedback/revision):
            *   Call `_handleReviseImplementation(userId, userFeedback)`.
    3.  **`lib/aider.js` - Undo Function:**
        *   Ensure Aider has an "undo last commit" capability accessible via `aider.js`, e.g., `undoLastCommit(options: { repoPath: string, ... }): Promise<void>`.
    4.  **`lib/core.js` - `_handleReviseImplementation` Implementation:**
        *   Call `aider.undoLastCommit`.
        *   Call `git-service.push` to push the revert.
        *   Treat `userFeedback` as an edit request to the `currentPlanFilePath`. Call `_handleEditPlan(userId, userFeedback)` (or a refactored version). This will update the plan and commit/push it.
        *   Once plan is updated, automatically call `_handleImplementPlan(userId)` again.
        *   The `currentPhase` remains 'implementation-review' or cycles appropriately.
    5.  **Testing:**
        *   Implement a plan.
        *   Provide feedback ("this is wrong, change X").
        *   Verify: last commit is undone, plan is updated, new implementation occurs.
        *   Verify new diff link.

### Phase 7: Advanced Intent Recognition LLM Integration

*   **Objective:** Replace basic intent recognizer with a more robust LLM-based one.
*   **Tasks:**
    1.  **Research & Setup:**
        *   Choose a small LLM (e.g., GPT-4o Mini via OpenAI API).
        *   Set up API access and any necessary SDKs. Add to `config.js`.
    2.  **`lib/intent-recognizer.js` - LLM Integration:**
        *   Modify `recognizeIntent` to call the chosen LLM.
        *   Develop effective prompts for intent classification (e.g., "Is the user asking to generate a plan, edit a plan, implement a plan, providing feedback on implementation, or just chatting?").
        *   Map LLM responses to standardized intent keys.
    3.  **`lib/core.js` - Update Intent Usage:**
        *   Ensure `core.js` correctly uses the new intent keys and handles cases where intent is ambiguous or simply "chatting" (continue Q&A).
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
