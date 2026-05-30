"""Debug / external-access helpers for the PyTorch Sandbox dev servers.

When ``USE_BFTORCH_DEBUG=true`` the dev workflow stops being loopback-only and
makes both halves reachable from *other computers on the LAN*:

  * bind to ``0.0.0.0`` instead of ``127.0.0.1`` (backend uvicorn + Vite),
  * unless ``BFTORCH_HTTPS=false``, serve everything over a self-signed HTTPS
    cert (generated on demand into ``.run/tls/``),
  * print the frontend URL another machine should open.

This module is intentionally **stdlib-only** (it shells out to ``openssl`` for
the certificate) so it can run under the bare system ``python3`` from the
Makefile *and* be imported by ``program.py`` inside the packaged venv. Importing
it must never pull in torch / fastapi.

Env vars (all optional):

  USE_BFTORCH_DEBUG   "true" turns the whole mode on.
  BFTORCH_HTTPS       "false" to force plain HTTP in debug; otherwise HTTPS is
                      the default in debug. Outside debug it is always off.
  BFTORCH_TLS_CERT    Override the cert path (default .run/tls/cert.pem).
  BFTORCH_TLS_KEY     Override the key path  (default .run/tls/key.pem).
  BFTORCH_TLS_REGEN   "1" to force regeneration even if the cert already exists.
"""

from __future__ import annotations

import argparse
import os
import socket
import subprocess
import sys
import tempfile
from pathlib import Path

# Default self-signed material lives beside the other dev run-state.
_DEFAULT_TLS_DIR = Path(".run") / "tls"


def truthy(value: str | None) -> bool:
    """Loose truthiness for env flags ('true', '1', 'yes', 'on')."""
    return (value or "").strip().lower() in {"true", "1", "yes", "on"}


def is_debug() -> bool:
    """Whether external-access debug mode is requested."""
    return truthy(os.environ.get("USE_BFTORCH_DEBUG"))


def https_enabled(default: bool = True) -> bool:
    """Whether to serve HTTPS. Only ever true in debug mode.

    In debug, HTTPS is on unless ``BFTORCH_HTTPS`` is explicitly falsey; the
    ``default`` lets callers (e.g. the packaged server) opt out of HTTPS-by-
    default while still honouring an explicit ``BFTORCH_HTTPS=true``.
    """
    if not is_debug():
        return False
    raw = os.environ.get("BFTORCH_HTTPS")
    if raw is None or raw == "":
        return default
    return truthy(raw)


def bind_host(debug: bool | None = None) -> str:
    """``0.0.0.0`` in debug (reachable from the LAN), else loopback."""
    if debug is None:
        debug = is_debug()
    return "0.0.0.0" if debug else "127.0.0.1"


def lan_ip() -> str | None:
    """Best-effort primary LAN IPv4 of this machine (no packets are sent)."""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        try:
            # Connecting a UDP socket just selects a source interface.
            s.connect(("8.8.8.8", 80))
            ip = s.getsockname()[0]
        finally:
            s.close()
        return ip if ip and not ip.startswith("127.") else None
    except OSError:
        return None


def tls_paths() -> tuple[Path, Path]:
    """Resolved (cert, key) paths, honouring the env overrides."""
    cert = os.environ.get("BFTORCH_TLS_CERT") or str(_DEFAULT_TLS_DIR / "cert.pem")
    key = os.environ.get("BFTORCH_TLS_KEY") or str(_DEFAULT_TLS_DIR / "key.pem")
    return Path(cert), Path(key)


def ensure_cert(cert: Path | None = None, key: Path | None = None) -> tuple[Path, Path]:
    """Generate a self-signed cert/key pair if one isn't already present.

    The cert carries Subject Alternative Names for localhost, 127.0.0.1, ::1
    and the detected LAN IP so browsers on other machines accept it (after the
    usual self-signed warning). Returns the (cert, key) paths.
    """
    if cert is None or key is None:
        d_cert, d_key = tls_paths()
        cert = cert or d_cert
        key = key or d_key
    cert, key = Path(cert), Path(key)

    regen = truthy(os.environ.get("BFTORCH_TLS_REGEN"))
    if not regen and cert.is_file() and key.is_file() and cert.stat().st_size and key.stat().st_size:
        return cert, key

    cert.parent.mkdir(parents=True, exist_ok=True)
    key.parent.mkdir(parents=True, exist_ok=True)

    alt = ["DNS:localhost", "IP:127.0.0.1", "IP:::1"]
    ip = lan_ip()
    if ip:
        alt.append(f"IP:{ip}")

    # A config file (rather than -addext) keeps this portable across the
    # OpenSSL / LibreSSL split on different machines.
    config = (
        "[req]\n"
        "distinguished_name = dn\n"
        "x509_extensions = v3\n"
        "prompt = no\n"
        "[dn]\n"
        "CN = bftorch-dev\n"
        "[v3]\n"
        "basicConstraints = CA:FALSE\n"
        f"subjectAltName = {', '.join(alt)}\n"
    )

    with tempfile.NamedTemporaryFile("w", suffix=".cnf", delete=False) as fh:
        fh.write(config)
        cfg_path = fh.name

    try:
        subprocess.run(
            [
                "openssl", "req", "-x509", "-newkey", "rsa:2048",
                "-nodes", "-sha256", "-days", "825",
                "-keyout", str(key), "-out", str(cert),
                "-config", cfg_path,
            ],
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.PIPE,
        )
    except FileNotFoundError as exc:
        raise RuntimeError(
            "openssl not found — install it or set BFTORCH_HTTPS=false to "
            "run the debug server over plain HTTP."
        ) from exc
    except subprocess.CalledProcessError as exc:
        raise RuntimeError(
            f"openssl failed to create the self-signed cert:\n"
            f"{exc.stderr.decode(errors='replace') if exc.stderr else exc}"
        ) from exc
    finally:
        os.unlink(cfg_path)

    return cert, key


def banner(
    *,
    context: str,
    https: bool,
    debug: bool,
    fe_port: int | None = None,
    be_port: int | None = None,
    lan: str | None = None,
) -> None:
    """Print a friendly 'open this from another computer' banner.

    Only prints in debug mode (when there's actually something to share). For
    ``context='packaged'`` the frontend and backend share one origin, so only a
    single URL is shown.
    """
    if not debug:
        return

    scheme = "https" if https else "http"
    if lan is None:
        lan = lan_ip()
    host = lan or "<this-machine-LAN-IP>"

    lines = [
        "=" * 64,
        " bftorch DEBUG mode — reachable from other computers on the LAN",
        "=" * 64,
    ]

    if context == "packaged":
        if be_port:
            lines += [
                " Open this in a browser on another computer:",
                f"     {scheme}://{host}:{be_port}/",
                f" Local (this machine):  {scheme}://localhost:{be_port}/",
            ]
    else:
        if fe_port:
            lines += [
                " Frontend — open this in a browser on another computer:",
                f"     {scheme}://{host}:{fe_port}/",
            ]
        if be_port:
            lines += [
                " Backend API:",
                f"     {scheme}://{host}:{be_port}/",
            ]
        if fe_port:
            lines += [f" Local (this machine):  {scheme}://localhost:{fe_port}/"]

    if https:
        lines += [
            " HTTPS uses a self-signed cert — the browser will warn once;",
            " choose 'Advanced -> proceed' to continue.",
        ]
    lines.append("=" * 64)
    print("\n".join(lines), flush=True)


# --------------------------------------------------------------------------- #
# CLI — used by the Makefile dev recipes.
# --------------------------------------------------------------------------- #

def _main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(prog="backend.netdbg")
    sub = parser.add_subparsers(dest="cmd", required=True)

    p_cert = sub.add_parser("cert", help="ensure a self-signed cert/key exists")
    p_cert.add_argument("cert", nargs="?")
    p_cert.add_argument("key", nargs="?")

    sub.add_parser("lanip", help="print the detected LAN IPv4 (or nothing)")

    p_ban = sub.add_parser("banner", help="print the external-access banner")
    p_ban.add_argument("--context", default="dev")
    p_ban.add_argument("--fe-port", type=int, default=None)
    p_ban.add_argument("--be-port", type=int, default=None)
    p_ban.add_argument("--https", default="0")
    p_ban.add_argument("--debug", default="0")

    args = parser.parse_args(argv)

    if args.cmd == "cert":
        cert, key = ensure_cert(
            Path(args.cert) if args.cert else None,
            Path(args.key) if args.key else None,
        )
        print(f"{cert}\n{key}")
        return 0

    if args.cmd == "lanip":
        ip = lan_ip()
        if ip:
            print(ip)
        return 0

    if args.cmd == "banner":
        banner(
            context=args.context,
            https=truthy(args.https),
            debug=truthy(args.debug),
            fe_port=args.fe_port,
            be_port=args.be_port,
        )
        return 0

    return 1


if __name__ == "__main__":
    raise SystemExit(_main(sys.argv[1:]))
