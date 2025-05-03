# Development Plan Checklist: v0.1.1 Cleanup

This plan outlines the cleanup tasks after the completion of v0.1 POC.

---

## `lib/git-service.js` (336 lines)

*   [ ] **Refactor SSH Key Handling:** The `setupSshKey` logic is duplicated (or called repeatedly) in multiple functions (`cloneRepo`, `pullBranch`, `pushBranch`, `checkoutOrCreateBranch` [nested], `deleteRemoteBranch`). Consider a higher-order function or refactoring how `simple-git` is configured to handle SSH credentials more centrally, perhaps during initialization or via a shared helper.
*   [ ] **Review Error Handling in `deleteRemoteBranch`:** The function currently logs errors for `remote ref does not exist` but doesn't throw, which is likely correct for cleanup. Ensure this behavior is desired and consistent for all non-critical cleanup errors.
*   [ ] **Examine `checkoutOrCreateBranch` Complexity:** This function has nested logic for local/remote existence checks and includes SSH setup within its `try/finally`. Evaluate if this can be simplified or broken down.
*   [ ] **Remove Dead Code/Comments:** Search for any commented-out code blocks or placeholder comments that are no longer relevant.
*   [ ] **Logging Consistency:** Ensure debug logs (`log`, `logSsh`, `logError`) are used consistently and provide meaningful information without excessive noise.

## `lib/core.js` (361 lines)

*   [ ] **Remove Unused Imports:** The `globSync` import is commented out (`// import { globSync } from 'glob';`). Remove it.
*   [ ] **Address `TODO` Comments:** Search for and address any remaining `TODO` comments.
*   [ ] **Refactor State Management:** `coreStateStore` manages state per `userId`, but `globalRepoPath` and `isCoreInitialized` are global. This mix might be confusing. Evaluate if `globalRepoPath` should be part of the initial config and if `isCoreInitialized` logic is robust, especially concerning re-initialization during tests.
*   [ ] **Simplify `handleIncomingMessage`:** This function is long and handles command parsing (`/add`, `/remove`, `/clear`), path validation, directory expansion, context updates, and Aider interaction prep. Break it down into smaller, more focused functions (e.g., `parseCommand`, `updateContext`, `prepareAiderOptions`, `runAiderInteraction`).
*   [ ] **Improve Read-Only File Handling:** Currently, read-only file content is prepended to the prompt. This might exceed token limits. Investigate if `aider-js` offers a dedicated way to handle read-only context or if a different strategy is needed. The check in `Phase 4.3` relies on Aider *not* producing a diff, which might be brittle.
*   [ ] **Review Aider Instance Management:** The code currently re-initializes the Aider instance (`userState.aiderInstance`) if the model changes. Confirm if this is the intended behavior and if `aiderService` itself could manage this more efficiently. The commented-out re-initialization logic in the `/remove` command block should be removed or implemented correctly.
*   [ ] **Path Validation Robustness:** Ensure the basic path validation (`!path.isAbsolute(relativePath) || relativePath.includes('..')`) is sufficient to prevent security risks.
*   [ ] **Directory Expansion Logic:** The `fs.readdir` logic for `/add <directory>` should be reviewed for efficiency and error handling, especially with large directories or complex structures.
*   [ ] **Remove Dead Code/Comments:** Clean up commented-out code, especially the Aider re-initialization block within the `/remove` logic.
*   [ ] **Logging Consistency:** Review debug logs for clarity and necessity.

## `lib/discord-adapter.js` (398 lines)

*   [ ] **Remove `TODO` Comments:** Address the `TODO` in `ClientReady`.
*   [ ] **Refactor Message Handling (`MessageCreate`):** This is a large handler managing: bot checks, thread checks, initial mentions, permission checks (guild/role), thread creation, and message relaying (including diff extraction). Break this down significantly.
*   [ ] **Improve Thread Identification:** Relying on `thread.name.startsWith('Aider task for')` or `ownerId` check might be brittle. Consider storing active bot-managed thread IDs.
*   [ ] **Simplify Diff Extraction:** The regex and logic for extracting diffs can be complex. Encapsulate this into a utility function. Ensure the filename guessing logic is reliable.
*   [ ] **Error Handling:** Improve error handling consistency, especially for Discord API errors (e.g., fetching members, sending messages) and core service errors. Provide clearer feedback to the user.
*   [ ] **Configuration:** Move hardcoded values like `autoArchiveDuration` or thread name prefixes to constants or configuration.
*   [ ] **Slash Command Handling:** Implement the actual logic for the defined slash commands (`model`, `add`, `remove`, `clear`) by calling the corresponding `coreService` functions.
*   [ ] **Code Duplication:** The response relaying logic (splitting messages, handling diffs) is duplicated for thread follow-ups and initial mentions. Create a reusable function.
*   [ ] **Logging:** Ensure logs clearly distinguish between initial prompts and follow-ups, and provide context like `userId` and `threadId`.

## `lib/utils.js` (112 lines)

*   [ ] **Review `splitMessage` Logic:** The splitting logic, especially around code blocks and hard splitting, can be complex. Add more test cases (if unit tests were planned) or manually verify edge cases (very long lines, multiple code blocks, etc.).
*   [ ] **Consider Alternatives:** Depending on usage, simpler splitting might suffice, or a library could be used if edge cases become problematic.

## `lib/aider.js` (75 lines)

*   [ ] **Remove Commented-Out Logging:** Remove the `// REMOVE DEBUG LOG` lines.
*   [ ] **Clarify `initializeAider` Purpose:** Since `runAider` seems self-contained, the purpose of `initializeAider` is mainly validation. Ensure this is clear and sufficient. If more complex state management is needed later, this might need expansion.
*   [ ] **Error Handling:** Ensure errors from `runAider` are propagated or handled appropriately.

## `lib/index.js` (4 lines)

*   [ ] No cleanup actions identified. This file simply exports modules.

## `tests/e2e.test.js` (1185 lines)

*   [ ] **Remove Commented-Out Code:** Remove the commented `tcpPortUsed` import and logic, the `await new Promise` sleep, and commented-out assertions (like the `t.false` on line 804).
*   [ ] **Address `TODO` Comments:** Search for and address any remaining `TODO` items (e.g., verifying context state in 4.5, model usage verification in 5.2).
*   [ ] **Reduce Code Duplication:** Many tests repeat the clone/initialize steps. Consider using `test.beforeEach` more effectively or creating helper functions for common setup tasks (e.g., `setupInitializedRepo`).
*   [ ] **Simplify Test Setup:** Some tests involve complex setup using `simple-git` directly (e.g., Phase 2.4, 2.5, 6.1, 6.2) to create specific git states. Evaluate if these setups can be simplified or made more readable.
*   [ ] **Improve Assertions:**
    *   Some assertions rely on checking log output or require manual checks (e.g., Phase 4.5, 5.2). Replace these with more direct assertions where possible (e.g., checking internal state if exposed, or analyzing recorded proxy requests).
    *   The file modification check in Phase 3.4 uses polling (`fs.stat`). This can be flaky. Consider if Aider provides a more deterministic way to know when an edit is complete, or if verifying the final content/git status is sufficient.
    *   The token count checks in Phase 4.6 are skipped/commented out. Address the upstream issue or remove the checks if they cannot be made reliable.
*   [ ] **Test Readability:** Add more descriptive names or comments to clarify the purpose of complex setup steps or assertions within tests. Break down very long tests if feasible.
*   [ ] **Remove Redundant Configuration:** Git user configuration is repeated in several tests. Set this up once in `beforeEach` or a helper.
*   [ ] **Echoproxia Usage:** Ensure `setSequence` calls consistently use `recordMode: false` unless actively recording new interactions. The comments about switching modes should be removed once recordings are stable.
*   [ ] **Timeout in Phase 3.4:** Remove the explicit `t.timeout(60000)` if the default timeout is sufficient after potential optimizations.
*   [ ] **Phase 6.1 Git Status Check:** The commented-out check for `status.modified` assumes Aider *doesn't* commit, but the comment says Aider *does* commit. Clarify the expected state after an Aider edit and adjust the assertion. The check against the commit message was also removed because Aider controls it; verify this is acceptable.
*   [ ] **Phase 4.3 Read-Only Handling:** The test assumes `/add` implies read-only. If `coreService` is updated to handle an explicit read-only flag, update this test.

---

**Next Steps:** Prioritize and address these items to improve code quality and maintainability. 