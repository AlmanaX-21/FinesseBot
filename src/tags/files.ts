import { readFile, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';

export interface TagInvocation {
  name: string;
  arguments: string;
}

const TAG_NAME_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/u;
const MAX_TAG_LENGTH = 8_000;
const DISCORD_MESSAGE_LIMIT = 2_000;

export function parseTagInvocation(content: string, prefix: string): TagInvocation | null {
  const trimmed = content.trim();
  if (!prefix || !trimmed.startsWith(prefix)) {
    return null;
  }

  const separatorIndex = trimmed.search(/\s/u);
  const command = separatorIndex === -1 ? trimmed : trimmed.slice(0, separatorIndex);
  const name = command.slice(prefix.length).toLowerCase();
  if (!TAG_NAME_PATTERN.test(name)) {
    return null;
  }

  return {
    name,
    arguments: separatorIndex === -1 ? '' : trimmed.slice(separatorIndex).trim()
  };
}

export function getTagsPath(customPath?: string): string {
  return resolve(process.cwd(), customPath || process.env.TAGS_PATH || './tags');
}

async function readTagFile(filePath: string, name: string): Promise<string | null> {
  const content = (await readFile(filePath, 'utf-8')).trim();
  if (!content) {
    return null;
  }
  if (content.length > MAX_TAG_LENGTH) {
    throw new Error(`Tag response exceeds 8,000 characters: ${name}`);
  }
  return content;
}

export async function readTag(tagsPath: string, name: string): Promise<string | null> {
  if (!TAG_NAME_PATTERN.test(name) || name === 'tag-list') {
    return null;
  }

  const fileName = `${name}.md`;
  try {
    const entries = await readdir(tagsPath, { withFileTypes: true });
    const entry = entries.find(candidate => candidate.name === fileName && candidate.isFile());
    if (!entry) {
      return null;
    }
    return await readTagFile(join(tagsPath, fileName), name);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

export async function listTagNames(tagsPath: string): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(tagsPath, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw error;
  }

  const names = entries
    .filter(entry => entry.isFile() && entry.name.endsWith('.md'))
    .map(entry => entry.name.slice(0, -3))
    .filter(name => TAG_NAME_PATTERN.test(name) && name !== 'tag-list');
  const readable: string[] = [];

  for (const name of names) {
    try {
      if (await readTagFile(join(tagsPath, `${name}.md`), name)) readable.push(name);
    } catch {
      continue;
    }
  }

  return readable.sort();
}

export function splitDiscordMessage(
  content: string,
  limit: number = DISCORD_MESSAGE_LIMIT
): string[] {
  const chunks: string[] = [];
  let remaining = content;

  while (remaining.length > limit) {
    let splitIndex = remaining.lastIndexOf('\n', limit);
    if (splitIndex < Math.floor(limit / 2)) {
      splitIndex = remaining.lastIndexOf(' ', limit);
    }
    if (splitIndex < Math.floor(limit / 2)) {
      splitIndex = limit;
    }
    if (/^[\uDC00-\uDFFF]$/u.test(remaining[splitIndex])) {
      splitIndex--;
    }

    chunks.push(remaining.slice(0, splitIndex));
    remaining = remaining.slice(splitIndex);
  }

  if (remaining) {
    chunks.push(remaining);
  }
  return chunks;
}
