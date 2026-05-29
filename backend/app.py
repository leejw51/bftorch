"""FastAPI application for the PyTorch Sandbox backend.

Exposes the PROTOCOL.md JSON API. Generates NO HTML — the TypeScript/Three.js
frontend talks to this purely via JSON over REST + WebSocket.

Run with:

    uvicorn backend.app:app --reload --port 8000
"""

from __future__ import annotations

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from . import lessons as lessons_mod
from . import trainer as trainer_mod
from .executor import run_code

app = FastAPI(title="PyTorch Sandbox Backend", version="1.0")

# Permissive CORS for dev (Vite at http://localhost:5173, etc.).
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --------------------------------------------------------------------------- #
# Request models
# --------------------------------------------------------------------------- #

class RunRequest(BaseModel):
    code: str
    timeout: float = 15.0


# --------------------------------------------------------------------------- #
# REST endpoints
# --------------------------------------------------------------------------- #

@app.get("/api/health")
def health() -> dict:
    torch_version = "unavailable"
    mps_available = False
    try:
        import torch

        torch_version = torch.__version__
        mps_available = bool(
            getattr(torch.backends, "mps", None)
            and torch.backends.mps.is_available()
        )
    except Exception:
        pass

    return {
        "status": "ok",
        "torch": torch_version,
        "device": "cpu",
        "mps": mps_available,
    }


@app.get("/api/lessons")
def get_lessons() -> dict:
    lessons = [
        {
            "id": l["id"],
            "title": l["title"],
            "explanation": l["explanation"],
            "starter_code": l["starter_code"],
            "hint": l["hint"],
        }
        for l in lessons_mod.LESSONS
    ]
    return {"lessons": lessons}


@app.get("/api/demos")
def get_demos() -> dict:
    return {"demos": trainer_mod.demos_list()}


@app.post("/api/run")
def post_run(req: RunRequest) -> dict:
    return run_code(req.code, timeout=req.timeout)


# --------------------------------------------------------------------------- #
# WebSocket — live training
# --------------------------------------------------------------------------- #

@app.websocket("/ws/train")
async def ws_train(websocket: WebSocket) -> None:
    await websocket.accept()
    try:
        config = await websocket.receive_json()

        demo = config.get("demo")
        epochs = int(config.get("epochs", 200))
        lr = float(config.get("lr", 0.05))
        hidden = int(config.get("hidden", 32))
        seed = int(config.get("seed", 0))

        if demo not in trainer_mod.DEMOS:
            await websocket.send_json({
                "type": "error",
                "message": (
                    f"Unknown demo {demo!r}. "
                    f"Choose from {list(trainer_mod.DEMOS)}."
                ),
            })
            await websocket.close()
            return

        for frame in trainer_mod.train(
            demo, epochs=epochs, lr=lr, hidden=hidden, seed=seed
        ):
            await websocket.send_json(frame)

        await websocket.close()

    except WebSocketDisconnect:
        # Client went away; nothing to do.
        return
    except Exception as exc:  # noqa: BLE001
        try:
            await websocket.send_json({"type": "error", "message": str(exc)})
            await websocket.close()
        except Exception:
            pass
