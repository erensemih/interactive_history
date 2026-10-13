#!/usr/bin/env python3
"""Build the app's border data from Cliopatria + Natural Earth (offline step).

    python3 -I scripts/pipeline/fetch_sources.py
    python3 -I scripts/pipeline/build_borders.py [--from 1800 --to 2000] [--out public/data]

What it does
  1. Land mask: Natural Earth 1:50m land, minus the big lakes, Antarctica dropped,
     lightly simplified. This is the coastline the whole app shares.
  2. Polities: every Cliopatria POLITY row that overlaps the year range, except the
     parenthesised "umbrella" rows ("(Holy Roman Empire)"), which are unions of their
     component rows and would double-draw. Umbrella names survive as the `up` lineage
     of their members.
  3. Each polygon is clipped to the land mask (crisp, consistent coast; clicks on the
     sea hit nothing) and thin coastal slivers left by the two datasets' slightly
     different coastlines are filled. This is the slow part (minutes); its result is
     cached in .cache/ so that changing the rules below re-runs in seconds.
  4. Rules per period (scripts/pipeline/periods/<from>-<to>.json, optional): ids the
     dataset labels differently although they are one state in one era are joined.
     Consecutive rows of a polity that are exactly the same shape become one row.
  5. Derived per-polity facts (Wikipedia/Wikidata from the dataset, a stable map tint
     chosen so that neighbours differ) go to polities.json.

Outputs (committed, so the app runs without Python), below --out (default public/data):
  geo/land.json
  borders/cliopatria-<from>-<to>.json
  borders/polities.json

The border file comes in two encodings (--format):
  delta    (default) the same GeoJSON, but every ring is one flat list of integers in
           units of 0.01 degrees, each point stored as the step from the one before
           (first point absolute, closing point left out). About half the size of the
           text form, and it compresses ~4x better. `meta.encoding` says so; the loader
           (src/data/borderCodec.ts) turns it back into ordinary GeoJSON.
  geojson  plain GeoJSON with 2-decimal coordinates (the form the 1400-1600 archive uses).
"""
import argparse
import datetime
import hashlib
import json
import multiprocessing
import pathlib
import pickle
import re
import sys
import time
import unicodedata
from collections import Counter, defaultdict

import numpy as np
import shapely
from shapely.geometry import box, mapping, shape
from shapely.geometry.base import BaseGeometry
from shapely.ops import polylabel, unary_union
from shapely.strtree import STRtree

ROOT = pathlib.Path(__file__).resolve().parents[2]
CACHE = ROOT / ".cache"
PERIODS = pathlib.Path(__file__).resolve().parent / "periods"

LAND_SIMPLIFY_DEG = 0.02  # ~2 km. One shared coastline for land, polities and clicks.
LAND_MIN_PART_DEG2 = 0.002  # drop islets smaller than ~25 km2
SLIVER_FILL_DEG = 0.06  # how far a polity may be grown to meet the shared coast
GRID_DEG = 0.01  # coordinate quantisation (~1.1 km)
MIN_ROW_DEG2 = 0.0002  # a clipped row smaller than this (~2.5 km2) is dropped
TINT_COUNT = 9
BIG_LAKE_MAX_SCALERANK = 1
CLIP_VERSION = 2  # bump when the clipping code below changes (invalidates the cache)

SOURCE_META = {
    "borders": {
        "name": "Seshat Cliopatria (polities only, file cliopatria_polities_only_v021)",
        "url": "https://github.com/Seshat-Global-History-Databank/cliopatria",
        "license": "CC BY 4.0",
        "citation": "Bennett, J. S. et al. (2025). Cliopatria: a geospatial database of world-wide political entities from 3400BCE to 2024CE. Scientific Data. doi:10.1038/s41597-025-04516-9",
    },
    "coast": {
        "name": "Natural Earth 1:50m land and lakes",
        "url": "https://www.naturalearthdata.com/",
        "license": "Public domain",
    },
}


def changes_note(args, canon) -> str:
    """What was done to the source rows, as the output says it (it follows the options that were really used)."""
    note = "Filtered to the year range, umbrella rows removed, clipped to the Natural Earth coastline"
    if args.simplify:
        note += f", simplified ({args.simplify} degrees)"
    note += ", rounded to 0.01 degrees"
    if not args.keep_identical:
        note += "; consecutive identical rows joined"
    if canon:
        note += f"; {len(canon)} ids the dataset labels inconsistently joined under {len(set(canon.values()))} (scripts/pipeline/periods)"
    return note + "."


def shown(path: pathlib.Path) -> str:
    try:
        return str(path.resolve().relative_to(ROOT))
    except ValueError:
        return str(path)


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


def encode_ring(ring) -> list:
    """One ring as flat integers in grid units: first point absolute, then steps; no closing point."""
    pts = np.rint(shapely.get_coordinates(ring)[:-1] / GRID_DEG).astype(np.int64)
    steps = np.diff(pts, axis=0, prepend=np.zeros((1, 2), dtype=np.int64))
    return steps.reshape(-1).tolist()


def delta_geometry(geom: BaseGeometry):
    polys = [[encode_ring(p.exterior)] + [encode_ring(h) for h in p.interiors] for p in polygons_of(geom)]
    if len(polys) == 1:
        return {"type": "Polygon", "coordinates": polys[0]}
    return {"type": "MultiPolygon", "coordinates": polys}


def build_land(out: pathlib.Path) -> BaseGeometry:
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
    path = out / "geo" / "land.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(fc, separators=(",", ":")), encoding="utf-8")
    print(f"land: {len(fc['features'])} parts -> {shown(path)} ({path.stat().st_size/1e6:.2f} MB)")
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
    pad = 0.03  # "touching": closer than ~3 km
    for i, r in enumerate(rows):
        x0, y0, x1, y1 = r["geom"].bounds
        # candidates by bounding box only; the exact distance is measured just for pairs not yet known to touch
        for j in tree.query(shapely.box(x0 - pad, y0 - pad, x1 + pad, y1 + pad)):
            if j <= i:
                continue
            o = rows[j]
            if o["id"] == r["id"] or o["id"] in neighbours[r["id"]]:
                continue
            if o["from"] <= r["to"] and r["from"] <= o["to"] and shapely.dwithin(r["geom"], o["geom"], pad):
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
    # how often each pair of tint indices meets on the map: what the colours of src/styles/tokens.css were dealt by
    matrix = [[0] * TINT_COUNT for _ in range(TINT_COUNT)]
    for a, ns in neighbours.items():
        for b in ns:
            if a < b:
                matrix[tint[a]][tint[b]] += 1
                if tint[a] != tint[b]:
                    matrix[tint[b]][tint[a]] += 1
    return tint, matrix


# --------------------------------------------------------------------------- clipping (slow, cached)

_SHARED = {}  # set before the worker pool forks; the workers read it instead of receiving copies


def clip_one(i):
    """One source row -> (index, (wkb, label, bbox)) or (index, None) when nothing is left on land."""
    f = _SHARED["features"][i]
    land, band = _SHARED["land"], _SHARED["band"]
    geom = shapely.make_valid(shape(f["geometry"]))
    if _SHARED["simplify"]:
        geom = geom.simplify(_SHARED["simplify"], preserve_topology=True)
    inside = geom.intersection(land)
    if land.intersects(geom):
        grown = geom.buffer(SLIVER_FILL_DEG).intersection(land)
        extra = grown.difference(geom).intersection(band)
        inside = unary_union([inside, extra]) if not extra.is_empty else inside
    inside = clean(inside, MIN_ROW_DEG2)
    if inside.is_empty:
        return i, None
    label, bbox = label_for(inside)
    return i, (shapely.to_wkb(inside), label, bbox)


def clipped_rows(features, selected, land, simplify, jobs, y0, y1, src, rebuild):
    """Clip every selected source row to the land mask, in parallel; the result is cached on disk."""
    signature = hashlib.sha1(
        json.dumps(
            [CLIP_VERSION, SLIVER_FILL_DEG, GRID_DEG, LAND_SIMPLIFY_DEG, LAND_MIN_PART_DEG2, MIN_ROW_DEG2,
             BIG_LAKE_MAX_SCALERANK, simplify, y0, y1, src.stat().st_size]
        ).encode()
    ).hexdigest()[:12]
    cache = CACHE / f"clipped-{y0}-{y1}-{signature}.pkl"
    if cache.exists() and not rebuild:
        print(f"clipped rows from cache {shown(cache)}")
        with open(cache, "rb") as fh:
            return pickle.load(fh)

    shapely.prepare(land)
    band = land.boundary.buffer(SLIVER_FILL_DEG)
    shapely.prepare(band)
    _SHARED.update(features=features, land=land, band=band, simplify=simplify)
    order = sorted(selected, key=lambda i: -features[i]["properties"].get("Area", 0))  # big (slow) jobs first
    out = {}
    t0 = time.time()
    ctx = multiprocessing.get_context("fork")
    with ctx.Pool(jobs) as pool:
        for n, (i, res) in enumerate(pool.imap_unordered(clip_one, order, chunksize=1), 1):
            out[i] = res
            if n % 250 == 0 or n == len(order):
                print(f"  clipped {n}/{len(order)} rows ({time.time() - t0:.0f}s)")
    with open(cache, "wb") as fh:
        pickle.dump(out, fh, protocol=pickle.HIGHEST_PROTOCOL)
    for old in CACHE.glob(f"clipped-{y0}-{y1}-*.pkl"):
        if old != cache:
            old.unlink()
    return out


# --------------------------------------------------------------------------- period rules

def load_rules(y0, y1):
    path = PERIODS / f"{y0}-{y1}.json"
    if not path.exists():
        return {}, {}
    rules = json.load(open(path, encoding="utf-8"))
    canon = {}
    for canonical, aliases in rules.get("merge", {}).items():
        for alias in aliases:
            canon[alias] = canonical
    print(f"period rules {shown(path)}: {len(canon)} ids joined into {len(rules.get('merge', {}))}")
    return rules, canon


def join_identical(rows):
    """Consecutive rows of one polity with exactly the same shape and parents become one row."""
    by_id = defaultdict(list)
    for r in rows:
        by_id[r["id"]].append(r)
    dropped = set()
    for rs in by_id.values():
        rs.sort(key=lambda r: (r["from"], r["to"]))
        prev = None
        for r in rs:
            if prev and prev["to"] + 1 >= r["from"] and prev["up"] == r["up"] and prev["geom"].equals_exact(r["geom"], 0):
                prev["to"] = max(prev["to"], r["to"])
                prev["area"] = max(prev["area"], r["area"])
                dropped.add(id(r))
                continue
            prev = r
    kept = [r for r in rows if id(r) not in dropped]
    print(f"identical consecutive rows joined: {len(dropped)}")
    return kept


# --------------------------------------------------------------------------- build

def build_borders(args, land: BaseGeometry, out: pathlib.Path):
    src = CACHE / "cliopatria" / "cliopatria_polities_only_v021.geojson"
    print(f"reading {shown(src)} ...")
    data = json.load(open(src, encoding="utf-8"))
    y0, y1 = args.year_from, args.year_to
    rules, canon = load_rules(y0, y1)
    canonical = lambda sid: canon.get(sid, sid)  # noqa: E731

    features = data["features"]
    selected, umbrella_meta = [], defaultdict(lambda: defaultdict(list))
    for i, f in enumerate(features):
        p = f["properties"]
        if p.get("Type") != "POLITY" or p["FromYear"] > y1 or p["ToYear"] < y0:
            continue
        name = p["Name"]
        if is_umbrella(name):
            eid = canonical(slugify(name))
            umbrella_meta[eid]["wikipedia"].append(p.get("Wikipedia", ""))
            umbrella_meta[eid]["wikidata"].append(p.get("Wikidata", ""))
            umbrella_meta[eid]["span"].append((max(p["FromYear"], y0), min(p["ToYear"], y1)))
            umbrella_meta[eid]["name"].append(name.strip("()"))
            continue
        selected.append(i)
    print(f"source rows in range: {len(selected)} (+ {sum(len(m['span']) for m in umbrella_meta.values())} umbrella rows)")

    clipped = clipped_rows(features, selected, land, args.simplify, args.jobs, y0, y1, src, args.rebuild)

    rows, skipped = [], 0
    for i in selected:
        res = clipped.get(i)
        if res is None:
            skipped += 1
            continue
        wkb, label, bbox = res
        p = features[i]["properties"]
        sid = slugify(p["Name"])
        eid = canonical(sid)
        up = []
        for token in (p.get("MemberOf") or "").split(";"):
            token = token.strip()
            if token:
                pid = canonical(slugify(token))
                if pid and pid != eid and pid not in up:
                    up.append(pid)
        rows.append(
            {
                "id": eid,
                "source": sid,
                "name": p["Name"],
                "from": max(p["FromYear"], y0),
                "to": min(p["ToYear"], y1),
                "area": round(p["Area"]),
                "up": up,
                "label": label,
                "bbox": bbox,
                "wikipedia": p.get("Wikipedia", ""),
                "wikidata": p.get("Wikidata", ""),
                "geom": shapely.from_wkb(wkb),
            }
        )
    del data, features
    print(f"rows kept: {len(rows)} (nothing left after clipping: {skipped})")

    # Cliopatria lists `MemberOf` on only some of an entity's rows (e.g. Saxony: 1400-1428 only).
    # Membership is assumed to continue until another membership is stated: carry it forward in time.
    carried = 0
    by_entity = defaultdict(list)
    for r in rows:
        by_entity[r["id"]].append(r)
    for rs in by_entity.values():
        rs.sort(key=lambda r: r["from"])
        last = []
        for r in rs:
            if r["up"]:
                last = r["up"]
            elif last:
                r["up"] = list(last)
                carried += 1
    print(f"membership carried forward on {carried} rows")

    if not args.keep_identical:
        rows = join_identical(rows)

    tints, tint_matrix = assign_tints(rows)
    CACHE.mkdir(exist_ok=True)
    (CACHE / f"tint-adjacency-{y0}-{y1}.json").write_text(json.dumps({"matrix": tint_matrix}), encoding="utf-8")
    rows.sort(key=lambda r: (-r["area"], r["id"], r["from"]))  # big first -> small drawn on top

    feats = []
    for r in rows:
        props = {
            "id": r["id"],
            "from": r["from"],
            "to": r["to"],
            "area": r["area"],
            "label": r["label"],
            "bbox": r["bbox"],
            "box": [round(v, 2) for v in r["geom"].bounds],  # the whole row, so hit-testing needs no geometry to reject
        }
        if r["up"]:
            props["up"] = r["up"]
        geometry = geojson_geometry(r["geom"]) if args.format == "geojson" else delta_geometry(r["geom"])
        feats.append({"type": "Feature", "properties": props, "geometry": geometry})

    meta = {"range": [y0, y1]}
    if args.format == "delta":
        meta["encoding"] = "delta-int"
        meta["scale"] = round(1 / GRID_DEG)
    source = {**SOURCE_META["borders"], "changes": changes_note(args, canon)}
    meta.update(source=source, coast=SOURCE_META["coast"], generated=datetime.date.today().isoformat())
    fc = {"type": "FeatureCollection", "meta": meta, "features": feats}
    path = out / "borders" / f"cliopatria-{y0}-{y1}.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(fc, separators=(",", ":"), ensure_ascii=False), encoding="utf-8")
    nverts = sum(len(shapely.get_coordinates(r["geom"])) for r in rows)
    print(f"borders: {len(feats)} features, {nverts} vertices -> {shown(path)} ({path.stat().st_size/1e6:.2f} MB, {args.format})")

    # ---- derived index of entities (generated; authored data lives in entities.json)
    entities = {}
    by_id = defaultdict(list)
    for r in rows:
        by_id[r["id"]].append(r)
    for eid, rs in by_id.items():
        entry = {
            "dataName": pick_mode(r["name"] for r in rs),
            "wikipedia": pick_mode(r["wikipedia"] for r in rs),
            "wikidata": pick_mode(r["wikidata"] for r in rs),
            "from": min(r["from"] for r in rs),
            "to": max(r["to"] for r in rs),
            "umbrella": False,
            "tint": tints[eid],
        }
        joined = sorted({r["source"] for r in rs} - {eid})
        if joined:
            entry["joined"] = joined
        entities[eid] = entry
    for eid, meta_ in umbrella_meta.items():
        if eid in entities:
            continue
        spans = meta_["span"]
        entities[eid] = {
            "dataName": pick_mode(meta_["name"]),
            "wikipedia": pick_mode(meta_["wikipedia"]),
            "wikidata": pick_mode(meta_["wikidata"]),
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
        "meta": {"range": [y0, y1], "tintCount": TINT_COUNT, "source": source, "generated": datetime.date.today().isoformat()},
        "entities": dict(sorted(entities.items())),
    }
    ipath = out / "borders" / "polities.json"
    ipath.write_text(json.dumps(index, indent=1, ensure_ascii=False), encoding="utf-8")
    print(f"polities index: {len(entities)} entities -> {shown(ipath)}")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--from", dest="year_from", type=int, default=1800)
    ap.add_argument("--to", dest="year_to", type=int, default=2000)
    ap.add_argument("--out", type=pathlib.Path, default=ROOT / "public" / "data", help="data directory to write (default public/data)")
    ap.add_argument("--format", choices=["delta", "geojson"], default="delta")
    ap.add_argument("--simplify", type=float, default=0.0, help="Douglas-Peucker tolerance in degrees applied to the source shapes before clipping (0 = off)")
    ap.add_argument("--jobs", type=int, default=multiprocessing.cpu_count())
    ap.add_argument("--rebuild", action="store_true", help="ignore the cached clipping result")
    ap.add_argument("--keep-identical", action="store_true", help="do not join consecutive identical rows")
    args = ap.parse_args()
    args.out = args.out.resolve()
    land = build_land(args.out)
    build_borders(args, land, args.out)
    return 0


if __name__ == "__main__":
    sys.exit(main())
