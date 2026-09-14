#!/usr/bin/env python3
"""Pixel Office background worker — the research loop that runs with the browser closed.

Every cycle it:
  1. pulls the same free live data the app uses (CoinGecko, Fear & Greed, mempool, GeckoTerminal)
  2. picks the next question from the desk rotation and routes it to a desk
  3. asks an LLM for the desk answer (free keyless Pollinations by default, or your own key)
  4. pushes the answer to your Telegram bot
  5. appends the full record to worker-log.jsonl (audit trail + future fine-tuning data)

Usage:
  python3 tools/office_worker.py --check          # validate config, test Telegram, then exit
  python3 tools/office_worker.py --once           # run a single cycle (good for testing)
  python3 tools/office_worker.py --once --dry-run # one cycle, print instead of sending
  python3 tools/office_worker.py                  # run forever (Ctrl+C to stop)
  python3 tools/office_worker.py --interval 120   # override the cycle time

Config lives in worker-config.json next to this file (created on first run).

The house rules are enforced in the prompt: never invent a number, say
"LIVE DATA UNAVAILABLE" for anything the feed does not carry, and separate
FACT / DATA / INTERPRETATION / SPECULATION.
"""
import argparse, json, os, random, signal, sys, time, urllib.request, urllib.error
from datetime import datetime, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
CONFIG = os.path.join(ROOT, "worker-config.json")
LOG = os.path.join(ROOT, "worker-log.jsonl")

DEFAULT_CONFIG = {
    "telegram": {"token": "", "chat_id": "", "enabled": False},
    "llm": {"provider": "pollinations", "api_key": "", "model": ""},
    "interval_seconds": 300,
    "symbols": ["BTC", "ETH", "SOL"],
    "rotation": [
        {"desk": "Market Intelligence", "ask": "Scan the tape: what changed in the tracked set and what is the regime?"},
        {"desk": "Technical", "ask": "Where is structure breaking or holding in the tracked set?"},
        {"desk": "Portfolio Risk", "ask": "What is the biggest risk in the majors right now, stated plainly?"},
        {"desk": "Narrative", "ask": "What are the trending pools telling us, and what would make it overheated?"},
        {"desk": "On-chain", "ask": "What do BTC mempool conditions say about network demand right now?"},
        {"desk": "Market Intelligence", "ask": "Summarise breadth and sentiment, and name the single biggest uncertainty."},
    ],
}

HOUSE_RULES = """You are one desk in a pixel-art crypto research office. Non-negotiable house rules:
- Never invent a number. Every figure must come from the LIVE DATA block below or you say LIVE DATA UNAVAILABLE.
- Separate FACT, DATA, INTERPRETATION and SPECULATION explicitly.
- Name what is missing from the feed instead of guessing it.
- No hype, no promises, no price targets.
- Finish with a score out of 100 for your desk, or "NO SCORE - insufficient data", and one line naming the biggest uncertainty.
- This is research, not financial advice. Keep it under 1400 characters."""


def load_config():
    if not os.path.exists(CONFIG):
        json.dump(DEFAULT_CONFIG, open(CONFIG, "w"), indent=2)
        print(f"created {CONFIG} — add your Telegram token/chat id there")
        return dict(DEFAULT_CONFIG)
    cfg = json.load(open(CONFIG))
    for k, v in DEFAULT_CONFIG.items():
        cfg.setdefault(k, v)
    return cfg


def get(url, timeout=25):
    req = urllib.request.Request(url, headers={"User-Agent": "pixel-office-worker/1.0"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8", "replace"))


def post_json(url, payload, headers=None, timeout=120):
    req = urllib.request.Request(url, data=json.dumps(payload).encode(), method="POST")
    req.add_header("Content-Type", "application/json")
    # some providers (pollinations) reject the default python user-agent
    req.add_header("User-Agent", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                                 "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122 Safari/537.36")
    req.add_header("Accept", "application/json")
    for k, v in (headers or {}).items():
        req.add_header(k, v)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8", "replace"))


# ---------------------------------------------------------------- live data
CG_IDS = {"BTC": "bitcoin", "ETH": "ethereum", "SOL": "solana", "XRP": "ripple",
          "BNB": "binancecoin", "DOGE": "dogecoin", "ADA": "cardano", "AVAX": "avalanche-2",
          "LINK": "chainlink", "TON": "the-open-network", "SUI": "sui", "ARB": "arbitrum"}


def market_snapshot(symbols):
    lines, src = [], "unavailable"
    data = {"rows": [], "fng": None, "fees": None, "pools": [], "source": "unavailable"}
    ids = ",".join(CG_IDS[s] for s in symbols if s in CG_IDS)
    try:
        rows = get("https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=" + ids +
                   "&price_change_percentage=24h,7d&sparkline=false")
        for r in rows:
            sym = next((k for k, v in CG_IDS.items() if v == r["id"]), r["id"][:5].upper())
            data["rows"].append({"sym": sym, "price": r["current_price"],
                                 "chg": r.get("price_change_percentage_24h") or 0,
                                 "chg7": r.get("price_change_percentage_7d_in_currency") or 0,
                                 "mcap": r.get("market_cap") or 0, "rank": r.get("market_cap_rank"),
                                 "low": r.get("low_24h"), "high": r.get("high_24h")})
            lines.append(f"- {sym} ${r['current_price']:,} | 24h {r.get('price_change_percentage_24h') or 0:+.2f}%"
                         f" | 7d {r.get('price_change_percentage_7d_in_currency') or 0:+.2f}%"
                         f" | mcap ${(r.get('market_cap') or 0):,} | rank #{r.get('market_cap_rank')}"
                         f" | 24h range {r.get('low_24h')}-{r.get('high_24h')}")
        src = "CoinGecko"
    except Exception as e:
        try:
            for s in symbols:
                d = get(f"https://api.binance.com/api/v3/ticker/24hr?symbol={s}USDT")
                lines.append(f"- {s} ${float(d['lastPrice']):,} | 24h {float(d['priceChangePercent']):+.2f}%")
                data["rows"].append({"sym": s, "price": float(d["lastPrice"]),
                                     "chg": float(d["priceChangePercent"]), "chg7": 0,
                                     "mcap": 0, "rank": None, "low": None, "high": None})
            src = "Binance"
        except Exception as e2:
            lines.append(f"LIVE DATA UNAVAILABLE (CoinGecko: {e}; Binance: {e2})")

    extras = []
    try:
        fng = get("https://api.alternative.me/fng/?limit=1")["data"][0]
        data["fng"] = {"value": int(fng["value"]), "label": fng["value_classification"]}
        extras.append(f"Fear & Greed: {fng['value']}/100 ({fng['value_classification']}) — alternative.me")
    except Exception:
        extras.append("Fear & Greed: LIVE DATA UNAVAILABLE")
    try:
        f = get("https://mempool.space/api/v1/fees/recommended")
        data["fees"] = {"fast": f["fastestFee"], "economy": f["economyFee"]}
        extras.append(f"BTC mempool fees: {f['fastestFee']} sat/vB fast, {f['economyFee']} economy — mempool.space")
    except Exception:
        extras.append("BTC mempool fees: LIVE DATA UNAVAILABLE")
    try:
        pools = get("https://api.geckoterminal.com/api/v2/networks/trending_pools")["data"][:4]
        names = []
        for p in pools:
            a = p.get("attributes", {})
            chg = (a.get("price_change_percentage") or {}).get("h24")
            names.append(f"{a.get('name', '?')}" + (f" {float(chg):+.1f}%" if chg not in (None, "") else ""))
            data["pools"].append({"name": a.get("name", "?"),
                                  "chg": float(chg) if chg not in (None, "") else None})
        extras.append("Trending pools (24h): " + "; ".join(names) + " — GeckoTerminal")
    except Exception:
        extras.append("Trending pools: LIVE DATA UNAVAILABLE")

    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    body = "\n".join(lines + [""] + extras)
    data["source"] = src
    return f"LIVE DATA ({src}, fetched {stamp}):\n{body}", src, data


# ---------------------------------------------------------------- local desk answer
def local_answer(desk, ask, data):
    """A desk answer built from the live feed alone — used when no LLM is reachable.
    Same house rules as the app: label the data, name the gaps, never invent a number."""
    rows = data.get("rows") or []
    if not rows:
        return ("LIVE DATA UNAVAILABLE — no price feed answered this cycle, so I will not state a number.\n"
                "Source that would answer it: CoinGecko / Binance market endpoints.\n"
                "SCORE: NO SCORE — insufficient data.")
    src = data.get("source", "feed")
    up = [r for r in rows if r["chg"] > 0]
    lead = max(rows, key=lambda r: abs(r["chg"]))
    L = [f"DATA ({src}, this cycle): " + " · ".join(f"{r['sym']} ${r['price']:,.2f} {r['chg']:+.2f}%" for r in rows), ""]
    L.append(f"FACT: {len(up)}/{len(rows)} of the tracked set is up over 24h; "
             f"the largest absolute move is {lead['sym']} at {lead['chg']:+.2f}%.")
    if data.get("fng"):
        L.append(f"DATA: Fear & Greed {data['fng']['value']}/100 ({data['fng']['label']}) — alternative.me.")
    if data.get("fees"):
        L.append(f"DATA: BTC mempool {data['fees']['fast']} sat/vB fast, {data['fees']['economy']} economy — mempool.space.")
    if data.get("pools"):
        top = sorted([x for x in data["pools"] if x["chg"] is not None], key=lambda x: -(x["chg"] or 0))[:3]
        if top:
            L.append("DATA: trending pools — " + "; ".join(f"{x['name']} {x['chg']:+.1f}%" for x in top) + ".")
    L.append("")
    regime = "RISK ON" if len(up) == len(rows) else ("RISK OFF" if not up else "MIXED")
    L.append(f"INTERPRETATION: breadth reads {regime} on this tracked set ({len(up)}/{len(rows)} up) — "
             "a statement about the sampled majors, not the whole market.")
    if desk.lower().startswith("risk"):
        L.append("INTERPRETATION: correlated majors are one bet wearing several tickers — size accordingly.")
    L.append("LIVE DATA UNAVAILABLE: order books, funding, open interest, ETF flows, unlocks, "
             "on-chain wallet labels and news. I will not estimate them.")
    L.append("SCORE: NO SCORE — this is a price-only desk read.")
    L.append(f"BIGGEST UNCERTAINTY: whether this breadth holds outside the {len(rows)} symbols sampled.")
    L.append("")
    L.append("Research, not financial advice.")
    return "\n".join(L)


# ---------------------------------------------------------------- llm
def ask_llm(cfg, system, user):
    prov = (cfg.get("provider") or "pollinations").lower()
    key = cfg.get("api_key") or ""
    model = cfg.get("model") or ""
    if prov == "pollinations":
        d = post_json("https://text.pollinations.ai/openai",
                      {"model": model or "openai",
                       "messages": [{"role": "system", "content": system},
                                    {"role": "user", "content": user}]})
        return d["choices"][0]["message"]["content"]
    if prov == "deepseek":
        d = post_json("https://api.deepseek.com/chat/completions",
                      {"model": model or "deepseek-chat",
                       "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}]},
                      {"Authorization": "Bearer " + key})
        return d["choices"][0]["message"]["content"]
    if prov == "openai":
        d = post_json("https://api.openai.com/v1/chat/completions",
                      {"model": model or "gpt-4o-mini",
                       "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}]},
                      {"Authorization": "Bearer " + key})
        return d["choices"][0]["message"]["content"]
    if prov == "claude":
        d = post_json("https://api.anthropic.com/v1/messages",
                      {"model": model or "claude-3-5-haiku-latest", "max_tokens": 1200,
                       "system": system, "messages": [{"role": "user", "content": user}]},
                      {"x-api-key": key, "anthropic-version": "2023-06-01"})
        return "".join(b.get("text", "") for b in d.get("content", []))
    raise SystemExit(f"unknown llm provider: {prov}")


SOFT_ERROR_MARKERS = ["reached its budget", "raise the key budget", "rate limit", "too many requests",
                      "unauthorized", "invalid api key", "quota", "payment required", "insufficient",
                      "try again later", "service unavailable"]


def looks_like_error(text):
    """Free tiers answer HTTP 200 with a notice in the body — treat those as failures."""
    t = (text or "").strip().lower()
    if len(t) < 40:
        return True
    return any(m in t for m in SOFT_ERROR_MARKERS)


# ---------------------------------------------------------------- telegram
def tg_send(cfg, text):
    tg = cfg["telegram"]
    if not (tg.get("enabled") and tg.get("token") and tg.get("chat_id")):
        return False, "telegram disabled (set enabled/token/chat_id in worker-config.json)"
    try:
        post_json(f"https://api.telegram.org/bot{tg['token']}/sendMessage",
                  {"chat_id": tg["chat_id"], "text": text, "parse_mode": "HTML",
                   "disable_web_page_preview": True})
        return True, "sent"
    except urllib.error.HTTPError as e:
        return False, f"HTTP {e.code}: {e.read().decode('utf-8', 'replace')[:200]}"
    except Exception as e:
        return False, str(e)


def esc(t):
    return str(t or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


# ---------------------------------------------------------------- cycle
def run_cycle(cfg, dry_run=False, quiet=False):
    rotation = cfg["rotation"]
    step = _STATE["cycle"] % len(rotation)
    job = rotation[step]
    _STATE["cycle"] += 1

    snapshot, src, data = market_snapshot(cfg["symbols"])
    system = HOUSE_RULES + f"\n\nYOU ARE: the {job['desk']} desk."
    user = f"Desk question: {job['ask']}\n\n{snapshot}"

    engine = cfg["llm"].get("provider", "pollinations")
    try:
        answer = ask_llm(cfg["llm"], system, user)
        if looks_like_error(answer):
            raise RuntimeError("provider returned a notice, not an answer")
        ok = True
    except Exception as e:
        # no LLM (offline, budget exhausted, bad key) -> the desk still answers from the feed
        answer = local_answer(job["desk"], job["ask"], data)
        engine = f"local template (LLM {type(e).__name__})"
        ok = False

    stamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    record = {"at": stamp, "cycle": _STATE["cycle"], "desk": job["desk"], "ask": job["ask"],
              "data_source": src, "snapshot": snapshot, "answer": answer, "llm_ok": ok}

    msg = (f"🏢 <b>Pixel Office · {esc(job['desk'])}</b>\n"
           f"<i>{esc(job['ask'])}</i>\n\n{esc(answer)}\n\n"
           f"<i>data: {esc(src)} · engine: {esc(engine)} · cycle {_STATE['cycle']} · {stamp}</i>")

    with open(LOG, "a") as fh:
        fh.write(json.dumps(record) + "\n")

    if dry_run:
        if not quiet:
            print("\n" + "=" * 74 + f"\n{job['desk']} — {job['ask']}\n{'-'*74}\n{answer}\n")
        return record, True, "dry run (not sent)"
    sent, why = tg_send(cfg, msg)
    if not quiet:
        flag = "sent" if sent else "NOT sent"
        print(f"[{stamp}] cycle {_STATE['cycle']:>4} · {job['desk']:<20} · llm {'ok' if ok else 'FAILED'} · telegram {flag}"
              + ("" if sent else f" ({why})"))
    return record, sent, why


_STATE = {"cycle": 0, "stop": False}


def main():
    ap = argparse.ArgumentParser(description="Pixel Office background research worker")
    ap.add_argument("--once", action="store_true", help="run a single cycle then exit")
    ap.add_argument("--dry-run", action="store_true", help="print instead of sending to Telegram")
    ap.add_argument("--check", action="store_true", help="validate config, test Telegram, exit")
    ap.add_argument("--interval", type=int, help="override interval_seconds")
    ap.add_argument("--quiet", action="store_true")
    args = ap.parse_args()

    cfg = load_config()
    if args.interval:
        cfg["interval_seconds"] = args.interval

    if args.check:
        print(f"config: {CONFIG}")
        print(f"  llm      : {cfg['llm'].get('provider')} {cfg['llm'].get('model') or '(default model)'}")
        print(f"  telegram : {'enabled' if cfg['telegram'].get('enabled') else 'disabled'}"
              f" token={'set' if cfg['telegram'].get('token') else 'missing'}"
              f" chat={'set' if cfg['telegram'].get('chat_id') else 'missing'}")
        snapshot, src, _ = market_snapshot(cfg["symbols"])
        print(f"  feed     : {src}")
        print("  " + snapshot.replace("\n", "\n  "))
        sent, why = tg_send(cfg, "🏢 <b>Pixel Office worker</b>\nConnectivity check — this chat will receive desk research.")
        print(f"  telegram test: {'OK' if sent else 'FAILED — ' + why}")
        return

    def stop(*_):
        _STATE["stop"] = True
        print("\nstopping after this cycle …")
    signal.signal(signal.SIGINT, stop)
    signal.signal(signal.SIGTERM, stop)

    if args.once:
        run_cycle(cfg, args.dry_run, args.quiet)
        return

    print(f"Pixel Office worker started · every {cfg['interval_seconds']}s · "
          f"llm={cfg['llm'].get('provider')} · telegram={'on' if cfg['telegram'].get('enabled') else 'off'} · "
          f"log={os.path.relpath(LOG, ROOT)}")
    while not _STATE["stop"]:
        t0 = time.time()
        try:
            run_cycle(cfg, args.dry_run, args.quiet)
        except Exception as e:
            print(f"cycle error: {e}")
        wait = max(10, cfg["interval_seconds"] - (time.time() - t0))
        end = time.time() + wait
        while time.time() < end and not _STATE["stop"]:
            time.sleep(1)
    print("worker stopped.")


if __name__ == "__main__":
    main()
