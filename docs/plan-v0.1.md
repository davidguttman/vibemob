# Development Plan: Aider Discord Bot v0.1 POC

*This plan outlines the development steps for the Aider Discord Bot POC (v0.1), following a strict Test-Driven Development (TDD) approach centered around a single, evolving end-to-end (E2E) test.*

---

## Guiding Principles

1.  **Single E2E Test:** We will maintain a single E2E test file that grows with the implementation. This test will represent the full user journey.
2.  **TDD Workflow:** For *every* piece of functionality, the workflow is:
    a.  **Add Test Step:** Add a specific assertion or action to the E2E test that represents the next required piece of functionality.
    b.  **Run & Verify Failure:** Execute the test suite (using `npx ava --serial`) and confirm that the *new* test step fails for the expected reason.
    c.  **Implement:** Write the minimum amount of application code required to make the failing test step pass.
    d.  **Run & Verify Success:** Execute the test suite again (using `npx ava --serial`) and confirm that all test steps now pass.
    e.  **Refactor (Optional):** Refactor the implementation code or test code while keeping the tests green.
3.  **Incremental Build:** Functionality will be built incrementally, driven directly by the failing test steps.
4.  **Core Module First:** We will focus on developing and testing the `core` module first, using the E2E test to simulate interactions that will later come from the `discord-adapter`.

---

## Phase 1: Test Environment Setup & Core Git Interaction

**Goal:** Establish a reliable testing environment using Docker Compose and verify basic Git functionality (cloning via SSH) using a JavaScript module.

**E2E Test File:** `tests/e2e.test.js` (to be created)

### Step 1.1: Docker Compose Test Environment Setup

*   **Action:** Define `docker-compose.test.yml` with two services:
    *   `git-server`:
        *   Builds from `Dockerfile.git-server`.
        *   Copies `tests/fixtures/git-repo` into the container.
        *   Sets up an SSH server configured to serve the copied repo.
        *   Uses SSH keys from `tests/fixtures/ssh/`.
        *   Ensures the repo state is reset on every container start.
    *   `test-runner`:
        *   Builds from `Dockerfile.test`.
        *   Mounts the project root directory.
        *   Has Node.js and `npm` installed.
        *   Configured to use the SSH key (`tests/fixtures/ssh/id_test`) to connect to `git-server`.
*   **Verification:** Manually run `docker-compose -f docker-compose.test.yml up --build` and confirm both containers start without errors. Manually verify SSH connectivity from `test-runner` to `git-server`.

### Step 1.2: Initial E2E Test - Git Clone via SSH

*   **Test Addition (`tests/e2e.test.js`):**
    *   Add an Ava test case (`test('should clone remote repository via SSH')`).
    *   Inside the test:
        *   Define the SSH URL for the `git-server` (e.g., `ssh://git@git-server/repo.git`).
        *   Define a temporary local path within the `test-runner` container for the clone.
        *   Use a (yet-to-be-created) JavaScript Git module function (e.g., `gitService.cloneRepo(repoUrl, localPath)`) to perform the clone.
        *   Assert that the clone operation completes without throwing errors.
*   **Run & Verify Failure:**
    *   Execute the test (e.g., via `docker-compose -f docker-compose.test.yml run test-runner npm test`).
    *   **Expected Failure:** Test fails because the `gitService` or `cloneRepo` function doesn't exist yet.
*   **Implementation (`lib/git-service.js`):**
    *   Create `lib/git-service.js`.
    *   Install `simple-git`: `docker-compose -f docker-compose.test.yml run test-runner npm install simple-git@latest`.
    *   Implement the `cloneRepo` function using `simple-git`. It should take the repository URL and local path as arguments. Ensure it configures `simple-git` to use the correct SSH key (`tests/fixtures/ssh/id_test`).
    *   Create an index file (`lib/index.js` or similar) to export the `gitService`.
    *   Update the E2E test to import the `gitService`.
*   **Run & Verify Success:**
    *   Execute the test again (`docker-compose -f docker-compose.test.yml run test-runner npm test`).
    *   **Expected Success:** The test passes, indicating the repository was cloned.

### Step 1.3: Verify Cloned Files

*   **Test Addition (`tests/e2e.test.js`):**
    *   Add assertions to the *existing* `should clone remote repository via SSH` test case *after* the successful clone.
    *   Use Node.js `fs` module functions (e.g., `fs.readdirSync`, `fs.readFileSync`) to:
        *   List the contents of the cloned directory.
        *   Assert that the expected files (`README.md`, `file1.txt`, `src/index.js`) exist.
        *   Optionally, read the content of a file (e.g., `README.md`) and assert its content matches the fixture.
*   **Run & Verify Failure:**
    *   Execute the test.
    *   **Expected Failure:** Assertions fail because the file checks haven't been implemented correctly or the clone didn't pull the files as expected (though the clone *operation* succeeded in Step 1.2). *Initially, this might pass if the clone worked perfectly, but we add the explicit checks.* If it passes immediately, we proceed.
*   **Implementation:**
    *   Ensure the `cloneRepo` function correctly clones the repo content.
    *   Refine the test assertions using `fs` to accurately check for the presence and/or content of the files from `tests/fixtures/git-repo`.
*   **Run & Verify Success:**
    *   Execute the test again.
    *   **Expected Success:** The test passes, confirming the repository is cloned correctly and the expected files are present.

---

## Phase 2: Core Startup Git Workflow (Branch Management)

*(Details to be added following the TDD pattern after Phase 1 is complete)*

**Goal:** Implement and test the Git startup workflow defined in `SPEC_v0.1.md#2.4`, including branch checkout, pulling, and creation.

*   Step 2.1: Test checkout of `STARTING_BRANCH`.
*   Step 2.2: Test pulling `STARTING_BRANCH`.
*   Step 2.3: Test creation of `WORKING_BRANCH` if it doesn't exist.
*   Step 2.4: Test checkout of existing remote `WORKING_BRANCH`.
*   Step 2.5: Test hard reset of existing local `WORKING_BRANCH` to remote state.
*   Step 2.6: Test keeping local `WORKING_BRANCH` if remote doesn't exist.

---

## Phase 3: Aider Integration & Basic Interaction

*(Details to be added following the TDD pattern)*

**Goal:** Integrate `@dguttman/aider-js` and test sending a message and receiving a plain text response.

*   Step 3.1: Test initializing the `core` module, which should initialize Aider.
*   Step 3.2: Test sending a simple message to the `core` module's `handleIncomingMessage`.
*   Step 3.3: Test receiving and verifying a plain text response from Aider via the `core` module.

---

## Phase 4: Context Management Commands

*(Details to be added following the TDD pattern)*

**Goal:** Implement and test the `/add`, `/remove`, and `/clear` context commands via the `core` module's API.

*   Step 4.1: Test `/add <file>` command.
*   Step 4.2: Test `/add <directory>` command.
*   Step 4.3: Test `/add <path>` with `read-only`.
*   Step 4.4: Test `/remove <path>` command.
*   Step 4.5: Test `/clear` command.
*   Step 4.6: Verify context changes affect subsequent Aider interactions.

---

## Phase 5: Model Configuration Command

*(Details to be added following the TDD pattern)*

**Goal:** Implement and test the `/model` command via the `core` module's API.

*   Step 5.1: Test setting the model using `setModel`.
*   Step 5.2: Verify the model change affects subsequent Aider interactions (may require proxy setup or specific test model).

---

## Phase 6: Git Push Functionality

*(Details to be added following the TDD pattern)*

**Goal:** Implement and test the ability to push changes from the `WORKING_BRANCH` to the remote origin.

*   Step 6.1: Test making a change via Aider (requires a test that modifies a file).
*   Step 6.2: Test the `pushChanges` function in the `core` module.
*   Step 6.3: Verify changes are pushed to the `git-server`.

---

## Phase 7: Discord Adapter Implementation

*(Details to be added)*

**Goal:** Build the `discord-adapter` to connect the tested `core` module functionality to Discord. Testing for this phase will likely involve mocking the `core` module and `discord.js`.

*   Step 7.1: Basic bot connection and ready event.
*   Step 7.2: Mention detection and thread creation.
*   Step 7.3: Message forwarding to `core.handleIncomingMessage`.
*   Step 7.4: Relaying `core` responses (text) to Discord thread.
*   Step 7.5: Handling file/diff responses as attachments.
*   Step 7.6: Implementing slash commands (`/model`, `/add`, `/remove`, `/clear`) calling the `core` API.
*   Step 7.7: Implementing access control (`GUILD_ID`, `ROLE_ID`).
*   Step 7.8: Implementing the "push changes" user command.

--- 