import { Router, json } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { rateLimit } from 'express-rate-limit';
import { createChatbotService } from './chatbot.service.js';
import { validateChat, validateDocument } from './chatbot.validation.js';
import { HttpError } from '../../lib/errors.js';

export function createChatbotRouter(config, service = createChatbotService(config)) {
  const router = Router();
  const limiter = (limit) => rateLimit({ windowMs: 60000, limit, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: 'Too many chatbot requests. Try again in a minute.' } });

  router.post('/chat', limiter(10), json({ limit: '256kb' }), async (req, res) => {
    res.json(await service.chat(validateChat(req.body)));
  });

  router.post('/documents', limiter(5), (req, _res, next) => {
    if (!config.chatbotIngestToken) throw new HttpError(503, 'Document ingestion is disabled. Set CHATBOT_INGEST_TOKEN on the backend.');
    const expected = Buffer.from(`Bearer ${config.chatbotIngestToken}`);
    const supplied = Buffer.from(req.get('authorization') || '');
    if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) throw new HttpError(401, 'A valid ingestion bearer token is required.');
    next();
  }, json({ limit: '256kb' }), async (req, res) => {
    res.status(201).json(await service.ingest(validateDocument(req.body)));
  });
  return router;
}
