import {
  Client,
  Events,
  GatewayIntentBits,
  AttachmentBuilder,
  SlashCommandBuilder,
  EmbedBuilder,
} from './discord/index.js'; // unified import via wrapper

import debug from 'debug';
import fs from 'fs/promises';
import path from 'path';
import { coreService } from './core.js';
import { splitMessage } from './utils.js';
import config from './config.js';
import MarkdownIt from 'markdown-it';

const log = debug('vibemob:discord');
const logError = debug('vibemob:discord:error');
logError.log = console.error.bind(console);
const logVerbose = debug('vibemob:discord:verbose');
const logWarn = debug('vibemob:discord:warn');

// --- Global variable for logging channel ---
let loggingChannel = null;
// --- END ---

// Environment Variables --> Use config now
const BOT_TOKEN = config.discordBotToken;
if (!BOT_TOKEN) {
  console.error('FATAL: DISCORD_BOT_TOKEN is missing or empty in config. Cannot start.');
  process.exit(1);
}

// Guild & role restrictions
const ALLOWED_GUILD_ID = config.discordGuildId;
const REQUIRED_ROLE_ID = config.discordRoleId;

// Constants for Discord Adapter
const THREAD_AUTO_ARCHIVE_DURATION = 60; // Minutes
const THREAD_NAME_PREFIX = 'Aider task for';

// Create a new client instance
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// When the client is ready
client.once(Events.ClientReady, async (c) => {
  log(`Ready! Logged in as ${c.user.tag}`);

  // --- Fetch logging channel ---
  const loggingChannelId = config.discordLoggingChannelId;
  if (loggingChannelId) {
    try {
      loggingChannel = await c.channels.fetch(loggingChannelId);
      if (loggingChannel && (loggingChannel.isTextBased() || loggingChannel.isThread())) {
        log(`Logging channel fetched: #${loggingChannel.name} (${loggingChannel.id})`);
        await sendLog('info', 'Bot restarted and logging initialized.');
      } else {
        logError(`Logging channel ID ${loggingChannelId} is not a text channel.`);
        loggingChannel = null;
      }
    } catch (err) {
      logError(`Error fetching logging channel (${loggingChannelId}):`, err);
      loggingChannel = null;
    }
  } else {
    log('No LOGGING_CHANNEL_ID configured.');
  }
});

// --- Embed constants ---
const MAX_EMBED_DESCRIPTION_LENGTH = 4096;
const MAX_TOTAL_EMBED_LENGTH = 6000;

// Helper functions -----------------------------------------------------------

async function _relayCoreResponse(channel, coreResponse, userId) {
  log(`Relaying core response (len ${coreResponse?.length}) to ${channel.id}`);
  if (!coreResponse || coreResponse.trim().length === 0) {
    await channel.send('Received empty response from core service.');
    return;
  }

  try {
    const diffRegex = /([\s\S]*?)^<<<<<<< SEARCH[\s\S]*?=======[\s\S]*?>>>>>>> REPLACE\s*$/gm;
    let lastIndex = 0;
    let match;
    let normalContent = '';
    const filesToSend = [];

    while ((match = diffRegex.exec(coreResponse)) !== null) {
      normalContent += coreResponse.substring(lastIndex, match.index);

      const precedingText = coreResponse.substring(0, match.index);
      const linesBeforeDiff = precedingText.split('\n').filter((l) => l.trim() !== '');
      const fileNameGuess =
        linesBeforeDiff.length > 0 ? linesBeforeDiff[linesBeforeDiff.length - 1].trim() : 'aider_change.diff';
      const safeFileName = fileNameGuess.replace(/[^a-zA-Z0-9_.-]/g, '_') || 'aider_change.diff';
      const diffFileName = safeFileName.endsWith('.diff') ? safeFileName : `${safeFileName}.diff`;

      const diffBlockContent = match[0].slice(match[1].length);
      const diffBuffer = Buffer.from(diffBlockContent, 'utf-8');
      filesToSend.push(new AttachmentBuilder(diffBuffer, { name: diffFileName }));
      lastIndex = diffRegex.lastIndex;
    }
    normalContent += coreResponse.substring(lastIndex);
    normalContent = normalContent.trim();

    // Markdown embed attempt
    let sentAsEmbed = false;
    if (normalContent.length > 0 && containsMarkdownStructure(normalContent)) {
      try {
        const md = new MarkdownIt();
        const tokens = md.parse(normalContent, {});
        const embeds = buildEmbedsFromTokens(tokens);
        if (embeds?.length) {
          for (const embed of embeds) await channel.send({ embeds: [embed] });
          sentAsEmbed = true;
        }
      } catch (markdownError) {
        logError('Markdown embed error:', markdownError);
      }
    }

    if (!sentAsEmbed && normalContent.length > 0) {
      for (const chunk of splitMessage(normalContent)) await channel.send(chunk);
    }

    if (filesToSend.length) {
      for (let i = 0; i < filesToSend.length; i += 10) {
        await channel.send({ files: filesToSend.slice(i, i + 10) });
      }
    }
  } catch (error) {
    await sendLog('error', 'Error relaying core response', error);
    await channel.send(`Error displaying response: ${error.message}`);
  }
}

function containsMarkdownStructure(content) {
  const hasHeadings = /^#{1,6}\s+/m.test(content);
  const hasLists = /^\s*[-*+]\s+/m.test(content) || /^\s*\d+\.\s+/m.test(content);
  const isJustCode = content.trim().startsWith('```') && content.trim().endsWith('```') && (content.match(/```/g) || []).length === 2;
  return !isJustCode && (hasHeadings || hasLists);
}

function buildEmbedsFromTokens(tokens) {
  const embeds = [];
  let currentEmbed = new EmbedBuilder();
  let currentDescription = '';
  let totalLength = 0;

  const finalize = (nextLen = 0) => {
    if (
      currentDescription.length &&
      (currentDescription.length + nextLen > MAX_EMBED_DESCRIPTION_LENGTH || totalLength + nextLen > MAX_TOTAL_EMBED_LENGTH)
    ) {
      currentEmbed.setDescription(currentDescription.trim());
      embeds.push(currentEmbed);
      currentEmbed = new EmbedBuilder();
      currentDescription = '';
      totalLength = 0;
    }
  };

  try {
    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i];
      switch (t.type) {
        case 'heading_open': {
          finalize();
          const lvl = parseInt(t.tag.substring(1), 10);
          const next = tokens[i + 1];
          const text = next && next.type === 'inline' ? next.content.trim() : '';
          if (lvl === 1 && !currentEmbed.data.title && text.length <= 256) {
            currentEmbed.setTitle(text);
            totalLength += text.length;
          } else {
            const seg = `\n**${text}**\n`;
            finalize(seg.length);
            currentDescription += seg;
            totalLength += seg.length;
          }
          // skip to close
          while (tokens[++i] && tokens[i].type !== 'heading_close');
          break;
        }
        case 'paragraph_open': {
          let paragraph = '';
          let j = i + 1;
          while (j < tokens.length && tokens[j].type !== 'paragraph_close') {
            const inTok = tokens[j];
            if (inTok.type === 'inline') paragraph += processInlineToken(inTok);
            else if (inTok.type === 'softbreak' || inTok.type === 'hardbreak') paragraph += '\n';
            j++;
          }
          finalize(paragraph.length + 2);
          currentDescription += paragraph + '\n\n';
          totalLength += paragraph.length + 2;
          i = j;
          break;
        }
        case 'fence': {
          const fence = `\
\`\`\`${t.info || ''}\n${t.content}\n\`\`\`\n`;
          finalize(fence.length);
          currentDescription += fence;
          totalLength += fence.length;
          break;
        }
        default:
          break;
      }
    }
    if (currentDescription.length) {
      currentEmbed.setDescription(currentDescription.trim());
      embeds.push(currentEmbed);
    } else if (currentEmbed.data.title) embeds.push(currentEmbed);
    return embeds.length ? embeds : null;
  } catch (err) {
    logError('Markdown token error:', err);
    return null;
  }
}

function processInlineToken(token) {
  if (!token.children?.length) return token.content;
  let text = '';
  token.children.forEach((c) => {
    switch (c.type) {
      case 'text':
        text += c.content;
        break;
      case 'code_inline':
        text += '`' + c.content + '`';
        break;
      case 'strong_open':
      case 'strong_close':
        text += '**';
        break;
      case 'em_open':
      case 'em_close':
        text += '*';
        break;
      case 'link_open':
        text += '[';
        break;
      case 'link_close': {
        const open = token.children.find((t) => t.type === 'link_open');
        text += `](${open?.attrGet('href') || ''})`;
        break;
      }
      case 'softbreak':
      case 'hardbreak':
        text += '\n';
        break;
      default:
        text += c.content || '';
    }
  });
  return text;
}

// Thread & mention handlers --------------------------------------------------

async function _handleThreadMessage(message) {
  const thread = message.channel;
  const userId = message.author.id;
  const prompt = message.content;
  try {
    await thread.sendTyping();
    const coreResponse = await coreService.handleIncomingMessage({ message: prompt, userId });
    await _relayCoreResponse(thread, coreResponse, userId);
  } catch (err) {
    await sendLog('error', 'Thread processing error', err);
    await thread.send(`Error: ${err.message}`);
  }
}

async function _handleInitialMention(message) {
  if (ALLOWED_GUILD_ID && message.guildId !== ALLOWED_GUILD_ID) return;

  if (REQUIRED_ROLE_ID) {
    const member = message.member ?? (await message.guild.members.fetch(message.author.id));
    if (!member.roles.cache.has(REQUIRED_ROLE_ID)) return;
  }

  let thread;
  try {
    thread = await message.startThread({
      name: `${THREAD_NAME_PREFIX} ${message.author.username}`.substring(0, 100),
      autoArchiveDuration: THREAD_AUTO_ARCHIVE_DURATION,
    });
  } catch (err) {
    await sendLog('error', 'Thread create error', err);
    await message.reply("Couldn't create a thread.");
    return;
  }

  try {
    const botMention = message.mentions.users.find((u) => u.id === client.user.id);
    const initialPrompt = botMention ? message.content.replace(`<@${botMention.id}>`, '').replace(`<@!${botMention.id}>`, '').trim() : message.content.trim();
    await thread.send(`Okay, ${message.author.username}. Working on: "${initialPrompt}"`);
    await thread.sendTyping();
    const coreResponse = await coreService.handleIncomingMessage({ message: initialPrompt, userId: message.author.id });
    await _relayCoreResponse(thread, coreResponse, message.author.id);
  } catch (err) {
    await sendLog('error', 'Initial prompt error', err);
    await thread.send(`Error: ${err.message}`);
  }
}

// Main message listener ------------------------------------------------------

client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot || !message.guild) return;

  const botWasMentioned = client.user && message.mentions.has(client.user.id);

  if (message.channel.isThread() && message.channel.name.startsWith(THREAD_NAME_PREFIX)) {
    await _handleThreadMessage(message);
  } else if (botWasMentioned) {
    await _handleInitialMention(message);
  }
});

// Command / interaction listener --------------------------------------------

client.on(Events.InteractionCreate, async (interaction) => {
  if (interaction.isAutocomplete()) {
    // Autocomplete handling trimmed for brevity
    return;
  }
  if (!interaction.isChatInputCommand()) return;

  // role / guild gate
  if (ALLOWED_GUILD_ID && interaction.guildId !== ALLOWED_GUILD_ID) {
    await interaction.reply({ content: 'Wrong guild.', ephemeral: true });
    return;
  }
  if (REQUIRED_ROLE_ID) {
    const member = interaction.member ?? (await interaction.guild.members.fetch(interaction.user.id));
    if (!member.roles.cache.has(REQUIRED_ROLE_ID)) {
      await interaction.reply({ content: 'Missing role.', ephemeral: true });
      return;
    }
  }

  const { commandName } = interaction;
  const userId = interaction.user.id;
  try {
    if (commandName === 'model') {
      const modelName = interaction.options.getString('model_name', true);
      await interaction.deferReply({ ephemeral: true });
      const result = await coreService.setModel({ userId, modelName });
      await interaction.editReply(`Model set to \`${result.modelName}\``);
    } else if (commandName === 'add') {
      const pathToAdd = interaction.options.getString('path', true);
      await interaction.deferReply({ ephemeral: true });
      const res = await coreService.handleIncomingMessage({ message: `/add ${pathToAdd}`, userId });
      await interaction.editReply(res);
    } else if (commandName === 'remove') {
      const pathToRemove = interaction.options.getString('path', true);
      await interaction.deferReply({ ephemeral: true });
      const res = await coreService.handleIncomingMessage({ message: `/remove ${pathToRemove}`, userId });
      await interaction.editReply(res);
    } else if (commandName === 'clear') {
      await interaction.deferReply({ ephemeral: true });
      const res = await coreService.handleIncomingMessage({ message: '/clear', userId });
      await interaction.editReply(res);
    } else if (commandName === 'context') {
      await interaction.deferReply({ ephemeral: true });
      const contextFiles = await coreService.getContextFiles({ userId });
      if (!contextFiles.length) {
        await interaction.editReply('The chat context is empty.');
      } else {
        const list = contextFiles.map((f) => `- \`${f.path}\` ${f.readOnly ? '(read-only)' : ''}`).join('\n');
        if (list.length > 2000) {
          await interaction.editReply('Context list too long.');
        } else {
          await interaction.editReply(`**Current Context:**\n${list}`);
        }
      }
    } else {
      await interaction.reply({ content: `Unknown command '/${commandName}'.`, ephemeral: true });
    }
  } catch (err) {
    await sendLog('error', `Command ${commandName} error`, err);
    const msg = `Error processing '/${commandName}': ${err.message}`;
    if (interaction.deferred || interaction.replied) await interaction.editReply(msg);
    else await interaction.reply({ content: msg, ephemeral: true });
  }
});

// Login ----------------------------------------------------------------------

async function start() {
  try {
    log('Logging in to Discord...');
    await client.login(BOT_TOKEN);
    log('Logged in.');
  } catch (err) {
    logError('Login failed:', err);
    process.exit(1);
  }
}

export const discordAdapter = { start, client };

if (import.meta.url === `file://${process.argv[1]}`) start();

// Centralized logging ---------------------------------------------------------
async function sendLog(level, message, error = null) {
  const consoleArgs = [message];
  if (error) consoleArgs.push(error);
  switch (level) {
    case 'error':
      logError(...consoleArgs);
      break;
    case 'warn':
      logWarn(...consoleArgs);
      break;
    default:
      log(...consoleArgs);
  }
  let discordMessage = `[${level.toUpperCase()}] ${message}`;
  if (error) {
    const errStr = error instanceof Error ? error.stack || error.message : String(error);
    discordMessage += `\n\
\`\`\`${errStr.slice(0, 1500)}\n\`\`\``;
  }
  if (loggingChannel?.isTextBased()) {
    for (const chunk of splitMessage(discordMessage, 2000)) {
      await loggingChannel.send(chunk).catch((e) => logError('Failed to send log chunk:', e));
    }
  }
}

// Recursive file list for autocomplete --------------------------------------
async function listFilesRecursive(dirPath, currentRelativePath = '') {
  let results = [];
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue;
      const full = path.join(dirPath, entry.name);
      const rel = path.join(currentRelativePath, entry.name);
      results.push(rel);
      if (entry.isDirectory()) {
        results = results.concat(await listFilesRecursive(full, rel));
      }
    }
  } catch (err) {
    logError('listFilesRecursive error:', err);
  }
  return results;
}
