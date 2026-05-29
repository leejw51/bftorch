"""Top-level entry point for the packaged PyTorch Sandbox.

This is what the `bftorch` pyapp binary boots into (`program:main`). It picks a
free TCP port, prints a machine-readable `ui-url=` line that the Tauri shell
(`bftorch-app`) parses to know where to point its webview, then runs a single
uvicorn process serving `backend.app` — which exposes the JSON API (/api, /ws)
*and*, in the packaged build, the bundled Three.js frontend mounted at "/".

There is no backend/frontend process split here (unlike bfagent): the FastAPI
app is the whole server, so one in-process uvicorn is all we need.
"""

from __future__ import annotations

import os
import socket
import sys


def free_port() -> int:
    """Ask the OS for an unused loopback port."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def main() -> None:
    host = os.environ.get("BFTORCH_HOST", "127.0.0.1")
    port = int(os.environ.get("BFTORCH_PORT") or free_port())
    # Re-export so child workers / reloads (and anyone reading the env) agree.
    os.environ["BFTORCH_HOST"] = host
    os.environ["BFTORCH_PORT"] = str(port)

    ui_url = f"http://{host}:{port}/"
    # These lines are a contract with tauri/src/main.rs — keep the prefixes.
    print(f"[bftorch] pid={os.getpid()}", flush=True)
    print(f"[bftorch] port={port}", flush=True)
    print(f"[bftorch] ui-url={ui_url}", flush=True)

    import uvicorn

    try:
        uvicorn.run(
            "backend.app:app",
            host=host,
            port=port,
            log_level=os.environ.get("BFTORCH_LOG_LEVEL", "info"),
        )
    except KeyboardInterrupt:
        print("\n[bftorch] shutting down.", flush=True)
        sys.exit(0)


if __name__ == "__main__":
    main()
