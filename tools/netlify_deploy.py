#!/usr/bin/env python3
"""Deploy dist/ to Netlify via the REST API (no interactive prompts).

Reads the access token that `netlify login` stored, creates a site if needed,
uploads dist/ as a zip deploy, waits for it to go live and prints the URL.

Usage:
  python3 tools/netlify_deploy.py                 # create/reuse site, deploy dist/
  python3 tools/netlify_deploy.py --site NAME     # use a specific site name
  python3 tools/netlify_deploy.py --list          # just list sites on the account
"""
import json, os, sys, time, zipfile, io, urllib.request, urllib.error, glob

API = "https://api.netlify.com/api/v1"
DIST = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "dist")


def find_token():
    env = os.environ.get("NETLIFY_AUTH_TOKEN")
    if env:
        return env.strip()
    cands = [
        os.path.expanduser("~/Library/Preferences/netlify/config.json"),
        os.path.expanduser("~/.config/netlify/config.json"),
        os.path.expanduser("~/.netlify/config.json"),
    ]
    for path in cands:
        if not os.path.exists(path):
            continue
        try:
            cfg = json.load(open(path))
        except Exception:
            continue
        users = cfg.get("users") or {}
        for uid in users:
            tok = (users[uid].get("auth") or {}).get("token")
            if tok:
                print(f"token: found in {path}")
                return tok
    return None


def call(method, path, token, data=None, ctype="application/json", raw=False):
    url = path if path.startswith("http") else API + path
    body = None
    if data is not None:
        body = data if isinstance(data, bytes) else json.dumps(data).encode()
    req = urllib.request.Request(url, data=body, method=method)
    req.add_header("Authorization", "Bearer " + token)
    if body:
        req.add_header("Content-Type", ctype)
    for attempt in range(6):
        try:
            with urllib.request.urlopen(req, timeout=300) as r:
                payload = r.read()
                return json.loads(payload) if not raw else payload
        except urllib.error.HTTPError as e:
            detail = e.read().decode("utf-8", "replace")[:400]
            if e.code == 429 and attempt < 5:
                wait = 10 * (attempt + 1)
                print(f"  rate limited, retrying in {wait}s …")
                time.sleep(wait)
                continue
            raise SystemExit(f"HTTP {e.code} on {method} {url}\n{detail}")


def zip_dist():
    buf = io.BytesIO()
    files = 0
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        for path in glob.glob(os.path.join(DIST, "**", "*"), recursive=True):
            if os.path.isfile(path):
                z.write(path, os.path.relpath(path, DIST))
                files += 1
    buf.seek(0)
    print(f"zip: {files} files, {len(buf.getvalue())//1024} KB")
    return buf.getvalue()


def main():
    token = find_token()
    if not token:
        raise SystemExit("No Netlify token found. Run: npx --yes netlify-cli@latest login")

    sites = call("GET", "/sites", token)
    if "--list" in sys.argv:
        for s in sites:
            print(f"  {s['name']:32} {s.get('ssl_url') or s.get('url')}")
        return

    name = None
    if "--site" in sys.argv:
        name = sys.argv[sys.argv.index("--site") + 1]

    site = None
    for s in sites:
        if name and s["name"] == name:
            site = s
            break
    if site is None and not name and sites:
        site = sites[0]          # reuse the account's first site
        print(f"site: reusing '{site['name']}'")
    if site is None:
        candidates = [name] if name else []
        if name:
            candidates += [name + "-app", name + "-live", name + "-hq", name + "-ai",
                           name + "-" + time.strftime("%y%m%d")]
        last = None
        for cand in candidates or [None]:
            try:
                site = call("POST", "/sites", token, {"name": cand} if cand else {})
                print(f"site: created '{site['name']}'")
                break
            except SystemExit as e:
                last = e
                if "must be unique" in str(e) or "Not Found" in str(e):
                    print(f"site: '{cand}' is taken, trying another name …")
                    continue
                raise
        if site is None:
            raise last or SystemExit("could not create a site")

    print(f"deploying dist/ to {site['name']} …")
    deploy = call("POST", f"/sites/{site['id']}/deploys", token, zip_dist(), "application/zip")

    for _ in range(60):
        state = deploy.get("state")
        if state in ("ready", "current"):
            break
        if state in ("error", "rejected"):
            raise SystemExit("deploy failed: " + json.dumps(deploy)[:300])
        time.sleep(3)
        deploy = call("GET", f"/sites/{site['id']}/deploys/{deploy['id']}", token)

    url = deploy.get("ssl_url") or deploy.get("url") or site.get("ssl_url") or site.get("url")
    print(f"\nLIVE: {url}")
    print(f"state: {deploy.get('state')}")
    open(os.path.join(os.path.dirname(DIST), ".netlify-site"), "w").write(
        json.dumps({"site_id": site["id"], "name": site["name"], "url": url}, indent=2))


if __name__ == "__main__":
    main()
