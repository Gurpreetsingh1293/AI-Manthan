import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { Document } from '@langchain/core/documents';
import { createEmbeddings, EMBEDDING_DIMENSIONS } from './embeddings.js';
import { HttpError } from '../../lib/errors.js';

// Small Supabase adapter: LangChain creates embeddings; Postgres handles storage/search.
export function createVectorStore(config, dependencies = {}) {
  if (!dependencies.client && (!config.supabaseUrl || !config.supabaseSecretKey)) {
    throw new HttpError(503, 'Set SUPABASE_URL and SUPABASE_SECRET_KEY, then run 002_chatbot_vectors.sql.');
  }
  const embeddings = dependencies.embeddings || createEmbeddings(config);
  const client = dependencies.client || createClient(config.supabaseUrl, config.supabaseSecretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  function validateVector(vector) {
    if (!Array.isArray(vector) || vector.length !== EMBEDDING_DIMENSIONS || !vector.every(Number.isFinite)) {
      throw new HttpError(502, `Embedding provider must return ${EMBEDDING_DIMENSIONS}-dimension numeric vectors.`);
    }
  }

  return {
    async search(query) {
      const vector = await embeddings.embedQuery(query);
      validateVector(vector);
      const { data, error } = await client.rpc('match_chatbot_documents', {
        query_embedding: vector,
        match_count: 4,
        min_similarity: 0.3,
      }).abortSignal(AbortSignal.timeout(10000));
      if (error) throw new HttpError(502, 'Vector search failed. Check Supabase and run 002_chatbot_vectors.sql.');
      return (data || []).map((row) => new Document({
        id: row.id,
        pageContent: row.content,
        metadata: { ...row.metadata, similarity: row.similarity },
      }));
    },
    async addDocuments(documents, documentId) {
      const vectors = await embeddings.embedDocuments(documents.map((doc) => doc.pageContent));
      if (vectors.length !== documents.length) throw new HttpError(502, 'Embedding count does not match the document chunks.');
      vectors.forEach(validateVector);
      const rows = documents.map((doc, index) => ({
        id: randomUUID(), document_id: documentId, chunk_index: index,
        content: doc.pageContent, metadata: doc.metadata, embedding: vectors[index],
      }));
      // A single insert is atomic: an unsuccessful request cannot leave half the chunks.
      const { error } = await client.from('chatbot_documents').insert(rows).abortSignal(AbortSignal.timeout(15000));
      if (error) throw new HttpError(502, 'Document storage failed. Check Supabase and run 002_chatbot_vectors.sql.');
      return rows.map((row) => row.id);
    },
  };
}
