# Specification: Aider Discord Bot v0.1 POC

*This document details the requirements, architecture, and plan for the Proof of Concept (v0.1) integration of `@dguttman/aider-js` with Discord.*

---

## 1. Core Goal

Enable Discord users within a specific guild and role to interact with Aider via a bot, using a designated Git repository as the workspace.

---

## 2. Requirements

### 2.1. Bot Invocation & Thread Management
- Users initiate interaction by mentioning the bot in any channel within the configured guild.
- The bot must detect mentions directed at it.
- Upon first mention, the bot creates a new public thread for the interaction. Thread title generation is optional and can be skipped.
- Subsequent messages within that thread are processed as input for Aider.

### 2.2. Aider Interaction
- Messages sent by users within an active Aider thread are forwarded to the `@dguttman/aider-js` library.
- Initially, only the content of the current message is sent (no prior thread history). The design should allow for future expansion to include history.
- Responses from Aider are relayed back to the user in the same Discord thread.
- Plain text responses are sent as standard Discord messages. If a response exceeds Discord's character limit, it must be split into multiple messages.
- Responses identified as diffs or files should be uploaded as Discord file attachments for better readability.

### 2.3. LLM Configuration
- The bot utilizes OpenRouter as the LLM backend.
- The `OPENROUTER_API_KEY` must be provided via environment variables.
- A slash command `/model <model_name>` allows users to configure the specific OpenRouter model to use. This command should feature autocomplete suggestions for available models (requires fetching model list from OpenRouter or aider-js).

### 2.4. Git Repository Management
- The bot operates on a Git repository specified by the `REPO_URL` environment variable.
- On startup, the bot ensures a local clone of the repository exists in a designated working directory.
- It manages two branches:
    - `STARTING_BRANCH`: The base branch (default: `main`), configured via env var.
    - `WORKING_BRANCH`: The branch where Aider makes changes (default: `vibemob`), configured via env var.
- **Startup Git Workflow:**
    1. Check if working directory exists. If not, clone `REPO_URL`.
    2. `cd` into the repo directory.
    3. `git fetch origin`
    4. `git checkout ${STARTING_BRANCH}`
    5. `git pull origin ${STARTING_BRANCH}`
    6. Check if `${WORKING_BRANCH}` exists locally.
    7. If not:
        - Check if `${WORKING_BRANCH}` exists remotely (`git ls-remote --heads origin ${WORKING_BRANCH}`).
        - If yes, `git checkout -b ${WORKING_BRANCH} origin/${WORKING_BRANCH}`.
        - If no, `git checkout -b ${WORKING_BRANCH}` (based on `STARTING_BRANCH`).
    8. If yes:
        - `git checkout ${WORKING_BRANCH}`.
        - Check if `${WORKING_BRANCH}` exists remotely.
        - If yes, `git reset --hard origin/${WORKING_BRANCH}`.
        - If no, keep local branch as-is.
- Aider is configured to auto-commit changes it makes.
- Users can explicitly command the bot (e.g., via a message like "push the changes") to push the current state of the `WORKING_BRANCH` to the remote `origin`.

### 2.5. Context Management
- The bot manages a global context for Aider (v0.1). Design should facilitate future per-thread context.
- Slash Commands:
    - `/add <path>`: Adds a file or directory (relative to the repo root) to Aider's context. Supports autocomplete suggestions based on the local repo structure. Includes a `read-only` boolean option.
    - `/remove <path>`: Removes a file or directory from the context. Supports autocomplete for items currently in context.
    - `/clear`: Clears the entire Aider context.
- Context modifications affect subsequent interactions with Aider.

### 2.6. Access Control
- Bot interaction is restricted to users within a specific Discord guild and possessing a specific role.
- `GUILD_ID` and `ROLE_ID` must be provided via environment variables.
- The bot should ignore mentions/commands from users not meeting these criteria.

### 2.7. Message Handling Specifics
- Only process new messages within threads. Ignore message edits and deletions for v0.1. (Consider future '/undo' support).
- Process only plain text messages. Ignore attachments, embeds, etc., from users for v0.1.
- Bot replies are public within the thread.

### 2.8. Exclusions (Out of Scope for v0.1)
- Rate limiting / Anti-spam measures.
- Persistence (database for state, history, preferences). All state is in-memory.
- Handling message edits/deletions.
- Processing user attachments/embeds.
- Per-thread context management.
- Advanced admin/configuration commands beyond `/model`, `/add`, `/remove`, `/clear`.
- Custom thread titles.

---

## 3. Architecture & Implementation Choices

### 3.1. Tech Stack
- **Language:** Node.js
- **Core Logic:** 
    - **Git Interaction:** `simple-git` library
    - **Aider Bridge:** `@dguttman/aider-js` library
- **Discord Interface:** `discord.js` library
- **Testing:** Ava framework

### 3.2. Core Components & Architecture

The application is split into two main modules:

1.  **`core` Module (Discord Agnostic):**
    *   Contains the primary application logic, independent of Discord.
    *   **Responsibilities:** Startup Git initialization, Aider interaction (via Aider Service), Git operations (via Git Service), context management (Context Manager), model configuration, state management.
    *   **Internal Services:**
        *   `Aider Service`: Wraps `@dguttman/aider-js`.
        *   `Git Service`: Wraps `simple-git`.
        *   `Context Manager`: Manages Aider context.
        *   `Startup Service`: Handles initial Git clone/setup.
    *   **API:** Exposes a clear API for the `discord-adapter` (e.g., `initialize(config)`, `handleIncomingMessage({ userId, text })`, `setContext({ command, path, readOnly })`, `setModel(modelName)`, `pushChanges()`).
    *   **Dependencies:** `simple-git`, `@dguttman/aider-js`, environment variables (for non-Discord config like `OPENROUTER_API_KEY`, `REPO_URL`, etc.).

2.  **`discord-adapter` Module:**
    *   Acts as the interface between Discord and the `core` module.
    *   **Responsibilities:** Connecting to Discord gateway, handling Discord events (mentions, messages, slash commands), translating Discord data structures to `core` API calls, translating `core` responses/events to Discord actions (sending messages, creating threads, uploading files), enforcing access control (`GUILD_ID`, `ROLE_ID`).
    *   **Dependencies:** `discord.js`, the `core` module, environment variables (`DISCORD_BOT_TOKEN`, `GUILD_ID`, `ROLE_ID`).

### 3.3. State Management
- All operational state (active threads mapping to core interactions if needed, global context, current model) will be held in memory within the `core` module. Bot restarts will reset this state.
- Git state is persisted on the filesystem within the cloned repository managed by the `core` module.

### 3.4. Configuration
- Runtime configuration via environment variables:
    - **Core:** `OPENROUTER_API_KEY`, `REPO_URL`, `STARTING_BRANCH`, `WORKING_BRANCH`
    - **Adapter:** `DISCORD_BOT_TOKEN`, `GUILD_ID`, `ROLE_ID`
- No configuration files planned for v0.1.

---

## 4. Data Handling

- **User Messages:** Received via `discord.js` events in the `discord-adapter`, relevant text/data passed to the `core` module's API.
- **Aider Responses:** Returned from the `core` module's API, handled by the `discord-adapter` for appropriate Discord display (text messages or file uploads).
- **Context:** Managed internally by the `core` module, modified via its API.
- **Git Data:** Managed entirely by the `Git Service` within the `core` module using `simple-git`.

---

## 5. Error Handling Strategies

- **Discord API Errors (Adapter):** Catch errors from `discord.js` calls. Log errors and potentially notify the user if an action failed (e.g., "Failed to send reply.").
- **Core Module Errors (Core):** Errors originating from Aider, Git, or internal logic within the `core` module should be caught and potentially returned/thrown to the `discord-adapter` with enough information to inform the user (e.g., "Aider encountered an error: [...]"). The `core` module itself should primarily log internal details.
- **Git Errors (Core):** Catch errors from `simple-git`. Log errors. For startup errors, the `core.initialize` might fail. For runtime errors (like push), the relevant `core` API call should indicate failure to the adapter.
- **Configuration Errors (Adapter/Core):** Check for essential environment variables on startup in the respective modules. Log and exit gracefully if required variables are missing.
- **Access Denied (Adapter):** Silently ignore requests from users outside the configured guild/role within the `discord-adapter`. Log attempts for debugging if needed.

---

## 6. Testing Plan (Integration/E2E Focus)

- **Development Workflow:** Test-First. Focus on building the `core` module's integration tests to cover the full user flow *before* implementing the `discord-adapter`.
- **Primary Focus:** End-to-end integration tests for the `core` module, simulating full user interactions and verifying repository state. Secondary focus on `discord-adapter` interface tests.

- **Test Environment Setup:**
    - A setup script (`zx` preferred) will automate environment preparation before running tests.
    - **Responsibilities:**
        - Ensure a record/replay proxy (e.g., `echoproxia`) is running and configured to proxy the target LLM API (`https://openrouter.ai/api/v1`).
        - Prepare a local test Git repository (e.g., clone a fixture repo to a temporary directory).
        - Initialize the test repo state (checkout `STARTING_BRANCH`, setup `WORKING_BRANCH`).
    - Tests should clean up the temporary repository afterwards.

- **`core` Module Integration Tests (Ava):**
    - Test the exported API of the `core` module directly against the prepared test repository.
    - Simulate full conversation flows: initialize, send messages, manage context, trigger pushes.
    - Verify API return values, internal state (if applicable), and final Git repository state (file content, commits, branches) using `simple-git` within assertions.
    - **Dependencies & Workflow:**
        - Use the *real* `simple-git` library.
        - Use the *real* `@dguttman/aider-js` library.
        - Configure `core` / `aider-js` to use the running proxy's endpoint as its `apiBase`.
        - **Record Mode:** Initially run tests with the proxy in RECORD mode (requires `OPENROUTER_API_KEY`) to generate fixtures of LLM interactions.
        - **Replay Mode:** Subsequent runs use REPLAY mode with the generated fixtures for fast, deterministic, key-free testing.

- **`discord-adapter` Interface Tests (Ava):**
    - Test the translation layer between Discord events and `core` API calls.
    - Verify that simulated Discord events trigger the correct `core` API calls.
    - Verify that simulated `core` API responses trigger the correct Discord actions.
    - **Mocking:**
        - Use the test-double pattern for `discord.js` (`discord.js-test` mock).
        - Mock the *entire* `core` module interface.

- **Unit Tests (Ava):**
    - Use sparingly for complex, isolated algorithms not covered by integration tests.

- **E2E Testing:** Considered covered by the `core` module's integration tests due to the architecture.
- **Test Execution:** Tests must run non-interactively, clean up resources (temp repos), exit cleanly, and use random ports if needed. 