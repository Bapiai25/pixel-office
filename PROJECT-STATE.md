# PROJECT STATE — Pixel Office

**Saved:** end of the "go live" session. Everything below is on disk and verified; nothing needs rebuilding.

---

## Response to the external architecture reviews

Two reviews were shared (a ChatGPT share link and a pasted security/architecture note). Outcome:

**Backend added (the thing I had argued was unnecessary — it wasn't)**
`netlify/functions/`: `health` · `llm` (server-side AI, owner key, per-IP rate limited) · `feed`
(scheduled research visible to every visitor) · `research` (hourly autonomous cycle → Telegram +
storage) · `research-now` (token-guarded manual trigger). Verified live: `/api/health` and `/api/feed`
respond on the production URL, a real research cycle ran end-to-end (`stored:true`) and appeared in
the feed seconds later. With **no env vars** the app behaves exactly as before (BYOK/free), so the
backend is opt-in and cannot break the product. Tests: 11 function checks + 9 client checks.

**Fixed — real issues they correctly flagged**
- **XSS in the ticker** (genuine, key-stealing): user-typed task titles and alert text were interpolated
  into `rail.innerHTML` unescaped. A payload like `<img src=x onerror="…localStorage…">` would have run
  and could have read the LLM/Telegram keys out of localStorage. Now escaped, with 8 regression tests
  (task board, ticker, alerts, command modal, bulletin, Telegram payloads).
- **Latent crash**: `pushAlert()` called a `renderAlerts()` that never existed — if an alert fired while
  the alerts tab was open, the exception was swallowed by the feed's try/catch and could knock the price
  chain into its fallback. Fixed to `renderView()` + regression test.
- **Content-Security-Policy** added (plus COOP), scoped to exactly the origins the app uses.

**Implemented — their genuinely valuable suggestions**
- **Data Confidence Engine**: every refresh cross-checks CoinGecko against Binance for each tracked
  symbol; desks are told the spread, and a divergence over 0.5% is flagged as unreliable.
- **New free desks/data** (all keyless, CORS-verified): derivatives (Binance futures funding rate,
  open interest, long/short account ratio), narratives (CoinGecko categories 24h leaders/laggards),
  DeFi TVL (DeFiLlama), large BTC transfers (mempool.space, size only — explicitly *not* labelled
  smart money). Free sources went from 3 → **8**, all shown on the FREE APIS chip.

**Clarified — where their premise did not match this design**
- "Never call an LLM from the frontend / keys in JS are exposed": this app ships **no** owner keys.
  It is bring-your-own-key: a visitor's key lives in *their* localStorage and goes straight to *their*
  provider. Verified: no token-shaped string exists anywhere in the repo or the built bundle. A backend
  proxy + env vars only becomes necessary if we ever sell AI credits the owner pays for — at which point
  the proxy also needs auth and rate limiting (documented, not built).
- Redux/Zustand, WebSockets, a database: not applicable at this size. The app is a single file with a
  plain state object; WebSockets would require a backend and the data sources are REST-only; localStorage
  keeps the product deployable with zero infrastructure. Worth revisiting only with a paid tier.

**Still open (next candidates)** — multi-desk debate + synthesis ("AI research team"), streaming
token-by-token answers with a collapsible thought process, skeleton loaders while a desk works.

## Security & privacy posture (verified)

- **No credentials in the repo or the site.** Scanned every revision for token-shaped strings: none.
  The `worker-config.json` that was briefly tracked contained empty key fields (verified by reading
  the old blob) — nothing was ever exposed.
- **Purged from git history** (not just untracked): `worker-config.json`, `worker-log.jsonl`,
  `.netlify-site`, `AGENTS.md`, `dist/DEPLOY.md` → 0 objects remain across all revisions; verified
  via the GitHub contents API (404) and code search (0 hits).
- **Nothing internal is published.** Deploy notes moved to `DEPLOY.md` at the repo root (outside
  `dist/`), so the web root serves only `index.html`, `play.html`, `terms.html`, `og.png`,
  `robots.txt`, `_headers`. `/DEPLOY.md` on the live site now returns 404.
- **Local paths and personal identifiers removed** from all tracked files (no `/Users/...`,
  no account slugs, no site ids). Commit author is the GitHub noreply address only.
- **Runtime secrets stay on your machine**: `worker-config.json` + `worker-log.jsonl` are gitignored
  and never leave your disk except as Telegram messages you configure.
- See `SECURITY.md` for the visitor-facing model (keys live in each visitor's own browser).

> Note on force-pushing: the rewritten history was force-pushed, so the old commits are no longer
> referenced. GitHub may keep unreferenced objects reachable by SHA for a while — irrelevant here
> because they contained no secrets, but contact GitHub support if you ever need a hard purge of
> genuinely sensitive data.

## Source of truth

**GitHub (public):** the project repo — 9 commits, everything attributed to
the repo owner. Auth is the GitHub CLI (`gh`, installed at `~/.local/bin/gh`) with the device-flow token;
`gh auth setup-git` wires git to it, so plain `git push` works.

```bash
cd "$REPO"   # your local clone
git add -A && git commit -m "…" && git push        # normal workflow from here
```

`worker-config.json` (Telegram token) and `worker-log.jsonl` are **gitignored on purpose** — the repo
ships `worker-config.example.json` instead. Never commit the real one: the repo is public.

## TL;DR — LIVE IN PRODUCTION

**The site is deployed and public:**

# https://pixel-office-live.netlify.app

| Route | What |
|---|---|
| `/` | the crypto research office (main product) |
| `/play.html` | the pixel play space |
| `/terms.html` | terms / disclaimer / privacy |
| `/og.png` | social preview image |

Host: **Netlify** (free plan; the site name and account are in the Netlify dashboard).
Verified live: all routes 200, security headers applied, and the downloaded production
HTML passes the full suite (**142/142**).

### New in this round (production customisations)

**Telegram bot updates** — desks push answers, market alerts and the daily digest straight to
your chat. The Bot API is CORS-open, so the browser talks to it directly; your token stays in
your own browser. Set it up in the app: **⚙ AI / API → TELEGRAM BOT** (token + chat id + which
events to send + TEST TELEGRAM). Get a token from **@BotFather**, then send your bot one message.

**Autonomous work loop** — the header **⟳ AUTO-LOOP** button turns the floor self-directed: every
N seconds (default 120, set in ⚙ settings) a desk picks the next question from a research rotation,
walks to its seat, answers, and posts to the bulletin + Telegram. Alerts wake the loop early, and
it never piles up more than two working desks. The **LOOP** chip counts down to the next run.

**Faster responses** — three changes:
1. *Speculative execution*: a desk starts answering the moment the task is assigned, so LLM
   latency overlaps the work animation instead of stacking on top of it (roughly halves wait time).
2. *Fast mode* (default on): the work animation is 45% shorter. Switch to CINEMATIC in settings.
3. *Answer cache*: an identical question on the same desk, provider and tape replays instantly,
   labelled "(cached answer from Ns ago — the tape has not moved since)". 2-minute window.

**Background worker (runs with the browser closed)** — `tools/office_worker.py` is the always-on
version of the loop. It pulls the same live data, rotates desks, asks an LLM if one is reachable,
**falls back to a local data-grounded desk answer when the free tier is out of budget**, and pushes
to Telegram. Every cycle is appended to `worker-log.jsonl` (audit trail + future training data).

```bash
python3 tools/office_worker.py --check        # validate config + live data + telegram test
python3 tools/office_worker.py --once --dry-run
python3 tools/office_worker.py                # run forever (Ctrl+C stops)
```

Config lives in `worker-config.json` (created on first run): telegram token/chat, LLM provider +
key, interval, symbols, and the desk rotation. Point `llm.provider` at `deepseek`/`openai`/`claude`
with a key for richer answers, or leave it on `pollinations` (keyless).

> **Free-tier reality check:** the keyless Pollinations tier ran out of budget on this network during
> testing and answered HTTP 200 with a quota notice. Both the app and the worker now detect that and
> fall back to the local live-data desk answer, so users always get a grounded answer. For heavy
> production use, run with your own key (DeepSeek is the cheapest of the three).

Rebuild + redeploy after any edit:

```bash
python3 tools/build_dist.py                          # rebuild dist/
node tools/run-office.js dist/index.html             # verify the bundle
python3 tools/netlify_deploy.py --site pixel-office-live
```

### Redeploy after any edit

```bash
cd "$REPO"   # your local clone
# 1. edit pixel-office.html (the source of truth)
# 2. rebuild dist/  (the build step: production <meta>, favicon, disclaimer link,
#    terms.html, robots.txt, _headers — see dist/DEPLOY.md for the exact script block)
# 3. push it live:
python3 tools/netlify_deploy.py --site pixel-office-live
```

`tools/netlify_deploy.py` reads the token that `netlify login` stored, zips `dist/`,
uploads it through the Netlify REST API, waits for `state: ready` and prints the live URL.
It retries on rate limits and falls back to another subdomain name if one is taken.

Auth token lives at your local Netlify CLI config.
If the token ever expires: `npx --yes netlify-cli@latest login`.

