import { ChatGroq } from '@langchain/groq';
import { HttpError } from '../../lib/errors.js';

export function createLLM(config) {
  if (!config.groqApiKey) throw new HttpError(503, 'Set GROQ_API_KEY in apps/api/.env to use the chatbot.');
  return new ChatGroq({
    apiKey: config.groqApiKey,
    model: config.groqModel,
    temperature: 0.2,
    maxTokens: 1024,
    timeout: 30000,
    maxRetries: 0,
  });
}
