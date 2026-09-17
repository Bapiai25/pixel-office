# 🏢 Pixel Office — Digital Asset Research Floor

A pixel-art crypto research office that runs in a single HTML file. You are the CIO; 21+ anime-styled
AI analyst desks research the market, answer your orders out loud, and post their findings on a
bulletin board — with live prices, honest data labels, and a Telegram bot that sends updates to
your phone.

**Live:** https://pixel-office-live.netlify.app

---

## What it does

**Ask in plain language.** Type `BTC latest price` or `what are the current trends?` into the
command desk at the top of the page. The responsible desk (market intel, technical, quant, on-chain,
whale, security, macro, social…) walks to its seat, works visibly, and answers. The answer lands on
the bulletin board next to your input, and the price hovers over the analyst's head.

**Nothing is invented.** Every figure comes from a live feed, or the desk says
`LIVE DATA UNAVAILABLE` and names the source that would fill the gap. House rules are enforced in
every prompt: separate FACT / DATA / INTERPRETATION / SPECULATION, no hype, no price targets,
research only.

**It learns.** Every desk keeps its own lessons and track record. Rate an answer 👍 GOOD or 🚩 FLAG;
open a paper trade from an answer and the desk is credited or blamed on close. Each answer is also
captured as a fine-tuning record and exportable as JSONL — plus a daily learning digest shared
across the whole office.

**It keeps working.** `⟳ AUTO-LOOP` makes the floor self-directed: a desk picks up the next question
from a research rotation every N seconds. `tools/office_worker.py` does the same with the browser
closed and pushes each cycle to Telegram.

---

## Features

| Area | What's included |
|---|---|
| **Live data** | CoinGecko → Binance → Coinbase fallback chain, Fear & Greed (alternative.me), BTC mempool fees (mempool.space), trending pools (GeckoTerminal) — all free and keyless |
| **LLM desks** | FREE keyless tier (Pollinations) out of the box, or bring your own **DeepSeek / Claude / ChatGPT** key (stored only in your browser) |
| **Honesty layer** | live/unavailable labelling, missing-dataset reporting, quota-notice detection with a local data-grounded fallback |
| **Speed** | speculative answering (LLM latency overlaps the work animation), fast mode, 2-minute answer cache |
| **Telegram** | desk answers, market alerts and the daily digest pushed to your chat, straight from the browser (Bot API is CORS-open) |
| **Autonomy** | in-app AUTO-LOOP + `tools/office_worker.py` background worker with a JSONL audit log |
| **Self-learning** | per-desk lessons, GOOD/FLAG ratings, paper-trade attribution, JSONL training export |
| **Office life** | 22 distinct hand-built pixel characters, 5×5 desk grid at reference scale, AUTO-TOUR, clickable props, live clock, day/night, scanlines, working indicators |
| **Compliance** | visible disclaimer in both apps + a full `terms.html` (research, not financial advice; keys stay local; no analytics) |

---

## Run it locally

Live market data needs a real origin — opening the file directly (`file://`) blocks the API calls.

```bash
git clone <this repo> && cd pixel-office
python3 -m http.server 8080 --bind 127.0.0.1
# → http://127.0.0.1:8080/pixel-office.html
```

## Test it

The project ships with a hand-rolled mock DOM and a **pixel-recording canvas** (so sprite art can be
rasterised and inspected), driving **105 checks** over the office and 23 over the play space.

```bash
node tools/run-office.js pixel-office.html      # 105 passed, 0 failed
node tools/run-play.js pixel-play-space.html         # 23 passed, 0 failed

node tools/render-office.js                     # renders the whole cast to previews/*.bmp
node tools/render-room.js                        # renders the floor
python3 tools/office_worker.py --once --dry-run  # one autonomous research cycle
```

## Deploy it

Everything is static — no backend, no build step on the server.

```bash
python3 tools/build_dist.py        # inject meta/OG/disclaimer, write dist/
python3 tools/netlify_deploy.py --site <your-site>   # push dist/ to Netlify
```

`dist/` can also be dropped onto Netlify Drop, pushed to Vercel/Cloudflare Pages, or published with
GitHub Pages. See `dist/DEPLOY.md`.

---

## Project layout

```
pixel-office.html        the product — single file, no build step
pixel-play-space.html    side app: a cozy pixel world that grows on its own
dist/                    production bundle (index.html, play.html, terms.html, og.png)
tools/                   test harnesses, renderers, build + deploy scripts, background worker
previews/                rendered cast + floor images
PROJECT-STATE.md         full session handoff: status, next steps, commands
```

## Configuration

Open **⚙ AI / API** in the app:

- **Mode** — free keyless tier, or DeepSeek / Claude / ChatGPT with your own key
- **Medium** — where answers appear: agent bubble, bulletin board, or both
- **Telegram bot** — token from @BotFather, press **FIND** to auto-discover the chat id
- **Response speed / auto-loop interval**

Keys are stored in your browser's localStorage and sent directly to the provider. There is no server
of ours anywhere in the path.

## Licence & disclaimer

Research and educational tool. **Not financial advice.** Market data may be delayed, incomplete or
unavailable; AI-written answers can be wrong and are not verified. See `dist/terms.html`.
