"""End-to-end smoke test for the PyTorch Sandbox backend.

Runs without a live server (uses FastAPI's in-process TestClient), so `make test`
needs nothing running. Exits non-zero on the first failure.
"""
import sys

from fastapi.testclient import TestClient

from backend.app import app

client = TestClient(app)
_failures = 0


def check(name, cond, detail=""):
    global _failures
    mark = "✅" if cond else "❌"
    print(f"{mark} {name}" + (f"  ({detail})" if detail else ""))
    if not cond:
        _failures += 1


# --- REST ----------------------------------------------------------------- #
h = client.get("/api/health").json()
check("GET /api/health", h.get("status") == "ok", f"torch={h.get('torch')} mps={h.get('mps')}")

les = client.get("/api/lessons").json()["lessons"]
check("GET /api/lessons", len(les) == 12, f"{len(les)} lessons")
check("lesson schema", all({"id", "title", "explanation", "starter_code", "hint"} <= set(l) for l in les))

demos = client.get("/api/demos").json()["demos"]
keys = {d["key"] for d in demos}
check("GET /api/demos", {"linreg", "sine", "classify_blobs"} <= keys, f"keys={sorted(keys)}")

run = client.post("/api/run", json={"code": "x = torch.arange(6).reshape(2,3)\nprint('hi')\nx.sum()"}).json()
check("POST /api/run ok", run["ok"] is True and run["error"] is None)
check("POST /api/run stdout", run["stdout"].strip() == "hi")
check("POST /api/run result_repr", run["result_repr"] == "tensor(15)")
tx = {t["name"]: t for t in run["tensors"]}
check("POST /api/run tensor extraction", "x" in tx and tx["x"]["shape"] == [2, 3], f"tensors={list(tx)}")

err = client.post("/api/run", json={"code": "1/0"}).json()
check("POST /api/run error path", err["ok"] is False and err["error"], "division by zero is reported")

big = client.post("/api/run", json={"code": "x = torch.arange(10000)"}).json()
bx = next(t for t in big["tensors"] if t["name"] == "x")
check("POST /api/run truncation", bx["truncated"] is True)

# --- WebSocket ------------------------------------------------------------ #
for demo, kind in [("linreg", "regression"), ("classify_blobs", "classification"), ("sine", "regression")]:
    with client.websocket_connect("/ws/train") as ws:
        ws.send_json({"demo": demo, "epochs": 30, "lr": 0.05, "hidden": 16, "seed": 0})
        frames, last = 0, None
        while True:
            m = ws.receive_json()
            if m.get("type") == "error":
                last = m
                break
            frames += 1
            last = m
            if m.get("done"):
                break
        ok = last and last.get("type") != "error" and last.get("done") and last["viz"]["kind"] == kind
        check(f"WS /ws/train [{demo}]", bool(ok), f"{frames} frames, kind={last.get('viz', {}).get('kind')}")

print()
if _failures:
    print(f"❌ {_failures} check(s) failed")
    sys.exit(1)
print("✅ all backend checks passed")
