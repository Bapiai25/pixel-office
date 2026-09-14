# PROJECT STATE — Pixel Office

**Saved:** end of the "go live" session. Everything below is on disk and verified; nothing needs rebuilding.

---

## TL;DR — LIVE IN PRODUCTION

**The site is deployed and public:**

# https://pixel-office-live.netlify.app

| Route | What |
|---|---|
| `/` | the crypto research office (main product) |
| `/play.html` | the pixel play space |
| `/terms.html` | terms / disclaimer / privacy |
| `/og.png` | social preview image |

Host: **Netlify** (free plan, account `bapiai25`, site `pixel-office-live`).
Verified live: all routes 200, security headers applied, and the downloaded production
HTML passes the full suite (**85/85**).

### Redeploy after any edit

```bash
cd "/Users/ray/Documents/AI work/deepseek"
# 1. edit pixel-office.html (the source of truth)
# 2. rebuild dist/  (the build step: production <meta>, favicon, disclaimer link,
#    terms.html, robots.txt, _headers — see dist/DEPLOY.md for the exact script block)
# 3. push it live:
python3 tools/netlify_deploy.py --site pixel-office-live
```

`tools/netlify_deploy.py` reads the token that `netlify login` stored, zips `dist/`,
uploads it through the Netlify REST API, waits for `state: ready` and prints the live URL.
It retries on rate limits and falls back to another subdomain name if one is taken.

Auth token lives at `~/Library/Preferences/netlify/config.json` (Netlify CLI config).
If it ever expires: `npx --yes netlify-cli@latest login`.

> Note: API-created sites inherit **SSO visitor access** on this account, which makes every
> page redirect to a Netlify login (401). It is switched off on this site; if a new site
> shows a login wall, run:
> `curl -X PATCH -H "Authorization: Bearer $TOK" -H 'Content-Type: application/json' -d '{"sso_login":false}' https://api.netlify.com/api/v1/sites/$SITE_ID`

## What the product is

A **single-file pixel-art crypto research office**. You are the CIO; 21+ anime-styled AI
analyst desks (market intel, technical, quant, on-chain, whale, security, macro, social…)
answer your questions about digital assets.

- You type an order ("BTC latest price", "what are the current trends?") in the **COMMAND DESK**
  at the top of the page → the responsible desk walks to their seat, works visibly, then
  answers → the answer lands on the **BULLETIN BOARD** next to the input, with a live price
  tag hovering over the answering agent.
- **Honesty rules are baked in**: every number comes from a live feed or the desk says
  `LIVE DATA UNAVAILABLE`. No invented prices, ever.

---

## Files in this workspace

| File | What it is |
|---|---|
| `pixel-office.html` | **The product** (~205 KB, single file, no build step). Office + agents + desk answers. |
| `pixel-play-space.html` | Side app: cozy play space (7 zones, self-hiring cast). |
| `hermes-pixel-office.html` | Dev-team visualiser (polls a local Hermes endpoint; dev-only). |
| `hermes-state-endpoint.py` | Local bridge serving real Hermes state on `127.0.0.1:9119`. |
| `dist/` | **Deployable production bundle** — see `dist/DEPLOY.md`. |
| `dist/index.html` | Production build of the office (meta tags, favicon, disclaimer footer). |
| `dist/terms.html` | Terms / disclaimer / privacy page (linked from both apps). |
| `dist/og.png` | 1200×630 social preview image, generated from the floor render. |
| `tools/` | Test + render tooling (see below). |
| `previews/` | Raw BMP renders; PNG copies in `office-room-preview.png`, `office-cast-preview.png`. |
| `.git` | Repo initialised, everything committed (`Pixel Office: crypto research floor + play space…`). |

---

## How to run it

```bash
cd "/Users/ray/Documents/AI work/deepseek"

# dev server (live APIs need http://, not file://)
python3 -m http.server 8080 --bind 127.0.0.1     # → http://127.0.0.1:8080/pixel-office.html

# production bundle preview
cd dist && python3 -m http.server 8090            # → http://127.0.0.1:8090
```

Background servers that were running during the session: `:8080` (apps), `:8090` (dist),
`:9119` (Hermes state bridge). They do not survive a reboot — just re-run the commands.

---

## Verification (run these after any edit)

```bash
cd "/Users/ray/Documents/AI work/deepseek"
node tools/run-office.js pixel-office.html     # expect: 85 passed, 0 failed
node tools/run-office.js dist/index.html       # same suite against the built bundle
node tools/run-play.js pixel-play-space.html   # expect: 23 passed, 0 failed

# syntax gate for any of the HTML files
node -e "const fs=require('fs');fs.writeFileSync('/tmp/x.js',fs.readFileSync('pixel-office.html','utf8').match(/<script>([\s\S]*?)<\/script>/)[1])" && node --check /tmp/x.js

# re-render the cast + floor previews (writes previews/*.bmp, convert with sips)
node tools/render-office.js && node tools/render-room.js
sips -s format png previews/office-room.bmp --out office-room-preview.png
```

`tools/` contains a hand-rolled mock DOM (`dom-office.js`, `dom-play.js`) plus a
**pixel-recording canvas** (`dom-render.js`) that can rasterise the real sprite code to an
image — that's how the character previews are produced and how visual changes get checked.

---

## Feature inventory (all working, all tested)

**Live data — auto-connected, keyless, CORS-verified**
- Prices: CoinGecko → Binance → Coinbase (fallback chain, honest failure states)
- Fear & Greed: alternative.me · BTC mempool fees: mempool.space · Trending pools: GeckoTerminal
- Free LLM: Pollinations (keyless) — desks answer with live context even before you add a key

**AI / API settings (⚙ AI / API button)**
- Mode: FREE (keyless) / DeepSeek / Claude (Anthropic) / ChatGPT (OpenAI)
- Model field with per-provider suggestions · Medium: bubble only / bulletin only / both
- Key fields per provider, stored **only in the user's browser**, sent straight to the provider
- TEST CONNECTION button, APPLY TO ALL DESKS, **EXPORT TRAINING DATA (JSONL)**

**Self-learning**
- Each desk keeps lessons, a track record (tasks, GOOD/FLAG %, paper-trade P&L)
- Feed it: GOOD/FLAG buttons on every bulletin answer + paper-trade outcomes
- Every answer is captured as a fine-tuning record (system prompt, user order, reply, rating,
  trade P&L) → exportable as JSONL; a daily LEARNING DIGEST goes to shared office memory

**Presentation**
- 22 distinct characters (straw-hat Luffy, green-haired Zoro with sword, fur-hat Law,
  skull-faced Brook, horned Chopper…) built from a mix-and-match parts library
- 40×48 sprite art blitted 1:1 (4× the detail of the original 20×24 art)
- Room scaled to the reference: 480×580 canvas, **85×78 desk cells, 5 desks per row**,
  desks with live-tape monitors, mugs, papers, name plaques
- AUTO-TOUR guided walk, clickable prop tiles (espresso/vending/cooler/sofa/table/jukebox),
  neon sign, live clock, working-indicator dots, floating price tags, day/night, scanlines

---

## Open items / next time

1. **Custom domain** — buy one and attach it in the Cloudflare dashboard (HTTPS is automatic).
3. **Monetization** — add a Stripe Payment Link or LemonSqueezy checkout to the header when
   you're ready; no backend needed.
4. **Rate limits** — public market APIs are fine for personal/small traffic. If it grows,
   put price fetching behind a small cache or a paid plan; only the endpoint URL changes.
5. **Optional**: ship `hermes-pixel-office.html` too (it needs a public state endpoint to be
   useful in production — currently it points at localhost).

---

## Session log (what was built, in order)

1. Interactive movement + task assignment in the office
2. Full 20-role crypto charter embedded; live prices (CoinGecko/Binance/Coinbase)
3. Anime character parts library + mix-and-match builder
4. Mission-control / Hermes-style state polling (dev)
5. NAKAMA-reference ports: AUTO-TOUR, clickable prop tiles, neon sign
6. AI/API settings (mode, medium, keys) + boss natural-language routing + bulletin board
7. Front-of-page command desk + bulletin, live clock
8. Free keyless API auto-connect (F&G, mempool, GeckoTerminal, Pollinations free LLM)
9. Self-learning: memory, ratings, trade attribution, office digest, JSONL training export
10. Per-character looks (22 distinct appearances)
11. Sprite art rebuilt at 40×48 with reference anatomy, then room rescaled to 85×78 cells
12. Production bundle: meta/OG/favicon, terms + disclaimer, security headers, deploy notes
13. **Deployed live to Netlify** → https://pixel-office-live.netlify.app (verified 85/85 in production)
