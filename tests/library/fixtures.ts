import { Network, NetworkDetails } from '../../src/library/types.js';

export const SITE = 'https://logistics-network.almanax21.com';

export interface Node {
  type: number;
  content?: string;
  custom_id?: string;
  label?: string;
  url?: string;
  style?: number;
  disabled?: boolean;
  accent_color?: number;
  items?: Array<{ media: { url: string }; description?: string }>;
  components?: Node[];
  accessory?: Node;
}

export interface Sent {
  method: string;
  payload?: unknown;
}

export function toNodes(card: Array<{ toJSON(): unknown }>): Node[] {
  return card.map(component => component.toJSON() as Node);
}

export function nodesOf(payload: unknown): Node[] {
  return toNodes((payload as { components: Array<{ toJSON(): unknown }> }).components);
}

export function flagsOf(payload: unknown): number {
  return (payload as { flags: number }).flags;
}

export function walk(nodes: Node[]): Node[] {
  return nodes.flatMap(node => [
    node,
    ...walk(node.components ?? []),
    ...(node.accessory ? [node.accessory] : [])
  ]);
}

export function textsOf(nodes: Node[]): string[] {
  return walk(nodes).flatMap(node => node.content ?? []);
}

export function network(overrides: Partial<Network> = {}): Network {
  const id = overrides.id ?? 'eldritch-automation.lnet';
  return {
    id,
    source: 'curated',
    name: 'Eldritch Automation',
    description: 'Eldritch Miner with auto repair',
    author: 'AlmanaX21',
    types: ['ITEM'],
    createdAt: 1780790400000,
    links: {
      visualiser: `${SITE}/visualiser.html?net=${id}`,
      file: `${SITE}/library/${id}`,
      image: `${SITE}/api/library/image.png?id=${id}`
    },
    ...overrides
  };
}

export function networks(count: number): Network[] {
  return Array.from({ length: count }, (_, i) => network({ id: `net-${i}.lnet`, name: `Network ${i}` }));
}

export function details(overrides: Partial<NetworkDetails> = {}): NetworkDetails {
  return {
    ...network(overrides),
    stats: { nodes: 3, hidden: 0, activeChannels: 6, links: 3, types: { ITEM: 6 } },
    nodes: [
      { label: 'Ore Store', visible: true, type: 'ITEM' },
      { label: 'Mineshaft', visible: true, type: 'ITEM' },
      { label: 'XP Tank', visible: true, type: 'ITEM' }
    ],
    ...overrides
  };
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

export function stubFetch(respond: (url: URL) => Response) {
  const requests: Array<{ url: URL; init: RequestInit }> = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    requests.push({ url, init: init ?? {} });
    return respond(url);
  }) as typeof fetch;
  return requests;
}

export function fakeInteraction<T>(fields: Record<string, unknown> = {}) {
  const sent: Sent[] = [];
  const record = (method: string) => async (payload?: unknown) => {
    sent.push({ method, payload });
  };
  const interaction = {
    user: { id: 'user-1' },
    deferReply: record('deferReply'),
    deferUpdate: record('deferUpdate'),
    editReply: record('editReply'),
    deleteReply: record('deleteReply'),
    followUp: record('followUp'),
    reply: record('reply'),
    update: record('update'),
    respond: record('respond'),
    ...fields
  } as unknown as T;
  return { interaction, sent };
}
