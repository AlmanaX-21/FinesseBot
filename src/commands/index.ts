import { checkCommand } from './check.js';
import { syncCommand } from './sync.js';
import { finesseCommand } from './finesse.js';
import { setupClaimCommand } from './setup-claim.js';
import { pingCommand } from './ping.js';

export const commands = [checkCommand, syncCommand, finesseCommand, setupClaimCommand, pingCommand];
export { checkCommand, syncCommand, finesseCommand, setupClaimCommand, pingCommand };
