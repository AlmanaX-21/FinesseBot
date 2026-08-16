export interface RoleRule {
  name: string;
  roleId?: string | null;
  messageCount?: number | null;
  timeInServerDays?: number | null;
}

export interface BotConfig {
  checkIntervalMinutes: number;
  roles: RoleRule[];
}

export interface MemberStats {
  messageCount: number;
  lastActiveTimestamp: number;
}

export interface MemberEvaluation {
  userId: string;
  guildId: string;
  messageCount: number;
  daysInServer: number;
  eligibleRoles: RoleRule[];
  nextRoles: RoleProgress[];
}

export interface RoleProgress {
  rule: RoleRule;
  missingMessages: number;
  missingDays: number;
}
