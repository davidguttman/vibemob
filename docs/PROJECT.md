# Project: Aider Discord Bot POC (v0.1)

*This file contains the stable, long-term context for the project.*
*It should be updated infrequently, primarily when core goals, tech, or patterns change.*

See `docs/SPEC_v0.1.md` for the detailed v0.1 specification.
See `docs/plan-v0.1.0.md` for the v0.1 development plan.
See `docs/plan-v0.2.0.md` for the v0.2 feature development plan.

---

## Overview

The Aider Discord Bot is a Proof-of-Concept designed to integrate `@dguttman/aider-js` with Discord. It allows authorized users within a specific Discord guild and role to interact with Aider, using a designated Git repository as the workspace. Users can manage Aider's context, change the language model, and instruct Aider to modify code within the repository.

Key capabilities:
- Interaction with Aider via Discord mentions and threads.
- Git repository management (cloning, branch management).
- Aider context management via slash commands (`/add`, `/remove`, `/clear`, `/context`).
- LLM model selection via slash command (`/model`).
- Pushing Aider-generated changes to the remote repository (`/push`).
- Access control based on Discord guild and role.

The bot serves developers or teams who want to leverage Aider's capabilities directly within their Discord workflow, facilitating collaborative coding and repository management through a conversational interface.

---

## Project Organization

### Core Systems

1.  **Discord Adapter** (`lib/discord-adapter.js`, `lib/discord/`)
    -   Handles connection to Discord and event processing (messages, interactions).
    -   Manages interaction threads.
    -   Translates Discord commands and messages into calls to the `coreService`.
    -   Formats and relays responses from `coreService` back to Discord.
    -   Includes a test double (`lib/discord/discord-test.js`) for testing.

2.  **Core Logic** (`lib/core.js`)
    -   Orchestrates interactions between Git, Aider, and the Discord adapter.
    -   Manages application state per user (current model, context files).
    -   Parses user messages to distinguish commands from Aider prompts.
    -   Handles context management logic (`/add`, `/remove`, `/clear`).

3.  **Git Service** (`lib/git-service.js`)
    -   Wraps `simple-git` library for all Git operations.
    -   Handles cloning, branch checking, creation, pulling, pushing, and resetting.
    -   Manages SSH key configuration for remote operations.

4.  **Aider Service** (`lib/aider.js`)
    -   Wraps the `@dguttman/aider-js` library.
    -   Provides functions to initialize and run Aider with appropriate context and configuration.

5.  **Configuration** (`lib/config.js`)
    -   Centralizes configuration management.
    -   Loads settings from environment variables and `.env` file (except in test environment).

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
│   └── plan-v0.2.0.md
├── lib/                       # Core library code
│   ├── aider.js               # Wrapper for aider-js library
│   ├── config.js              # Configuration management
│   ├── core.js                # Core application logic, state management
│   ├── discord/               # Discord-specific modules
│   │   ├── commands.js        # Slash command definitions
│   │   ├── discord-test.js    # Test double for discord.js
│   │   └── index.js           # Conditional export for discord.js/discord-test.js
│   ├── discord-adapter.js     # Handles Discord API interaction
│   ├── git-service.js         # Wrapper for simple-git operations
│   ├── index.js               # Exports public library functions/modules
│   └── utils.js               # Utility functions (e.g., message splitting)
├── package-lock.json
├── package.json
├── repomix-output.txt         # Merged codebase representation (for AI)
├── scripts/                   # Utility and helper scripts
│   ├── debug-aider.js
│   ├── deploy-commands.js     # Deploys Discord slash commands
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
    -   `main()`: Initializes core services and starts the Discord adapter.

2.  **Discord Adapter** (`lib/discord-adapter.js`)
    -   `discordAdapter.start()`: Logs the client into Discord.
    -   `client.on(Events.ClientReady, ...)`: Handler for bot ready state.
    -   `client.on(Events.MessageCreate, ...)`: Handler for incoming messages (mentions, thread messages).
    -   `client.on(Events.InteractionCreate, ...)`: Handler for slash commands and autocomplete.
    -   `_handleInitialMention()`: Creates thread and handles first prompt.
    -   `_handleThreadMessage()`: Processes subsequent messages in a thread.
    -   `_relayCoreResponse()`: Formats and sends core service responses to Discord.

3.  **Core Logic** (`lib/core.js`)
    -   `coreService.initializeCore()`: Clones/sets up the Git repo and initializes state.
    -   `coreService.handleIncomingMessage()`: Main entry point for processing user text input (commands or prompts).
    -   `coreService.setModel()`: Sets the LLM model for a specific user.
    -   `coreService.setConfigOverrides()`: Allows overriding API base/key per user.
    -   `coreService.pushChanges()`: Triggers a Git push of the working branch.
    -   `coreService.getContextFiles()`: Retrieves the current file context for a user.
    -   `coreService.getFileContent()`: Reads content of a specific file in the repo.
    -   `getUserState()`: Retrieves or initializes the state object for a user.

4.  **Git Service** (`lib/git-service.js`)
    -   `gitService.cloneRepo()`: Clones the remote repository.
    -   `gitService.checkoutOrCreateBranch()`: Manages checkout/creation/reset of the working branch.
    -   `gitService.pushBranch()`: Pushes a specified branch to the remote.
    -   `gitService.getCurrentBranch()`: Gets the current local branch name.
    -   `gitService.listBranches()`: Lists local and remote branches.
    -   `_getGitInstance()`: Internal helper to create configured `simple-git` instances.

5.  **Aider Service** (`lib/aider.js`)
    -   `aiderService.initializeAider()`: Validates Aider configuration.
    -   `aiderService.sendPromptToAider()`: Executes `runAider` from `@dguttman/aider-js` with context.

6.  **Discord Test Double** (`lib/discord/discord-test.js`)
    -   `MockClient`: Mock `discord.js` Client class.
    -   `createMock...`: Factory functions for creating mock Discord objects (Message, Interaction, Channel, etc.).

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

*   **Development Approach:** Strict Test-Driven Development (TDD) focusing on a single, incrementally built End-to-End (E2E) test (`tests/e2e.test.js`). See `docs/plan-v0.1.0.md` and subsequent plan files (e.g., `docs/plan-v0.2.0.md`).
*   **Test Execution:** All Ava tests MUST be run serially (`npx ava --serial`). The test scripts in `package.json` set `NODE_ENV=test`.
*   **Configuration:** Centralized configuration managed in `lib/config.js`, sourcing values primarily from environment variables. When `NODE_ENV` is *not* `test`, it loads variables from the root `.env` file using `dotenv`. During tests (`NODE_ENV=test`), the `.env` file is explicitly skipped, and configuration relies solely on environment variables set by the test runner (e.g., `docker-compose.test.yml`, `scripts/run-tests.sh`).
*   **SSH Key Handling:**
    *   **Testing:** The test environment (`docker-compose.test.yml`) mounts the test SSH key (`tests/fixtures/ssh/id_test`) and config (`tests/fixtures/ssh/ssh_config`) into standard locations (`/root/.ssh/`) within the `test-runner` container. `simple-git` picks these up automatically.
    *   **Deployment:** For non-test environments, the SSH private key **must** be provided as a base64 encoded string via the `SSH_PRIVATE_KEY_B64` environment variable. `lib/config.js` reads this variable. `lib/git-service.js` then decodes the key, writes it to a temporary file (with `600` permissions) in the OS temporary directory (e.g., `/tmp/`), and configures `simple-git` (via `GIT_SSH_COMMAND`) to use this temporary key file for all remote Git operations. The temporary file is cleaned up by the OS.
*   **Testing Dependencies (Mocking):** Avoid `proxyquire` or `sinon`. Use the conditional export pattern for test doubles:
    ```js
    // service/index.js
    module.exports = process.env.NODE_ENV !== 'test' ? require('./real-service') : require('./fake-service')
    ```
*   **Testing Discord Interaction:** The interaction with `discord.js` is handled via a test double located in `lib/discord-double`. An `index.js` file in this directory conditionally exports either the real `discord.js` library (for production/development) or `discord-double.js` (when `NODE_ENV=test`). The double mimics the necessary `discord.js` classes, methods, and events used by `lib/discord-adapter.js` to allow for testing without connecting to Discord's actual services.
*   **Commit Messages:** Follow Conventional Commits format.
*   **Function Arguments:** Use options objects for functions with more than two arguments.
*   **Asynchronous Operations:** Do NOT use arbitrary timeouts or sleeps (`setTimeout`, `setInterval` with delays) to wait for asynchronous operations (e.g., network, service startup, file I/O). Use proper async/await, promises, event listeners, health checks, or polling with libraries designed for waiting on resources (e.g., waiting for a port to be open) instead.
*   **React/JSX (If applicable):** Avoid ternaries; use conditional returns.
*   **Dependencies:** Manage using `npm install <package>@latest`, do not edit `package.json` directly.

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
