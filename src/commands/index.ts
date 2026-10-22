import { checkCommand } from './check.js';
import { syncCommand } from './sync.js';
import { finesseCommand } from './finesse.js';
import { setupClaimCommand } from './setup-claim.js';
import { pingCommand } from './ping.js';
import { networkCommand } from './network.js';

export const commands = [checkCommand, syncCommand, finesseCommand, setupClaimCommand, pingCommand, networkCommand];
export { checkCommand, syncCommand, finesseCommand, setupClaimCommand, pingCommand, networkCommand };
