import test from 'node:test';
import assert from 'node:assert/strict';
import { createCrashTracker } from '../../src/crashes/watcher.js';
import { Crash } from '../../src/crashes/types.js';

const daemon = (text: string) => `\u001b[33m\u001b[1m[Pterodactyl Daemon]:\u001b[39m ${text}\u001b[0m`;

test('crash tracker', async (t) => {
  await t.test('reports a crash with exit code and memory details', () => {
    const crashes: Crash[] = [];
    const track = createCrashTracker(crash => crashes.push(crash));

    track('[12:00:00] [Server thread/INFO]: Saving chunks');
    track(daemon('---------- Detected server process in a crashed state! ----------'));
    track(daemon('Exit code: 137'));
    track(daemon('Out of memory: true'));

    assert.equal(crashes.length, 1);
    assert.equal(crashes[0].exitCode, '137');
    assert.equal(crashes[0].outOfMemory, 'true');
  });

  await t.test('reports a crash when auto restart is turned off', () => {
    const crashes: Crash[] = [];
    const track = createCrashTracker(crash => crashes.push(crash));
    track(daemon('Aborting automatic restart, crash detection is disabled for this instance.'));
    assert.equal(crashes.length, 1);
    assert.equal(crashes[0].exitCode, undefined);
  });

  await t.test('ignores normal console lines', () => {
    const crashes: Crash[] = [];
    const track = createCrashTracker(crash => crashes.push(crash));
    track('[12:00:00] [Server thread/INFO]: Exit code: 0');
    track('[12:00:01] [Server thread/INFO]: Stopping server');
    track(daemon('Aborting automatic restart, last crash occurred less than 60 seconds ago.'));
    assert.equal(crashes.length, 0);
  });

  await t.test('reports each crash separately', () => {
    const crashes: Crash[] = [];
    const track = createCrashTracker(crash => crashes.push(crash));
    track(daemon('Detected server process in a crashed state!'));
    track(daemon('Exit code: 1'));
    track(daemon('Detected server process in a crashed state!'));
    track(daemon('Exit code: 2'));
    assert.deepEqual(crashes.map(crash => crash.exitCode), ['1', '2']);
  });
});
