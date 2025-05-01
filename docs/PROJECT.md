# Project: Aider Discord Bot POC (v0.1)

*This file contains the stable, long-term context for the project.*
*It should be updated infrequently, primarily when core goals, tech, or patterns change.*

See `docs/SPEC_v0.1.md` for the detailed v0.1 specification.
See `docs/plan-v0.1.md` for the step-by-step development plan.

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

## Critical Patterns & Conventions

*   **Development Approach:** Strict Test-Driven Development (TDD) focusing on a single, incrementally built End-to-End (E2E) test (`tests/e2e.test.js`). See `docs/plan-v0.1.md`.
*   **Test Execution:** All Ava tests MUST be run serially (`npx ava --serial`).
*   **Testing Dependencies (Mocking):** Avoid `proxyquire` or `sinon`. Use the conditional export pattern for test doubles:
    ```js
    // service/index.js
    module.exports = process.env.NODE_ENV !== 'test' ? require('./real-service') : require('./fake-service')
    ```
*   **Commit Messages:** Follow Conventional Commits format.
*   **Function Arguments:** Use options objects for functions with more than two arguments.
*   **React/JSX (If applicable):** Avoid ternaries; use conditional returns.
*   **Dependencies:** Manage using `npm install <package>@latest`, do not edit `package.json` directly.

## Testing Environment

- **Framework:** Docker Compose (`docker-compose.test.yml`)
- **Services:**
    - `git-server`: Provides a Git repository over SSH, resetting on each run.
    - `test-runner`: Executes the `ava` E2E tests against the `git-server` and the application code.
- **Fixtures:**
    - `tests/fixtures/git-repo`: Source files for the test repository.
    - `tests/fixtures/ssh`: SSH keys for communication between test containers.
- **Orchestration:** Tests are run via `docker-compose run test-runner npm test` (or similar).

## Project Status

- **Current Phase:** Phase 1: Test Environment Setup & Core Git Interaction (See `docs/plan-v0.1.md`).
- **Next Step:** Implementing Step 1.1 (Docker Compose Setup) as defined in the plan.

---

## References

- `docs/SPEC_v0.1.md`: Detailed functional specification.
- `docs/plan-v0.1.md`: TDD Development Plan.
- `docs/aider-js-test`: Standalone environment for testing `@dguttman/aider-js`.

## Assumptions

- **API Keys:** The `OPENROUTER_API_KEY` environment variable is assumed to be set on the host machine when running tests, particularly in record mode (`npm run test:lib:record`). The `scripts/run-lib-tests.mjs` script will pass this key into the test container.

## Phase 1: Core Foundation & Git Workflow (v0.1)


