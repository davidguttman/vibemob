# Development Plan Checklist: Aider Discord Bot v0.1 POC

*This checklist outlines the development steps for the Aider Discord Bot POC (v0.1), following a strict Test-Driven Development (TDD) approach centered around a single, evolving end-to-end (E2E) test.*

---

## Guiding Principles

*   **Single E2E Test:** Maintain a single E2E test file (`tests/e2e.test.js`) that grows with the implementation.
*   **TDD Workflow:**
    1.  Add Test Step.
    2.  Run & Verify Failure (`npm test`).
    3.  Implement.
    4.  Run & Verify Success (`npm test`).
    5.  Refactor (Optional).
*   **Incremental Build:** Build functionality incrementally.
*   **Core Module First:** Develop and test the `core` module first.

---

## Phase 1: Test Environment Setup & Core Git Interaction

**Goal:** Establish a reliable Docker Compose testing environment and verify basic Git cloning via SSH.

*   [x] **Step 1.1: Docker Compose Test Environment Setup**
    *   [x] Define `git-server` service in `docker-compose.test.yml` (Builds `Dockerfile.git-server`, copies fixture `tests/fixtures/git-repo`, sets up SSHD, uses keys from `tests/fixtures/ssh`).
    *   [x] Define `test-runner` service in `docker-compose.test.yml` (Builds `Dockerfile.test`, mounts project root, installs Node/npm, configures SSH key access).
    *   [x] Verification: `docker-compose -f docker-compose.test.yml up --build` runs without errors.
*   [x] **Step 1.2: Initial E2E Test - Git Clone via SSH**
    *   [x] Test Addition: Add `test('Phase 1.2: should clone remote repository via SSH')` to `tests/e2e.test.js` asserting `gitService.cloneRepo` does not throw.
    *   [x] Run & Verify Failure: `npm test` fails (Module/Function not found).
    *   [x] Implementation:
        *   [x] Create `lib/git-service.js` and `lib/index.js`.
        *   [x] Add `simple-git` dependency.
        *   [x] Implement *placeholder* `cloneRepo` function.
        *   [x] Configure Ava test file patterns in `package.json`.
    *   [x] Run & Verify Success: `npm test` passes (placeholder resolves).
*   [x] **Step 1.3: Verify Cloned Files**
    *   [x] Test Addition: Add `fs` assertions to `tests/e2e.test.js` to check for `README.md`, `file1.txt`, `src/index.js` after clone.
    *   [x] Run & Verify Failure: `npm test` fails (files not found).
    *   [x] Implementation:
        *   [x] Pass SSH key to `test-runner` (e.g., via `SSH_PRIVATE_KEY_B64` env var).
        *   [x] Update `gitService.cloneRepo` to use `simple-git` and the SSH key to perform a real clone.
    *   [x] Run & Verify Success: `npm test` passes (files are cloned and verified).

---

## Phase 2: Core Startup Git Workflow (Branch Management)

**Goal:** Implement and test the Git startup workflow (branch checkout, pull, creation).

*   [x] Step 2.1: Test checkout of `STARTING_BRANCH`.
*   [x] Step 2.2: Test pulling `STARTING_BRANCH`.
*   [x] Step 2.3: Test creation of `WORKING_BRANCH` if it doesn't exist.
*   [x] Step 2.4: Test checkout of existing remote `WORKING_BRANCH`.
*   [x] Step 2.5: Test hard reset of existing local `WORKING_BRANCH` to remote state.
*   [x] Step 2.6: Test keeping local `WORKING_BRANCH` if remote doesn't exist.

---

## Phase 3: Aider Integration & Basic Interaction

**Goal:** Integrate `@dguttman/aider-js` and test basic message send/receive.

*   [x] Step 3.1: Test initializing the `core` module (including Aider).
*   [x] Step 3.2: Test sending a message via `core.handleIncomingMessage`.
*   [x] Step 3.3: Test receiving/verifying a plain text Aider response from `core`.
*   [ ] Step 3.4: Test a real Aider edit on `tests/fixtures/git-repo/src/server.js` (e.g., add a PATCH endpoint for partial updates).

---

## Phase 4: Context Management Commands

**Goal:** Implement and test `/add`, `/remove`, `/clear` via the `core` module API.

*   [ ] Step 4.1: Test `/add <file>`.
*   [ ] Step 4.2: Test `/add <directory>`.
*   [ ] Step 4.3: Test `/add <path>` with `read-only`.
*   [ ] Step 4.4: Test `/remove <path>`.
*   [ ] Step 4.5: Test `/clear`.
*   [ ] Step 4.6: Verify context changes affect Aider interaction.

---

## Phase 5: Model Configuration Command

**Goal:** Implement and test `/model` via the `core` module API.

*   [ ] Step 5.1: Test setting model via `core.setModel`.
*   [ ] Step 5.2: Verify model change affects Aider interaction.

---

## Phase 6: Git Push Functionality

**Goal:** Implement and test pushing `WORKING_BRANCH` changes to remote.

*   [ ] Step 6.1: Test making a change via Aider.
*   [ ] Step 6.2: Test `core.pushChanges` function.
*   [ ] Step 6.3: Verify changes are pushed to `git-server`.

---

## Phase 7: Discord Adapter Implementation

**Goal:** Connect the tested `core` module to Discord.

*   [ ] Step 7.1: Basic bot connection/ready event.
*   [ ] Step 7.2: Mention detection & thread creation.
*   [ ] Step 7.3: Message forwarding to `core.handleIncomingMessage`.
*   [ ] Step 7.4: Relaying text responses to Discord.
*   [ ] Step 7.5: Handling file/diff responses as attachments.
*   [ ] Step 7.6: Implementing slash commands (`/model`, `/add`, `/remove`, `/clear`) -> core API.
*   [ ] Step 7.7: Implementing access control (`GUILD_ID`, `ROLE_ID`).
*   [ ] Step 7.8: Implementing "push changes" user command.

--- 