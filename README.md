# PyTorch Sandbox 🧪

An interactive, browser-based playground for **learning PyTorch by doing** — type code, run it,
and watch tensors and training come alive in **3D**.

- **Backend** — Python + PyTorch + FastAPI. Exposes a pure **JSON** API (REST + WebSocket). Generates no HTML.
- **Frontend** — TypeScript + **Three.js** + Vite. Renders everything in an Apple-polished 3D scene.
- **Contract** — see [`PROTOCOL.md`](./PROTOCOL.md). The two halves talk only via JSON.

## Features

- **🧪 Sandbox** — type PyTorch code (`torch`, `nn`, `F`, `np`, `math` preloaded), run it (Ctrl/Cmd+Enter),
  see stdout / the last expression / errors, and **visualize your tensors in 3D** — scalars as glowing
  spheres, vectors as bar rows, matrices as height-mapped cube grids, 3-D tensors as voxel volumes.
- **📚 Lessons** — a 12-step curriculum from tensors → autograd → training a neural net. Load a lesson's
  starter code into the editor and run it.
- **🚀 Live Trainer** — watch tiny models train live over a WebSocket: a 3-D loss ribbon plus a
  regression fit or a classification decision surface, updating every few epochs.

## Quick start

```bash
make install      # Python venv + backend deps, and frontend npm deps
make start        # backend on :8200, frontend on :5173 (make stop to stop)
# open http://localhost:5173
```

Or run the halves separately:

```bash
make backend      # uvicorn backend.app:app --reload --port 8200

Change the port once via `make PORT=9000 start` — the Vite proxy follows automatically.
make frontend     # vite dev server (proxies /api and /ws to the backend)
```

Other targets: `make build` (production frontend build), `make clean`.

## Native macOS app

The whole sandbox ships as a single double-clickable macOS app — no Python, Node,
or terminal required by the end user. Packaging is **macOS / Apple Silicon only**.

```bash
make package      # builds ./bftorch.dmg
open bftorch.dmg  # then drag "PyTorch Sandbox" to Applications
```

What `make package` does:

1. Builds the Three.js frontend (`npm run build`) and copies it into
   `backend/static/`, so the FastAPI server serves the SPA and the JSON API on
   one origin.
2. Builds a wheel (`program.py` + the `backend` package + the bundled static
   frontend) and wraps it with [`pyapp`](https://github.com/ofek/pyapp) into a
   self-bootstrapping `./bftorch` binary. On first launch it downloads a pinned
   CPython and the Python deps (PyTorch etc.) into
   `~/Library/Application Support/pyapp/bftorch` — once, then cached.
3. Builds the Tauri shell `./bftorch-app`, which launches `./bftorch`, reads the
   `ui-url=` it prints, waits for the port, and opens a native webview window.
4. Assembles `bftorch.app` (shell + server side by side in `Contents/MacOS/`)
   and packs it into `bftorch.dmg`.

Useful sub-targets: `make package-py` (server binary only), `make package-tauri`
(window shell only), `make app` (the `.app`, no dmg), `make run` (build then
launch the window), `make icon` (regenerate the app icon).

> First build is slow — `cargo install pyapp` and the Tauri release build both
> compile from source. Subsequent builds reuse the cargo caches.

## Layout

```
backend/          FastAPI app + PyTorch
  app.py            REST + WebSocket endpoints (JSON only)
  executor.py       safe code execution + tensor → JSON extraction
  trainer.py        streaming training demos (JSON frames)
  lessons.py        the curriculum
frontend/
  src/api.ts        typed JSON client (REST + WebSocket)
  src/scene.ts      Three.js Visualizer (tensors, loss curve, fits, surfaces)
  src/main.ts       app shell + tabs, wires API ↔ Visualizer
  src/style.css     Apple-polished design system
program.py        packaged entry point (free port → uvicorn → prints ui-url)
pyproject.toml    wheel definition (backend package + bundled static frontend)
tauri/            native-window shell (Rust) that wraps the pyapp server
assets/make_icon.py  zero-dependency app-icon generator
PROTOCOL.md       the JSON contract between backend and frontend
Makefile          install / dev / build / clean / package
```

## Requirements

- Python 3.10+ (PyTorch 2.x)
- Node 18+ / npm
- For `make package`: macOS on Apple Silicon, a Rust toolchain (`cargo`), and Xcode CLT
