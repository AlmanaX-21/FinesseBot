import { Guild, GuildMember, Role } from 'discord.js';
import { RoleRule } from './types.js';
import { evaluateMember } from './evaluator.js';
import { MemberStore } from './database.js';

export function findGuildRole(guild: Guild, rule: RoleRule): Role | undefined {
  if (rule.roleId) {
    const role = guild.roles.cache.get(rule.roleId);
    if (role) return role;
  }
  const normalized = rule.name.toLowerCase().trim();
  return guild.roles.cache.find(r => r.name.toLowerCase().trim() === normalized);
}

export async function syncMemberRoles(
  member: GuildMember,
  rules: RoleRule[],
  messageCount: number
): Promise<{ added: string[]; failed: string[] }> {
  if (member.user.bot || !member.joinedTimestamp) {
    return { added: [], failed: [] };
  }

  const evaluation = evaluateMember(
    member.id,
    member.guild.id,
    messageCount,
    member.joinedTimestamp,
    rules
  );

  const added: string[] = [];
  const failed: string[] = [];

  for (const rule of evaluation.eligibleRoles) {
    const role = findGuildRole(member.guild, rule);
    if (!role || member.roles.cache.has(role.id)) {
      continue;
    }

    try {
      await member.roles.add(role, 'Automated threshold reached');
      added.push(role.name);
    } catch (err) {
      console.warn(`[Assigner] Failed to add "${role.name}" to "${member.user.tag}":`, err instanceof Error ? err.message : err);
      failed.push(role.name);
    }
  }

  return { added, failed };
}

export async function syncGuildRoles(
  guild: Guild,
  rules: RoleRule[],
  store: MemberStore
): Promise<{ processed: number; rolesAssigned: number }> {
  let members;
  try {
    members = await guild.members.fetch();
  } catch (err) {
    console.error(`[Assigner] Failed to fetch guild members for "${guild.name}":`, err);
    return { processed: 0, rolesAssigned: 0 };
  }

  let rolesAssigned = 0;
  let processed = 0;

  for (const [, member] of members) {
    if (member.user.bot || !member.joinedTimestamp) {
      continue;
    }

    const stats = store.getStats(guild.id, member.id);
    const result = await syncMemberRoles(member, rules, stats.messageCount);
    rolesAssigned += result.added.length;
    processed += 1;

    if (result.added.length > 0) {
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  }

  return { processed, rolesAssigned };
}
