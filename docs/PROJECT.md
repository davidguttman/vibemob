# Project: Aider Discord Bot POC (v0.1)

_This file contains the stable, long-term context for the project._
_It should be updated infrequently, primarily when core goals, tech, or patterns change._

See `docs/SPEC_v0.1.md` for the detailed v0.1 specification.
See `docs/plan-v0.1.0.md` for the v0.1 development plan.
See `docs/plan-v0.2.0.md` for the v0.2 feature development plan.
See `docs/plan-v1.0.0.md` for the v1.0.0 feature development plan.

---

## Overview

The Aider Discord Bot integrates `@dguttman/aider-js` with Discord.
For v1.0.0, the bot introduces an interactive, phased workflow:

1.  **Conversational Planning:** Users engage in Q&A with Aider in a dedicated Discord thread to build a chat history.
2.  **Plan Generation:** Aider uses the chat history to generate a Markdown plan file in the repository.
3.  **Plan Review & Iteration:** Users review the plan (via GitHub link) and request edits. Aider updates the plan file.
4.  **Plan Implementation:** Aider implements the finalized plan, making code changes.
5.  **Implementation Review & Iteration:** Users review code changes (via GitHub diff link). Feedback triggers an automated cycle: Aider undoes changes, updates the plan, and re-implements.

This approach allows authorized users to collaboratively develop and refine software plans and implementations directly within their Discord workflow. It uses a designated Git repository as the workspace and aims for natural language interaction for key commands.

Key capabilities:

- **Interactive Planning Workflow:**
  - Conversational Q&A with Aider to build a planning context.
  - AI-assisted generation of Markdown plan files from conversation history.
  - Iterative review and editing of plan files via natural language feedback.
  - Plan-driven code implementation by Aider.
  - Iterative review of implemented code, with an automated cycle of undo, plan update, and re-implementation based on feedback.
- **Discord Integration:**
  - Interaction initiated by creating a new thread with the bot.
  - GitHub links provided for plan previews and commit diffs.
- **Core Aider Functionality:**
  - Management of Aider's file context (though less reliant on explicit `/add`, `/remove` in the new flow).
  - LLM model selection (persists, but may be less frequently changed during a planning session).
- **Git Integration:**
  - Automated commits and pushes for plan files and code changes to a working branch.
  - Git repository management (cloning, branch management).
- **Access Control:** Based on Discord guild and role.
- **Configuration:** Optional command prefixing, Aider settings.
- **Future Goal (v1.0.0 plan):** Natural language intent recognition for triggering workflow steps (plan generation, edits, implementation).

The bot serves developers or teams who want to leverage Aider's capabilities for a more structured, plan-centric development process within their Discord environment.

---

## Project Organization

### Core Systems

1.  **Discord Adapter** (`lib/discord-adapter.js`, `lib/discord/`)

    - Handles connection to Discord and event processing (messages, interactions).
    - Manages interaction threads (initiating planning sessions on new thread creation).
    - Translates Discord commands and messages into calls to the `coreService`.
    - Formats and relays responses (including GitHub links) from `coreService` back to Discord.
    - Includes a test double (`lib/discord/discord-test.js`) for testing.

2.  **Core Logic** (`lib/core.js`)

    - Orchestrates interactions between Git, Aider, the Discord adapter, and the Intent Recognizer.
    - Manages application state per user, including planning session state (chat history, current plan file, current phase).
    - Handles the multi-phase workflow (conversational planning, plan generation, plan review, implementation, implementation review).
    - Manages in-memory chat history.
    - (Future) Integrates with `Intent Recognizer` to process natural language commands.

3.  **Intent Recognition Service** (`lib/intent-recognizer.js` - _New in v1.0.0_)

    - Responsible for interpreting user messages to determine their intent within the planning workflow (e.g., generate plan, edit plan, implement plan).
    - Initially basic (keyword/regex), planned to evolve into an LLM-based recognizer.

4.  **Git Service** (`lib/git-service.js`)

    - Wraps `simple-git` library for all Git operations.
    - Handles cloning, branch checking, creation, committing, pulling, pushing, and resetting.
    - Manages SSH key configuration for remote operations.
    - (Potentially) Assists in generating GitHub preview/diff links.

5.  **Aider Service** (`lib/aider.js`)

    - Wraps the `@dguttman/aider-js` library.
    - Provides functions to initialize and run Aider for various tasks:
      - Q&A during conversational planning.
      - Generating Markdown plan files from chat history.
      - Editing plan files based on user feedback.
      - Implementing code changes based on a plan file.
      - Undoing previous commits.

6.  **Configuration** (`lib/config.js`)
    - Centralizes configuration management.
    - Loads settings from environment variables and `.env` file (except in test environment).
    - Handles optional command prefixing (`COMMAND_PREFIX`).

### Main Files and Directories

```
.
├── CONVENTIONS.md
├── Dockerfile
├── Dockerfile.git-server
├── Dockerfile.test
├── README.md
├── app.js                     # Main application entry point
├── captain-definition
├── docker-compose.prod-local.yml
├── docker-compose.test.yml
├── docs/                      # Documentation, plans, specifications
│   ├── PROJECT.md             # This file
│   ├── SPEC_v0.1.md
│   ├── aider-js-test/         # Specific test setup for aider-js library
│   │   ├── Dockerfile
│   │   ├── recordings/
│   │   └── ... (scripts)
│   ├── plan-v0.1.0.md
│   ├── plan-v0.1.1.md
│   ├── plan-v0.2.0.md
│   └── plan-v1.0.0.md         # v1.0.0 development plan
├── lib/                       # Core library code
│   ├── aider.js               # Wrapper for aider-js library
│   ├── config.js              # Configuration management
│   ├── core.js                # Core application logic, state management, v1.0 workflow orchestration
│   ├── discord/               # Discord-specific modules
│   │   ├── commands.js        # Slash command definitions (handles prefixing)
│   │   ├── discord-test.js    # Test double for discord.js
│   │   └── index.js           # Conditional export for discord.js/discord-test.js
│   ├── discord-adapter.js     # Handles Discord API interaction (handles prefixing)
│   ├── git-service.js         # Wrapper for simple-git operations
│   ├── intent-recognizer.js   # (New in v1.0.0) User intent recognition
│   ├── index.js               # Exports public library functions/modules
│   └── utils.js               # Utility functions (e.g., message splitting)
├── package-lock.json
├── package.json
├── repomix-output.txt         # Merged codebase representation (for AI)
├── scripts/                   # Utility and helper scripts
│   ├── debug-aider.js
│   ├── deploy-commands.js     # Deploys Discord slash commands (handles prefixing)
│   ├── reset-test-env.sh
│   ├── run-single-test.sh
│   └── run-tests.sh           # Main test execution script
└── tests/                     # Automated tests
    ├── e2e.test.js            # Main end-to-end test file
    ├── fixtures/              # Test data, mock repositories, recordings
    │   ├── git-repo/
    │   ├── markdown-test-repo/
    │   ├── recordings/        # Echoproxia recordings for LLM interactions
    │   └── ssh/               # SSH keys for test Git server
    └── markdown-interaction.test.js # Test for markdown rendering
```

### Key Functions and Classes

1.  **Application Entry Point** (`app.js`)

    - `main()`: Initializes core services and starts the Discord adapter.

2.  **Discord Adapter** (`lib/discord-adapter.js`)

    - `discordAdapter.start()`: Logs the client into Discord.
    - `client.on(Events.ClientReady, ...)`: Handler for bot ready state.
    - `client.on(Events.MessageCreate, ...)`: Handler for incoming messages (mentions, thread messages).
    - `client.on(Events.ThreadCreate, ...)`: (New for v1.0.0) Handler to detect new threads with the bot to initiate planning sessions.
    - `client.on(Events.InteractionCreate, ...)`: Handler for slash commands and autocomplete (handles command prefix).
    - `_handleInitialMention()`: (Behavior changes in v1.0.0) May now primarily focus on guiding users to start threads or handling non-thread interactions.
    - `_handleThreadMessage()`: (Behavior changes in v1.0.0) Routes messages from planning threads to `coreService` for processing within the active planning phase.
    - `_relayCoreResponse()`: Formats and sends core service responses to Discord, including GitHub links.

3.  **Core Logic** (`lib/core.js`)

    - `coreService.initializeCore()`: Clones/sets up the Git repo and initializes state.
    - `coreService.handleIncomingMessage()`: (Significantly updated for v1.0.0) Main entry point for processing user text input. Routes to intent recognizer and manages state transitions through planning/implementation phases (conversational Q&A, plan generation, plan editing, plan implementation, implementation revision).
    - `coreService.setModel()`: Sets the LLM model for a specific user.
    - `coreService.setConfigOverrides()`: Allows overriding API base/key per user.
    - `coreService.pushChanges()`: (Role changes) Git pushes are now more integrated into specific workflow steps (plan generated, plan edited, code implemented, undo pushed).
    - `coreService.getContextFiles()`: Retrieves the current file context for a user.
    - `coreService.getFileContent()`: Reads content of a specific file in the repo.
    - `getUserState()`: (Updated for v1.0.0) Retrieves or initializes the state object for a user, including new fields for planning session (chat history, current plan file path, current phase).
    - (New v1.0.0 functions like `_handleGeneratePlan`, `_handleEditPlan`, `_handleImplementPlan`, `_handleReviseImplementation` to manage workflow stages).

4.  **Intent Recognition Service** (`lib/intent-recognizer.js` - _New in v1.0.0_)

    - `intentRecognizer.recognizeIntent()`: Takes user message and potentially context, returns a classified intent (e.g., 'generate_plan', 'edit_plan', 'implement_plan', 'continue_chat').

5.  **Git Service** (`lib/git-service.js`)

    - `gitService.cloneRepo()`: Clones the remote repository.
    - `gitService.checkoutOrCreateBranch()`: Manages checkout/creation/reset of the working branch.
    - `gitService.commitAndPush()`: (Enhanced or new variants for v1.0.0) Commits specified files or all changes and pushes to the remote branch. Used for plan files and code changes.
    - `gitService.pushBranch()`: Pushes a specified branch to the remote.
    - `gitService.getCurrentBranch()`: Gets the current local branch name.
    - `gitService.listBranches()`: Lists local and remote branches.
    - `_getGitInstance()`: Internal helper to create configured `simple-git` instances.

6.  **Aider Service** (`lib/aider.js`)

    - `aiderService.initializeAider()`: Validates Aider configuration.
    - `aiderService.sendPromptToAider()`: (Role may adapt) Used for general Q&A.
    - (New v1.0.0 functions):
      - `aiderService.generatePlanFromHistory()`: Takes chat history, generates Markdown plan.
      - `aiderService.editFile()`: Edits a specified file (e.g., the plan) based on a prompt.
      - `aiderService.implementPlan()`: Implements code changes based on a plan file.
      - `aiderService.undoLastCommit()`: Instructs Aider to undo its last commit.

7.  **Discord Test Double** (`lib/discord/discord-test.js`)
    - `MockClient`: Mock `discord.js` Client class.
    - `createMock...`: Factory functions for creating mock Discord objects (Message, Interaction, Channel, etc.).

---

## Glossary of codebase-specific terms

1.  **`aiderService`**: Module wrapping the `@dguttman/aider-js` library (`lib/aider.js`).
2.  **`coreService`**: The main module containing Discord-agnostic application logic, state management, and orchestration (`lib/core.js`).
3.  **`coreStateStore`**: In-memory object within `core.js` holding the state for each active user (`lib/core.js`).
4.  **`contextFiles`**: An array within a user's state (`userState`) tracking files/directories added to Aider's context, including their read-only status (`lib/core.js`).
5.  **`discordAdapter`**: Module responsible for all interactions with the Discord API using `discord.js` (`lib/discord-adapter.js`).
6.  **`Echoproxia`**: The HTTP request recording/replay proxy used during testing to capture and mock LLM API interactions (`tests/e2e.test.js`).
7.  **`gitService`**: Module responsible for all Git operations, wrapping the `simple-git` library (`lib/git-service.js`).
8.  **`globalRepoPath`**: Variable within `core.js` storing the filesystem path to the locally cloned Git repository (`lib/core.js`).
9.  **`handleIncomingMessage`**: The primary function in `coreService` that processes user messages, routing them to command handlers or the Aider service (`lib/core.js`).
10. **`initializeCore`**: Function in `coreService` responsible for setting up the Git repository (cloning/branch management) and initializing the core application state (`lib/core.js`).
11. **`STARTING_BRANCH`**: Configuration value specifying the Git branch to base the `WORKING_BRANCH` on if it doesn't exist remotely (e.g., `main`) (`lib/config.js`).
12. **`Test Double`**: A mock implementation of a dependency (like `discord.js`) used to isolate components during testing (`lib/discord/discord-test.js`).
13. **`userState`**: The specific state object for a single user stored within `coreStateStore`, containing their current model, API settings, and context files (`lib/core.js`).
14. **`WORKING_BRANCH`**: Configuration value specifying the Git branch where Aider makes and commits changes (e.g., `aider-bot-dev`) (`lib/config.js`).
15. **`COMMAND_PREFIX`**: Optional configuration value (`lib/config.js`) read from environment variable. If set (e.g., to `dev`), it prefixes all slash commands (e.g., `/dev_add`, `/dev_context`). Defaults to empty string (`''`).

---

## Tech Stack

- **Language:** Node.js
- **Discord Interaction:** `discord.js`
- **Git Interaction:** `simple-git`
- **Aider Interaction:** `@dguttman/aider-js`
- **Testing:** `ava` (with serial execution)
- **LLM Backend:** OpenRouter (via `aider-js`)
- **Environment Variables:** `dotenv`

## Critical Patterns & Conventions

- **Development Approach:** Strict Test-Driven Development (TDD) focusing on a single, incrementally built End-to-End (E2E) test (`tests/e2e.test.js`). See `docs/plan-v0.1.0.md` and subsequent plan files (e.g., `docs/plan-v0.2.0.md`).
- **Test Execution:** All Ava tests MUST be run serially (`npx ava --serial`). The test scripts in `package.json` set `NODE_ENV=test`.
- **Configuration:** Centralized configuration managed in `lib/config.js`, sourcing values primarily from environment variables. When `NODE_ENV` is _not_ `test`, it loads variables from the root `.env` file using `dotenv`. During tests (`NODE_ENV=test`), the `.env` file is explicitly skipped, and configuration relies solely on environment variables set by the test runner (e.g., `docker-compose.test.yml`, `scripts/run-tests.sh`).
- **SSH Key Handling:**
  - **Testing:** The test environment (`docker-compose.test.yml`) mounts the test SSH key (`tests/fixtures/ssh/id_test`) and config (`tests/fixtures/ssh/ssh_config`) into standard locations (`/root/.ssh/`) within the `test-runner` container. `simple-git` picks these up automatically.
  - **Deployment:** For non-test environments, the SSH private key **must** be provided as a base64 encoded string via the `SSH_PRIVATE_KEY_B64` environment variable. `lib/config.js` reads this variable. `lib/git-service.js` then decodes the key, writes it to a temporary file (with `600` permissions) in the OS temporary directory (e.g., `/tmp/`), and configures `simple-git` (via `GIT_SSH_COMMAND`) to use this temporary key file for all remote Git operations. The temporary file is cleaned up by the OS.
- **Testing Dependencies (Mocking):** Avoid `proxyquire` or `sinon`. Use the conditional export pattern for test doubles:
  ```js
  // service/index.js
  module.exports =
    process.env.NODE_ENV !== 'test'
      ? require('./real-service')
      : require('./fake-service')
  ```
- **Testing Discord Interaction:** The interaction with `discord.js` is handled via a test double located in `lib/discord-double`. An `index.js` file in this directory conditionally exports either the real `discord.js` library (for production/development) or `discord-double.js` (when `NODE_ENV=test`). The double mimics the necessary `discord.js` classes, methods, and events used by `lib/discord-adapter.js` to allow for testing without connecting to Discord's actual services.
- **Commit Messages:** Follow Conventional Commits format.
- **Function Arguments:** Use options objects for functions with more than two arguments.
- **Asynchronous Operations:** Do NOT use arbitrary timeouts or sleeps (`setTimeout`, `setInterval` with delays) to wait for asynchronous operations (e.g., network, service startup, file I/O). Use proper async/await, promises, event listeners, health checks, or polling with libraries designed for waiting on resources (e.g., waiting for a port to be open) instead.
- **React/JSX (If applicable):** Avoid ternaries; use conditional returns.
- **Dependencies:** Manage using `npm install <package>@latest`, do not edit `package.json` directly.

## Deployment

- **Dockerfile:** A multi-stage `Dockerfile` is provided for building a production-ready container image. It installs only production dependencies, creates a non-root user, and copies only the necessary source files (`lib`, `package.json`).
- **Environment Variables:** Production deployments require setting the environment variables listed in `.env.example`. See the SSH Key Handling section below for specifics on `SSH_PRIVATE_KEY_B64`.
- **Local Testing:** To test the production build locally before deployment, create a `.env` file in the project root with production variables, then run `npm run start:prod:local`. This uses `docker-compose.prod-local.yml` to build and run the container.

## Testing Environment

- **Framework:** Docker Compose (`docker-compose.test.yml`) orchestrates the test environment.
- **Components:**
  - `git-server`: A container running SSHD and serving a bare Git repository initialized from `tests/fixtures/git-repo`. Uses a persistent SSH key (`tests/fixtures/ssh/id_test.pub`).
  - `test-runner`: A container based on the Node.js image where tests are executed. Mounts the project code and SSH keys. Runs `npm test` via `scripts/run-tests.sh`.
- **LLM Mocking:** `echoproxia` is used to record and replay interactions with the LLM API (OpenRouter by default). Recordings are stored in `tests/fixtures/recordings`.
- **Execution:** Tests are run non-interactively using `npm test`, which executes `scripts/run-tests.sh` inside the `test-runner` container.
