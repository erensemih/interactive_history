#!/usr/bin/env python3
"""Derive the shapes of the `add` rows of the correction layer (public/data/corrections/ww2.json) from Natural Earth.

    python3 -I scripts/pipeline/build_correction_shapes.py            # write the polygons into ww2.json
    python3 -I scripts/pipeline/build_correction_shapes.py --check    # only compare them with what the sources give
    npx prettier --write public/data/corrections/ww2.json             # (after writing) the file's usual layout

The correction layer never edits the Cliopatria border file; its `add` rows are small patches painted on top of it.
Their shapes are not drawn by hand: each is a country of Natural Earth 1:10m admin-0 (public domain), grown a little
toward its neighbours (RECIPES below say how much and why) and clipped to the same coastline the border file and the
map use (public/data/geo/land.json), on the same 0.01 degree grid as the border file. A row is found in ww2.json by
its `name`; rows without a recipe are left as they are.

Needs: shapely (scripts/pipeline/requirements.txt) and .cache/natural-earth/ne_10m_admin_0_countries.geojson
(downloaded here from the Natural Earth repository when it is missing).
"""
import argparse
import json
import pathlib
import sys
import urllib.request

import shapely
from shapely.geometry import shape
from shapely.geometry.polygon import orient
from shapely.ops import unary_union

ROOT = pathlib.Path(__file__).resolve().parents[2]
CORRECTIONS = ROOT / "public" / "data" / "corrections" / "ww2.json"
LAND = ROOT / "public" / "data" / "geo" / "land.json"
NE_FILE = ROOT / ".cache" / "natural-earth" / "ne_10m_admin_0_countries.geojson"
NE_URL = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_0_countries.geojson"

GRID_DEG = 0.01  # the border file's grid (build_borders.py GRID_DEG)
MIN_PART_DEG2 = 0.0001  # a piece smaller than this (~1 km2) is dropped

# name of the row in ww2.json -> its pieces. A piece is the union of Natural Earth countries (`ne`: ADM0_A3 codes), grown by
# `grow` degrees and, when given, cut to `box` [west, south, east, north]; the row is the union of its pieces.
RECIPES = {
    # Singapore. The British row of 1942-45 still covers the island and a strip of the Johor shore across the strait
    # (103.5-104.0 E, up to 1.5 N), and being smaller than every Japanese row it wins there. So the patch is Singapore
    # plus that strip of Malaysia. 0.03 degrees is how far the map's coastline lies outside the 1:10m coast of Natural Earth.
    "Singapur": [
        {"ne": ["SGP"], "grow": 0.03},
        {"ne": ["MYS"], "grow": 0.03, "box": [103.5, 1.2, 104.0, 1.5]},
    ],
    # East Timor (Portuguese Timor): the border file keeps it Portuguese until 1944 and Japanese only in 1945. The
    # border file's Portuguese polygon is cruder than the country (it lies up to ~0.15 degrees over the line to West
    # Timor), so the piece is grown by 0.15 degrees to leave none of it Portuguese; Japan took the whole island in 1942.
    "Doğu Timor": [{"ne": ["TLS"], "grow": 0.15}],
}


def load_ne() -> list:
    if not NE_FILE.exists():
        print(f"  fetch {NE_URL}")
        NE_FILE.parent.mkdir(parents=True, exist_ok=True)
        with urllib.request.urlopen(NE_URL, timeout=300) as resp, open(NE_FILE, "wb") as out:
            while chunk := resp.read(1 << 20):
                out.write(chunk)
    return json.load(open(NE_FILE, encoding="utf-8"))["features"]


def polygons_of(geom) -> list:
    if geom.is_empty:
        return []
    if geom.geom_type == "Polygon":
        return [geom]
    out = []
    for g in getattr(geom, "geoms", []):
        out.extend(polygons_of(g))
    return out


def derive(pieces: list, ne_features: list, land) -> list:
    """The polygons ([ring, ...holes] of [lon, lat]) of one recipe."""
    grown = []
    for piece in pieces:
        countries = [shape(f["geometry"]) for f in ne_features if f["properties"]["ADM0_A3"] in piece["ne"]]
        if not countries:
            raise SystemExit(f"Natural Earth has no country {piece['ne']}")
        part = unary_union(countries).buffer(piece["grow"])
        if "box" in piece:
            part = part.intersection(shapely.box(*piece["box"]))
        grown.append(part)
    inside = shapely.set_precision(unary_union(grown).intersection(land), GRID_DEG)
    out = []
    for poly in sorted(polygons_of(inside), key=lambda p: -p.area):
        if poly.area < MIN_PART_DEG2:
            continue
        poly = orient(poly, 1.0)
        rings = [poly.exterior] + list(poly.interiors)
        out.append([[[round(x, 2), round(y, 2)] for x, y in r.coords] for r in rings])
    return out


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--check", action="store_true", help="do not write; exit 1 when ww2.json differs from the sources")
    args = ap.parse_args()

    doc = json.load(open(CORRECTIONS, encoding="utf-8"))
    land_fc = json.load(open(LAND, encoding="utf-8"))
    land = unary_union([shapely.make_valid(shape(f["geometry"])) for f in land_fc["features"]])
    shapely.prepare(land)
    ne = load_ne()

    stale = 0
    seen = set()
    for row in doc.get("rows", []):
        name = row.get("name")
        recipe = RECIPES.get(name)
        if row.get("op") != "add" or recipe is None:
            continue
        seen.add(name)
        polygons = derive(recipe, ne, land)
        npts = sum(len(r) - 1 for p in polygons for r in p)
        same = row.get("polygons") == polygons
        print(f"{name}: {len(polygons)} parts, {npts} points -> {'unchanged' if same else 'differs from ww2.json'}")
        if not same:
            stale += 1
            row["polygons"] = polygons
    for name in RECIPES:
        if name not in seen:
            print(f"  (no `add` row named {name!r} in {CORRECTIONS.name})")
            stale += 1

    if args.check:
        return 1 if stale else 0
    if stale:
        CORRECTIONS.write_text(json.dumps(doc, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        print(f"wrote {CORRECTIONS.relative_to(ROOT)} (run: npx prettier --write public/data/corrections/ww2.json)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
