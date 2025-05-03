# Project: Aider Discord Bot POC (v0.1)

*This file contains the stable, long-term context for the project.*
*It should be updated infrequently, primarily when core goals, tech, or patterns change.*

See `docs/SPEC_v0.1.md` for the detailed v0.1 specification.
See `docs/plan-v0.1.0.md` for the v0.1 development plan.
See `docs/plan-v0.2.0.md` for the v0.2 feature development plan.

---

## Core Goal

Enable Discord users within a specific guild and role to interact with `@dguttman/aider-js` via a bot, using a designated Git repository as the workspace, as detailed in `docs/SPEC_v0.1.md`.

## Core Architecture

The application is split into two main modules:

1.  **`core` Module (Discord Agnostic):** Contains the primary application logic (Git interaction via `simple-git`, Aider interaction via `@dguttman/aider-js`, context management, state management).
2.  **`discord-adapter` Module:** Acts as the interface between Discord (using `discord.js`) and the `core` module, handling Discord events and translating data.

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

- **Framework:** Docker Compose (`