import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { HttpError } from './lib/errors.js';
import { generateReply } from './services/groq.js';
import { createDatabaseService } from './services/supabase.js';

export function createApp(config, services = {}) {
  const app = express();
  const database = services.database || createDatabaseService(config);
  const chat = services.chat || ((prompt) => generateReply(prompt, config));
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxyHops || false);
  app.use(helmet());
  app.use(cors({ origin: config.clientOrigin }));
  app.use(express.json({ limit: '16kb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', services: { groq: !!config.groqApiKey, supabase: !!(config.supabaseUrl && config.supabaseSecretKey) } });
  });

  app.get('/api/health/database', rateLimit({ windowMs: 60000, limit: 10, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: 'Too many database checks. Try again in a minute.' } }), async (_req, res) => {
    res.json(await database.check());
  });

  app.post('/api/ai/chat', rateLimit({ windowMs: 60000, limit: 10, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: 'Too many requests. Try again in a minute.' } }), async (req, res) => {
    const prompt = req.body?.prompt;
    if (typeof prompt !== 'string' || !prompt.trim() || prompt.length > 8000) {
      throw new HttpError(400, 'prompt must be a non-empty string of at most 8,000 characters.');
    }
    res.json(await chat(prompt.trim()));
  });

  app.use('/api', (_req, res) => res.status(404).json({ error: 'API route not found.' }));

  const webDist = fileURLToPath(new URL('../../web/dist/', import.meta.url));
  if (config.production && existsSync(webDist)) {
    app.use(express.static(webDist));
    app.get('/{*path}', (_req, res) => res.sendFile(`${webDist}/index.html`));
  }

  app.use((err, _req, res, _next) => {
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Request body must be valid JSON.' });
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Request body is too large.' });
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
    console.error('Unhandled request error:', err.name);
    res.status(500).json({ error: 'An unexpected server error occurred.' });
  });
  return app;
}
