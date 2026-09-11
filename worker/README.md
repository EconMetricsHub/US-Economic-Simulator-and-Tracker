# MACROSCOPE AI Shock Worker

This optional Cloudflare Worker gives the static GitHub Pages frontend a private server-side LLM bridge. It intentionally implements a **Duck.ai-style chat workflow**, not an undocumented proxy of Duck.ai itself.

## Deploy
1. Install Wrangler: `npm i -g wrangler`
2. Copy `wrangler.toml.example` to `wrangler.toml` and set `ALLOWED_ORIGIN`, `LLM_API_BASE`, and `LLM_MODEL`.
3. Add the provider secret: `wrangler secret put LLM_API_KEY`
4. Deploy: `wrangler deploy`
5. Paste the resulting Worker URL into **Events & Shocks → AI Shock Studio**. The URL is remembered in localStorage.

The worker can target OpenAI-compatible chat-completions providers. The frontend validates the returned target names and requires an explicit user click before a generated shock enters the model.


## v6 analyst mode
POST the same endpoint with `{ "mode": "analyst", "prompt": "...", "context": {...} }` to receive `{ "answer": "..." }`. The Worker instructs the model to use only the supplied MACROSCOPE state and not invent current market facts.
