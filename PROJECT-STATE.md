# PROJECT STATE — Pixel Office

**Saved:** end of the "go live" session. Everything below is on disk and verified; nothing needs rebuilding.

---

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
HTML passes the full suite (**105/105**).

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

