import { OpenAIEmbeddings } from '@langchain/openai';
import { HttpError } from '../../lib/errors.js';

// Keep the model/dimensions aligned with 002_chatbot_vectors.sql.
// Re-embed the entire knowledge base if you replace this provider or model.
export const EMBEDDING_MODEL = 'text-embedding-3-small';
export const EMBEDDING_DIMENSIONS = 1536;

export function createEmbeddings(config) {
  if (!config.openaiApiKey) throw new HttpError(503, 'Set OPENAI_API_KEY for document embeddings, or use plain chat with useRetrieval: false.');
  return new OpenAIEmbeddings({
    apiKey: config.openaiApiKey,
    model: EMBEDDING_MODEL,
    dimensions: EMBEDDING_DIMENSIONS,
    timeout: 15000,
    maxRetries: 0,
    batchSize: 64,
  });
}
