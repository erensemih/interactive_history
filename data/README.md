# Arşivlenmiş dönemler

Yayındaki dönem `public/data/` içindedir (şu anda **1800–2000**). Diğer dönemler burada, `data/<başlangıç>-<bitiş>/`
altında, **tam** ve **yayın dışı** tutulur: aynı dosyalar, aynı düzen; uygulamaya ve tek dosya sürümüne hiçbir şey
buradan girmez.

| Klasör | İçerik |
|---|---|
| `1400-1600/` | Sınırlar (Cliopatria, düz GeoJSON), 281 devlet kaydı (Türkçe ad ve özetler), 72 olay (küresel, Osmanlı, Ming), kategoriler, kıyı katmanı; açılış aralığı 1490–1520 (`events/index.json` içinde `open`) |

## Bir dönemi yayına almak

```bash
npm run data:period -- --list        # yayındaki ve arşivdeki dönemler
npm run data:period -- 1400-1600     # 1400–1600'ü yayına al; yayındaki dönem data/ altına geçer
npm run data:validate && npm run build
```

Dosyalar taşınır (kopyalanmaz): her dönem tek bir yerdedir. Arşivdeki dönem testlerde de kullanılır
(`tests/helpers/shipped.ts` → `archivedData('1400-1600')`; `tests/data.test.ts` arşivi de doğrular), yani arşiv bozulursa
test kırılır.

## Bir dönemi yeniden üretmek (Python)

Sınır hattı döneme göre parametriktir; sonuç doğrudan arşiv klasörüne yazılabilir:

```bash
python3 -I scripts/pipeline/fetch_sources.py
python3 -I scripts/pipeline/build_borders.py --from 1400 --to 1600 --format geojson --keep-identical --out data/1400-1600
```

`--format geojson --keep-identical` 1400–1600 arşivinin biçimidir (düz GeoJSON, aynı satırlar birleştirilmez).
Varsayılan biçim (`--format delta`) 1800–2000 içindir: halkalar 0,01° adımlarıyla tamsayı listeleri olarak yazılır
(yaklaşık yarı boyut; gzip ile ~4× daha küçük) ve yükleyici (`src/data/borderCodec.ts`) bunları GeoJSON'a çevirir.
Bir dönemin kendi kuralları (aynı devleti iki adla anan kayıtların birleştirilmesi) `scripts/pipeline/periods/<başlangıç>-<bitiş>.json`
dosyasındadır; dosya yoksa kayıtlar olduğu gibi kalır.
