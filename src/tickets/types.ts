export type TicketStatus = 'UNCLAIMED' | 'ACTIVE' | 'CLOSED';

export interface TicketRecord {
  id: number;
  code: string;
  channel_id: string;
  user_id: string | null;
  client_name: string;
  contact_info: string;
  service_type: string;
  budget: string;
  description: string;
  links: string | null;
  status: TicketStatus;
  created_at: number;
  claimed_at: number | null;
  closed_at: number | null;
}

export interface TicketInput {
  code: string;
  channelId: string;
  clientName: string;
  contactInfo: string;
  serviceType: string;
  budget: string;
  description: string;
  links?: string | null;
}

export interface CommissionPayload {
  code: string;
  clientName: string;
  contactInfo: string;
  serviceType: string;
  budget: string;
  description: string;
  links?: string[] | string | null;
}
