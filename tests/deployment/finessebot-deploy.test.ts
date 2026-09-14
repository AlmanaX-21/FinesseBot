import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const bash = process.platform === 'win32' ? 'C:\\Program Files\\Git\\bin\\bash.exe' : 'bash';
const deployScript = resolve('ops/finessebot-deploy');
const revision = 'a'.repeat(40);

function bashPath(path: string): string {
  if (process.platform !== 'win32') return path;
  return path.replace(/^([A-Za-z]):/, (_, drive: string) => `/${drive.toLowerCase()}`).replaceAll('\\', '/');
}

function writeExecutable(path: string, contents: string): void {
  writeFileSync(path, contents, 'utf8');
  chmodSync(path, 0o755);
}

function makeArchive(directory: string): Buffer {
  const source = join(directory, 'source');
  mkdirSync(join(source, 'src'), { recursive: true });
  writeFileSync(join(source, 'package.json'), '{"scripts":{"build":"tsc"}}');
  writeFileSync(join(source, 'package-lock.json'), '{}');
  writeFileSync(join(source, 'src', 'index.ts'), 'export {};');

  const result = spawnSync(bash, ['-lc', `tar -czf - -C '${bashPath(source)}' .`]);
  assert.equal(result.status, 0, result.stderr.toString());
  return result.stdout;
}

function makeCommands(directory: string): string {
  const bin = join(directory, 'bin');
  mkdirSync(bin);
  writeExecutable(
    join(bin, 'runuser'),
    '#!/usr/bin/env bash\nwhile [[ "$1" != "--" ]]; do shift; done\nshift\nexec "$@"\n'
  );
  writeExecutable(
    join(bin, 'npm'),
    '#!/usr/bin/env bash\nwhile (($#)); do\n  if [[ "$1" == "--prefix" ]]; then release="$2"; shift 2; else shift; fi\ndone\nmkdir -p "$release/dist"\nprintf "built\\n" > "$release/dist/index.js"\n'
  );
  writeExecutable(
    join(bin, 'systemctl'),
    '#!/usr/bin/env bash\nprintf "systemctl %s\\n" "$*" >> "$DEPLOY_LOG"\n'
  );
  writeExecutable(
    join(bin, 'curl'),
    '#!/usr/bin/env bash\nprintf "curl %s\\n" "$*" >> "$DEPLOY_LOG"\n[[ "${FAIL_HEALTH:-0}" != "1" ]]\n'
  );
  writeExecutable(join(bin, 'chown'), '#!/usr/bin/env bash\nexit 0\n');
  writeExecutable(join(bin, 'flock'), '#!/usr/bin/env bash\nexit 0\n');
  return bin;
}

function runDeploy(
  root: string,
  bin: string,
  archive: Buffer,
  runId: string,
  failHealth = false
) {
  const command = `export PATH='${bashPath(bin)}':"$PATH"; exec '${bashPath(deployScript)}'`;

  return spawnSync(bash, ['-c', command], {
    input: archive,
    env: {
      ...process.env,
      SSH_ORIGINAL_COMMAND: `deploy ${revision} ${runId} 1`,
      FINESSEBOT_ROOT: bashPath(root),
      DEPLOY_LOG: `${bashPath(root)}.log`,
      FAIL_HEALTH: failHealth ? '1' : '0',
      MSYS: 'winsymlinks:nativestrict'
    }
  });
}

test('deploys a release without changing persistent data', () => {
  const directory = mkdtempSync(join(tmpdir(), 'finessebot-deploy-'));
  const root = join(directory, 'opt', 'finessebot');
  const persistent = join(directory, 'var', 'lib', 'finessebot', 'stats.json');
  mkdirSync(join(root, 'current'), { recursive: true });
  mkdirSync(resolve(persistent, '..'), { recursive: true });
  writeFileSync(join(root, 'current', 'old.txt'), 'old release');
  writeFileSync(persistent, 'message counts');

  try {
    const result = runDeploy(root, makeCommands(directory), makeArchive(directory), '1001');

    assert.equal(result.status, 0, result.stderr.toString());
    assert.equal(lstatSync(join(root, 'current')).isSymbolicLink(), true);
    assert.equal(existsSync(join(realpathSync(join(root, 'current')), 'dist', 'index.js')), true);
    assert.equal(readFileSync(persistent, 'utf8'), 'message counts');
    assert.match(readFileSync(`${root}.log`, 'utf8'), /systemctl restart finessebot/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('restores the previous release when health verification fails', () => {
  const directory = mkdtempSync(join(tmpdir(), 'finessebot-rollback-'));
  const root = join(directory, 'opt', 'finessebot');
  mkdirSync(join(root, 'current'), { recursive: true });

  try {
    const bin = makeCommands(directory);
    const archive = makeArchive(directory);
    const first = runDeploy(root, bin, archive, '2001');
    assert.equal(first.status, 0, first.stderr.toString());
    const previous = realpathSync(join(root, 'current'));

    const failed = runDeploy(root, bin, archive, '2002', true);

    assert.notEqual(failed.status, 0);
    assert.equal(realpathSync(join(root, 'current')), previous);
    assert.equal(existsSync(join(root, 'releases', `${revision}-2002-1`)), false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
