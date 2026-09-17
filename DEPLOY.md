# Pixel Office — deploy notes

The whole product is static: `dist/` is the deployable folder, nothing to build on the server.

```
dist/
  index.html    ← the crypto research office (main product)
  play.html     ← the pixel play space (side app)
  terms.html    ← terms, disclaimer, privacy
  og.png        ← 1200x630 social preview image
  robots.txt
  _headers      ← security headers (Netlify / Cloudflare Pages)
```

## What is already production-ready

- **No backend, no keys on a server.** Every desk's LLM key (if the user adds one) lives in
  that user's own browser localStorage and is sent straight to the provider.
- **All data sources are keyless and CORS-verified** for direct browser calls:
  CoinGecko → Binance → Coinbase (prices) · alternative.me (Fear & Greed) ·
  mempool.space (BTC fees) · GeckoTerminal (trending pools) · Pollinations (free LLM).
- **Graceful degradation**: if a source is down the desk says `LIVE DATA UNAVAILABLE`
  instead of inventing a number.
- **Disclaimer** in the footer of both apps + a full `terms.html`.

## Deploy options (pick one)

### 1. Netlify Drop — fastest, no account needed to start
Open https://app.netlify.com/drop and drag the **`dist`** folder onto the page.
You get a live HTTPS URL in seconds; claiming the site (free account) makes it permanent
and lets you attach a custom domain.

### 2. Netlify CLI
```bash
npx netlify-cli deploy --dir=dist --prod
```
First run opens a browser to log in / create a free account.

### 3. Vercel
```bash
npx vercel --prod dist
```
(or `npx vercel login` first for the interactive flow)

### 4. Cloudflare Pages
```bash
npx wrangler pages deploy dist --project-name pixel-office
```
`_headers` is honoured automatically.

### 5. GitHub Pages
```bash
git init && git add dist && git commit -m "pixel office"
# push to a repo, then Settings → Pages → deploy from branch, folder /dist
```
GitHub Pages ignores `_headers` (that's fine, it's optional hardening).

## After the first deploy

1. **Custom domain** — buy one (Namecheap/Cloudflare, ~$10/yr) and point it at the host's
   DNS target; HTTPS is automatic on all four hosts above.
2. **Update the social preview** — `og.png` is generated from a render of the floor; swap it
   for a screenshot of the live site any time.
3. **Analytics (optional)** — none is included on purpose. If you add any, add a cookie
   notice and update `terms.html` §5 to match.
4. **Rate limits** — the public market APIs are fine for personal use and small traffic.
   If usage grows, move price fetching behind a small cache (or a paid CoinGecko/Binance
   plan); the browser code only needs the endpoint URL changed.
5. **Monetization** — the app is a single static page, so Stripe Payment Links or
   LemonSqueezy checkout links can be added to the header without any backend.

## Rebuilding `dist/` after editing the apps

```bash
cd "$REPO"   # your local clone
# edit pixel-office.html / pixel-play-space.html, then re-run the build step
# (the build only injects production <meta> tags, the favicon, the footer disclaimer
#  link, plus terms/robots/headers — the app code itself is copied verbatim)
```

## Local production check

```bash
cd dist && python3 -m http.server 8090
# open http://127.0.0.1:8090  (index.html, play.html, terms.html)
```
