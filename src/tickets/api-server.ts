import http, { IncomingMessage, ServerResponse } from 'node:http';
import { Database as DatabaseInstance } from 'better-sqlite3';
import { Guild, TextChannel } from 'discord.js';
import { CommissionPayload } from './types.js';
import { createTicketRecord, getTicketByCode } from './database.js';
import { createCommissionChannel } from './channel-factory.js';

export interface ApiServerOptions {
  db: DatabaseInstance;
  guildResolver: () => Guild | null;
  channelFactory?: (guild: Guild, payload: CommissionPayload) => Promise<TextChannel>;
  botApiSecret?: string;
  port?: number;
}

function parseJsonBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 1048576) {
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      if (!body.trim()) {
        return resolve({});
      }
      try {
        resolve(JSON.parse(body));
      } catch (err) {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

function sendJsonResponse(res: ServerResponse, statusCode: number, data: unknown): void {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function validateCommissionPayload(body: any): CommissionPayload | null {
  if (
    !body ||
    typeof body.code !== 'string' || !body.code.trim() ||
    typeof body.clientName !== 'string' || !body.clientName.trim() ||
    typeof body.contactInfo !== 'string' || !body.contactInfo.trim() ||
    typeof body.serviceType !== 'string' || !body.serviceType.trim() ||
    typeof body.budget !== 'string' || !body.budget.trim() ||
    typeof body.description !== 'string' || !body.description.trim()
  ) {
    return null;
  }

  return {
    code: body.code.trim().toUpperCase(),
    clientName: body.clientName.trim(),
    contactInfo: body.contactInfo.trim(),
    serviceType: body.serviceType.trim(),
    budget: body.budget.trim(),
    description: body.description.trim(),
    links: body.links
  };
}

export function createApiServer(options: ApiServerOptions): http.Server {
  const secret = options.botApiSecret || process.env.BOT_API_SECRET;
  const channelCreator = options.channelFactory || createCommissionChannel;

  return http.createServer(async (req, res) => {
    const url = req.url ? new URL(req.url, `http://${req.headers.host || 'localhost'}`) : new URL('http://localhost');
    const pathname = url.pathname;

    if (req.method === 'GET' && pathname === '/health') {
      return sendJsonResponse(res, 200, { status: 'ok', uptime: process.uptime() });
    }

    if (req.method === 'POST' && pathname === '/api/ticket/create') {
      const authHeader = req.headers.authorization;
      if (!secret || !authHeader || authHeader !== `Bearer ${secret}`) {
        return sendJsonResponse(res, 401, { error: 'Unauthorized' });
      }

      let parsed: unknown;
      try {
        parsed = await parseJsonBody(req);
      } catch (err: any) {
        return sendJsonResponse(res, 400, { error: err.message || 'Malformed request body' });
      }

      const payload = validateCommissionPayload(parsed);
      if (!payload) {
        return sendJsonResponse(res, 400, { error: 'Validation failed: Missing required fields' });
      }

      const existingTicket = getTicketByCode(options.db, payload.code);
      if (existingTicket) {
        return sendJsonResponse(res, 409, { error: `Ticket with code ${payload.code} already exists` });
      }

      const guild = options.guildResolver();
      if (!guild) {
        return sendJsonResponse(res, 500, { error: 'Discord guild is not ready or unavailable' });
      }

      try {
        const channel = await channelCreator(guild, payload);
        const linksStr = Array.isArray(payload.links) ? payload.links.join(', ') : payload.links;

        createTicketRecord(options.db, {
          code: payload.code,
          channelId: channel.id,
          clientName: payload.clientName,
          contactInfo: payload.contactInfo,
          serviceType: payload.serviceType,
          budget: payload.budget,
          description: payload.description,
          links: linksStr
        });

        return sendJsonResponse(res, 201, {
          success: true,
          code: payload.code,
          channelId: channel.id
        });
      } catch (err: any) {
        console.error('[API Server] Channel creation error:', err);
        return sendJsonResponse(res, 500, { error: err.message || 'Failed to provision ticket channel' });
      }
    }

    return sendJsonResponse(res, 404, { error: 'Not Found' });
  });
}

export function startApiServer(options: ApiServerOptions): http.Server {
  const server = createApiServer(options);
  const port = options.port || Number(process.env.PORT) || 3000;
  const host = '0.0.0.0';

  server.listen(port, host, () => {
    console.log(`Ticket API server listening on http://${host}:${port}`);
  });

  return server;
}
