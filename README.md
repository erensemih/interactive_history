# Aynı Zamanda

**Aynı sırada, dünyanın başka yerlerinde ne oluyordu?**

Bir bölgenin tarihini tek başına okumak, olayları birbirinden kopuk bir listeye çevirir. *Aynı Zamanda*, bu
soruyu kolay yanıtlamak için tasarlanmış, zamanı ön plana alan etkileşimli bir tarih haritasıdır. Kullanıcı iki şey
seçer: bir **zaman aralığı** (tek yıl, 5 yıl, 100 yıl; kararı kullanıcı verir) ve haritada bir **yer**.

- **Harita zamana bağlıdır ve herkes için aynıdır:** o dönemin siyasi sınırlarını ve dünya tarihi için önemli
  olayları gösterir. Hangi yerin seçili olduğu haritanın *içeriğini* değiştirmez.
- **Zaman çizelgesi yere bağlıdır:** seçilen yerle doğrudan ilgili olayları, dünya tarihinde önemsiz olsalar bile,
  gösterir.

Bu ilk prototip, görsel dili ve etkileşimi oturtmak içindir; veri bilerek küçüktür (1400–1600, 72 olay).

![Anadolu, 1500](docs/verification/02-anadolu-1500.png)

## Çalıştırma

```bash
npm install
npm run dev          # http://127.0.0.1:5173
npm run build && npm run preview
npm test             # birim testleri + veri doğrulaması
npm run e2e          # gerçek tarayıcıda kabul senaryosu (aşağıya bakın)
npm run data:validate
```

Gerekenler: Node 20.19+ (22 önerilir). Veri hattını yeniden çalıştırmak için ayrıca Python 3 ve `shapely` gerekir;
uygulamanın kendisi Python'a ihtiyaç duymaz, çünkü üretilen veri depoda durur.

## Kullanım

| Ne yapmak istiyorsunuz | Nasıl |
|---|---|
| Zaman aralığını seçmek | Alttaki cetvelde aralığı sürükleyin, kenarlarından uzunluğunu ayarlayın; ya da yılları yazın; ya da *1 / 5 / 25 / 100 yıl* düğmelerini kullanın |
| Haritada hangi yılın sınırlarının çizildiğini seçmek | Cetvelde aralığın içindeki **▾** işaretini sürükleyin (varsayılan: aralığın ortası). Seçili yıl, zaman denetiminde "Haritadaki sınırlar" yanında ve haritanın başlığında yazar |
| Bir yeri seçmek | Haritada bir devletin üzerine tıklayın. **Harita yerinden oynamaz**: yalnızca sürükleme, tekerlek, çimdik ve `+/−` düğmeleri haritayı hareket ettirir |
| Bir olayı okumak | Haritadaki işaretçiye, çizelgedeki düğüme ya da sağdaki listeye tıklayın |
| Seçimi kaldırmak | Panelde ✕ ya da `Esc` |

Adres çubuğu durumu taşır (`#t=1450-1500&p=32.85,39.93&e=...`), bu yüzden bir görünümü bağlantıyla paylaşabilirsiniz.

## Tasarım kararları ve gerekçeleri

| Karar | Gerekçe |
|---|---|
| **MapLibre GL JS** (vektör, GPU) | Sürükleme/yakınlaştırma akıcı olmalı; sınırlar, vurgu ve katmanlar tek bir yerde çizilebilsin. Dış karo sunucusuna ihtiyaç yok: harita tamamen kendi verimizden çizilir. |
| **Vite + TypeScript + lit-html** (React yok) | Arayüz küçük ve durum odaklı; bir bileşen çerçevesi gereksiz. Mantık (`src/domain`) arayüzden ayrıdır ve birim testlidir. |
| **Sınır verisi: Seshat Cliopatria** (CC BY 4.0) | 1400–1600 arasında her devlet için 5–20 yıllık dönemlerle *her yıl* sınır verir; zaman sürükleyince sınırlar gerçekten kayar. Alternatif `historical-basemaps` bu aralıkta yalnızca 5 anlık görüntü (1400, 1492, 1500, 1530, 1600) sunuyor ve GPL-3.0. Cliopatria ayrıca her devlet için Wikipedia/Wikidata kimliği ve üst-alt (ör. Brandenburg → Kutsal Roma) ilişkisi taşır. Bedeli: yalnızca devletleri haritalar; devlet kaydı olmayan karalar noktalı "veri yok" zemini olarak gösterilir. |
| **Yer = bir nokta, devlet = o noktanın o yıldaki sahibi** | Konya 1450'de Karamanoğulları, 1475'te Osmanlı'dır. Zaman çizelgesi, aralık boyunca o noktayı elinde tutan *tüm* devletlerin (ve üst yapılarının, bulunduğu bölgenin) olaylarını toplar; böylece "yerin tarihi" okunur. |
| **Haritadaki olay sayısı: önem + yakınlaştırma bütçesi** | Önem 1–5. Haritada yalnızca ≥3 görünür; dünya görünümünde en önemliler, yakınlaştıkça daha fazlası (bütçe zoom ile artar), ekranda çakışanlar önem sırasına göre elenir. Sağ alttaki not kaç olayın çizildiğini ve geri kalanının neden görünmediğini söyler. Önem 1–2 olaylar yalnızca çizelgededir. |
| **Aralık seçici: fırçalı cetvel + hazır uzunluklar + yazılan yıl + "sınır yılı" işareti** | Tek yıl da 100 yıl da aynı denetimle seçilir. 100 yıllık bir aralıkta tek bir sınır haritası yetmez; fırçanın içindeki işaret, o aralık içinde hangi yılın sınırlarının çizileceğini seçtirir ve arayüzde her zaman yazılı görünür. Cetvelden çizelgeye çizilen "büyüteç" bağlantısı, çizelgenin aralığın yakınlaştırılmış hâli olduğunu gösterir. |
| **Çizelge, aralığın biraz ötesini soluk gösterir** | Tek yıllık bir seçimde bile yerin komşu yıllardaki olayları okunur; aralığın içindekiler vurgulu, dışındakiler soluktur. |
| **Düzen sabittir** | Bir yer seçilince alt bölümün ya da panelin boyu değişseydi harita yeniden boyutlanır ve kaymış gibi görünürdü. Boyutlar durumdan bağımsızdır. |

### Görsel dil

Basılı bir atlas: sıcak kâğıt, kahverengi-siyah mürekkep, sakin pastel devlet dolguları ve **tek canlı renk**
(vermilyon): "seçtiğiniz şey". Seçili devlet taramalı ve ışıltılı çizilir. Devlet dolgularının rengi yalnızca
komşuları ayırır (derleme sırasında komşuluk grafiği boyanır; kimlik etiket ve sınırla taşınır). Yazı: okuma
metinleri ve başlıklar için **Newsreader**, denetimler için **Instrument Sans**; ikisi de uygulamayla paketlenir.

**İşaretçiler harita, çizelge, lejant ve panelde aynıdır:** *şekil* kategoriyi, *boyut* önemi, renk şekli
pekiştirir. Altı kategori rengi bir renk-ayırt-edilebilirlik doğrulayıcısından (OKLab ΔE, protan/deutan simülasyonu), en sert
senaryoda (herhangi iki işaretçi yan yana, kâğıt zemin) geçirilmiştir: normal görüşte en kötü çift ΔE 19,3; protan/deutan simülasyonunda 10,0;
tümü kâğıda karşı ≥3:1 kontrast. Renk tek başına taşıyıcı değildir; şekil ikinci kanaldır.

## Veri

```
public/data/
  borders/cliopatria-1400-1600.json   sınırlar (üretilmiş; elle düzenlenmez)
  borders/polities.json               devlet başına türetilmiş bilgiler (Wikipedia/Wikidata, ton, dönem)
  geo/land.json                       kıyı çizgisi / kara (Natural Earth, üretilmiş)
  entities.json                       DEVLET VE BÖLGE ADLARI + ÖZETLER (Türkçe, elle yazılır)
  categories.json                     olay kategorileri
  events/index.json                   hangi olay dosyalarının yükleneceği
  events/*.json                       OLAYLAR (Türkçe, elle yazılır)
  schema/events.schema.json           olay dosyası için JSON şeması (editörde otomatik tamamlama)
```

### Sınırları yeniden üretmek

```bash
python3 -m venv .venv && .venv/bin/pip install -r scripts/pipeline/requirements.txt
.venv/bin/python -I scripts/pipeline/fetch_sources.py        # Cliopatria (46 MB) + Natural Earth → .cache/
.venv/bin/python -I scripts/pipeline/build_borders.py --from 1400 --to 1600
```

Betik: parantezli "şemsiye" kayıtları çizmez (bileşenlerinin birleşimidir); poligonları kıyıya kırpar (kıyı
net olur, denize tıklamak hiçbir şey seçmez); komşuluk grafiğiyle devlet tonlarını boyar; etiket noktalarını
hesaplar. **Zaman aralığını genişletmek** için `--from/--to` değiştirilip betik yeniden çalıştırılır; arayüz
aralığı dosyadan okur.

### Olay eklemek (kod değişikliği gerekmez)

`public/data/events/` altındaki bir dosyaya (ya da yeni bir dosyaya, `index.json`'a ekleyerek) bir nesne eklemek yeter:

```json
{
  "id": "istanbul-fethi-1453",
  "title": { "tr": "İstanbul'un Fethi" },
  "summary": { "tr": "II. Mehmed komutasındaki Osmanlı ordusu, 53 günlük kuşatmanın ardından …" },
  "date": { "start": "1453-04-06", "end": "1453-05-29" },
  "location": { "name": { "tr": "İstanbul" }, "coordinates": [28.94, 41.01] },
  "importance": 5,
  "category": "military",
  "parties": ["ottoman-empire", "byzantine-empire"],
  "sources": [{ "wikipedia": "Fall of Constantinople" }]
}
```

- `date`: `"1453"`, `"1453-05"`, `"1453-05-29"` ya da `{ "start", "end", "approximate" }`.
- `importance`: 5 dönüm noktası · 4 çok önemli · **3 önemli (haritada görünür)** · 2 yerel önem · 1 yerel ayrıntı (yalnızca çizelge).
- `parties`: `entities.json` içindeki devlet/bölge kimlikleri. Olay, bu tarafların çizelgesinde **mesafeden
  bağımsız** görünür. Bir "üst yapı" taraf olarak yazılırsa (ör. `holy-roman-empire`), üyelerinin (Saksonya,
  Bavyera…) çizelgesinde de görünür.
- `sources`: en az bir Vikipedi makalesi (`wikipedia`, varsayılan dil `en`), Vikiveri kimliği (`wikidata`) ya da `url`.
- Yeni bir **bölge** (devlet kaydı olmayan karalar için, ör. Karayipler) `entities.json`'a `kind: "region"` ve
  `bounds: [batı, güney, doğu, kuzey]` ile eklenir.
- Kategori eklemek için `categories.json`'a kayıt yeterlidir; görünümü `src/domain/categories.ts`'de tanımlanmazsa
  nötr bir yedek biçim kullanılır.

`npm run data:validate` her şeyi denetler (zorunlu alanlar, tarih biçimi, bilinmeyen taraf/kategori, yinelenen id,
kaynak yokluğu, Türkçe ad eksikliği…).

### Bilinen veri sınırlamaları

- Cliopatria **yalnızca devletleri** haritalar: Amerika, Afrika ve Sibirya'nın büyük bölümü noktalı "veri yok"
  zemindir. Bu yerlere tıklanırsa devlet yerine (varsa) bölge adı gösterilir.
- Veri setinde bazı devletlerin kayıt aralıklarında boşluk vardır (ör. Bizans 1402–1406, Macaristan 1450–1458);
  bu yıllarda devlet haritada görünmez. **Uydurma sınır çizilmez.**
- Sınırlar yaklaşıktır (veri setinin kendi uyarısı: bir yorumun yalnızca bir sürümü). Panelde, çizilen sınırın hangi
  kayıt dönemine ait olduğu (ör. "1492–1501") gösterilir.
- Olayların kaynakları İngilizce Vikipedi makale başlıklarıdır. Geliştirme ortamında Vikipedi/Vikiveri'ye erişim
  olmadığından başlıklar ve olay Wikidata kimlikleri **otomatik doğrulanamadı**; bağlantıları ilk fırsatta kontrol
  edin. Devletlerin Vikiveri kimlikleri ise doğrudan Cliopatria'dan gelir.

## Mimari

```
src/
  domain/   saf mantık (arayüzsüz, testli): time, geo, events, lanes, categories
  data/     veri yükleyici ve birleştirme
  state/    store (durum + eylemler), derive (görünüm modeli), url (adres çubuğu)
  map/      MapLibre görünümü, DOM etiketleri, işaretçiler, yer iğnesi
  ui/       cetvel, zaman çizelgesi, bilgi paneli, harita üstü öğeler, ipucu kutusu
  styles/   tasarım belirteçleri ve bileşen stilleri
```

- Durumda **harita kamerası yoktur**; harita görünümünü yalnızca kullanıcının kendi eylemleri değiştirir.
  Kaynakta kamerayı oynatan tek yer, açılıştaki başlangıç çerçevesi ve kullanıcının bastığı `+/−` düğmeleridir
  (`flyTo`, `fitBounds`, `easeTo` vb. hiçbir yerde çağrılmaz); çift tıklamayla yakınlaştırma da kapalıdır.
- `ViewModel.mapEvents` yalnızca zaman aralığından hesaplanır. Seçili yer yalnızca vurgu katmanını, yer iğnesini,
  panelin yer kartını ve çizelgeyi değiştirir.
- **Karşılaştırma moduna hazırlık:** seçim bir dizidir (`places: PlacePoint[]`), türetilmiş görünüm yer başına bir
  `PlaceView` üretir, panel `placeCard`'ı yer başına çizer, çizelge yer başına bir şerit alacak biçimde yazılmıştır,
  harita iğneleri bir listedir. İkinci yeri eklemek, durum ve çizim katmanlarında ek özellik gerektirmez; yalnızca
  ikinci bir seçim eylemi ve iki sütunlu düzen gerekir.
- **Ek katmanlar (din, dil):** `MapView.onLoad` katman listesine yeni kaynak/katman eklemek yeter; zaman filtresi
  (`from/to`) aynı biçimde uygulanır.

## Doğrulama

`npm run e2e`, üretim derlemesini gerçek (başsız) Chromium'da şu senaryoyla sınar ve `docs/verification/` altına
ekran görüntüleri ve `RAPOR.md` yazar:

1. 1500'de Anadolu'da bir nokta → **Osmanlı** vurgulanır, çizelgede Osmanlı olayları görünür.
2. Çin'de bir nokta → **Ming** görünür; **harita kamerası (merkez, yakınlaştırma, açı) birebir aynı kalır.**
3. Aralık 1450–1500 → haritadaki olay kümesi, aralıktan bağımsız hesaplanan kümeyle birebir aynıdır.

Ek olarak: işaretçi/çizelge/deniz tıklamalarının haritayı oynatmadığı, haritanın yerden bağımsız olduğu, düzenin
kaymadığı, klavye ve sürükleme denetimlerinin çalıştığı ve (duyarlılık sınaması olarak) gerçek bir sürüklemenin
kamerayı **gerçekten** hareket ettirdiği denetlenir.

## Bilinen sınırlar ve sonraki adımlar

- Karşılaştırma modu henüz yok (veri yapıları hazır; yukarıya bakın).
- Haritada devlet seçimi yalnızca fare/dokunma ile yapılır; klavye ile devlet seçimi için bir arama kutusu eklenebilir.
- Karanlık tema yok (renkler `tokens.css`'te belirteç olarak duruyor).
- İlk yükleme ~9 MB sınır verisi indirir (sıkıştırılmış ~1,7 MB); büyük aralıklar için sınırlar yıl dilimlerine bölünebilir.
- Kod için lisans henüz seçilmedi; veri ve kütüphane atıfları için [`public/NOTICE.txt`](public/NOTICE.txt) dosyasına bakın.
