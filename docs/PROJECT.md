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
- **Environment Variables:** `dotenv`

## Critical Patterns & Conventions

*   **Development Approach:** Strict Test-Driven Development (TDD) focusing on a single, incrementally built End-to-End (E2E) test (`tests/e2e.test.js`). See `docs/plan-v0.1.md`.
*   **Test Execution:** All Ava tests MUST be run serially (`npx ava --serial`).
*   **Configuration:** Centralized configuration managed in `lib/config.js`, sourcing values from environment variables loaded via `dotenv` from the root `.env` file.
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

## Testing Environment

- **Framework:** Docker Compose (`docker-compose.test.yml`)
- **Services:**
    - `git-server`: Provides a Git repository over SSH, resetting on each run. Uses the public key from `tests/fixtures/ssh/id_test.pub`.
    - `test-runner`: Executes the `ava` E2E tests against the `git-server` and the application code. The private key (`tests/fixtures/ssh/id_test`) and a custom SSH config (`tests/fixtures/ssh/ssh_config`) are mounted into `/root/.ssh/` to facilitate SSH connections to `git-server`.
- **Fixtures:**
    - `tests/fixtures/git-repo`: Source files for the test repository.
    - `tests/fixtures/ssh`: Contains `id_test` (private key), `id_test.pub` (public key), and `ssh_config` (client configuration) for testing SSH connections between containers.
    - `tests/fixtures/recordings`: Stores Echoproxia recordings for mocking LLM API calls.
- **Orchestration:**
    - Use npm scripts to manage the test environment:
        - `npm run test:env:up`: Starts the services (`git-server`, `test-runner`) in detached mode. Builds images automatically if they are missing or outdated.
        - `npm run test:env:down`: Stops and removes the containers, networks.
        - `npm run test:env:exec -- <command>`: Executes a command inside the `test-runner` container (e.g., `npm run test:env:exec -- ls -la`). Use `npm run test:env:exec` for an interactive shell.
        - `npm run test:env:ssh`: Opens an SSH connection from `test-runner` to `git-server` (useful for verifying connectivity).
    - Run tests using: The top-level `npm test` script handles environment setup and execution within the container.
        - To run ALL tests (in replay mode): `npm test`
        - To run ALL tests in RECORD mode: `npm run test:record`
        - To run ONLY specific tests: Temporarily modify the test definition(s) in `tests/e2e.test.js` from `test(...)` to `test.only(...)`. Remember to revert this change before committing.
        - To SKIP specific tests: Temporarily modify the test definition(s) in `tests/e2e.test.js` from `test(...)` to `test.skip(...)`.
        - Remember to set `ECHOPROXIA_RECORDING_DIR` if you want recordings in a specific directory when using `test:record`, e.g., `ECHOPROXIA_RECORDING_DIR=tests/fixtures/recordings/my-new-test npm run test:record`
        - **Note:** Do NOT use the `-m` flag with `npm test` or related scripts to filter tests; use `test.only` as described above.
        - **Dependency Note:** If you add or update dependencies using `npm install <package>`, the `test-runner` container might not automatically pick them up. You **must** run `npm run test:reset` afterwards to rebuild the test environment and incorporate the changes before running `npm test`.
        - **Echoproxia Note:** Calling `proxy.setSequence(name, { recordMode: true/false })` within a test will override the global `ECHOPROXIA_MODE` set by the `npm run test:record` or `npm test` script. This can be useful to force a specific sequence to always record or always replay, effectively "locking" a known-good recording in place while still allowing other tests to record new interactions.

## Project Status

- **Current Phase:** Phase 7: Discord Adapter Implementation (Complete!)
- **Next Step:** v0.1 POC Completed. Next steps involve deployment, refinement, adding features (e.g., push command), and robust testing of the Discord interaction.

---

## References

- `docs/SPEC_v0.1.md`: Detailed functional specification.
- `