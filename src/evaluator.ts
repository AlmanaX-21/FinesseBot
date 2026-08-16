import { RoleRule, MemberEvaluation, RoleProgress } from './types.js';

const DAY_MS = 86_400_000;

export function calculateDaysInServer(joinedTimestamp: number, currentTimestamp: number = Date.now()): number {
  if (!joinedTimestamp || joinedTimestamp > currentTimestamp) {
    return 0;
  }
  return Math.floor((currentTimestamp - joinedTimestamp) / DAY_MS);
}

export function isRoleEligible(
  messageCount: number,
  daysInServer: number,
  rule: RoleRule
): boolean {
  const hasMessageReq = typeof rule.messageCount === 'number' && rule.messageCount > 0;
  const hasTimeReq = typeof rule.timeInServerDays === 'number' && rule.timeInServerDays > 0;

  if (!hasMessageReq && !hasTimeReq) {
    return false;
  }

  const messagePass = !hasMessageReq || messageCount >= (rule.messageCount as number);
  const timePass = !hasTimeReq || daysInServer >= (rule.timeInServerDays as number);

  return messagePass && timePass;
}

export function evaluateMember(
  userId: string,
  guildId: string,
  messageCount: number,
  joinedTimestamp: number,
  rules: RoleRule[]
): MemberEvaluation {
  const daysInServer = calculateDaysInServer(joinedTimestamp);
  const eligibleRoles: RoleRule[] = [];
  const nextRoles: RoleProgress[] = [];

  for (const rule of rules) {
    if (isRoleEligible(messageCount, daysInServer, rule)) {
      eligibleRoles.push(rule);
    } else {
      const missingMessages = typeof rule.messageCount === 'number' && rule.messageCount > messageCount
        ? rule.messageCount - messageCount
        : 0;

      const missingDays = typeof rule.timeInServerDays === 'number' && rule.timeInServerDays > daysInServer
        ? rule.timeInServerDays - daysInServer
        : 0;

      nextRoles.push({
        rule,
        missingMessages,
        missingDays
      });
    }
  }

  return {
    userId,
    guildId,
    messageCount,
    daysInServer,
    eligibleRoles,
    nextRoles
  };
}
