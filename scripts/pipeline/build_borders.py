#!/usr/bin/env python3
"""Build the app's border data from Cliopatria + Natural Earth (offline step).

    python3 -I scripts/pipeline/fetch_sources.py
    python3 -I scripts/pipeline/build_borders.py [--from 1400 --to 1600]

What it does
  1. Land mask: Natural Earth 1:50m land, minus the big lakes, Antarctica dropped,
     lightly simplified. This is the coastline the whole app shares.
  2. Polities: every Cliopatria POLITY row that overlaps the year range, except the
     parenthesised "umbrella" rows ("(Holy Roman Empire)"), which are unions of their
     component rows and would double-draw. Umbrella names survive as the `up` lineage
     of their members.
  3. Each polygon is clipped to the land mask (crisp, consistent coast; clicks on the
     sea hit nothing) and thin coastal slivers left by the two datasets' slightly
     different coastlines are filled.
  4. Derived per-polity facts (Wikipedia/Wikidata from the dataset, a stable map tint
     chosen so that neighbours differ) go to polities.json.

Outputs (committed, so the app runs without Python):
  public/data/geo/land.json
  public/data/borders/cliopatria-<from>-<to>.json
  public/data/borders/polities.json
"""
import argparse
import datetime
import json
import pathlib
import re
import sys
import unicodedata
from collections import Counter, defaultdict

import shapely
from shapely.geometry import box, mapping, shape
from shapely.geometry.base import BaseGeometry
from shapely.ops import polylabel, unary_union
from shapely.strtree import STRtree

ROOT = pathlib.Path(__file__).resolve().parents[2]
CACHE = ROOT / ".cache"
OUT = ROOT / "public" / "data"

LAND_SIMPLIFY_DEG = 0.02  # ~2 km. One shared coastline for land, polities and clicks.
LAND_MIN_PART_DEG2 = 0.002  # drop islets smaller than ~25 km2
SLIVER_FILL_DEG = 0.06  # how far a polity may be grown to meet the shared coast
GRID_DEG = 0.01  # coordinate quantisation (~1.1 km)
TINT_COUNT = 9
BIG_LAKE_MAX_SCALERANK = 1

SOURCE_META = {
    "borders": {
        "name": "Seshat Cliopatria (polities only, file cliopatria_polities_only_v021)",
        "url": "https://github.com/Seshat-Global-History-Databank/cliopatria",
        "license": "CC BY 4.0",
        "citation": "Bennett, J. S. et al. (2025). Cliopatria: a geospatial database of world-wide political entities from 3400BCE to 2024CE. Scientific Data. doi:10.1038/s41597-025-04516-9",
        "changes": "Filtered to the year range, umbrella rows removed, clipped to the Natural Earth coastline, simplified and rounded to 0.01 degrees.",
    },
    "coast": {
        "name": "Natural Earth 1:50m land and lakes",
        "url": "https://www.naturalearthdata.com/",
        "license": "Public domain",
    },
}


def slugify(name: str) -> str:
    """Stable ASCII id from a Cliopatria name; parentheses (umbrella rows) are dropped."""
    s = name.strip().strip("()").strip()
    s = s.replace("Đ", "D").replace("đ", "d")
    s = unicodedata.normalize("NFKD", s)
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = re.sub(r"[^a-zA-Z0-9]+", "-", s).strip("-").lower()
    return s


def is_umbrella(name: str) -> bool:
    return name.strip().startswith("(")


def polygons_of(geom: BaseGeometry):
    if geom.is_empty:
        return []
    if geom.geom_type == "Polygon":
        return [geom]
    if geom.geom_type in ("MultiPolygon", "GeometryCollection"):
        out = []
        for g in geom.geoms:
            out.extend(polygons_of(g))
        return out
    return []


def clean(geom: BaseGeometry, min_area: float = 0.0) -> BaseGeometry:
    """Snap to grid, repair, drop slivers; returns a (Multi)Polygon or empty."""
    if geom.is_empty:
        return geom
    geom = shapely.make_valid(geom)
    parts = [p for p in polygons_of(geom) if p.area >= min_area]
    if not parts:
        return shapely.Polygon()
    geom = unary_union(parts)
    geom = shapely.set_precision(geom, GRID_DEG)
    parts = [p for p in polygons_of(geom) if p.area > 0]
    return unary_union(parts) if parts else shapely.Polygon()


def round_coords(obj, nd=2):
    if isinstance(obj, (list, tuple)):
        return [round_coords(o, nd) for o in obj]
    return round(obj, nd)


def geojson_geometry(geom: BaseGeometry):
    g = mapping(geom)
    return {"type": g["type"], "coordinates": round_coords(g["coordinates"])}


def build_land(args) -> BaseGeometry:
    ne = CACHE / "natural-earth"
    land_fc = json.load(open(ne / "ne_50m_land.geojson", encoding="utf-8"))
    lakes_fc = json.load(open(ne / "ne_50m_lakes.geojson", encoding="utf-8"))

    land = unary_union([shapely.make_valid(shape(f["geometry"])) for f in land_fc["features"]])
    land = land.intersection(box(-180, -60, 180, 84))  # Antarctica is irrelevant here
    big_lakes = [
        shapely.make_valid(shape(f["geometry"]))
        for f in lakes_fc["features"]
        if f["properties"].get("scalerank", 9) <= BIG_LAKE_MAX_SCALERANK
    ]
    if big_lakes:
        land = land.difference(unary_union(big_lakes))
    land = land.simplify(LAND_SIMPLIFY_DEG, preserve_topology=True)
    land = clean(land, LAND_MIN_PART_DEG2)

    fc = {
        "type": "FeatureCollection",
        "meta": {"source": SOURCE_META["coast"], "generated": datetime.date.today().isoformat()},
        "features": [
            {"type": "Feature", "properties": {}, "geometry": geojson_geometry(p)} for p in polygons_of(land)
        ],
    }
    path = OUT / "geo" / "land.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(fc, separators=(",", ":")), encoding="utf-8")
    print(f"land: {len(fc['features'])} parts -> {path.relative_to(ROOT)} ({path.stat().st_size/1e6:.2f} MB)")
    return land


def label_for(geom: BaseGeometry):
    """Label anchor on the biggest part: [lon, lat, inscribed radius deg] and its bbox."""
    parts = polygons_of(geom)
    if not parts:
        return None, None
    biggest = max(parts, key=lambda p: p.area)
    pt = polylabel(biggest, tolerance=0.02)
    r = biggest.boundary.distance(pt)
    w, s, e, n = biggest.bounds
    return [round(pt.x, 2), round(pt.y, 2), round(r, 2)], [round(w, 2), round(s, 2), round(e, 2), round(n, 2)]


def pick_mode(values):
    values = [v for v in values if v]
    return Counter(values).most_common(1)[0][0] if values else ""


def assign_tints(rows):
    """Greedy graph colouring over entities that touch at any common time."""
    geoms = [r["geom"] for r in rows]
    tree = STRtree(geoms)
    neighbours = defaultdict(set)
    for i, r in enumerate(rows):
        probe = r["geom"].buffer(0.03)
        for j in tree.query(probe, predicate="intersects"):
            if j <= i:
                continue
            o = rows[j]
            if o["id"] == r["id"]:
                continue
            if o["from"] <= r["to"] and r["from"] <= o["to"]:
                neighbours[r["id"]].add(o["id"])
                neighbours[o["id"]].add(r["id"])
    area = defaultdict(float)
    for r in rows:
        area[r["id"]] = max(area[r["id"]], r["area"])
    order = sorted(area, key=lambda e: (-len(neighbours[e]), -area[e], e))
    tint = {}
    for e in order:
        used = Counter(tint[n] for n in neighbours[e] if n in tint)
        pick = next((c for c in range(TINT_COUNT) if c not in used), None)
        if pick is None:  # more neighbours than colours: take the least-used one
            pick = min(range(TINT_COUNT), key=lambda c: (used[c], c))
        tint[e] = pick
    clashes = sum(1 for e in tint for n in neighbours[e] if n in tint and tint[n] == tint[e]) // 2
    print(f"tints: {len(tint)} entities, {sum(len(v) for v in neighbours.values())//2} adjacencies, {clashes} unavoidable clashes")
    return tint


def build_borders(args, land: BaseGeometry):
    src = CACHE / "cliopatria" / "cliopatria_polities_only_v021.geojson"
    print(f"reading {src.relative_to(ROOT)} ...")
    data = json.load(open(src, encoding="utf-8"))
    y0, y1 = args.year_from, args.year_to

    shapely.prepare(land)
    coast_band = land.boundary.buffer(SLIVER_FILL_DEG)
    shapely.prepare(coast_band)

    rows, umbrella_meta = [], defaultdict(lambda: defaultdict(list))
    skipped = 0
    for f in data["features"]:
        p = f["properties"]
        if p.get("Type") != "POLITY" or p["FromYear"] > y1 or p["ToYear"] < y0:
            continue
        name = p["Name"]
        eid = slugify(name)
        if is_umbrella(name):
            umbrella_meta[eid]["wikipedia"].append(p.get("Wikipedia", ""))
            umbrella_meta[eid]["wikidata"].append(p.get("Wikidata", ""))
            umbrella_meta[eid]["span"].append((max(p["FromYear"], y0), min(p["ToYear"], y1)))
            umbrella_meta[eid]["name"].append(name.strip("()"))
            continue

        geom = shapely.make_valid(shape(f["geometry"]))
        inside = geom.intersection(land)
        if land.intersects(geom):
            grown = geom.buffer(SLIVER_FILL_DEG).intersection(land)
            extra = grown.difference(geom).intersection(coast_band)
            inside = unary_union([inside, extra]) if not extra.is_empty else inside
        inside = clean(inside, 0.0002)
        if inside.is_empty:
            skipped += 1
            continue
        up = []
        for token in (p.get("MemberOf") or "").split(";"):
            token = token.strip()
            if token:
                pid = slugify(token)
                if pid and pid != eid and pid not in up:
                    up.append(pid)
        label, bbox = label_for(inside)
        rows.append(
            {
                "id": eid,
                "name": name,
                "from": max(p["FromYear"], y0),
                "to": min(p["ToYear"], y1),
                "area": round(p["Area"]),
                "up": up,
                "label": label,
                "bbox": bbox,
                "wikipedia": p.get("Wikipedia", ""),
                "wikidata": p.get("Wikidata", ""),
                "geom": inside,
            }
        )
    print(f"rows kept: {len(rows)} (skipped empty after clipping: {skipped})")

    tints = assign_tints(rows)
    rows.sort(key=lambda r: (-r["area"], r["id"], r["from"]))  # big first -> small drawn on top

    feats = []
    for r in rows:
        props = {"id": r["id"], "from": r["from"], "to": r["to"], "area": r["area"], "label": r["label"], "bbox": r["bbox"]}
        if r["up"]:
            props["up"] = r["up"]
        feats.append({"type": "Feature", "properties": props, "geometry": geojson_geometry(r["geom"])})

    fc = {
        "type": "FeatureCollection",
        "meta": {
            "range": [y0, y1],
            "source": SOURCE_META["borders"],
            "coast": SOURCE_META["coast"],
            "generated": datetime.date.today().isoformat(),
        },
        "features": feats,
    }
    path = OUT / "borders" / f"cliopatria-{y0}-{y1}.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(fc, separators=(",", ":"), ensure_ascii=False), encoding="utf-8")
    nverts = sum(len(shapely.get_coordinates(r["geom"])) for r in rows)
    print(f"borders: {len(feats)} features, {nverts} vertices -> {path.relative_to(ROOT)} ({path.stat().st_size/1e6:.2f} MB)")

    # ---- derived index of entities (generated; authored data lives in entities.json)
    entities = {}
    by_id = defaultdict(list)
    for r in rows:
        by_id[r["id"]].append(r)
    for eid, rs in by_id.items():
        entities[eid] = {
            "dataName": pick_mode(r["name"] for r in rs),
            "wikipedia": pick_mode(r["wikipedia"] for r in rs),
            "wikidata": pick_mode(r["wikidata"] for r in rs),
            "from": min(r["from"] for r in rs),
            "to": max(r["to"] for r in rs),
            "umbrella": False,
            "tint": tints[eid],
        }
    for eid, meta in umbrella_meta.items():
        if eid in entities:
            continue
        spans = meta["span"]
        entities[eid] = {
            "dataName": pick_mode(meta["name"]),
            "wikipedia": pick_mode(meta["wikipedia"]),
            "wikidata": pick_mode(meta["wikidata"]),
            "from": min(s[0] for s in spans),
            "to": max(s[1] for s in spans),
            "umbrella": True,
            "tint": None,
        }
    # every `up` id must be known
    for r in rows:
        for pid in r["up"]:
            if pid not in entities:
                entities[pid] = {"dataName": pid, "wikipedia": "", "wikidata": "", "from": r["from"], "to": r["to"], "umbrella": True, "tint": None}

    index = {
        "meta": {"range": [y0, y1], "tintCount": TINT_COUNT, "source": SOURCE_META["borders"], "generated": datetime.date.today().isoformat()},
        "entities": dict(sorted(entities.items())),
    }
    ipath = OUT / "borders" / "polities.json"
    ipath.write_text(json.dumps(index, indent=1, ensure_ascii=False), encoding="utf-8")
    print(f"polities index: {len(entities)} entities -> {ipath.relative_to(ROOT)}")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--from", dest="year_from", type=int, default=1400)
    ap.add_argument("--to", dest="year_to", type=int, default=1600)
    args = ap.parse_args()
    land = build_land(args)
    build_borders(args, land)
    return 0


if __name__ == "__main__":
    sys.exit(main())
