// lib/discord-double/discord-double.js

// Mock implementation of the discord.js library for testing purposes.
// This needs to replicate the API surface used by lib/discord-adapter.js

const EventEmitter = require('events');

// --- Mock Events --- (Values don't strictly matter, just need to exist)
const Events = {
  ClientReady: 'ready',
  MessageCreate: 'messageCreate',
  InteractionCreate: 'interactionCreate',
};

// --- Mock GatewayIntentBits --- (Values don't strictly matter)
const GatewayIntentBits = {
  Guilds: 1 << 0,
  GuildMembers: 1 << 1,
  GuildBans: 1 << 2,
  GuildEmojisAndStickers: 1 << 3,
  GuildIntegrations: 1 << 4,
  GuildWebhooks: 1 << 5,
  GuildInvites: 1 << 6,
  GuildVoiceStates: 1 << 7,
  GuildPresences: 1 << 8,
  GuildMessages: 1 << 9,
  GuildMessageReactions: 1 << 10,
  GuildMessageTyping: 1 << 11,
  DirectMessages: 1 << 12,
  DirectMessageReactions: 1 << 13,
  DirectMessageTyping: 1 << 14,
  MessageContent: 1 << 15,
  GuildScheduledEvents: 1 << 16,
};

// --- Mock Client --- (Needs more methods/properties based on usage)
class MockClient extends EventEmitter {
  constructor(options) {
    super();
    this.options = options;
    this.user = { id: 'mock-bot-id', tag: 'MockBot#0000' };
    this.channels = {
      cache: new Map(), // Simple cache
      fetch: async (id) => {
        // Basic fetch mock - can be expanded
        if (this.channels.cache.has(id)) {
          return this.channels.cache.get(id);
        }
        // Simulate not found or return a generic mock channel
        // throw new Error(`Mock fetch error: Channel ${id} not found`); 
        console.warn(`MockClient.channels.fetch: Channel ${id} not found in mock cache.`);
        return null; // Or return a generic mock channel object
      }
    };
    this.guilds = {
        cache: new Map(),
        fetch: async (id) => {
          // Basic fetch mock - can be expanded
          if (this.guilds.cache.has(id)) {
            return this.guilds.cache.get(id);
          }
          console.warn(`MockClient.guilds.fetch: Guild ${id} not found in mock cache.`);
          return null;
        }
    };
    this._isReady = false;
    console.log('MockClient instantiated with options:', options);
  }

  login(token) {
    console.log(`MockClient login called with token: ${token ? '***' : 'undefined'}`);
    // Simulate async login and ready event
    process.nextTick(() => {
      this._isReady = true;
      this.emit(Events.ClientReady, this); // Pass client instance to ready event
    });
    return Promise.resolve();
  }

  // Helper to simulate events for testing
  simulateEvent(eventName, ...args) {
    console.log(`Simulating event: ${eventName} with args:`, args);
    this.emit(eventName, ...args);
  }
}

// --- Mock AttachmentBuilder --- (Needs constructor logic if used)
class MockAttachmentBuilder {
  constructor(buffer, options) {
    this.buffer = buffer;
    this.options = options;
    console.log(`MockAttachmentBuilder created with options:`, options);
  }
  // Add methods used by the adapter if any
}

// --- Mock SlashCommandBuilder --- (Needs method chaining)
class MockSlashCommandBuilder {
    constructor() {
        this.commandData = {};
        console.log('MockSlashCommandBuilder created.');
    }
    setName(name) {
        this.commandData.name = name;
        console.log(`MockSlashCommandBuilder.setName: ${name}`);
        return this; // Return this for chaining
    }
    setDescription(description) {
        this.commandData.description = description;
        console.log(`MockSlashCommandBuilder.setDescription: ${description}`);
        return this;
    }
    addStringOption(optionCallback) {
        const option = new MockSlashCommandOption();
        optionCallback(option); // Let the callback configure the mock option
        if (!this.commandData.options) this.commandData.options = [];
        this.commandData.options.push(option.optionData);
        console.log(`MockSlashCommandBuilder.addStringOption called`);
        return this;
    }
    // Add other methods like addIntegerOption, addBooleanOption etc. if needed
}

// Helper for SlashCommandBuilder options
class MockSlashCommandOption {
    constructor() {
        this.optionData = {};
    }
    setName(name) {
        this.optionData.name = name;
        console.log(`MockSlashCommandOption.setName: ${name}`);
        return this;
    }
    setDescription(description) {
        this.optionData.description = description;
        console.log(`MockSlashCommandOption.setDescription: ${description}`);
        return this;
    }
    setRequired(required) {
        this.optionData.required = required;
        console.log(`MockSlashCommandOption.setRequired: ${required}`);
        return this;
    }
}

// --- Mock Structures (Message, Interaction, Channel, etc.) --- 
// These need to be created as needed for tests and passed to simulateEvent
// Example Mock Message:
function createMockMessage(override = {}) {
    const defaults = {
        id: `mock-msg-${Date.now()}`,
        content: '',
        author: { id: 'mock-user-id', tag: 'MockUser#0000', bot: false, username: 'MockUser' },
        channel: createMockTextChannel({ id: 'mock-channel-id' }),
        guild: createMockGuild({ id: 'mock-guild-id' }),
        guildId: 'mock-guild-id',
        member: createMockGuildMember({ id: 'mock-user-id' }),
        mentions: {
            users: new Map(),
            has: (id) => false // Default to false, override in specific tests
        },
        startThread: async (options) => {
            console.log('MockMessage.startThread called with:', options);
            const thread = createMockThreadChannel({ name: options.name, parentId: defaults.channel.id });
            defaults.channel.threads?.cache.set(thread.id, thread); // Add to parent cache if exists
            return thread;
        },
        reply: async (content) => {
            console.log(`MockMessage.reply called with:`, content);
            // Simulate sending a message
            return createMockMessage({ content: typeof content === 'string' ? content : content.content, channel: defaults.channel });
        }
    };
    return { ...defaults, ...override };
}

// Example Mock Interaction (ChatInputCommand):
function createMockChatInputCommandInteraction(override = {}) {
    const defaults = {
        id: `mock-interaction-${Date.now()}`,
        commandName: '',
        user: { id: 'mock-user-id', tag: 'MockUser#0000', username: 'MockUser' },
        channel: createMockTextChannel({ id: 'mock-channel-id' }),
        channelId: 'mock-channel-id',
        guild: createMockGuild({ id: 'mock-guild-id' }),
        guildId: 'mock-guild-id',
        member: createMockGuildMember({ id: 'mock-user-id' }),
        options: {
            getString: (name, required = false) => null, // Override in tests
            // Add getInteger, getBoolean etc. as needed
        },
        isChatInputCommand: () => true,
        isCommand: () => true, // Generic check
        // Reply methods
        replied: false,
        deferred: false,
        reply: async (options) => {
            console.log(`MockInteraction.reply called with:`, options);
            defaults.replied = true;
            // Return mock message or similar if needed
        },
        deferReply: async (options) => {
            console.log(`MockInteraction.deferReply called with:`, options);
            defaults.deferred = true;
        },
        editReply: async (options) => {
            console.log(`MockInteraction.editReply called with:`, options);
        },
        followUp: async (options) => {
            console.log(`MockInteraction.followUp called with:`, options);
        }
    };
    const interaction = { ...defaults, ...override };
    // Simple mock for options based on provided commandData
    if (override.commandData && override.commandData.options) {
        interaction.options.getString = (name, required = false) => {
            const opt = override.commandData.options.find(o => o.name === name);
            // In a real test, you'd set the actual value here
            return opt ? `mock-value-for-${name}` : null;
        };
    }
    return interaction;
}

// Example Mock Channel (Text Based)
function createMockTextChannel(override = {}) {
    const defaults = {
        id: `mock-channel-${Date.now()}`,
        name: 'mock-channel',
        type: 'GUILD_TEXT', // Use actual type values if needed by logic
        isTextBased: () => true,
        isThread: () => false,
        send: async (content) => {
            console.log(`MockChannel(${defaults.id}).send called with:`, content);
            // In a real test, store sent messages here
            return createMockMessage({ content: typeof content === 'string' ? content : content.content, channel: defaults });
        },
        sendTyping: async () => {
            console.log(`MockChannel(${defaults.id}).sendTyping called.`);
        },
        // Add threads cache for startThread
        threads: {
            cache: new Map(),
            fetch: async (id) => null, // Mock thread fetching if needed
            create: async (options) => null // Mock thread creation if needed
        }
    };
    return { ...defaults, ...override };
}

// Example Mock Thread Channel
function createMockThreadChannel(override = {}) {
    const defaults = {
        id: `mock-thread-${Date.now()}`,
        name: 'mock-thread',
        parentId: 'mock-parent-channel-id',
        type: 'GUILD_PUBLIC_THREAD', // Or private, etc.
        isTextBased: () => true,
        isThread: () => true,
        send: async (content) => {
            console.log(`MockThread(${defaults.id}).send called with:`, content);
            return createMockMessage({ content: typeof content === 'string' ? content : content.content, channel: defaults });
        },
        sendTyping: async () => {
            console.log(`MockThread(${defaults.id}).sendTyping called.`);
        },
    };
    return { ...defaults, ...override };
}

// Example Mock Guild Member
function createMockGuildMember(override = {}) {
    const defaults = {
        id: `mock-member-${Date.now()}`,
        user: { id: override.id || `mock-user-${Date.now()}`, tag: 'MockUser#0000', username: 'MockUser' },
        roles: {
            cache: new Map(), // Map role IDs to mock role objects
            has: (roleId) => {
                console.log(`MockMember.roles.cache.has checking for role: ${roleId}`);
                return defaults.roles.cache.has(roleId);
            }
            // Add other role cache methods if needed (e.g., add, remove)
        },
    };
    // Example: Add a role for testing
    // defaults.roles.cache.set('mock-role-id', { id: 'mock-role-id', name: 'MockRole' });
    return { ...defaults, ...override };
}

// Example Mock Guild
function createMockGuild(override = {}) {
    const defaults = {
        id: `mock-guild-${Date.now()}`,
        name: 'Mock Guild',
        members: {
            cache: new Map(),
            fetch: async (userId) => {
                console.log(`MockGuild.members.fetch called for user: ${userId}`);
                if (defaults.members.cache.has(userId)) {
                    return defaults.members.cache.get(userId);
                }
                // Return a default mock member or null
                return createMockGuildMember({ id: userId });
            }
        },
        channels: {
            cache: new Map(),
            fetch: async (channelId) => {
                console.log(`MockGuild.channels.fetch called for channel: ${channelId}`);
                if (defaults.channels.cache.has(channelId)) {
                    return defaults.channels.cache.get(channelId);
                }
                return null;
            }
        }
    };
    return { ...defaults, ...override };
}


// --- Export Mocks --- 
module.exports = {
  Client: MockClient,
  Events,
  GatewayIntentBits,
  AttachmentBuilder: MockAttachmentBuilder,
  SlashCommandBuilder: MockSlashCommandBuilder,
  // Export mock creators for use in tests
  _createMockMessage: createMockMessage,
  _createMockChatInputCommandInteraction: createMockChatInputCommandInteraction,
  _createMockTextChannel: createMockTextChannel,
  _createMockThreadChannel: createMockThreadChannel,
  _createMockGuildMember: createMockGuildMember,
  _createMockGuild: createMockGuild,
}; 