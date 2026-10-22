export const RESOURCE_TYPES = ['ITEM', 'FLUID', 'ENERGY', 'CHEMICAL', 'SOURCE'] as const;
export type ResourceType = (typeof RESOURCE_TYPES)[number];

export interface Network {
  id: string;
  source: 'curated' | 'community';
  name: string;
  description: string;
  author: string;
  types: ResourceType[];
  createdAt: number;
  links: { visualiser: string; file: string; image: string };
}

export interface NetworkDetails extends Network {
  stats: {
    nodes: number;
    hidden: number;
    activeChannels: number;
    links: number;
    types: Partial<Record<ResourceType, number>>;
  };
  nodes: Array<{ label: string; visible: boolean; type: ResourceType | null }>;
}

export type SearchQuery = {
  q?: string;
  type?: ResourceType;
  author?: string;
  limit?: number;
  offset?: number;
};

export interface SearchPage {
  total: number;
  results: Network[];
}
