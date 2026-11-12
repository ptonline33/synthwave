#!/usr/bin/env python3
"""Generate Synthwave Generator PWA icons using only the Python stdlib.

Design: a neon sunset with a scanline sun over a perspective grid, on a dark
purple field. Supersampled for smooth edges. No Pillow / ImageMagick needed.

Run:  python3 /home/ubuntu/synthwave/tools/make-icons.py
"""
import math
import os
import struct
import zlib

OUT_DIR = "/home/ubuntu/synthwave/icons"

TOP = (13, 6, 48)        # #0d0630
MID = (74, 18, 89)       # #4a1259
LOW = (224, 57, 127)     # #e0397f
GROUND = (10, 5, 32)     # #0a0520
SUN_TOP = (255, 216, 116)
SUN_BOT = (255, 45, 120)
GLOW = (255, 94, 168)
GLOWLINE = (255, 120, 190)
CYAN = (53, 230, 255)

HY = 0.60
CX, CY, R = 0.5, 0.44, 0.23


def mix(a, b, t):
    t = max(0.0, min(1.0, t))
    return (a[0] + (b[0] - a[0]) * t,
            a[1] + (b[1] - a[1]) * t,
            a[2] + (b[2] - a[2]) * t)


def sdf_round_rect(x, y, r):
    cx, cy = 0.5, 0.5
    qx = abs(x - cx) - (0.5 - r)
    qy = abs(y - cy) - (0.5 - r)
    return min(max(qx, qy), 0.0) + math.hypot(max(qx, 0.0), max(qy, 0.0)) - r


def color_at(x, y):
    if y <= HY:
        t = y / HY
        c = mix(TOP, MID, t / 0.55) if t < 0.55 else mix(MID, LOW, (t - 0.55) / 0.45)
    else:
        c = mix(MID, GROUND, min(1.0, (y - HY) / (1 - HY) * 2.2))

    g = math.exp(-((x - CX) ** 2 + (y - CY) ** 2) / (2 * 0.19 ** 2)) * 0.30
    c = mix(c, GLOW, g)

    dx, dy = x - CX, y - CY
    if dx * dx + dy * dy <= R * R:
        c = mix(SUN_TOP, SUN_BOT, max(0.0, min(1.0, (y - (CY - R)) / (2 * R))))
        for i in range(7):
            y0 = CY + R * (0.06 + i * 0.135)
            th = R * (0.020 + i * 0.012)
            if y0 <= y <= y0 + th:
                c = mix(MID, LOW, max(0.0, min(1.0, (y - CY) / 0.26)))
                break

    d = abs(y - HY)
    if d < 0.010:
        c = mix(c, GLOWLINE, (1 - d / 0.010) * 0.9)

    if y > HY:
        gy = (y - HY) / (1 - HY)
        hit = False
        for f in (0.12, 0.28, 0.48, 0.72, 1.0):
            ly = HY + (1 - HY) * f * f
            if abs(y - ly) < 0.005 * (1 + f):
                c = mix(c, CYAN, 0.85)
                hit = True
                break
        if not hit:
            for k in range(-6, 7):
                lx = CX + k * 0.085 * gy
                if abs(x - lx) < 0.0035 * (0.4 + gy):
                    c = mix(c, CYAN, 0.65)
                    break
    return c


def render(size, ss=3, maskable=False):
    inv = 1.0 / (ss * ss)
    rows = []
    for py in range(size):
        row = []
        for px in range(size):
            r = g = b = a = 0.0
            for sy in range(ss):
                yy = (py + (sy + 0.5) / ss) / size
                for sx in range(ss):
                    xx = (px + (sx + 0.5) / ss) / size
                    cr, cg, cb = color_at(xx, yy)
                    alpha = 1.0 if maskable else (1.0 if sdf_round_rect(xx, yy, 0.22) <= 0 else 0.0)
                    r += cr * alpha
                    g += cg * alpha
                    b += cb * alpha
                    a += alpha
            row.append((int(r * inv + 0.5), int(g * inv + 0.5),
                        int(b * inv + 0.5), int(a * inv * 255 + 0.5)))
        rows.append(row)
    return rows


def write_png(path, rows):
    h, w = len(rows), len(rows[0])
    raw = bytearray()
    for row in rows:
        raw.append(0)
        for r, g, b, a in row:
            raw += bytes((max(0, min(255, r)), max(0, min(255, g)),
                          max(0, min(255, b)), max(0, min(255, a))))

    def chunk(typ, data):
        return (struct.pack(">I", len(data)) + typ + data +
                struct.pack(">I", zlib.crc32(typ + data) & 0xFFFFFFFF))

    ihdr = struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0)
    blob = (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) +
            chunk(b"IDAT", zlib.compress(bytes(raw), 9)) + chunk(b"IEND", b""))
    with open(path, "wb") as f:
        f.write(blob)
    return len(blob)


if __name__ == "__main__":
    os.makedirs(OUT_DIR, exist_ok=True)
    jobs = [
        ("icon-192.png", 192, 3, False),
        ("icon-512.png", 512, 2, False),
        ("icon-maskable-512.png", 512, 2, True),
    ]
    for name, size, ss, maskable in jobs:
        path = os.path.join(OUT_DIR, name)
        print("%s: %dx%d, %d bytes" % (path, size, size, write_png(path, render(size, ss, maskable))))
