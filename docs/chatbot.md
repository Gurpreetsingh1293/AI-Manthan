# Chatbot API boilerplate

All application code is JavaScript. The React client calls Express; only Express connects to the AI providers and Supabase.

```text
React / any HTTP client
  → POST /api/chatbot/chat
  → LangGraph: retrieve → generate
      retrieve: LangChain embeddings → Supabase pgvector search (optional)
      generate: LangChain ChatGroq → Groq LLM
  ← { reply, model, sources }

Trusted ingestion client
  → POST /api/chatbot/documents
  → LangChain text splitter → embeddings → Supabase chunks + vectors
```

## Files to work in

```text
apps/api/src/modules/chatbot/
  chatbot.routes.js       HTTP routes, ingestion token, request limits
  chatbot.validation.js   API input validation and history budget
  chatbot.service.js      Graph invocation and document ingestion
  chatbot.graph.js        LangGraph state and retrieve/generate nodes
  prompts.js             System instructions and context formatting
  llm.js                 LangChain ChatGroq configuration
  embeddings.js          Replaceable embedding provider
  vector-store.js        Supabase inserts and vector search RPC
apps/web/src/features/chatbot/
  api.js                 Frontend API wrapper
  Chatbot.jsx            Conversation UI, history, source excerpts
supabase/migrations/
  002_chatbot_vectors.sql Vector extension, table, index, search function
```

## Setup

1. Run `npm install` at the repository root.
2. Add the following settings to the existing `apps/api/.env`. Keep existing settings and keys:

```dotenv
GROQ_API_KEY=your-groq-key
GROQ_MODEL=llama-3.3-70b-versatile
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SECRET_KEY=your-backend-secret-key
OPENAI_API_KEY=your-embedding-key
CHATBOT_INGEST_TOKEN=your-long-random-private-token
```

3. Run migrations `001_starter.sql`, then `002_chatbot_vectors.sql`, in Supabase's SQL editor.
4. Restart with `npm run dev`.
5. Use plain chat first. Ingest a document, then enable **Use knowledge base** in the UI.

Groq is the answer-generation LLM. The default embedding adapter uses OpenAI `text-embedding-3-small` with 1,536 dimensions. It requires a separate API key and may incur provider charges. You can replace `embeddings.js` with another LangChain embedding implementation. Keep the database vector dimensions aligned and regenerate all stored embeddings when changing model/provider; vectors from different models cannot be mixed even if their dimensions match. [OpenAI embedding documentation](https://developers.openai.com/api/docs/guides/embeddings).

Plain chat (`useRetrieval: false`) requires only Groq. Retrieval and ingestion also require the embedding and Supabase configuration. All clients are initialized lazily so an unconfigured integration doesn't prevent startup.

## Chat endpoint

`POST /api/chatbot/chat`

```json
{
  "message": "Where is the event being held?",
  "history": [
    { "role": "user", "content": "Tell me about AI Manthan." },
    { "role": "assistant", "content": "What would you like to know?" }
  ],
  "useRetrieval": true
}
```

Example response shape:

```json
{
  "reply": "The event is at AITR, Indore [1].",
  "model": "llama-3.3-70b-versatile",
  "sources": [
    {
      "citation": 1,
      "id": "chunk-uuid",
      "title": "Event guide",
      "source": "event-guide.txt",
      "excerpt": "AI Manthan takes place at AITR, Indore.",
      "similarity": 0.85
    }
  ]
}
```

`history` defaults to `[]`; `useRetrieval` defaults to `false`. History is supplied per request, with only `user` and `assistant` roles accepted. The server has no persistent chat memory or shared thread map. The React demo retains the conversation until refresh or **New chat**, and sends a bounded recent history. For persistent conversations, add authenticated storage and/or a LangGraph checkpointer with ownership checks.

Limits: 8,000 characters per message, 20 history messages, 24,000 total history characters, and 10 chat calls/minute/IP. Responses are JSON, without streaming. The old `/api/ai/chat` endpoint remains available as the original single-prompt demo.

Retrieval embeds the current question plus up to two recent user messages, fetches up to four chunks with cosine similarity at least 0.3, and supplies them as reference data to the LLM. Tune the threshold and chunk sizes against your dataset. If no chunks match, it returns an explicit no-information response with `model: null` and avoids an LLM call. Source entries are retrieved excerpts; model-written citations still need evaluation.

## Document ingestion endpoint

`POST /api/chatbot/documents`

Headers:

```text
Content-Type: application/json
Authorization: Bearer <CHATBOT_INGEST_TOKEN>
```

Body:

```json
{
  "title": "Event guide",
  "source": "event-guide.txt",
  "text": "AI Manthan takes place at AITR, Indore. Teams have 24 hours to build a project."
}
```

Response: HTTP `201` with `{ "documentId": "uuid", "chunks": 1, "source": "event-guide.txt" }`.

This accepts extracted text, up to 40,000 characters. It splits into 1,000-character chunks with 150-character overlap, embeds the chunks, and inserts them atomically. `source` is a label; the server does not fetch URLs or parse files. Add PDF/document loaders before this service when needed. Each successful ingestion creates a new document ID, so submitting the same text again creates another copy. The endpoint is limited to 5 calls/minute/IP and disabled until the private ingestion token is configured. Do not put that token in browser code or a `VITE_` variable.

This starter has a **shared knowledge base**: all chat callers can retrieve its documents. Use non-sensitive team/demo content. Add user authentication and document ownership filters before supporting private per-user knowledge. RLS prevents direct browser access; the backend secret key has privileged access.

## API usage from React

```js
import { sendChatMessage } from './features/chatbot/api.js';

const result = await sendChatMessage({
  message: 'Summarize the event guide.',
  history: [],
  useRetrieval: true,
});
console.log(result.reply, result.sources);
```

For Postman or VS Code's REST Client, use the examples in `examples/chatbot.http`. Insert your private ingestion token locally; don't commit it.

## Checks and extension points

`npm test` exercises the real compiled LangGraph with fake model/vector adapters, API validation and ingestion authorization, chunking, empty retrieval, and Supabase adapter requests. `npm run build` verifies the React build. Neither command makes paid AI calls. Run the SQL and test ingestion/retrieval against your own configured Supabase project to verify live integrations.

The basic `/api/health/database` check still verifies `starter_health`, not the vector migration. A successful document ingestion followed by a retrieval query verifies the new vector path.

Extend `chatbot.graph.js` to add query rewriting, tools, routing, or answer evaluation. Customize the assistant in `prompts.js`. Add authentication at the router before introducing private knowledge or persistent conversations.

References: [LangGraph Graph API](https://docs.langchain.com/oss/javascript/langgraph/graph-api), [LangChain ChatGroq](https://docs.langchain.com/oss/javascript/integrations/chat/groq), [Supabase vectors](https://supabase.com/docs/guides/ai).
