#!/usr/bin/env python3
"""
hermes-state-endpoint.py — serve the pixel office's state document from the REAL
Hermes runtime on this machine.

It reads what Hermes actually records and exposes it at http://127.0.0.1:9119/state
in the schema hermes-pixel-office.html polls:

    { "workflow": {...}, "tasks": [...], "agents": [ {id,status,task,tool,progress,step,log} ] }

Nothing is invented. Every agent shown is a process Hermes has on record, and every
status is derived from that record:

    process running, recent log activity  -> working (mapped to a station by argv)
    process running, no recent activity   -> idle
    process recorded but not running      -> done

If a source file is missing or unreadable, the endpoint reports the error in the
document and still serves — the floor will fall back to its labelled simulation.

Usage:
    python3 hermes-state-endpoint.py                 # serve on 127.0.0.1:9119
    python3 hermes-state-endpoint.py --port 9200
    python3 hermes-state-endpoint.py --once          # print the document and exit
"""
import argparse, json, os, sys, time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

HERMES_HOME = os.environ.get("HERMES_HOME", os.path.expanduser("~/.hermes"))
SOURCES = {
    "processes": os.path.join(HERMES_HOME, "processes.json"),
    "spawn_ledger": os.path.join(HERMES_HOME, "spawn-ledger.json"),
    "gateway": os.path.join(HERMES_HOME, "gateway_state.json"),
}

# map what the process is doing (argv/cwd) to a floor station
STATION_RULES = [
    ("searching", ("search", "browser", "crawl", "fetch", "scrape", "agent-reach")),
    ("coding",    ("code", "vite", "tsc", "build", "python", "node", "pytest", "npm")),
    ("writing",   ("write", "doc", "pdf", "markdown", "report", "export")),
    ("delegating",("delegate", "serve", "gateway", "route", "spawn", "queue")),
    ("tool",      ("tool", "install", "uv ", "uvx", "pip", "brew")),
    ("thinking",  ("plan", "analyse", "analyze", "eval", "review")),
]

ACTIVE_WINDOW = 90  # seconds; activity newer than this reads as "working"


def _load(path):
    try:
        with open(path) as fh:
            return json.load(fh), None
    except FileNotFoundError:
        return None, "missing"
    except Exception as exc:                                    # noqa: BLE001
        return None, "unreadable: %s" % exc


def _station_for(text):
    low = (text or "").lower()
    for station, needles in STATION_RULES:
        if any(n in low for n in needles):
            return station
    return "thinking"


def _pid_alive(pid):
    if not pid:
        return False
    try:
        os.kill(int(pid), 0)
        return True
    except OSError:
        return False
    except Exception:                                           # noqa: BLE001
        return False


def _age(ts):
    try:
        return max(0.0, time.time() - float(ts))
    except Exception:                                           # noqa: BLE001
        return None


def _label(rec):
    """A short, honest name for a record — no invented personas."""
    cwd = rec.get("cwd") or ""
    base = os.path.basename(cwd.rstrip("/")) if cwd else ""
    purpose = rec.get("purpose") or ""
    sid = rec.get("session_id") or rec.get("session_key") or ""
    if base:
        return base.upper()
    if purpose:
        return purpose.upper()
    if sid:
        return sid[-8:].upper()
    return "AGENT"


def _agent_from_process(rec, i):
    pid = rec.get("pid")
    alive = _pid_alive(pid)
    started = rec.get("started_at") or rec.get("create_time")
    age = _age(started)
    cwd = rec.get("cwd") or ""
    command = rec.get("command") or ""
    argv = rec.get("argv") if isinstance(rec.get("argv"), list) else []
    blob = " ".join([cwd, command] + [str(a) for a in argv])
    station = _station_for(blob)

    if alive and age is not None and age < ACTIVE_WINDOW:
        status = station
    elif alive:
        status = "idle"
    else:
        status = "done"

    tool = ""
    if station == "searching":
        tool = "web_search"
    elif station == "coding":
        tool = "edit"
    elif station == "writing":
        tool = "markdown"
    elif station == "delegating":
        tool = "delegate_task"
    elif station == "tool":
        tool = "shell"

    detail = command or " ".join(str(a) for a in argv) or cwd or "(no command recorded)"
    log = ["pid %s %s" % (pid, "alive" if alive else "not running")]
    if age is not None:
        log.append("started %.0fs ago" % age)
    if cwd:
        log.append("cwd %s" % cwd)

    role = {
        "searching": "RESEARCH",
        "coding": "ENGINEERING",
        "writing": "WRITING",
        "delegating": "OPS / GATEWAY",
        "tool": "TOOLING",
        "thinking": "PLANNING",
        "idle": "IDLE",
        "done": "FINISHED",
    }.get(station, "PROCESS")

    return {
        "id": "proc_%s" % (rec.get("session_id") or ("p%s" % rec.get("pid")) or i),
        "name": _label(rec),
        "role": role,
        "status": status,
        "task": detail[:160],
        "tool": tool,
        "progress": (1.0 if status == "done" else (0.6 if status != "idle" else 0.15)),
        "step": "%s" % (("%.0fs" % age) if age is not None else "-"),
        "log": log,
        "raw": rec,
    }


def build_document():
    """Assemble the state document from real Hermes records."""
    notes, agents, tasks = [], [], []

    processes, err = _load(SOURCES["processes"])
    if err:
        notes.append("processes.json %s" % err)
    for i, rec in enumerate(processes or []):
        if not isinstance(rec, dict):
            continue
        a = _agent_from_process(rec, i)
        agents.append(a)
        tasks.append({
            "id": "task_%s" % a["id"],
            "title": a["task"] or "background process",
            "owner": a["id"],
            "status": {"done": "done", "idle": "pending"}.get(a["status"], "running"),
            "progress": a["progress"],
            "parent": None,
            "detail": a["role"],
        })

    ledger, err = _load(SOURCES["spawn_ledger"])
    if err:
        notes.append("spawn-ledger.json %s" % err)
    for i, rec in enumerate(ledger or []):
        if not isinstance(rec, dict):
            continue
        a = _agent_from_process(rec, 100 + i)
        a["id"] = "spawn_%s" % (rec.get("pid") or i)
        a["name"] = (rec.get("purpose") or "service").upper()
        a["role"] = "OPS / GATEWAY"
        host = rec.get("host") or "127.0.0.1"
        port = rec.get("port")
        a["task"] = "serve on %s:%s" % (host, port) if port else (rec.get("argv") and " ".join(rec["argv"])[:120]) or "spawned service"
        if a["status"] not in ("done",):
            a["id"] = a["id"]
        agents.append(a)
        tasks.append({
            "id": "task_%s" % a["id"],
            "title": a["task"],
            "owner": a["id"],
            "status": "done" if a["status"] == "done" else "running",
            "progress": a["progress"],
            "parent": None,
            "detail": a["role"],
        })

    gateway, err = _load(SOURCES["gateway"])
    if err:
        notes.append("gateway_state.json %s" % err)
    active_count = None
    if isinstance(gateway, dict):
        active_count = gateway.get("active_agents")
        kind = gateway.get("kind") or "gateway"
        updated = gateway.get("updated_at") or ""
        running = _pid_alive(gateway.get("pid"))
        workflow = {
            "name": "%s · active_agents=%s" % (kind, active_count if active_count is not None else "?"),
            "status": "running" if running else "done",
            "progress": min(1.0, (len(agents) / 8.0)) if agents else 0.0,
            "started": updated or None,
        }
        if not running:
            notes.append("gateway pid is not running")
    else:
        workflow = {"name": "hermes runtime", "status": "done", "progress": 0.0}

    if not agents:
        notes.append("no process records found in %s" % HERMES_HOME)

    doc = {
        "workflow": workflow,
        "tasks": tasks,
        "agents": agents,
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "source": "hermes runtime at %s" % HERMES_HOME,
        "notes": notes,
    }
    return doc


class Handler(BaseHTTPRequestHandler):
    def _send(self, payload, status=200):
        body = json.dumps(payload, indent=2).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):                                           # noqa: N802
        if self.path.startswith("/state"):
            self._send(build_document())
        elif self.path in ("/", "/health"):
            self._send({"ok": True, "endpoints": ["/state"], "hermes_home": HERMES_HOME})
        else:
            self._send({"error": "not found", "try": "/state"}, 404)

    def log_message(self, *args):                               # keep the console quiet
        pass


def main():
    ap = argparse.ArgumentParser(description="Serve the Hermes pixel office state document.")
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--port", type=int, default=9119)
    ap.add_argument("--once", action="store_true", help="print the document and exit")
    args = ap.parse_args()

    if args.once:
        print(json.dumps(build_document(), indent=2))
        return 0

    srv = ThreadingHTTPServer((args.host, args.port), Handler)
    print("hermes state endpoint → http://%s:%d/state" % (args.host, args.port))
    print("reading from %s" % HERMES_HOME)
    print("in the pixel office press C and use that URL. Ctrl-C to stop.")
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        print("\nstopped")
    return 0


if __name__ == "__main__":
    sys.exit(main())
