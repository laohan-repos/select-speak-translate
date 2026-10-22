"""Generate the extension's PNG icons using only Python's standard library."""
from pathlib import Path
import struct
import zlib

ROOT = Path(__file__).resolve().parent.parent

def polygon(x, y, points):
    inside = False
    previous = points[-1]
    for point in points:
        if (point[1] > y) != (previous[1] > y):
            crossing = (previous[0] - point[0]) * (y - point[1]) / (previous[1] - point[1]) + point[0]
            if x < crossing:
                inside = not inside
        previous = point
    return inside

def pixel(x, y):
    dx, dy = max(abs(x - 64) - 37, 0), max(abs(y - 64) - 37, 0)
    if dx * dx + dy * dy > 25 * 25:
        return (0, 0, 0, 0)
    color = (49 + int(y / 16), 120 + int(y / 12), 93 + int(y / 15), 255)
    left = polygon(x, y, [(26, 96), (53, 30), (65, 30), (92, 96), (76, 96), (58, 48), (40, 96)])
    crossbar = 59 <= y <= 71 and 43 <= x <= 75
    if left or crossbar:
        color = (255, 255, 249, 255)
    arrow = polygon(x, y, [(85, 30), (106, 30), (106, 51), (99, 51), (99, 42), (85, 57), (80, 52), (95, 37), (85, 37)])
    if arrow:
        color = (205, 231, 166, 255)
    return color

def chunk(kind, data):
    return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data))

for size in (16, 32, 48, 128):
    rows = bytearray()
    for y in range(size):
        rows.append(0)
        for x in range(size):
            samples = [pixel((x + (sx + .5) / 4) * 128 / size, (y + (sy + .5) / 4) * 128 / size) for sy in range(4) for sx in range(4)]
            alpha = sum(p[3] for p in samples)
            rgb = [round(sum(p[c] * p[3] for p in samples) / alpha) if alpha else 0 for c in range(3)]
            rows.extend((*rgb, round(alpha / 16)))
    png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(rows)) + chunk(b"IEND", b"")
    (ROOT / f"icons/{size}.png").write_bytes(png)
print("Generated 16 / 32 / 48 / 128 px icons")
