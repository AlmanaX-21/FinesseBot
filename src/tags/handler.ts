import { Message, PermissionFlagsBits } from 'discord.js';
import {
  listTagNames,
  parseTagInvocation,
  readTag,
  splitDiscordMessage
} from './files.js';

export interface TagHandlerOptions {
  prefix: string;
  tagsPath: string;
  cooldownMs?: number;
}

interface AttentionMentions {
  text: string;
  users: string[];
  roles: string[];
}

const CANNOT_SEND_MESSAGES_TO_USER = 50_007;

function isClosedDmError(error: unknown): boolean {
  return typeof error === 'object'
    && error !== null
    && 'code' in error
    && error.code === CANNOT_SEND_MESSAGES_TO_USER;
}

function isCoolingDown(cooldowns: Map<string, number>, key: string, now: number): boolean {
  for (const [memberKey, expiresAt] of cooldowns) {
    if (expiresAt <= now) cooldowns.delete(memberKey);
  }
  return (cooldowns.get(key) || 0) > now;
}

async function reserveMember(pending: Map<string, Promise<void>>, key: string): Promise<() => void> {
  while (pending.has(key)) {
    await pending.get(key);
  }

  let resolvePending: () => void = () => undefined;
  const current = new Promise<void>(resolve => {
    resolvePending = resolve;
  });
  pending.set(key, current);

  return () => {
    if (pending.get(key) === current) pending.delete(key);
    resolvePending();
  };
}

function collectAttentionMentions(message: Message<true>, content: string): AttentionMentions {
  const users: string[] = [];
  const roles: string[] = [];
  const mentions: string[] = [];
  const seen = new Set<string>();
  const canMentionRoles = message.member?.permissionsIn(message.channel)
    .has(PermissionFlagsBits.MentionEveryone) || false;

  for (const match of content.matchAll(/<@!?(\d+)>|<@&(\d+)>/gu)) {
    const userId = match[1];
    const roleId = match[2];
    const key = userId ? `user:${userId}` : `role:${roleId}`;
    if (seen.has(key) || mentions.length >= 10) continue;

    if (userId && message.mentions.users.has(userId)) {
      users.push(userId);
      mentions.push(`<@${userId}>`);
      seen.add(key);
    } else if (roleId) {
      const role = message.mentions.roles.get(roleId);
      if (role && (role.mentionable || canMentionRoles)) {
        roles.push(roleId);
        mentions.push(`<@&${roleId}>`);
        seen.add(key);
      }
    }
  }

  return { text: mentions.join(' '), users, roles };
}

async function sendTagList(
  message: Message<true>,
  prefix: string,
  tagsPath: string
): Promise<void> {
  const names = await listTagNames(tagsPath);
  const content = names.length === 0
    ? 'No tags are configured yet.'
    : `**Available tags (${names.length})**\n${names.map(name => `${prefix}${name}`).join('\n')}`;

  try {
    for (const chunk of splitDiscordMessage(content)) {
      await message.author.send({ content: chunk, allowedMentions: { parse: [] } });
    }
  } catch (error) {
    if (!isClosedDmError(error)) throw error;
    await message.channel.send({
      content: 'I could not send the tag list. Please enable direct messages and try again.',
      allowedMentions: { parse: [] }
    });
  }
}

async function sendTagResponse(
  message: Message<true>,
  response: string,
  attention: AttentionMentions
): Promise<void> {
  for (const chunk of splitDiscordMessage(response)) {
    await message.channel.send({
      content: chunk,
      allowedMentions: { parse: [], users: [], roles: [] }
    });
  }

  if (attention.text) {
    await message.channel.send({
      content: `**Attention:** ${attention.text}`,
      allowedMentions: {
        parse: [],
        users: attention.users,
        roles: attention.roles
      }
    });
  }
}

export function createTagHandler(options: TagHandlerOptions) {
  const cooldowns = new Map<string, number>();
  const pendingMembers = new Map<string, Promise<void>>();
  const cooldownMs = options.cooldownMs ?? 5_000;

  return async function handleTagMessage(message: Message<true>): Promise<boolean> {
    const invocation = parseTagInvocation(message.content, options.prefix);
    if (!invocation) {
      return false;
    }

    const memberKey = `${message.guildId}:${message.author.id}`;
    const releaseMember = await reserveMember(pendingMembers, memberKey);

    try {
      if (isCoolingDown(cooldowns, memberKey, Date.now())) {
        return true;
      }

      if (invocation.name === 'tag-list') {
        cooldowns.set(memberKey, Date.now() + cooldownMs);
        await sendTagList(message, options.prefix, options.tagsPath);
        return true;
      }

      const response = await readTag(options.tagsPath, invocation.name);
      if (!response) {
        return false;
      }
      cooldowns.set(memberKey, Date.now() + cooldownMs);

      const attention = collectAttentionMentions(message, invocation.arguments);
      await sendTagResponse(message, response, attention);
      return true;
    } finally {
      releaseMember();
    }
  };
}
