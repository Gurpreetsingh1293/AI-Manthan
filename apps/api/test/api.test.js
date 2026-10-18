import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { generateReply } from '../src/services/groq.js';

const config = { clientOrigin: 'http://localhost:5173', groqModel: 'test-model', production: false };

async function withServer(fn, services) {
  const server = createApp(config, services).listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  try { await fn(`http://127.0.0.1:${server.address().port}`); }
  finally { await new Promise((resolve) => server.close(resolve)); }
}

test('health works without credentials and never exposes keys', async () => {
  await withServer(async (url) => {
    const response = await fetch(`${url}/api/health`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: 'ok', services: { groq: false, supabase: false } });
  });
});

test('chat validates inputs before calling the model and returns its result', async () => {
  const prompts = [];
  await withServer(async (url) => {
    for (const prompt of ['', '   ', 42, 'x'.repeat(8001)]) {
      const response = await fetch(`${url}/api/ai/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt }) });
      assert.equal(response.status, 400);
    }
    assert.equal(prompts.length, 0);
    const response = await fetch(`${url}/api/ai/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: ' Hello ' }) });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { reply: 'Hi', model: 'test-model' });
    assert.deepEqual(prompts, ['Hello']);
  }, { chat: async (prompt) => { prompts.push(prompt); return { reply: 'Hi', model: 'test-model' }; } });
});

test('unconfigured services return actionable 503 errors', async () => {
  await withServer(async (url) => {
    const database = await fetch(`${url}/api/health/database`);
    assert.equal(database.status, 503);
    assert.match((await database.json()).error, /SUPABASE_URL/);
    const ai = await fetch(`${url}/api/ai/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: 'Hello' }) });
    assert.equal(ai.status, 503);
    assert.match((await ai.json()).error, /GROQ_API_KEY/);
  });
});

test('malformed JSON and unknown API routes return JSON errors', async () => {
  await withServer(async (url) => {
    const malformed = await fetch(`${url}/api/ai/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{bad' });
    assert.equal(malformed.status, 400);
    assert.match((await malformed.json()).error, /valid JSON/);
    const missing = await fetch(`${url}/api/missing`);
    assert.equal(missing.status, 404);
    assert.equal((await missing.json()).error, 'API route not found.');
  });
});

test('Groq sends the expected API request and extracts the response', async () => {
  const result = await generateReply('Hello', { ...config, groqApiKey: 'test-only-key' }, async (url, options) => {
    assert.equal(url, 'https://api.groq.com/openai/v1/chat/completions');
    assert.equal(options.headers.Authorization, 'Bearer test-only-key');
    const body = JSON.parse(options.body);
    assert.equal(body.model, 'test-model');
    assert.equal(body.messages.at(-1).content, 'Hello');
    return Response.json({ choices: [{ message: { content: 'Hi' } }], model: 'test-model' });
  });
  assert.deepEqual(result, { reply: 'Hi', model: 'test-model' });
});

test('Groq failure cases are mapped without leaking provider responses', async () => {
  for (const [response, expected] of [[new Response('secret provider details', { status: 401 }), 502], [new Response('', { status: 429 }), 429], [Response.json({ choices: [] }), 502]]) {
    await assert.rejects(generateReply('Hello', { ...config, groqApiKey: 'test' }, async () => response), (error) => error.status === expected && !error.message.includes('secret provider details'));
  }
  await assert.rejects(generateReply('Hello', { ...config, groqApiKey: 'test' }, async () => { throw new DOMException('Timed out', 'TimeoutError'); }), { status: 504 });
});
