#!/usr/bin/env python3
"""Generate the bftorch app icon (icons/icon.png) with zero dependencies.

Draws a glowing flame (a nod to PyTorch) on a rounded-square gradient tile,
2x-supersampled for clean edges, and writes it as an 8-bit RGBA PNG using only
the standard library. Run via `make icon`; the Makefile skips it if the file
already exists.
"""

from __future__ import annotations

import math
import struct
import sys
import zlib
from pathlib import Path

SIZE = 1024     # output resolution
SS = 2          # supersampling factor per axis


def _lerp(a, b, t):
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))


def _smoothstep(edge0, edge1, x):
    if edge1 == edge0:
        return 0.0 if x < edge0 else 1.0
    t = max(0.0, min(1.0, (x - edge0) / (edge1 - edge0)))
    return t * t * (3 - 2 * t)


# Palette
BG_TOP = (0x20, 0x12, 0x3a)      # deep indigo
BG_BOT = (0x3b, 0x14, 0x5e)      # violet
FLAME_TOP = (0xff, 0xd1, 0x66)   # warm yellow
FLAME_MID = (0xff, 0x7a, 0x2f)   # orange
FLAME_BOT = (0xee, 0x3d, 0x2f)   # red
DOT = (0xff, 0xe6, 0xa8)         # the PyTorch-style spark


def _flame_halfwidth(ny: float, cy: float, r: float, ty: float) -> float:
    """Half-width of the teardrop flame at normalized vertical position ny."""
    if ny >= cy:  # rounded bottom (circle)
        d = r * r - (ny - cy) ** 2
        return math.sqrt(d) if d > 0 else 0.0
    # tapering top -> point at ty
    span = cy - ty
    if span <= 0:
        return 0.0
    return r * max(0.0, (ny - ty) / span)


def _sample(px: float, py: float) -> tuple:
    """Return RGBA (0-255) for a point in [0,1]x[0,1]."""
    # Rounded-square tile coverage with a transparent margin.
    margin = 0.06
    radius = 0.22
    x = px
    y = py
    inset0, inset1 = margin, 1.0 - margin
    # distance outside the rounded rect (0 inside)
    dx = max(inset0 - x, x - inset1, 0.0)
    dy = max(inset0 - y, y - inset1, 0.0)
    # corner rounding
    cx = min(max(x, inset0 + radius), inset1 - radius)
    cy = min(max(y, inset0 + radius), inset1 - radius)
    corner_d = math.hypot(x - cx, y - cy) - radius
    edge = max(dx, dy, corner_d) if corner_d > 0 else max(dx, dy)
    alpha = 1.0 - _smoothstep(0.0, 0.004, edge)
    if alpha <= 0.0:
        return (0, 0, 0, 0)

    # Background vertical gradient.
    bg = _lerp(BG_TOP, BG_BOT, y)
    r_, g_, b_ = bg

    # Flame geometry (normalized).
    fcx = 0.5
    cy_f = 0.62      # center of the rounded bottom
    r_f = 0.24       # bottom radius
    ty_f = 0.20      # tip
    hw = _flame_halfwidth(y, cy_f, r_f, ty_f)
    if hw > 0:
        # asymmetric wobble so the flame leans like a real one
        lean = 0.06 * math.sin((y - ty_f) * 6.0)
        dxf = abs(x - (fcx + lean))
        cov = 1.0 - _smoothstep(hw - 0.012, hw, dxf)
        if cov > 0:
            t = _smoothstep(ty_f, cy_f + r_f, y)
            if t < 0.5:
                fc = _lerp(FLAME_TOP, FLAME_MID, t * 2)
            else:
                fc = _lerp(FLAME_MID, FLAME_BOT, (t - 0.5) * 2)
            r_ = round(r_ + (fc[0] - r_) * cov)
            g_ = round(g_ + (fc[1] - g_) * cov)
            b_ = round(b_ + (fc[2] - b_) * cov)

    # Spark dot above the flame tip.
    dot_d = math.hypot(x - fcx, y - 0.16) - 0.028
    dcov = 1.0 - _smoothstep(0.0, 0.006, dot_d)
    if dcov > 0:
        r_ = round(r_ + (DOT[0] - r_) * dcov)
        g_ = round(g_ + (DOT[1] - g_) * dcov)
        b_ = round(b_ + (DOT[2] - b_) * dcov)

    return (r_, g_, b_, round(alpha * 255))


def render() -> bytearray:
    stride = SIZE * 4
    buf = bytearray(SIZE * stride)
    inv = 1.0 / (SIZE * SS)
    for j in range(SIZE):
        row = j * stride
        for i in range(SIZE):
            ar = ag = ab = aa = 0
            for sj in range(SS):
                py = ((j * SS + sj) + 0.5) * inv
                for si in range(SS):
                    px = ((i * SS + si) + 0.5) * inv
                    r, g, b, a = _sample(px, py)
                    ar += r * a
                    ag += g * a
                    ab += b * a
                    aa += a
            n = SS * SS
            o = row + i * 4
            if aa > 0:
                buf[o] = min(255, ar // aa)
                buf[o + 1] = min(255, ag // aa)
                buf[o + 2] = min(255, ab // aa)
            buf[o + 3] = aa // n
    return buf


def write_png(path: Path, width: int, height: int, rgba: bytearray) -> None:
    def chunk(typ: bytes, data: bytes) -> bytes:
        return (
            struct.pack(">I", len(data))
            + typ
            + data
            + struct.pack(">I", zlib.crc32(typ + data) & 0xFFFFFFFF)
        )

    ihdr = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)
    stride = width * 4
    raw = bytearray()
    for y in range(height):
        raw.append(0)  # filter type: none
        raw.extend(rgba[y * stride : (y + 1) * stride])
    idat = zlib.compress(bytes(raw), 9)
    path.write_bytes(
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", ihdr)
        + chunk(b"IDAT", idat)
        + chunk(b"IEND", b"")
    )


def main() -> None:
    out = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("tauri/icons/icon.png")
    out.parent.mkdir(parents=True, exist_ok=True)
    print(f"[icon] rendering {SIZE}x{SIZE} -> {out}", flush=True)
    write_png(out, SIZE, SIZE, render())
    print(f"[icon] wrote {out} ({out.stat().st_size} bytes)", flush=True)


if __name__ == "__main__":
    main()
