import { HttpError } from '../../lib/errors.js';

function text(value, label, max) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) {
    throw new HttpError(400, `${label} must be a non-empty string of at most ${max} characters.`);
  }
  return value.trim();
}

export function validateChat(body = {}) {
  const message = text(body?.message, 'message', 8000);
  const history = body.history ?? [];
  if (!Array.isArray(history) || history.length > 20) throw new HttpError(400, 'history must contain at most 20 messages.');
  const normalized = history.map((item) => {
    if (!item || !['user', 'assistant'].includes(item.role)) throw new HttpError(400, 'History roles must be user or assistant.');
    return { role: item.role, content: text(item.content, 'history content', 8000) };
  });
  if (normalized.reduce((n, item) => n + item.content.length, 0) > 24000) throw new HttpError(400, 'Combined history must not exceed 24000 characters.');
  if (body.useRetrieval !== undefined && typeof body.useRetrieval !== 'boolean') throw new HttpError(400, 'useRetrieval must be a boolean.');
  return { message, history: normalized, useRetrieval: body.useRetrieval ?? false };
}

export function validateDocument(body = {}) {
  return {
    text: text(body?.text, 'text', 40000),
    source: text(body?.source, 'source', 300),
    title: text(body?.title ?? body?.source, 'title', 200),
  };
}
