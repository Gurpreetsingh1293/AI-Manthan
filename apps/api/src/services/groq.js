import { HttpError } from '../lib/errors.js';

export async function generateReply(prompt, config, fetchImpl = fetch) {
  if (!config.groqApiKey) throw new HttpError(503, 'Add GROQ_API_KEY to apps/api/.env and restart the backend.');

  let response;
  try {
    response = await fetchImpl('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.groqApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: config.groqModel,
        messages: [
          { role: 'system', content: 'You are a helpful assistant. Give clear, practical, concise answers.' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.7,
        max_completion_tokens: 1024,
      }),
      signal: AbortSignal.timeout(30000),
    });
  } catch (error) {
    if (error.name === 'TimeoutError') throw new HttpError(504, 'Groq took too long to respond. Please try again.');
    throw new HttpError(502, 'Could not reach Groq. Please try again.');
  }

  if (response.status === 429) throw new HttpError(429, 'Groq rate limit reached. Wait a moment and try again.');
  if (!response.ok) throw new HttpError(502, 'Groq request failed. Check the backend API key and model configuration.');
  const data = await response.json().catch(() => null);
  const reply = data?.choices?.[0]?.message?.content;
  if (typeof reply !== 'string' || !reply.trim()) throw new HttpError(502, 'Groq returned an empty or invalid response.');
  return { reply, model: data.model || config.groqModel };
}
