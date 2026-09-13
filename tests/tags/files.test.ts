import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  getTagsPath,
  listTagNames,
  parseTagInvocation,
  readTag,
  splitDiscordMessage
} from '../../src/tags/files.js';

test('parseTagInvocation matches the first token case-insensitively', () => {
  assert.deepEqual(
    parseTagInvocation('  !Question extra words <@123>  ', '!'),
    { name: 'question', arguments: 'extra words <@123>' }
  );
  assert.equal(parseTagInvocation('hello !question', '!'), null);
  assert.equal(parseTagInvocation('!', '!'), null);
  assert.equal(parseTagInvocation('!bad_name', '!'), null);
});

test('getTagsPath resolves configured and environment paths', () => {
  const originalTagsPath = process.env.TAGS_PATH;
  process.env.TAGS_PATH = './custom-tags';

  assert.equal(getTagsPath(), join(process.cwd(), 'custom-tags'));
  assert.equal(getTagsPath('./other-tags'), join(process.cwd(), 'other-tags'));

  if (originalTagsPath === undefined) {
    delete process.env.TAGS_PATH;
  } else {
    process.env.TAGS_PATH = originalTagsPath;
  }
});

test('readTag reflects file changes and enforces the response limit', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'finesse-tags-'));

  try {
    await writeFile(join(directory, 'question.md'), 'First answer\n', 'utf-8');
    assert.equal(await readTag(directory, 'question'), 'First answer');

    await writeFile(join(directory, 'question.md'), 'Updated answer', 'utf-8');
    assert.equal(await readTag(directory, 'question'), 'Updated answer');

    await writeFile(join(directory, 'empty.md'), '  \n', 'utf-8');
    assert.equal(await readTag(directory, 'empty'), null);
    assert.equal(await readTag(directory, 'missing'), null);

    await writeFile(join(directory, 'long.md'), 'x'.repeat(8_001), 'utf-8');
    await assert.rejects(readTag(directory, 'long'), /8,000 characters/u);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('listTagNames returns sorted usable root Markdown files', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'finesse-tags-list-'));

  try {
    await Promise.all([
      writeFile(join(directory, 'zeta.md'), 'Zeta', 'utf-8'),
      writeFile(join(directory, 'alpha.md'), 'Alpha', 'utf-8'),
      writeFile(join(directory, 'Beta.md'), 'Uppercase', 'utf-8'),
      writeFile(join(directory, 'bad_name.md'), 'Invalid', 'utf-8'),
      writeFile(join(directory, 'tag-list.md'), 'Reserved', 'utf-8'),
      writeFile(join(directory, 'empty.md'), '', 'utf-8'),
      writeFile(join(directory, 'notes.txt'), 'Ignored', 'utf-8')
    ]);
    await mkdir(join(directory, 'nested'));
    await writeFile(join(directory, 'nested', 'child.md'), 'Nested', 'utf-8');

    assert.deepEqual(await listTagNames(directory), ['alpha', 'zeta']);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('listTagNames treats a missing directory as empty', async () => {
  const directory = join(tmpdir(), `missing-finesse-tags-${Date.now()}`);
  assert.deepEqual(await listTagNames(directory), []);
});

test('readTag rejects filename casing that violates the tag rules', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'finesse-tags-case-'));

  try {
    await writeFile(join(directory, 'Beta.md'), 'Uppercase', 'utf-8');
    assert.equal(await readTag(directory, 'beta'), null);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('splitDiscordMessage keeps content intact within Discord limits', () => {
  const content = `${'a'.repeat(1_500)}\n${'b'.repeat(700)}`;
  const chunks = splitDiscordMessage(content);

  assert.deepEqual(chunks.map(chunk => chunk.length), [1_500, 701]);
  assert.equal(chunks.join(''), content);
  assert.ok(chunks.every(chunk => chunk.length <= 2_000));
});
