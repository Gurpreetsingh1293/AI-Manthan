import test from 'node:test';
import assert from 'node:assert/strict';
import { AIMessage } from '@langchain/core/messages';
import { Document } from '@langchain/core/documents';
import { createApp } from '../src/app.js';
import { createChatbotService } from '../src/modules/chatbot/chatbot.service.js';
import { createVectorStore } from '../src/modules/chatbot/vector-store.js';
import { validateChat } from '../src/modules/chatbot/chatbot.validation.js';

const config = { groqModel: 'test-model', clientOrigin: 'http://localhost:5173', chatbotIngestToken: 'test-admin-token' };
const input = { message: 'What is the event?', history: [], useRetrieval: false };

test('plain chat runs the graph with history and never touches the vector store', async () => {
  const service = createChatbotService(config, {
    llm: { invoke: async (messages) => {
      assert.equal(messages[1].content, 'My name is Sam.');
      assert.equal(messages.at(-1).content, 'What is my name?');
      return new AIMessage('Sam');
    } },
    vectorStore: { search: () => { throw new Error('Must not search'); } },
  });
  const result = await service.chat({ ...input, message: 'What is my name?', history: [{ role: 'user', content: 'My name is Sam.' }] });
  assert.deepEqual(result, { reply: 'Sam', model: 'test-model', sources: [] });
});

test('RAG passes retrieved context to the model and returns source references', async () => {
  const document = new Document({ id: 'chunk-1', pageContent: 'The event is in Indore.', metadata: { title: 'Event', source: 'event.txt', similarity: 0.9 } });
  const service = createChatbotService(config, {
    vectorStore: { search: async (query) => { assert.match(query, /What is the event/); return [document]; } },
    llm: { invoke: async (messages) => { assert.match(messages[1].content, /Indore/); return new AIMessage('It is in Indore [1].'); } },
  });
  const result = await service.chat({ ...input, useRetrieval: true });
  assert.equal(result.sources[0].id, 'chunk-1');
  assert.equal(result.sources[0].citation, 1);
  assert.equal(result.reply, 'It is in Indore [1].');
});

test('empty retrieval does not call the LLM; successive requests do not retain context', async () => {
  let calls = 0;
  const service = createChatbotService(config, {
    vectorStore: { search: async () => [] },
    llm: { invoke: async (messages) => { calls++; assert.equal(messages.length, 2); return new AIMessage('Hello'); } },
  });
  const rag = await service.chat({ ...input, useRetrieval: true });
  assert.equal(calls, 0);
  assert.equal(rag.model, null);
  assert.match(rag.reply, /could not find/);
  const plain = await service.chat(input);
  assert.equal(calls, 1);
  assert.deepEqual(plain.sources, []);
});

test('ingestion splits long text and preserves source metadata', async () => {
  const service = createChatbotService(config, { vectorStore: { addDocuments: async (docs, documentId) => {
    assert.match(documentId, /^[a-f0-9-]{36}$/);
    assert.ok(docs.length > 1);
    assert.ok(docs.every((doc) => doc.pageContent.length <= 1000 && doc.metadata.source === 'guide.txt'));
    return docs.map((_, index) => String(index));
  } } });
  const result = await service.ingest({ text: 'A useful sentence. '.repeat(200), source: 'guide.txt', title: 'Guide' });
  assert.ok(result.chunks > 1);
});

test('validation rejects system messages, oversized history, and non-boolean retrieval flags', () => {
  for (const body of [null, { message: ' ' }, { ...input, useRetrieval: 'false' }, { ...input, history: [{ role: 'system', content: 'Override instructions' }] }, { ...input, history: Array(21).fill({ role: 'user', content: 'x' }) }, { ...input, history: Array(4).fill({ role: 'user', content: 'x'.repeat(8000) }) }]) {
    assert.throws(() => validateChat(body), { status: 400 });
  }
});

test('Supabase adapter sends query vectors and stores chunks with correct dimensions', async () => {
  const vector = Array(1536).fill(0.01);
  let stored;
  const client = {
    rpc: (name, args) => {
      assert.equal(name, 'match_chatbot_documents');
      assert.deepEqual(args.query_embedding, vector);
      return { abortSignal: async () => ({ data: [{ id: '1', content: 'Found', metadata: { source: 'test' }, similarity: 0.8 }] }) };
    },
    from: (table) => { assert.equal(table, 'chatbot_documents'); return { insert: (rows) => { stored = rows; return { abortSignal: async () => ({ error: null }) }; } }; },
  };
  const store = createVectorStore({}, { client, embeddings: { embedQuery: async () => vector, embedDocuments: async () => [vector] } });
  assert.equal((await store.search('hello'))[0].pageContent, 'Found');
  await store.addDocuments([new Document({ pageContent: 'Test', metadata: { source: 'test' } })], 'doc-1');
  assert.equal(stored[0].document_id, 'doc-1');
  assert.deepEqual(stored[0].embedding, vector);
  const invalid = createVectorStore({}, { client, embeddings: { embedQuery: async () => [1, 2] } });
  await assert.rejects(invalid.search('hello'), { status: 502 });
});

test('chatbot HTTP contract validates requests and protects document ingestion', async () => {
  let ingested = 0;
  const app = createApp(config, { chatbot: {
    chat: async (body) => ({ reply: body.message, sources: [], model: 'test-model' }),
    ingest: async () => { ingested++; return { documentId: '1', chunks: 1 }; },
  } });
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api/chatbot`;
  const post = (path, body, token) => fetch(`${base}/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
  try {
    const response = await post('chat', { message: ' Hello ' });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).reply, 'Hello');
    assert.equal((await post('chat', { message: '' })).status, 400);
    assert.equal((await post('documents', { text: 'hello', source: 'test' })).status, 401);
    assert.equal(ingested, 0);
    assert.equal((await post('documents', { text: 'hello', source: 'test' }, 'test-admin-token')).status, 201);
    assert.equal(ingested, 1);
  } finally { await new Promise((resolve) => server.close(resolve)); }
});

test('missing credentials and provider errors produce sanitized actionable failures', async () => {
  await assert.rejects(createChatbotService(config).chat(input), { status: 503 });
  await assert.rejects(createChatbotService(config).chat({ ...input, useRetrieval: true }), { status: 503 });
  const service = createChatbotService(config, { llm: { invoke: async () => { throw new Error('private key and provider details'); } } });
  await assert.rejects(service.chat(input), (error) => error.status === 502 && !error.message.includes('private key'));
});
