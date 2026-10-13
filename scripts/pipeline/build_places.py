#!/usr/bin/env python3
"""Build the app's gazetteer (public/data/places.json) from Natural Earth populated places (offline step).

    python3 -I scripts/pipeline/fetch_sources.py
    python3 -I scripts/pipeline/build_places.py [--out public/data/places.json] [--check] [--audit]

What the gazetteer is for: the ends of the lines and the stops of the routes the reading companion draws are *places*
(src/data/places.ts). A place is found by its Turkish or English name or by any alternative name ("Danzig", "Stalingrad",
"Peking"), so the file carries the names a narrator of 1800-2000 history would write, not only today's.

What it does
  1. Reads .cache/natural-earth/ne_10m_populated_places.geojson (7,342 points).
  2. Selects: every national capital, every place of 100,000 people or more, every place a hand-kept list names
     (places-extra.json "include", the targets of places-aliases.json) and every place the capitals table
     (public/data/capitals.json) points to.
  3. Cleans the source's names (its English name is wrong for a few dozen places: "Pochinki" for Cuttack, "Saudi Arabia"
     for Ha'il; an English name that has nothing to do with the place's own names is replaced by the place's own name)
     and applies the corrections of places-aliases.json ("countries", "fixes").
  4. Gives every place an id (the English name as a slug; where two places share one the biggest keeps it and the rest
     get "-<country>"), collects the other spellings as `alt`, adds the curated historical names (places-aliases.json
     "aliases") and the places Natural Earth lacks (places-extra.json "places").
  5. Writes places.json: one place per line, sorted by id, no timestamp (the same input gives the same bytes).
     A place the hand-kept lists or the capitals table name carries "key": 1 - when two places share a name, the page
     offers the one a narrator of the period most likely means (Salamanca in Spain) before the bigger namesake.

Natural Earth is in the public domain ("Made with Natural Earth."). The names, coordinates and populations of the
selected places are the source's, except where the lists say otherwise; `meta.source.changes` says so in the file.

Input lists (hand-kept, next to this script)
  places-extra.json     "places": places the source lacks (id, tr, en, lon, lat, cc, alt, pop?; `note` is for readers)
                        "include": places the source has, below the size limit, that the war needs (Narvik, El Alamein)
  places-aliases.json   "aliases": historical and alternative names -> one place (English name + country code; a target
                        that is missing or matches two places stops the build; "near" settles the second case)
                        "drop": spellings of the source that are wrong and must not become an alternative name
                        "countries": country-code corrections for a box of the map (Crimea)
                        "fixes": corrections of one source record (English or Turkish name, country, population, capital)

`--check` builds in memory and exits 1 if the file on disk differs; `--audit` lists what a maintainer should look at after
a new source file (replaced English names, Turkish names that look unrelated, shared names, curated names that collide).
"""
import argparse
import json
import math
import pathlib
import re
import sys
import unicodedata
from collections import defaultdict
from difflib import SequenceMatcher

ROOT = pathlib.Path(__file__).resolve().parents[2]
HERE = pathlib.Path(__file__).resolve().parent
SOURCE = ROOT / ".cache" / "natural-earth" / "ne_10m_populated_places.geojson"
EXTRA = HERE / "places-extra.json"
ALIASES = HERE / "places-aliases.json"
CAPITALS = ROOT / "public" / "data" / "capitals.json"
OUT = ROOT / "public" / "data" / "places.json"

MIN_POP = 100_000  # every place at least this big is in
SOURCE_URL = "https://www.naturalearthdata.com/downloads/10m-cultural-vectors/10m-populated-places/"

# The source's ISO code is "-99" where the state has none; the first two letters of its three-letter code are wrong
# for Kosovo, so the three states that matter are named.
ISO_FALLBACK = {"KOS": "XK", "SOL": "SO", "CYN": "CY"}

# The same folding as normalizeName in src/domain/names.ts (lower case, accents and these letters folded, everything but
# letters and digits one space): a key made here is the key the page makes.
FOLD = {"ı": "i", "ß": "ss", "æ": "ae", "œ": "oe", "ø": "o", "đ": "d", "ł": "l"}
# Letters the page does not fold but an id should not lose.
SLUG_FOLD = {**FOLD, "ð": "d", "þ": "th", "ŋ": "ng", "ə": "e", "ʻ": "", "ʼ": ""}

OTHER_LANGUAGES = ["NAME_DE", "NAME_FR", "NAME_ES", "NAME_IT", "NAME_PT", "NAME_NL", "NAME_PL", "NAME_SV", "NAME_HU"]
# English-name suffixes that are the source's disambiguation and not the name ("Kuqa County", "Qatif governorate").
EN_SUFFIX = re.compile(r"\s+(County|governorate|Territory|District)\b.*$|^Campament of\s+", re.I)
TR_SUFFIX = re.compile(r"\s+(İlçesi|Şehri)$")


def normalize(text: str) -> str:
    text = unicodedata.normalize("NFD", text.lower())
    text = "".join(c for c in text if not unicodedata.category(c).startswith("M"))
    text = "".join(FOLD.get(c, c) for c in text)
    return re.sub(r"[^a-z0-9]+", " ", text).strip()


def slugify(text: str) -> str:
    text = unicodedata.normalize("NFD", text.lower())
    text = "".join(c for c in text if not unicodedata.category(c).startswith("M"))
    text = "".join(SLUG_FOLD.get(c, c) for c in text)
    return re.sub(r"[^a-z0-9]+", "-", text).strip("-")


def clean(text) -> str:
    if not text:
        return ""
    text = unicodedata.normalize("NFC", str(text)).replace("‎", "").replace("‏", "").replace(" ", " ")
    return re.sub(r"\s+", " ", text).strip()


def number(n: int) -> str:
    """A count as Turkish writes it: 3.246."""
    return f"{n:,}".replace(",", ".")


def fail(message: str) -> None:
    print(f"HATA: {message}", file=sys.stderr)
    sys.exit(1)


def distance_km(lon1, lat1, lon2, lat2) -> float:
    p1, p2 = math.radians(lat1), math.radians(lat2)
    a = math.sin((p2 - p1) / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(math.radians(lon2 - lon1) / 2) ** 2
    return 12742 * math.asin(math.sqrt(a))


def read_json(path: pathlib.Path):
    try:
        return json.loads(path.read_text(encoding="utf8"))
    except FileNotFoundError:
        return None
    except json.JSONDecodeError as error:
        fail(f"{path.relative_to(ROOT)} okunamadı: {error}")


# ---------------------------------------------------------------------------------------------------------------------
# The source
# ---------------------------------------------------------------------------------------------------------------------


def split_alternatives(value) -> list:
    """The source's NAMEALT/NAMEPAR: names joined with "|" or ";", sometimes with a region after a comma or a
    second name in brackets ("Pietersburg (Polokwane)"). Only the names are kept."""
    out = []
    for part in re.split(r"[|;]", clean(value)):
        part = part.split(",")[0].strip()
        m = re.fullmatch(r"(.+?)\s*\((.+)\)", part)
        out.extend([m.group(1), m.group(2)] if m else [part])
    return [clean(p) for p in out if clean(p)]


def load_source() -> list:
    if not SOURCE.exists():
        fail(f"{SOURCE.relative_to(ROOT)} yok. Önce: python3 -I scripts/pipeline/fetch_sources.py")
    records = []
    for feature in json.loads(SOURCE.read_text(encoding="utf8"))["features"]:
        p = feature["properties"]
        lon, lat = feature["geometry"]["coordinates"][:2]  # the geometry is corrected; LONGITUDE/LATITUDE are not
        iso = clean(p["ISO_A2"])
        if not re.fullmatch(r"[A-Z]{2}", iso):
            iso = ISO_FALLBACK.get(p["ADM0_A3"], clean(p["ADM0_A3"])[:2].upper())
        records.append(
            {
                "ne_id": p["NE_ID"],
                "name": clean(p["NAME"]),
                "ascii": clean(p["NAMEASCII"]),
                "par": split_alternatives(p["NAMEPAR"]),
                "alts": split_alternatives(p["NAMEALT"]),
                "en_raw": clean(p["NAME_EN"]),
                "tr_raw": clean(p["NAME_TR"]),
                "others": [clean(p.get(k)) for k in OTHER_LANGUAGES if clean(p.get(k))],
                "cc": iso,
                "lon": lon,
                "lat": lat,
                "pop": int(p["POP_MAX"] or 0),
                "cap": p["ADM0CAP"] == 1,
                "capital_class": clean(p["FEATURECLA"]).startswith(("Admin-0 capital", "Admin-0 region capital")),
                "alt": [],
                "key": False,
            }
        )
    return records


def related(english: str, evidence: list) -> bool:
    """Is the source's English name a name of the same place? Compared with the place's own name and the names other
    languages give it: equal after folding, or close enough to be another spelling or an exonym ("Mecca"/"Makkah")."""
    key = normalize(english)
    if not key:
        return False
    for other in evidence:
        o = normalize(other)
        if not o:
            continue
        if key == o or key in o.split() or (o in key.split() and len(o) >= 4):
            return True
        if SequenceMatcher(None, key, o).ratio() >= 0.72:
            return True
    return False


def choose_names(rec: dict, owners: dict) -> None:
    """tr and en of a source record; a wrong English name is replaced by the place's own name.

    The English name is wrong when it has nothing to do with the place's own names, or when it is the own name of a
    bigger place far away and only vaguely like this one's ("Pyongyang" for the town of Pyongsan, "Niamey" for Maradi)."""
    primary = [rec["name"], rec["ascii"], *rec["par"], *rec["alts"], rec["tr_raw"]]
    evidence = [*primary, *rec["others"]]
    en = EN_SUFFIX.sub("", rec["en_raw"]).strip() if rec["en_raw"] else ""
    wrong = not en or not related(en, evidence)
    if not wrong:
        key = normalize(en)
        borrowed = any(
            o is not rec and o["pop"] >= rec["pop"] and distance_km(o["lon"], o["lat"], rec["lon"], rec["lat"]) > 40
            for o in owners.get(key, [])
        )
        if borrowed and key not in {normalize(p) for p in primary}:
            wrong = not any(SequenceMatcher(None, key, normalize(p)).ratio() >= 0.9 for p in primary if p)
    rec["en_wrong"] = rec["en_raw"] if wrong else ""
    if wrong:
        en = rec["name"] or rec["ascii"] or en
    tr = TR_SUFFIX.sub("", rec["tr_raw"]).strip() if rec["tr_raw"] else ""
    rec["en"] = en
    rec["tr"] = (tr or en).replace("ș", "ş").replace("Ș", "Ş")  # Romanian comma-below s is Turkish cedilla s here


def apply_countries(records: list, rules: list) -> int:
    changed = 0
    for rule in rules:
        west, south, east, north = rule["box"]
        for rec in records:
            if rec["cc"] == rule["from"] and west <= rec["lon"] <= east and south <= rec["lat"] <= north:
                rec["cc"] = rule["to"]
                changed += 1
    return changed


def apply_fixes(records: list, fixes: list) -> None:
    for fix in fixes:
        hits = [
            r
            for r in records
            if r["name"] == fix["ne"]
            and r["cc"] == fix["cc"]
            and ("near" not in fix or distance_km(r["lon"], r["lat"], *fix["near"]) < 60)
        ]
        if len(hits) != 1:
            fail(f"places-aliases.json fixes: \"{fix['ne']}\" ({fix['cc']}) {len(hits)} kayıtla eşleşti (1 olmalı; \"near\" ekle)")
        rec = hits[0]
        for field in ("en", "tr", "cc", "pop"):
            if field in fix:
                rec[field] = fix[field]
        if "cap" in fix:
            rec["cap"] = bool(fix["cap"])


# ---------------------------------------------------------------------------------------------------------------------
# Selection, ids, alternative names
# ---------------------------------------------------------------------------------------------------------------------


def find_target(records: list, entry: dict, what: str) -> dict:
    """The one source record an {"en", "cc"} entry names (by its English name after cleaning, or its own name)."""
    key = normalize(entry["en"])
    hits = [r for r in records if r["cc"] == entry["cc"] and key in (normalize(r["en"]), normalize(r["name"]))]
    if "near" in entry:
        hits = [r for r in hits if distance_km(r["lon"], r["lat"], *entry["near"]) < 60]
    exact = [r for r in hits if normalize(r["en"]) == key]
    hits = exact or hits
    if len(hits) != 1:
        found = "; ".join(f"{r['en']} ({r['cc']}, {r['pop']}, {r['lon']:.2f},{r['lat']:.2f})" for r in hits) or "hiçbiri"
        fail(f"{what}: \"{entry['en']}\" ({entry['cc']}) {len(hits)} yerle eşleşti (1 olmalı): {found}")
    return hits[0]


def assign_ids(selected: list, reserved: set) -> None:
    """Slug of the English name; the biggest place keeps it, the others get -<country> (then -2, -3...)."""
    groups = defaultdict(list)
    for rec in selected:
        slug = slugify(rec["en"]) or slugify(rec["name"]) or f"yer-{rec['ne_id']}"
        groups[slug].append(rec)
    used = set(reserved)
    for slug in sorted(groups):
        group = sorted(groups[slug], key=lambda r: (-r["pop"], r["cc"], r["lon"], r["lat"]))
        for i, rec in enumerate(group):
            candidate = slug if i == 0 and slug not in used else f"{slug}-{rec['cc'].lower()}"
            n = 2
            while candidate in used:
                candidate = f"{slug}-{rec['cc'].lower()}-{n}"
                n += 1
            used.add(candidate)
            rec["id"] = candidate


def add_alt(names: list, text: str, seen: set) -> bool:
    key = normalize(text)
    if len(key) < 2 or re.search(r"\d", key) or key in seen:
        return False
    seen.add(key)
    names.append(text)
    return True


def collect_alt(rec: dict, drop_keys: set, mains: dict) -> None:
    """Every other spelling of the source: its own name, the bracketed and the alternative names, the ASCII name.
    Junk (places-aliases.json "drop") and names that are another place's own name in the same country (the source
    mixing two cities up: "Teresina" for Timon) are left out."""
    seen = {normalize(rec["tr"]), normalize(rec["en"]), *drop_keys}
    rec["alt"] = []
    for text in (rec["name"], *rec["par"], *rec["alts"], rec["ascii"]):
        if "?" in text or "�" in text:
            continue
        if text not in (rec["name"], rec["ascii"]) and any(
            o is not rec and o["cc"] == rec["cc"] for o in mains.get(normalize(text), [])
        ):
            continue
        add_alt(rec["alt"], text, seen)


def sort_key(text: str):
    return (normalize(text), text)


# ---------------------------------------------------------------------------------------------------------------------
# Build
# ---------------------------------------------------------------------------------------------------------------------


def build():
    extra = read_json(EXTRA) or {}
    config = read_json(ALIASES) or {}
    capitals = read_json(CAPITALS)
    capital_ids = sorted({span["place"] for spans in (capitals or {}).get("capitals", {}).values() for span in spans})
    warnings = []

    records = load_source()
    owners = defaultdict(list)  # a name -> the records whose own name it is
    for rec in records:
        for text in {rec["name"], rec["ascii"]}:
            owners[normalize(text)].append(rec)
    for rec in records:
        choose_names(rec, owners)
    moved = apply_countries(records, config.get("countries", []))
    apply_fixes(records, config.get("fixes", []))

    drop_keys = {normalize(t) for t in config.get("drop", [])}
    includes = [find_target(records, e, "places-extra.json include") for e in extra.get("include", [])]
    alias_entries = config.get("aliases", [])
    targets = [find_target(records, e, "places-aliases.json aliases") for e in alias_entries]
    if len({id(t) for t in targets}) != len(targets):
        again = [e["en"] for e, t in zip(alias_entries, targets) if sum(1 for u in targets if u is t) > 1]
        fail("places-aliases.json: aynı yer iki kez hedef: " + ", ".join(again))

    chosen = {id(r): r for r in records if r["cap"] or r["capital_class"] or r["pop"] >= MIN_POP}
    for rec in includes + targets:
        chosen[id(rec)] = rec
        rec["key"] = True

    extra_places = extra.get("places", [])
    reserved = {p["id"] for p in extra_places}
    if len(reserved) != len(extra_places):
        fail("places-extra.json: yinelenen id")
    for p in extra_places:
        if p["id"] != slugify(p["en"]):
            warnings.append(f"places-extra.json: {p['id']} kimliği İngilizce adın ({p['en']}) kısaltması değil")

    # the capitals table names places by id; a place the size rules left out is taken in (and the ids settled again,
    # because a newcomer can take the plain slug of a smaller namesake)
    by_slug = defaultdict(list)
    for r in records:
        by_slug[slugify(r["en"])].append(r)
    for _ in range(6):
        selected = list(chosen.values())
        assign_ids(selected, reserved)
        by_id = {r["id"]: r for r in selected}
        missing = [i for i in capital_ids if i not in by_id and i not in reserved]
        if not missing:
            break
        progress = False
        for i in missing:
            hits = by_slug.get(i, [])
            m = re.fullmatch(r"(.+)-([a-z]{2})(?:-\d+)?", i)
            if not hits and m:  # "valencia-es": the namesake of that country
                hits = [r for r in by_slug.get(m.group(1), []) if r["cc"].lower() == m.group(2)]
            hits = sorted(hits, key=lambda r: -r["pop"])
            if hits and id(hits[0]) not in chosen:
                chosen[id(hits[0])] = hits[0]
                progress = True
        if not progress:
            fail("capitals.json bu yerleri bulamadı (places-extra.json'a ekle ya da kimliği düzelt): " + ", ".join(missing))
    else:
        fail("kimlikler yerine oturmadı")
    for rec in selected:
        if rec["id"] in reserved:
            fail(f"places-extra.json kimliği \"{rec['id']}\" kaynaktaki bir yerin kimliğiyle çakışıyor ({rec['en']}, {rec['cc']})")
        if rec["id"] in capital_ids:
            rec["key"] = True

    # the names
    mains = defaultdict(list)
    for r in selected:
        mains[normalize(r["en"])].append(r)
        mains[normalize(r["tr"])].append(r)
    for rec in selected:
        collect_alt(rec, drop_keys, mains)

    alias_names = 0
    for entry, rec in zip(alias_entries, targets):
        seen = {normalize(rec["tr"]), normalize(rec["en"]), *(normalize(a) for a in rec["alt"])}
        for name in entry["alt"]:
            if add_alt(rec["alt"], clean(name), seen):
                alias_names += 1
            for other in mains.get(normalize(name), []):
                if other is not rec:
                    warnings.append(f"ad çakışması: \"{name}\" -> {rec['id']}, ama {other['id']} ({other['cc']}) yerinin kendi adı")

    places = []
    for rec in selected:
        item = {
            "id": rec["id"],
            "tr": rec["tr"],
            "en": rec["en"],
            "lon": round(rec["lon"], 3) + 0.0,
            "lat": round(rec["lat"], 3) + 0.0,
            "pop": rec["pop"],
            "cc": rec["cc"],
        }
        if rec["cap"]:
            item["cap"] = 1
        if rec["key"]:
            item["key"] = 1
        item["alt"] = sorted(rec["alt"], key=sort_key)
        places.append(item)

    for entry in extra_places:
        seen = {normalize(entry["tr"]), normalize(entry["en"])}
        alt = []
        for name in entry.get("alt", []):
            if add_alt(alt, clean(name), seen):
                alias_names += 1
        item = {
            "id": entry["id"],
            "tr": entry["tr"],
            "en": entry["en"],
            "lon": round(entry["lon"], 3) + 0.0,
            "lat": round(entry["lat"], 3) + 0.0,
            "pop": int(entry.get("pop", 0)),
            "cc": entry["cc"],
            "key": 1,
            "alt": sorted(alt, key=sort_key),
        }
        places.append(item)
        for r in selected:  # the same place twice?
            if r["cc"] == entry["cc"] and normalize(r["en"]) == normalize(entry["en"]) and distance_km(r["lon"], r["lat"], entry["lon"], entry["lat"]) < 15:
                warnings.append(f"places-extra.json: {entry['id']} zaten Natural Earth'te var ({r['id']})")

    places.sort(key=lambda p: p["id"])
    ids = [p["id"] for p in places]
    if len(set(ids)) != len(ids):
        fail("yinelenen kimlik: " + ", ".join(sorted({i for i in ids if ids.count(i) > 1})))

    replaced = [r for r in selected if r["en_wrong"]]
    doc = {
        "meta": {
            "source": {
                "name": "Natural Earth — Populated places (1:10m)",
                "url": SOURCE_URL,
                "license": "Kamu malı (public domain)",
                "citation": "Made with Natural Earth.",
                "changes": (
                    f"Tüm ulusal başkentler, nüfusu {number(MIN_POP)} ve üzeri olan yerler ile savaş, tarihsel ad ve başkent listelerinde "
                    f"geçen yerler seçildi (7.342 kayıttan {number(len(selected))} yer). Türkçe ad kaynağın NAME_TR alanındandır; "
                    f"kaynağın yanlış İngilizce adları ({len(replaced)} yerde) yerin kendi adıyla değiştirildi, Kırım'daki yerlerin ülke kodu "
                    f"UA yapıldı. Natural Earth'te bulunmayan {len(extra_places)} yer elle eklendi; {alias_names} tarihsel ve alternatif ad işlendi."
                ),
            },
            "count": len(places),
        },
        "places": places,
    }
    report = {
        "selected": len(selected),
        "extra": len(extra_places),
        "include": len(includes),
        "targets": len(targets),
        "alias_names": alias_names,
        "capital_ids": len(capital_ids),
        "moved": moved,
        "replaced": [(r["en_raw"], r["en"], r["cc"]) for r in replaced],
        "warnings": warnings,
        "selected_records": selected,
        "mains": mains,
    }
    return doc, report


def render(doc: dict) -> str:
    meta = json.dumps(doc["meta"], ensure_ascii=False, indent=2).replace("\n", "\n  ")
    lines = ["    " + json.dumps(p, ensure_ascii=False, separators=(",", ":")) for p in doc["places"]]
    return '{\n  "meta": ' + meta + ',\n  "places": [\n' + ",\n".join(lines) + "\n  ]\n}\n"


def audit(report: dict) -> None:
    selected = report["selected_records"]
    print(f"\nİngilizce adı değişen {len(report['replaced'])} yer:")
    for raw, used, cc in report["replaced"]:
        print(f"  {raw!r} -> {used!r} ({cc})")
    print("\nTürkçe adı İngilizce ve yerel adlardan çok uzak olanlar (bozuk olabilir; Kandiye gibi gerçek adlar da çıkar):")
    for rec in sorted(selected, key=lambda r: -r["pop"]):
        own = [normalize(x) for x in (rec["en"], rec["name"], rec["ascii"]) if x]
        ratio = max(SequenceMatcher(None, normalize(rec["tr"]), o).ratio() for o in own)
        if ratio < 0.5:
            print(f"  {rec['tr']!r} ({rec['en']!r}, {rec['cc']}, {rec['pop']})")
    shared = {k: v for k, v in report["mains"].items() if len({id(r) for r in v}) > 1}
    print(f"\nBirden çok yerin kendi adı olan {len(shared)} ad:")
    for key, group in sorted(shared.items()):
        uniq = {id(r): r for r in group}.values()
        print(f"  {key}: " + ", ".join(f"{r['id']}({r['cc']},{r['pop'] // 1000}k{',key' if r['key'] else ''})" for r in uniq))


def main() -> int:
    parser = argparse.ArgumentParser(description="Natural Earth populated places -> public/data/places.json")
    parser.add_argument("--out", default=str(OUT), help="output file (default public/data/places.json)")
    parser.add_argument("--check", action="store_true", help="build in memory; exit 1 if the file on disk differs")
    parser.add_argument("--audit", action="store_true", help="list what a maintainer should look at, and write nothing")
    args = parser.parse_args()

    doc, report = build()
    for line in report["warnings"]:
        print(f"uyarı: {line}", file=sys.stderr)
    if args.audit:
        audit(report)
        return 0
    text = render(doc)
    out = pathlib.Path(args.out)
    if args.check:
        same = out.exists() and out.read_text(encoding="utf8") == text
        print("places.json güncel." if same else "places.json eski: python3 -I scripts/pipeline/build_places.py")
        return 0 if same else 1
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(text, encoding="utf8")
    print(
        f"{len(doc['places'])} yer ({report['selected']} Natural Earth + {report['extra']} elle eklenen; "
        f"{report['include']} küçük yer alındı, {report['targets']} yer için {report['alias_names']} ad eklendi, "
        f"{report['capital_ids']} başkent kimliği, {report['moved']} yerin ülke kodu düzeltildi) "
        f"-> {out.relative_to(ROOT) if out.is_relative_to(ROOT) else out}  {len(text.encode('utf8')) / 1024:.0f} KB"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
