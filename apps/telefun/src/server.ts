import { createServer } from 'http';
import { randomUUID } from 'crypto';
import { WebSocketServer, WebSocket } from 'ws';
import { env } from './env.js';
import { verifyToken } from './auth.js';
import { parseUsageMetadata, mergeSnapshot, flushLiveUsage, type LiveUsageSnapshot } from './usage.js';

process.on('uncaughtException', (err) => console.error('[Telefun] Uncaught:', err));
process.on('unhandledRejection', (reason) => console.error('[Telefun] Unhandled Rejection:', reason));

const server = createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', uptime: process.uptime(), timestamp: new Date().toISOString() }));
    return;
  }
  res.writeHead(404);
  res.end();
});

const wss = new WebSocketServer({ server });

function normalizeOrigin(raw: string): string {
  try { return `${new URL(raw).protocol}//${new URL(raw).host}`; }
  catch { return raw.replace(/\/+$/, ''); }
}

const allowedOrigins = env.ALLOWED_ORIGINS === '*'
  ? [] : env.ALLOWED_ORIGINS.split(',').map(o => normalizeOrigin(o.trim())).filter(Boolean);

wss.on('connection', async (ws, req) => {
  const pendingMessages: string[] = [];
  let geminiWs: WebSocket | null = null;
  let isGeminiOpen = false;
  let authed = false;
  let userId = '';
  const requestId = `telefun-live-${randomUUID()}`;
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  let usageSnapshot: LiveUsageSnapshot | null = null;
  let usageFlushed = false;
  let activeModelId = 'gemini-3.1-flash-live-preview';

  const flushUsage = async () => {
    if (usageFlushed || !authed || !usageSnapshot) return;
    usageFlushed = true;
    await flushLiveUsage(requestId, userId, usageSnapshot, activeModelId);
  };

  // Buffer client messages until Gemini WS is ready
  ws.on('message', (data) => {
    const raw = data.toString();
    if (geminiWs && isGeminiOpen) {
      geminiWs.send(raw);
    } else {
      pendingMessages.push(raw);
    }

    // Detect model from setup messages
    try {
      const parsed = JSON.parse(raw);
      if (parsed.setup?.model) {
        activeModelId = parsed.setup.model.replace(/^models\//, '');
      }
    } catch { /* non-JSON */ }
  });

  ws.on('close', () => {
    if (geminiWs && (geminiWs.readyState === WebSocket.OPEN || geminiWs.readyState === WebSocket.CONNECTING)) {
      geminiWs.close();
    }
    setTimeout(() => void flushUsage(), 2000);
  });

  ws.on('error', () => {
    if (geminiWs && (geminiWs.readyState === WebSocket.OPEN || geminiWs.readyState === WebSocket.CONNECTING)) {
      geminiWs.close();
    }
    setTimeout(() => void flushUsage(), 2000);
  });

  // Validate origin
  const origin = req.headers.origin;
  if (env.ALLOWED_ORIGINS !== '*' && origin && !allowedOrigins.includes(normalizeOrigin(origin))) {
    ws.close(4003, 'Forbidden Origin');
    return;
  }

  if (url.pathname !== '/' && url.pathname !== '/ws') {
    ws.close(4000, 'Invalid Path');
    return;
  }

  const token = url.searchParams.get('token');
  if (!token) { ws.close(4001, 'Missing Token'); return; }

  const authResult = await verifyToken(token);
  if (!authResult.success) { ws.close(4001, 'Unauthorized'); return; }
  if (ws.readyState !== WebSocket.OPEN) return;

  userId = authResult.user!.id;
  authed = true;
  console.log('[Telefun] User connected:', authResult.user?.email);

  // Connect to Gemini Live API
  const geminiUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${env.GEMINI_API_KEY}`;
  geminiWs = new WebSocket(geminiUrl);

  geminiWs.on('open', () => {
    isGeminiOpen = true;
    console.log('[Telefun] Gemini Live connected');
    while (pendingMessages.length > 0) {
      const msg = pendingMessages.shift();
      if (msg) geminiWs!.send(msg);
    }
  });

  geminiWs.on('message', (data) => {
    const raw = data.toString();
    if (raw.includes('"usageMetadata"')) {
      try {
        const parsed = JSON.parse(raw);
        const meta = parseUsageMetadata(parsed.usageMetadata);
        if (meta) usageSnapshot = mergeSnapshot(usageSnapshot, meta);
      } catch { /* skip */ }
    }
    if (ws.readyState === WebSocket.OPEN) ws.send(raw);
  });

  geminiWs.on('error', () => {
    void flushUsage();
    if (ws.readyState === WebSocket.OPEN) ws.close(1011, 'Gemini API Error');
  });

  geminiWs.on('close', (code, reason) => {
    console.log(`[Telefun] Gemini closed: ${code}`);
    void flushUsage();
    const safeCode = (code >= 3000 && code <= 4999) || (code >= 1000 && code <= 1013) ? code : 1011;
    if (ws.readyState === WebSocket.OPEN) ws.close(safeCode, reason.toString().slice(0, 123));
  });
});

server.listen(env.PORT, '0.0.0.0', () => {
  console.log(`[Telefun] Server running on http://0.0.0.0:${env.PORT}`);
  console.log(`[Telefun] Gemini API Key: ${env.GEMINI_API_KEY ? '***' + env.GEMINI_API_KEY.slice(-4) : 'MISSING'}`);
});

function gracefulShutdown(signal: string) {
  console.log(`\n[Telefun] Received ${signal}. Starting graceful shutdown...`);

  // Stop accepting new connections
  wss.close(() => {
    console.log('[Telefun] WebSocket server closed');
  });

  // Close all existing WebSocket connections
  for (const ws of wss.clients) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.close(1001, 'Server shutting down');
    }
  }

  // Close HTTP server with 10s timeout
  server.close(() => {
    console.log('[Telefun] HTTP server closed');
    process.exit(0);
  });

  setTimeout(() => {
    console.error('[Telefun] Graceful shutdown timeout, forcing exit');
    process.exit(1);
  }, 10_000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
