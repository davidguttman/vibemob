# Development Plan Checklist: Aider Discord Bot v0.2 Features

*This checklist outlines the development steps for adding new features in v0.2, building upon the v0.1 POC.*

---

## Guiding Principles

*   **Incremental Build:** Build functionality incrementally.
*   **Testing:** Ensure new functionality is covered by tests (either extending existing E2E or adding new focused tests as needed).
*   **Core/Adapter Separation:** Maintain the separation between `core` logic and `discord-adapter` interface logic.
*   **Testing Discord Interaction:** Implement a test double for `discord.js` to enable testing `lib/discord-adapter.js` without connecting to actual Discord services.
    *   Create a `lib/discord-double` directory.
    *   Create `lib/discord-double/index.js`: This file will conditionally export the real `discord.js` library or the test double based on `process.env.NODE_ENV`.
    *   Create `lib/discord-double/discord-double.js`: This file will contain the mock implementation, replicating the necessary `discord.js` API surface used by `lib/discord-adapter.js`. This includes:
        *   A mock `Client` class/object supporting `new Client({ intents })`, `.once(Events.ClientReady, ...)`, `.on(Events.MessageCreate, ...)`, `.on(Events.InteractionCreate, ...)`, `.login(token)`, and a `.user` property.
        *   Mock `Events`, `GatewayIntentBits`, `AttachmentBuilder`, and `SlashCommandBuilder` objects/classes.
        *   Mock structures for `message`, `interaction`, `channel`, `thread`, and `member` objects, providing the methods and properties used in the adapter (e.g., `message.startThread`, `interaction.reply`, `channel.send`, `member.roles.cache.has`).
        *   An internal mechanism (like `EventEmitter`) to simulate Discord events (`MessageCreate`, `InteractionCreate`) for tests.
        *   Methods to retrieve sent messages/interactions for test assertions (e.g., `getSentMessages()`, `clearSentMessages()`).
    *   Modify `lib/discord-adapter.js` to import from `./discord-double/index.js` instead of directly from `discord.js`.

---

## Phase 8: Direct Git Interaction via Discord

**Goal:** Allow users to trigger Git operations directly through Discord commands.

*   [x] **Step 8.1: Implement `/push` Command**
    *   [x] Create a new slash command `/push`.
    *   [x] Connect the command to the existing `core.pushChanges()` function.
    *   [x] Provide feedback to the user in Discord about the push status (success, failure, errors).
*   [ ] **Step 8.2: Review Other Git Commands** (Optional for v0.2, consider for future)
    *   [ ] Evaluate the need for commands like `/git status`, `/git diff`, `/git reset`, etc.

---

## Phase 9: Operational Enhancements

**Goal:** Improve logging and monitoring capabilities.

*   [x] **Step 9.1: Add Configurable Logging Channel**
    *   [x] Define a new environment variable (e.g., `LOGGING_CHANNEL_ID`).
    *   [x] If set, retrieve the channel object during bot startup.
*   [x] **Step 9.2: Send Detailed Logs to Channel**
    *   [x] Implement logic to send important logs (errors, critical events, startup info) to the configured logging channel.
    *   [x] Ensure logs are formatted clearly. Avoid excessive noise.

---

## Phase 10: Enhanced Slash Commands

**Goal:** Improve usability and functionality of existing slash commands and add new ones.

*   [x] **Step 10.1: Implement `/add` Autocomplete**
    *   [x] Fetch file/directory structure from the local repository.
    *   [x] Provide relevant suggestions as the user types the path argument.
*   [x] **Step 10.2: Implement `/remove` Autocomplete**
    *   [x] Fetch the current context list from the `core` module.
    *   [x] Provide suggestions based on items currently in the context.
*   [x] **Step 10.3: Implement `/model` Autocomplete**
    *   [x] Integrate logic to fetch available models (e.g., via `aider-js` or OpenRouter API).
    *   [x] Provide model name suggestions for the `/model` command.
    *   NOTE: Currently implemented using a static list in `lib/config.js`. Future enhancement: dynamically query API.
*   [x] **Step 10.4: Implement `/context` Command**
    *   [x] Create a new slash command `/context`.
    *   [x] Fetch the current context list from the `core` module.
    *   [x] Display the context list (files/directories, read-only status) to the user in the Discord channel.

---

## Phase 11: Improved Output Formatting

**Goal:** Make the bot's responses clearer and more readable in Discord.

*   [x] **Step 11.1: Syntax Highlighting for Code Blocks**
    *   [x] Detect code blocks (e.g., ```lang ... ```) in Aider's responses.
    *   [x] Format them using Discord's markdown for syntax highlighting (e.g., ```js ... ```, ```diff ... ```, ```py ... ```).
    *   NOTE: Relies on existing `lib/utils.js#splitMessage` logic and assumes `aider-js` provides language identifiers.
*   [ ] **Step 11.2: Markdown Rendering via Embeds**
    *   [ ] Detect markdown content in Aider's responses.
    *   [ ] Use Discord embeds to render the markdown for better formatting (headings, lists, links, etc.).
*   [ ] **Step 11.3: Send Full Files as Attachments**
    *   [ ] Detect when Aider's response represents a full file's content.
    *   [ ] Send the full content as a file attachment instead of (or in addition to) a message block.
    *   [ ] Consider adding a user command (e.g., `/show <file>`) to request a file view.

---

**v0.2 Development Underway...** 