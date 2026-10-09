#!/usr/bin/env python3
"""Download the raw source datasets into .cache/ (not committed).

    python3 -I scripts/pipeline/fetch_sources.py

Sources
  * Seshat Cliopatria (CC BY 4.0) - political borders
      https://github.com/Seshat-Global-History-Databank/cliopatria
  * Natural Earth 1:50m land + lakes (public domain) - coastline mask
      https://github.com/nvkelso/natural-earth-vector
"""
import pathlib
import sys
import urllib.request
import zipfile

ROOT = pathlib.Path(__file__).resolve().parents[2]
CACHE = ROOT / ".cache"

CLIOPATRIA_ZIP = "https://raw.githubusercontent.com/Seshat-Global-History-Databank/cliopatria/main/cliopatria.geojson.zip"
NE_BASE = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson"
NE_FILES = ["ne_50m_land.geojson", "ne_50m_lakes.geojson"]


def download(url: str, dest: pathlib.Path) -> None:
    if dest.exists() and dest.stat().st_size > 0:
        print(f"  have {dest.relative_to(ROOT)}")
        return
    print(f"  fetch {url}")
    dest.parent.mkdir(parents=True, exist_ok=True)
    with urllib.request.urlopen(url, timeout=300) as resp, open(dest, "wb") as out:
        while chunk := resp.read(1 << 20):
            out.write(chunk)


def main() -> int:
    cliopatria_dir = CACHE / "cliopatria"
    download(CLIOPATRIA_ZIP, cliopatria_dir / "cliopatria.geojson.zip")
    with zipfile.ZipFile(cliopatria_dir / "cliopatria.geojson.zip") as zf:
        for name in zf.namelist():
            target = cliopatria_dir / pathlib.Path(name).name
            if not target.exists():
                print(f"  unzip {name}")
                with zf.open(name) as src, open(target, "wb") as out:
                    while chunk := src.read(1 << 20):
                        out.write(chunk)
    for name in NE_FILES:
        download(f"{NE_BASE}/{name}", CACHE / "natural-earth" / name)
    print("done")
    return 0


if __name__ == "__main__":
    sys.exit(main())
