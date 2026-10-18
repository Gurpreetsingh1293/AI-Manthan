# AI Manthan starter

A JavaScript npm-workspaces monorepo for a four-person hackathon team.

- **Frontend:** React + Vite, plain CSS
- **Backend:** Express, JavaScript ES modules
- **Database:** Supabase Postgres, accessed through the backend
- **AI:** LangChain + LangGraph chatbot with Groq, optional Supabase vector retrieval, and a replaceable embedding provider

See **[Chatbot setup and API guide](docs/chatbot.md)** for the chatbot module, document ingestion, vector migration, conversation history, and request examples.

## Quick start

Install Node.js 24 LTS. From the repository root:

```sh
npm install
```

Copy `apps/api/.env.example` to `apps/api/.env`. In PowerShell:

```powershell
Copy-Item apps/api/.env.example apps/api/.env
```

On macOS/Linux: `cp apps/api/.env.example apps/api/.env`.

```sh
npm run dev
```

Open **http://localhost:5173**. Express runs on **http://localhost:3001**. Vite proxies `/api` to Express, so the frontend needs no environment configuration locally. If you change the backend port, update the proxy in `apps/web/vite.config.js` too.

The UI and health endpoint work without credentials. AI and database actions return setup instructions until configured. Restart the backend after editing its environment file.

## Connect Groq

Create an API key in the [Groq console](https://console.groq.com/keys), then set these in `apps/api/.env`:

```dotenv
GROQ_API_KEY=your-key
GROQ_MODEL=llama-3.3-70b-versatile
```

The model is configurable; use a model available to your account. The chatbot's model and prompts live in `apps/api/src/modules/chatbot/llm.js` and `prompts.js`. It accepts conversation history through the API. The original single-prompt endpoint remains in `apps/api/src/services/groq.js` for compatibility.

## Connect Supabase

1. Create a Supabase project.
2. Copy its project URL and backend secret key from the project settings into `SUPABASE_URL` and `SUPABASE_SECRET_KEY` in `apps/api/.env`. A legacy `service_role` key can also be used for the latter.
3. Run `supabase/migrations/001_starter.sql` in the project's SQL editor.
4. Restart the backend and select **Test Supabase connection** in the UI.

The starter table exists only to verify connectivity. Add your domain tables and migrations when you choose a problem statement. Row-level security is enabled and browser roles have no access to the starter table. The backend secret key bypasses RLS: add authentication and authorization before implementing user-specific data routes. Never put this key or the Groq key in a `VITE_` variable or commit `.env` files.

## Structure and team ownership

```text
apps/
  web/                       Frontend engineer
    src/App.jsx              Starter screen
    src/lib/api.js           API helper
    src/styles.css           UI styles
  api/                       Backend engineer
    src/app.js               Routes and middleware
    src/config.js            Backend environment configuration
    src/server.js            Server lifecycle
    src/modules/chatbot/     AI engineer: graph, LLM, embeddings, vectors, routes
    src/services/supabase.js Database service
    test/                    API and provider-adapter tests
supabase/migrations/         SQL migrations
.github/workflows/ci.yml     Integration/deployment owner
```

Use feature branches and small pull requests. Agree on API request/response formats before changing them. Coordinate edits to the root lockfile and shared configuration. Run `npm test` and `npm run build` before merging.

## API contract

| Method | Endpoint | Result |
| --- | --- | --- |
| GET | `/api/health` | `{ status: "ok", services: { groq: boolean, supabase: boolean } }` |
| GET | `/api/health/database` | `{ status: "connected" }` after a real database query |
| POST | `/api/ai/chat` | Accepts `{ prompt: "..." }`; returns `{ reply: "...", model: "..." }` |
| POST | `/api/chatbot/chat` | Accepts `{ message, history?, useRetrieval? }`; returns `{ reply, model, sources }` |
| POST | `/api/chatbot/documents` | Private ingestion endpoint; accepts `{ text, source, title? }` |

Errors use `{ error: "Human-readable message" }`. Prompts must be non-empty strings of at most 8,000 characters. AI requests and database checks each allow 10 requests per minute per IP. The health endpoint reports whether credentials are configured, not whether the providers are reachable.

The demo API is unauthenticated. Add authentication and appropriate spending controls before exposing a paid AI endpoint publicly. The included rate limiter uses process memory; use a shared store if deploying multiple instances.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start both apps with automatic reload |
| `npm run dev:web` | Start React only |
| `npm run dev:api` | Start Express only |
| `npm test` | Run tests without real credentials or paid API calls |
| `npm run build` | Build the React frontend |
| `npm start` | Start Express |

## Deployment

For one Node service, run `npm ci` and `npm run build` during the build step. Set `NODE_ENV=production` and the backend environment variables in the host's settings, then use `npm start`. Express serves `apps/web/dist` in production along with `/api`. Set `CLIENT_ORIGIN` to the public frontend origin. The host can supply `PORT`.

If your host uses a reverse proxy, set `TRUST_PROXY_HOPS` to the exact number of trusted proxies so rate limiting identifies clients correctly. Leave it at `0` locally.

For separate deployments, build the frontend with `VITE_API_URL=https://your-api-host.example` (no `/api` suffix), publish `apps/web/dist`, and set the backend's `CLIENT_ORIGIN` to the frontend origin. `VITE_` values are public and embedded at build time. Configure the static host to fall back to `index.html` if you add client-side routes.

GitHub Actions runs the tests and frontend build on pushes and pull requests. No provider credentials are needed for CI.

## References

- [Vite setup](https://vite.dev/guide/)
- [Groq chat API](https://console.groq.com/docs/api-reference)
- [Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys)
- [Supabase JavaScript client](https://supabase.com/docs/reference/javascript/initializing)
