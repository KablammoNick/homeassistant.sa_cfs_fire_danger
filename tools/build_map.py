"""Build the map card's district shapes from the CFS fire ban district GeoJSON.

Dev-time only (standard library, not loaded by Home Assistant):

    python3 tools/build_map.py [tools/fire_ban_districts.geojson]

Writes custom_components/sa_cfs_fire_danger/www/sa-cfs-map-data.js.

Shared borders between districts are simplified once and reused by both
districts, so simplification never opens gaps or overlaps between them.
"""
from __future__ import annotations

import json
import math
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "tools" / "fire_ban_districts.geojson"
OUTPUT = ROOT / "custom_components" / "sa_cfs_fire_danger" / "www" / "sa-cfs-map-data.js"

WIDTH = 1000  # SVG units across the state
TOLERANCE = 0.8  # Douglas-Peucker tolerance in SVG units
DECIMALS = 1


def district_key(name: str) -> str:
    """Same as parser.district_key (duplicated so this runs without Home Assistant)."""
    return name.lower().replace(" ", "_").replace("-", "_").replace("/", "")


def douglas_peucker(points: list, tolerance: float) -> list:
    if len(points) < 3:
        return points
    (x1, y1), (x2, y2) = points[0], points[-1]
    dx, dy = x2 - x1, y2 - y1
    length = math.hypot(dx, dy)
    max_dist, index = -1.0, 0
    for i in range(1, len(points) - 1):
        px, py = points[i]
        if length == 0:
            dist = math.hypot(px - x1, py - y1)
        else:
            dist = abs(dy * px - dx * py + x2 * y1 - y2 * x1) / length
        if dist > max_dist:
            max_dist, index = dist, i
    if max_dist <= tolerance:
        return [points[0], points[-1]]
    left = douglas_peucker(points[: index + 1], tolerance)
    right = douglas_peucker(points[index:], tolerance)
    return left[:-1] + right


def split_into_arcs(ring: list, owners: dict) -> list:
    """Split a closed ring at junctions: points where the set of owning districts changes."""
    pts = ring[:-1] if ring[0] == ring[-1] else ring
    n = len(pts)
    junctions = [
        i
        for i in range(n)
        if owners[pts[i]] != owners[pts[i - 1]] or owners[pts[i]] != owners[pts[(i + 1) % n]]
    ]
    if not junctions:
        return [pts + [pts[0]]]
    arcs = []
    for j, start in enumerate(junctions):
        end = junctions[(j + 1) % len(junctions)]
        arc, i = [pts[start]], start
        while i != end:
            i = (i + 1) % n
            arc.append(pts[i])
        arcs.append(arc)
    return arcs


def simplify_ring(ring: list, owners: dict, cache: dict) -> list:
    out = []
    for arc in split_into_arcs(ring, owners):
        key = tuple(arc)
        reverse_key = tuple(reversed(arc))
        if key in cache:
            simple = cache[key]
        elif reverse_key in cache:
            simple = list(reversed(cache[reverse_key]))
        else:
            simple = douglas_peucker(arc, TOLERANCE)
            cache[key] = simple
        out.extend(simple[:-1])
    return out


def point_in_ring(x: float, y: float, ring: list) -> bool:
    inside = False
    for (x1, y1), (x2, y2) in zip(ring, ring[1:] + ring[:1]):
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
            inside = not inside
    return inside


def distance_to_ring(x: float, y: float, ring: list) -> float:
    best = math.inf
    for (x1, y1), (x2, y2) in zip(ring, ring[1:] + ring[:1]):
        dx, dy = x2 - x1, y2 - y1
        t = 0.0 if dx == dy == 0 else max(0.0, min(1.0, ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy)))
        best = min(best, math.hypot(x - (x1 + t * dx), y - (y1 + t * dy)))
    return best


def label_point(ring: list) -> tuple:
    """Approximate pole of inaccessibility: the inside point furthest from the edge."""
    xs, ys = [p[0] for p in ring], [p[1] for p in ring]
    x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
    best, best_dist = ((x0 + x1) / 2, (y0 + y1) / 2), -1.0
    step = max(x1 - x0, y1 - y0) / 24
    cx, cy, span = (x0 + x1) / 2, (y0 + y1) / 2, max(x1 - x0, y1 - y0) / 2
    for _ in range(6):  # coarse grid, then refine around the best point
        y = cy - span
        while y <= cy + span:
            x = cx - span
            while x <= cx + span:
                if point_in_ring(x, y, ring):
                    dist = distance_to_ring(x, y, ring)
                    if dist > best_dist:
                        best, best_dist = (x, y), dist
                x += step
            y += step
        cx, cy = best
        span, step = step * 2, step / 4
    return best


def fmt(value: float) -> str:
    text = f"{value:.{DECIMALS}f}".rstrip("0").rstrip(".")
    return text if text != "-0" else "0"


def main() -> None:
    source = Path(sys.argv[1]) if len(sys.argv) > 1 else SOURCE
    features = json.loads(source.read_text())["features"]

    lons = [p[0] for f in features for r in f["geometry"]["coordinates"] for p in r]
    lats = [p[1] for f in features for r in f["geometry"]["coordinates"] for p in r]
    lon0, lon1, lat0, lat1 = min(lons), max(lons), min(lats), max(lats)
    x_scale = math.cos(math.radians((lat0 + lat1) / 2))
    scale = WIDTH / ((lon1 - lon0) * x_scale)
    height = (lat1 - lat0) * scale

    def project(lon: float, lat: float) -> tuple:
        return ((lon - lon0) * x_scale * scale, (lat1 - lat) * scale)

    owners: dict = defaultdict(set)
    for i, feature in enumerate(features):
        for ring in feature["geometry"]["coordinates"]:
            for lon, lat in ring:
                owners[project(lon, lat)].add(i)

    cache: dict = {}
    districts = {}
    for feature in features:
        name = feature["properties"]["firebandistrict"]
        if feature["geometry"]["type"] != "Polygon":
            raise SystemExit(f"{name}: expected a Polygon, got {feature['geometry']['type']}")
        rings = [
            simplify_ring([project(lon, lat) for lon, lat in ring], owners, cache)
            for ring in feature["geometry"]["coordinates"]
        ]
        path = "".join(
            "M" + "L".join(f"{fmt(x)} {fmt(y)}" for x, y in ring) + "Z" for ring in rings
        )
        lx, ly = label_point(rings[0])
        districts[district_key(name)] = {
            "name": name,
            "path": path,
            "label": [float(fmt(lx)), float(fmt(ly))],
        }
        print(f"{name:24} {sum(len(r) for r in rings):5} points")

    OUTPUT.write_text(
        "// Generated by tools/build_map.py from tools/fire_ban_districts.geojson. Do not edit.\n"
        f'export const VIEWBOX = "0 0 {fmt(WIDTH)} {fmt(height)}";\n'
        f"export const DISTRICTS = {json.dumps(districts, separators=(',', ':'))};\n"
    )
    print(f"Wrote {OUTPUT.relative_to(ROOT)} ({OUTPUT.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
