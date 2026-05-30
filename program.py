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
    from backend import netdbg

    # In debug mode bind to 0.0.0.0 so other machines on the LAN can reach the
    # packaged server (which serves the UI *and* the API on one origin). HTTPS
    # is opt-in here (BFTORCH_HTTPS=true) rather than on-by-default: the Tauri
    # webview can't trust a self-signed cert, so the local window stays HTTP
    # unless you explicitly ask for TLS.
    debug = netdbg.is_debug()
    https = netdbg.https_enabled(default=False)

    default_host = netdbg.bind_host(debug)
    host = os.environ.get("BFTORCH_HOST", default_host)
    port = int(os.environ.get("BFTORCH_PORT") or free_port())
    # Re-export so child workers / reloads (and anyone reading the env) agree.
    os.environ["BFTORCH_HOST"] = host
    os.environ["BFTORCH_PORT"] = str(port)

    ssl_kwargs: dict = {}
    if https:
        cert, key = netdbg.ensure_cert()
        ssl_kwargs = {"ssl_certfile": str(cert), "ssl_keyfile": str(key)}

    scheme = "https" if https else "http"
    # The Tauri shell connects its webview to the loopback address regardless of
    # what uvicorn binds to, so keep ui-url on 127.0.0.1 (0.0.0.0 isn't a valid
    # connect target on macOS). The scheme must match how uvicorn is serving.
    ui_url = f"{scheme}://127.0.0.1:{port}/"
    # These lines are a contract with tauri/src/main.rs — keep the prefixes.
    print(f"[bftorch] pid={os.getpid()}", flush=True)
    print(f"[bftorch] port={port}", flush=True)
    print(f"[bftorch] ui-url={ui_url}", flush=True)

    # When reachable from the LAN, tell the user which URL to open elsewhere.
    netdbg.banner(context="packaged", https=https, debug=debug, be_port=port)

    import uvicorn

    try:
        uvicorn.run(
            "backend.app:app",
            host=host,
            port=port,
            log_level=os.environ.get("BFTORCH_LOG_LEVEL", "info"),
            **ssl_kwargs,
        )
    except KeyboardInterrupt:
        print("\n[bftorch] shutting down.", flush=True)
        sys.exit(0)


if __name__ == "__main__":
    main()
