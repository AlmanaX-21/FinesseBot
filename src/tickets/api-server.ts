import http, { IncomingMessage, ServerResponse } from 'node:http';
import crypto from 'node:crypto';
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

function readRawBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 1048576) {
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function sendJsonResponse(res: ServerResponse, statusCode: number, data: unknown): void {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function verifyHmacSignature(secret: string, timestamp: string, rawBody: string, signature: string): boolean {
  if (!secret || !timestamp || !signature) {
    return false;
  }
  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${rawBody}`)
    .digest('hex');

  const sigBuffer = Buffer.from(signature, 'hex');
  const expectedBuffer = Buffer.from(expected, 'hex');

  if (sigBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(sigBuffer, expectedBuffer);
}

function validateCommissionPayload(body: unknown): CommissionPayload | null {
  if (!body || typeof body !== 'object') {
    return null;
  }
  const b = body as Record<string, unknown>;
  if (
    typeof b.code !== 'string' || !b.code.trim() ||
    typeof b.clientName !== 'string' || !b.clientName.trim() ||
    typeof b.contactInfo !== 'string' || !b.contactInfo.trim() ||
    typeof b.serviceType !== 'string' || !b.serviceType.trim() ||
    typeof b.budget !== 'string' || !b.budget.trim() ||
    typeof b.description !== 'string' || !b.description.trim()
  ) {
    return null;
  }

  return {
    code: b.code.trim().toUpperCase(),
    clientName: b.clientName.trim(),
    contactInfo: b.contactInfo.trim(),
    serviceType: b.serviceType.trim(),
    budget: b.budget.trim(),
    description: b.description.trim(),
    links: typeof b.links === 'string' || Array.isArray(b.links) ? (b.links as string | string[]) : null
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
      const signatureHeader = req.headers['x-signature'] as string | undefined;
      const timestampHeader = req.headers['x-timestamp'] as string | undefined;

      if (!secret || !authHeader || authHeader !== `Bearer ${secret}`) {
        return sendJsonResponse(res, 401, { error: 'Unauthorized: Invalid bearer token' });
      }

      if (!timestampHeader || !signatureHeader) {
        return sendJsonResponse(res, 401, { error: 'Unauthorized: Missing signature or timestamp' });
      }

      const timestampNum = Number(timestampHeader);
      if (Number.isNaN(timestampNum) || Math.abs(Date.now() - timestampNum) > 60000) {
        return sendJsonResponse(res, 401, { error: 'Unauthorized: Request timestamp expired or invalid' });
      }

      let rawBody = '';
      try {
        rawBody = await readRawBody(req);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Error reading payload';
        return sendJsonResponse(res, 400, { error: msg });
      }

      const isValidSig = verifyHmacSignature(secret, timestampHeader, rawBody, signatureHeader);
      if (!isValidSig) {
        return sendJsonResponse(res, 401, { error: 'Unauthorized: Invalid HMAC signature' });
      }

      let parsed: unknown = {};
      try {
        parsed = rawBody.trim() ? JSON.parse(rawBody) : {};
      } catch {
        return sendJsonResponse(res, 400, { error: 'Malformed JSON payload' });
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

        return sendJsonResponse(res, 200, {
          success: true,
          code: payload.code,
          channelId: channel.id
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Failed to provision ticket channel';
        console.error('[API Server] Channel creation error:', err);
        return sendJsonResponse(res, 500, { error: msg });
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
