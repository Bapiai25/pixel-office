# Security & privacy

## The short version

Pixel Office is a **static page**. There is no backend, no database, no analytics and no telemetry.
Nothing about you or your users is collected, and there is nowhere for it to be stored.

## Where credentials live

| Credential | Where it is stored | Where it goes |
|---|---|---|
| LLM API keys (DeepSeek / Claude / ChatGPT) | your browser's `localStorage` only | sent directly from your browser to that provider |
| Telegram bot token + chat id | your browser's `localStorage` only | sent directly to `api.telegram.org` |
| Netlify / GitHub tokens (development only) | your machine's CLI config | never part of this repo or the site |

The project owner holds **no** keys for anyone else. There is no server that could leak them, and
`dist/` contains no credentials — the site ships with every key field empty.

## What the site talks to

All requests go straight from the visitor's browser to first-party public APIs:

`api.coingecko.com` · `api.binance.com` · `api.coinbase.com` · `api.alternative.me` ·
`mempool.space` · `api.geckoterminal.com` · `text.pollinations.ai` · `api.telegram.org` ·
`fonts.googleapis.com`

There is no proxy and no analytics. Those providers see the visitor's IP address exactly as any
website visit would.

## Data that stays on the device

Settings, per-desk learning memory, bulletin history and the optional training-data records live in
`localStorage`. They never leave the browser unless the user explicitly exports the JSONL file.
Clearing browser data removes them.

## Repository hygiene

- `worker-config.json` (holds the Telegram token) and `worker-log.jsonl` are **gitignored**; the repo
  ships `worker-config.example.json` instead.
- Local absolute paths, personal identifiers and deploy metadata are kept out of tracked files.
- `AGENTS.md` (internal working notes) and deploy notes are untracked / outside `dist/`, so they are
  never published.
- No secrets are committed anywhere in the history — verified by scanning every revision.

## If the serverless backend is enabled

The optional backend in `netlify/functions/` never puts a secret in the browser:

- The owner's LLM key lives in a **Netlify environment variable** and is used only inside the function.
  It is never returned to the client (a test asserts the key never appears in any response).
- CORS is an explicit allowlist of the site's own origins — unknown origins are not echoed back.
- Requests are **rate limited per IP** (default 30/hour, 120/day) so an exposed key cannot be drained.
- Input is validated and capped (question 800 chars, notes 400, symbols allowlisted) before any model call.
- The manual research trigger requires `ADMIN_TOKEN`; the hourly schedule cannot be invoked over HTTP.
- Scheduled research stores only market commentary — no visitor data, no IPs, no identifiers.

When the backend is **not** configured, `/api/health` reports `serverAI:false` and the app falls back to
the browser-only model (free keyless tier or the visitor's own key).

## Reporting

If you find a security or privacy problem, please open an issue (or contact the owner privately for
anything sensitive) rather than posting exploit details publicly.

## Honest limitations

- Free public APIs can rate-limit or go offline; when that happens the desks say
  `LIVE DATA UNAVAILABLE` rather than inventing numbers, and quota notices are never shown to users.
- AI-written answers can be wrong. They are opinions to verify, not facts.
- Nothing here is financial advice.
