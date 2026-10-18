import { randomUUID } from 'node:crypto';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { createLLM } from './llm.js';
import { createVectorStore } from './vector-store.js';
import { createChatbotGraph } from './chatbot.graph.js';
import { EMBEDDING_MODEL } from './embeddings.js';
import { HttpError } from '../../lib/errors.js';

function providerError(error) {
  if (error instanceof HttpError) return error;
  if (error.status === 429) return new HttpError(429, 'AI provider rate limit reached. Please try again shortly.');
  if (['TimeoutError', 'APIConnectionTimeoutError', 'AbortError'].includes(error.name)) return new HttpError(504, 'AI provider request timed out. Please try again.');
  return new HttpError(502, 'AI request failed. Check provider credentials, model access, and connectivity.');
}

export function createChatbotService(config, dependencies = {}) {
  let llm;
  let vectorStore;
  const getLLM = () => (llm ||= dependencies.llm || createLLM(config));
  const getVectorStore = () => (vectorStore ||= dependencies.vectorStore || createVectorStore(config));
  const graph = createChatbotGraph({ getLLM, getVectorStore });
  const splitter = new RecursiveCharacterTextSplitter({ chunkSize: 1000, chunkOverlap: 150 });

  return {
    async chat(input) {
      try {
        const result = await graph.invoke(input);
        return {
          reply: result.reply,
          model: result.documents.length === 0 && input.useRetrieval ? null : config.groqModel,
          sources: result.documents.map((doc, index) => ({
            citation: index + 1, id: doc.id,
            source: doc.metadata.source, title: doc.metadata.title,
            excerpt: doc.pageContent, similarity: doc.metadata.similarity,
          })),
        };
      } catch (error) { throw providerError(error); }
    },
    async ingest({ text, source, title }) {
      try {
        const store = getVectorStore();
        const documentId = randomUUID();
        const chunks = await splitter.createDocuments([text], [{ source, title, embedding_model: EMBEDDING_MODEL }]);
        const ids = await store.addDocuments(chunks, documentId);
        return { documentId, chunks: ids.length, source };
      } catch (error) { throw providerError(error); }
    },
  };
}
