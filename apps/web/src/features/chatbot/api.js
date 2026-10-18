import { api } from '../../lib/api.js';

export function sendChatMessage({ message, history = [], useRetrieval = false }) {
  return api('/chatbot/chat', {
    method: 'POST',
    body: JSON.stringify({ message, history, useRetrieval }),
  });
}
