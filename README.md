# Vibemob - Aider Discord Bot POC (v0.1)

This project is a Proof-of-Concept Discord bot that integrates with `@dguttman/aider-js`, allowing authorized Discord users to interact with Aider within the context of a specific Git repository.

See `docs/SPEC_v0.1.md` for detailed specifications and `docs/PROJECT.md` for architecture and conventions.

## Core Features

*   **Discord Interaction:** Mention the bot in a configured guild to start an interaction thread.
*   **Aider Bridge:** Forwards messages within the thread to `@dguttman/aider-js` for processing.
*   **Git Workspace:** Operates within a clone of a configured Git repository (`REPO_URL`), managing changes on a dedicated working branch (`WORKING_BRANCH`).
*   **Context Management:** Supports `/add`, `/remove`, and `/clear` slash commands to manage Aider's context.
*   **Model Configuration:** Supports `/model` slash command to change the LLM model (via OpenRouter).
*   **Push Changes:** Can push Aider-generated changes from the `WORKING_BRANCH` to the remote origin on command.
*   **Access Control:** Restricts usage to specific Discord guilds (`DISCORD_GUILD_ID`) and roles (`DISCORD_ROLE_ID`).

## Tech Stack

*   Node.js
*   `discord.js` (Discord API)
*   `@dguttman/aider-js` (Aider Interaction)
*   `simple-git` (Git Operations)
*   `ava` (Testing Framework)
*   `dotenv` (Environment Variables)
*   Docker & Docker Compose (Development, Testing, Deployment)

## Setup & Running

### 1. Prerequisites

*   Node.js (v22 recommended, see `Dockerfile`)
*   Docker & Docker Compose
*   Access to a Git repository via SSH.
*   Discord Bot Token and relevant IDs.
*   OpenRouter API Key (or other LLM provider compatible with `@dguttman/aider-js`).

### 2. Configuration

*   Copy the contents of the `.env.example` snippet (provided in the conversation) into a new file named `.env` in the project root.
*   Fill in the required values:
    *   `DISCORD_BOT_TOKEN`
    *   `DISCORD_BOT_USER_ID`
    *   `AIDER_API_KEY`
    *   `REPO_URL` (SSH format)
    *   `SSH_PRIVATE_KEY_B64` (Base64 encoded SSH private key with access to `REPO_URL`)
*   Optionally, configure other variables like `DISCORD_GUILD_ID`, `DISCORD_ROLE_ID`, `STARTING_BRANCH`, `WORKING_BRANCH`, etc.

### 3. Install Dependencies

```bash
npm install
```

### 4. Running Locally (Development/Production Simulation)

This method uses Docker Compose to build and run the production image locally, mounting your `.env` file.

```bash
npm run start:prod:local
```

The bot should connect to Discord and be ready for interactions.

## Testing

This project uses `ava` for testing, primarily focusing on end-to-end tests run within a Dockerized environment using `docker-compose.test.yml`. This setup includes a dedicated `git-server` container.

Tests rely on `echoproxia` for recording and replaying LLM API interactions.

### Running Tests

1.  **Set up Test Environment:** The test environment requires a Git server and a test runner.
    ```bash
    npm run test:env:up
    ```
2.  **Run Tests (Replay Mode):** Executes tests using pre-recorded LLM interactions (fixtures located in `tests/fixtures/recordings`). This is the default and fastest way to run tests.
    ```bash
    npm test
    # or explicitly: npm run test:replay
    ```
3.  **Run Tests (Record Mode):** *Requires a valid `OPENROUTER_API_KEY` environment variable.* Executes tests and records new LLM interactions, overwriting existing fixtures. Use this when changing LLM prompts or expected interactions.
    ```bash
    export OPENROUTER_API_KEY="your_key_here"
    npm run test:record
    ```
4.  **Tear Down Test Environment:**
    ```bash
    npm run test:env:down
    ```

See `package.json` for other test-related scripts (`test:reset`, `test:container`, `test:env:ssh`, `test:env:exec`). Note that tests *must* be run serially (`ava --serial`), which is handled by the `run-tests.sh` script. 