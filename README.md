# Aynı Zamanda

**Aynı sırada, dünyanın başka yerlerinde ne oluyordu?**

Bir bölgenin tarihini tek başına okumak, olayları birbirinden kopuk bir listeye çevirir. *Aynı Zamanda*, bu
soruyu kolay yanıtlamak için tasarlanmış, zamanı ön plana alan etkileşimli bir tarih haritasıdır. Kullanıcı iki şey
seçer: bir **zaman aralığı** (tek yıl, 5 yıl, 100 yıl; kararı kullanıcı verir) ve haritada bir **yer**.

- **Harita zamana bağlıdır:** o dönemin siyasi sınırlarını ve dünyanın dört bir yanından bir olay seçkisini gösterir.
  Haritada **tek anlatıcı** vardır: hiçbir şey seçili değilken dünya olayları (önemli olanlar) haritadadır; bir yer seçilince
  onlar haritadan çekilir (çizelgede kalırlar, seçim kalkınca dönerler) ve yer kendi kartı, vurgusu ve çizelgesiyle anlatır;
  yapay zekâ konuşurken harita onundur.
- **Zaman çizelgesi yere bağlıdır:** seçilen yerle doğrudan ilgili olayları, dünya tarihinde önemsiz olsalar bile, gösterir;
  yalnızca **seçili aralığı** gösterir (aralığın öncesi ve sonrası yoktur).

Bu ilk prototip, görsel dili ve etkileşimi oturtmak içindir; yayındaki dönem **1800–2000**'dir ve açılış ekranı **İkinci Dünya
Savaşı** yıllarındadır (1939–1945). Olay verisi bilerek küçüktür (74 olay: iki yüzyıla yayılmış birkaç dönüm noktası ve savaş için
yoğun bir küme). Önceki dönem (1400–1600) verisiyle ve hattıyla birlikte depoda durur, ama yayın dışıdır
([`data/README.md`](data/README.md)).

![Almanya, 1942](docs/verification/02-almanya-1942.png)

| Sovyetler Birliği seçili, aynı harita | Aralık 1938–1942 | Olay ayrıntısı |
|---|---|---|
| ![](docs/verification/03-sovyetler-1942.png) | ![](docs/verification/04-aralik-1938-1942.png) | ![](docs/verification/05-olay-detayi.png) |

Çizelgeden görünüm dışındaki bir olay (Stalingrad, 1942) seçilince harita yumuşakça, yalnızca gerektiği kadar uzaklaşır:

| Önce: Çin'e yakınlaşılmış | Sonra: Volga görünür, işaretçi vurgulu | Olay kapatılınca |
|---|---|---|
| ![](docs/verification/11-stalingrad-once-cin.png) | ![](docs/verification/12-stalingrad-sonra.png) | ![](docs/verification/13-olay-kapaninca.png) |

## Çalıştırma

En kolay yol **tek dosya sürümüdür**: sunucu da, kurulum da gerekmez.

```bash
npm install
npm run build:standalone   # → dist-standalone/ayni-zamanda.html (~7,4 MB)
```

`ayni-zamanda.html` dosyasını tarayıcıda açmak (çift tıklamak) yeterlidir. Betik, stil, yazı tipleri ve tüm veri dosyanın
içindedir; hiçbir ağ isteği yapmaz, çevrimdışı çalışır ve her statik barındırmaya tek dosya olarak yüklenebilir.
(`ayni-zamanda.fragment.html`, kendi `<html>` kabuğunu ekleyen barındırıcılar için aynı sayfanın gövdesidir. Bu sürümde
"Atıf ve lisanslar" bağlantısı, dosyanın yanında NOTICE.txt olmadığı için depodaki dosyaya gider.)

Geliştirme için:

```bash
npm install
npm run dev          # http://127.0.0.1:5173
npm run build && npm run preview
npm test             # birim testleri + veri doğrulaması
npm run e2e          # gerçek tarayıcıda kabul senaryosu (aşağıya bakın)
npm run e2e:ai       # okuma arkadaşı (sohbet) için aynısı, komut dosyalı modelle
npm run smoke        # her turun varsayılan denetimi: tsc + birim + derleme + hızlı e2e (≈3 dk)
npm run full         # tam doğrulama: smoke'un ön adımları + tam e2e + tam e2e:ai (yalnızca istenince; ≈31 dk)
npm run data:validate
npm run data:period -- --list        # yayındaki ve arşivdeki dönemler (bir dönemi yayına almak: data/README.md)
```

Gerekenler: Node 20.19+ (22 önerilir). Veri hattını yeniden çalıştırmak için ayrıca Python 3 ve `shapely` gerekir;
uygulamanın kendisi Python'a ihtiyaç duymaz, çünkü üretilen veri depoda durur.

## Kullanım

| Ne yapmak istiyorsunuz | Nasıl |
|---|---|
| Zaman aralığını seçmek | Alttaki cetvelde aralık çubuğunu sürükleyin; kenarlarından sürükleyerek uzunluğunu ayarlayın; boş yere tıklarsanız aralık oraya taşınır. Başka denetim yoktur (yıl kutusu, hazır süre düğmesi yok). Klavyeyle: çubukta `←/→` 1 yıl, `Shift` ile 10 yıl, `Home/End` uçlara |
| Haritada hangi yılın sınırlarının çizildiğini seçmek | Aralığın içindeki küçük işareti (çizgi + nokta) sürükleyin (varsayılan: aralığın ortası). Seçili yıl, haritanın üstündeki başlıkta "… yılının sınırları" notunda yazar |
| Bir yeri seçmek | Haritada bir devletin üzerine tıklayın. Dünya olayları haritadan çekilir (sol altta "Yer seçili · dünya olayları haritadan çekildi, seçimi kaldırınca döner" yazar). **Harita yerinden oynamaz**: yalnızca sürükleme, tekerlek, çimdik ve `+/−` düğmeleri haritayı hareket ettirir (istisnalar aşağıda: görünüm dışındaki bir olayı açmak; bir yanıt ekrandayken, siz açık tutarsanız, *Harita takibi*). Sağdaki küçük bilgi kartı haritanın bir köşesini örter: ✕ ile kapatın |
| Bir olayı okumak | Haritadaki işaretçiye, çizelgedeki noktaya ya da kartın *Aynı sırada, başka yerlerde* bölümüne tıklayın (bir yer seçiliyken ya da bir yanıt ekrandayken dünya olayları haritadan çekilir: çizelgeden tıklayın, işaretçisi haritaya gelir). Çizelgede olay adları kalıcı yazılmaz: noktanın üstüne gelince (dokunmatikte dokununca) adı görünür; açık olayın adı noktasının yanında kalır. Klavyeyle: `Tab` ile işaretçi grubuna girin, ok tuşlarıyla işaretçiler arasında gezinin, `Enter` ile açın (odak olay kartına gider) |
| Olaydan yer görünümüne dönmek | Kartın üstündeki tek satırlık yer başlığına tıklayın (ad + aralık), olay kartında ✕'e basın ya da `Esc` |
| Seçimi kaldırmak | Kartta ✕ ya da `Esc` (önce açık olayı kapatır; ekranda yanıt yoksa ikincisi yer seçimini kaldırır) |
| Bir şey sormak | Alttaki soru kutusuna yazın (`Enter`); kartta *Bu yerin tarihini anlat* / *Soru sor* da aynı kutuyu kullanır. Kart kenara çekilir, yanıt haritanın üstünde görünür |
| Bir anlatımı izlemek | **İzle**: `←` / `→` (`Home` / `End`) ya da düğmeler; *Oynat* ve hız seçici (Yavaş / Normal / Hızlı) kendiliğinden ilerletir; zaman cetvelindeki numaralı noktalar o adıma götürür. Altyazıdaki altı çizili olay adları tıklanabilir: çizelgedeki olaya tıklamakla aynı şeyi yapar |
| Sohbeti sıfırlamak | Soru kutusundaki **Sohbeti temizle** (her zaman görünür): konuşma silinir, model de onu bir daha görmez |
| Metni okumak | *Metni oku* (ya da soru kutusundaki metin düğmesi): yan panel; ⤢ tam ekran (köşede küçük harita); *İzle* geri döner. Adım her geçişte korunur; `Esc` adım adım kapatır |

**Açık olay her zaman haritadadır.** Çizelgeden ya da listeden bir olay açtığınızda işaretçisi, yakınlaştırma bütçesi veya
eleme yüzünden normalde çizilmeyecek olsa bile, çizilir ve belirgin biçimde vurgulanır (kalın vermilyon halka, ışıma,
adı yanında). Yeri o anki görünümün dışındaysa harita, yeri görünene kadar **yalnızca uzaklaşır** (kaydırmak yerine
uzaklaşmak tercih edilir; önceki görünüm yeni görünümün içinde kalır) ve bunu sıçramadan, yumuşakça yapar. Zaten görünen
bir olayı açmak (örneğin kendi işaretçisine tıklamak) haritayı hiç oynatmaz.

Adres çubuğu durumu taşır (`#t=1940-1944&p=9.2,48.8&e=stalingrad-1942`), bu yüzden bir görünümü bağlantıyla paylaşabilirsiniz.
Harita kamerası (`v=yakınlaştırma/enlem/boylam`) adrese yalnızca siz haritayı kendiniz oynattıktan sonra yazılır; açılıştaki
otomatik çerçeve herkes için aynıdır ve bağlantıya girmez. Bozuk ya da yarım bir bağlantı (ör. `p=9.2,`) yok sayılır;
uygulamayı çökertmez. Fare olan cihazlarda tekerlek haritayı yakınlaştırır (dar pencerede de); dokunmatik ekranlarda sayfa
kaydırması ile harita hareketi karışmasın diye harita iki parmakla gezilir.

## Okuma arkadaşı: haritayla birlikte okuyan sohbet

Düzen **harita öncelikli**dir: harita ekranın neredeyse tamamıdır (1440×900'de %86); üstte tek ince çubuk (ad, yer ve yıl, atıf),
altta ince zaman çizelgesi (≈ 80 px) ve onun hemen üstünde **soru kutusu** durur. Sağdaki **bilgi kartı** küçüktür (≈ 330 px), ✕ ile
kapanır ve okur bir şey sorunca **kendiliğinden kenara çekilir**: yalnızca yerin adını taşıyan küçük bir sekme kalır (yer seçili kalır,
soru onunla ilgilidir; sekme kartı geri getirir; yanıt kapanınca ya da başka bir yer seçilince kart kendiliğinden döner).
Şimdiye kadarki uygulama sohbetin **bağlam seçicisidir**: seçili yer, zaman aralığı ve açık olay modele kendiliğinden gider; harita ise
model anlatırken üzerine çizdiği şeydir. Harita yine yalnızca zamana bağlıdır (sınırlar ve haritanın tuttuğu
olay kümesi); hangi olayların *çizildiğini* anlatıcı belirler (aşağıda: haritada tek anlatıcı). Zaman çizelgesi seçili yere ve
yalnızca seçili aralığa bağlıdır.

| Harita öncelikli düzen | İzle: sabit yerde altyazı, adım adım |
|---|---|
| ![](docs/verification/ai-0-yeni-duzen.png) | ![](docs/verification/ai-1b-anlatim-adim2.png) |

| Oku: yan panel (1. adım) | Oku: tam ekran, köşede küçük harita (1. adım) |
|---|---|
| ![](docs/verification/ai-w2-oku-yan-panel.png) | ![](docs/verification/ai-w3-oku-tam-ekran.png) |

| Tek adımlı yanıt: altyazı ve «Devamını oku» (Stalingrad) | Düz metin yanıt: altyazı ilk cümle, geri kalanı Oku'da |
|---|---|
| ![](docs/verification/ai-2b-stalingrad-yaniti.png) | ![](docs/verification/ai-2c-duz-metin.png) |

(Görseller bir önceki turun ekran görüntüleridir; görsel inceleme her yayından sonra elle yapılır ve betikler görüntüleri yalnızca
`E2E_SHOTS=1` ile yeniler: sabit görsel dil, vuruşlar ve zaman çizelgesindeki sahne noktaları için yeni görüntüler henüz alınmadı.)

**Bir anlatımı iki biçimde izlemek: İzle ve Oku.** Çok sahneli bir anlatım iki görünümde izlenir; ikisi de **aynı sahneyi** paylaşır.

- **İzle** (varsayılan): harita tam ekran kalır; anlatım **sahne sahne, sahnenin içinde de cümle cümle** ilerler. Her sahnenin
  **altyazısı** haritanın üstünde, soru kutusunun hemen üzerindeki sabit bir yerde durur, altyazı gibi; kutunun yeri sahneden sahneye
  değişmez. **Altyazının her cümlesi haritada bir vuruştur** (beat): o cümle okunurken haritada ne görüneceğini model seçer (araçlardaki
  `beat`). Vuruşlar **okuma hızında, kendiliğinden** oynar (cümle başına 1,1 sn + sözcük başına 0,33 sn, en az 2,4, en çok 11 sn; sahnenin
  ilk cümlesi kamera yerine varsın diye 0,9 sn daha uzun; hıza bölünür: *Yavaş* 0,65 / *Normal* 1 / *Hızlı* 1,8). Oynayan cümle
  vurgulu (işaretleyici zemin), gelecek cümleler soluk, okunanlar olduğu gibidir. **Bir vuruş bitince okları söner, işaretleri adını
  bırakıp küçük numaralı bir noktaya (vuruşun numarası) dönüşür;** kamera sahne boyunca yerinde kalır (sahnenin göstereceği her şey, bütün
  vuruşlarıyla, bir kez, sahnenin başında çerçevelenir). Bütün cümleler oynayınca sahne biter: haritada işaretlerin numaralı noktaları,
  taraf renkleri ve toprak değişiminin sonucu kalır, ok yoktur. **Oynat** (isteğe bağlı) yalnızca sahne bitince ne olacağını söyler:
  açıksa kısa bir beklemeden (1,6 sn / hız) sonraki sahne başlar, kapalıysa harita okuru bekler. **Sonraki iki aşamalıdır:** sahne
  oynarken önce sahnenin *sonunu* gösterir, bir daha basınca sonraki sahneyi başlatır; **Önceki** de öyle: sahne ilerlemişse ya da
  bitmişse başına sarar, başındaysa bir önceki sahneyi bittiği hâliyle getirir. **Bir cümleye tıklamak** o vuruşu yeniden oynatır
  (okun çizilişi yeniden başlar) ve oynatmayı orada tutar; *Oynat* tutulan yerden devam ettirir. Sahneler `←/→` (ve `Home` / `End`),
  düğmeler ya da zaman çizelgesindeki sahne noktalarıyla gezilir; elle gezmek, görünümü değiştirmek ya da *Duraklat* oynatmayı durdurur
  (cümleler yine kendi sahnelerinde kendiliğinden oynar); son sahnenin sonunda oynatma biter (başa dönmez). Oklar metin kutusunda, ayar
  listesinde ve kaydırıcılarda kendi işlerini yapar; harita odaktayken de haritayı kaydırmaz. Bir vuruşun ne zaman bittiğine
  `Pacer` karar verir (`src/ai/presentation.ts`): varsayılanı okuma hızıdır; sesli okuma eklendiğinde cümlenin okunup bittiği an olur
  (sesli okuma henüz yok).
- **Oku**: tam metin. **Kapalı**, **yan panel** (≈ 460 px, haritanın üstünde bir katman: harita yine tam ekrandır, çizim panelin
  altında kalmayacak biçimde görünür kılınır) ya da **tam ekran** olur. Okuyucuda hiçbir şey oynamaz: **sahneler bittiği hâliyle**
  gösterilir (işaretlerin numaralı noktaları, taraf renkleri, toprak sonuçları). Tam ekranda harita sağ üst köşede **küçük bir pencere**
  olur (≈ 340×236) ve **o anki sahneyi** gösterir; pencerede yalnızca çizimin kendisi vardır (devlet adları, oklar, noktalar; ad etiketleri
  metnin yanında olduğu için yazılmaz), köşedeki düğmeyle harita yeniden büyür. Metni kaydırmak okuma çizgisindeki sahneyi etkin yapar ve
  harita (ya da küçük pencere) ona geçer. Telefonda metin her zaman tam ekrandır ve küçük harita başlığın altındadır.
- **Geçişte sahne korunur.** İzle'de 3. sahnedeyken *Metni oku*: metin açılır, 3. sahne okuma konumundadır ve etkindir (bitmiş hâliyle);
  geri dönünce altyazı yine 3. sahnenindir. Yan panel ↔ tam ekran geçişinde de etkin sahne okuma konumunda kalır (metin yeni genişlikte
  yeniden dizilir). Okuyucu en son kullanılan kipte açılır. `Esc` önce açık olay kartını, sonra tam ekranı yan panele, sonra metni, sonra
  ekrandaki yanıtı, en sonda yer seçimini kapatır.
- **Okurken sorulan soru haritayı arka planda günceller:** yanıt metne eklenir, okuyucu açık kalır ve arkadaki harita (ya da küçük pencere)
  yeni yanıtın sahnesine (bittiği hâliyle) geçer.
- **Zaman çizelgesi ilerleme çubuğudur** (çok sahneli bir anlatım ekrandayken): sahneler, **anlatıdaki tarihlerinde** (sahnenin gösterdiği en
  erken olayın başladığı gün; olay yoksa yılın ortası) **alttaki yakınlaştırılmış şeritte** (yer çizelgesinin kendisi: seçili aralık sayfanın
  tam genişliğidir) numaralı noktalardır; üstteki 1800–2000 cetvelinde sahne noktası yoktur (cetvelde 1939–1945 yaklaşık 40 px'tir, sekiz
  nokta oraya sığmıyordu). Görülenler dolu, etkin olan işaretli ve ilkinden ona bir çizgi uzanır; bir noktaya tıklamak o sahneyi başından
  başlatır ve okurun aralığına ya da imlecine dokunmaz. Aralığın dışında kalan bir tarih en yakın uca konur; aynı tarihe düşenler en az
  kayarak açılır (`placeStepPoints`, `src/domain/spread.ts`); bir nokta altındaki yıl yazısını örtecekse o yıl yazısı çizilmez (çentik
  kalır). Ekrandaki nokta tıklanamayan bir işarettir, böylece altında kalan komşuları erişilebilir kalır. Tarihsiz sahneler çubukta yoktur.

**Her yanıtın bir altyazısı ve bir tam metni vardır.** Her yanıt bir **anlatımdır** ve her **sahnenin** bir **başlığı**, **cümle cümle
ilerleyen bir altyazısı** (en çok 640 karakter, en çok 12 cümle) ve bir **tam metni** vardır; sahneler **haritanın sahneleridir**: her
sahne kendi haritasını bildirir ve altyazısının her cümlesi o haritanın bir vuruşudur. **Kaç sahne olacağı, nasıl bölüneceği ve hangi
sırayla anlatılacağı modelin kararıdır**; sayfa yalnızca çok yüksek bir sağlık sınırı koyar (60 sahne) ve biçimin sözleşmesini ister
(altyazı + tam metin, olay işaretleri). Yanıtlar sahne sayısıyla ayrışır:

- **Çok sahneli** (bir süreç, bir dönem, birbirine bağlı olaylar): İzle'de sahne gezintisi (oklar, düğmeler, oynat/hız) ve zaman
  çizelgesinde sahne noktaları vardır.
- **Tek sahneli** (bir olay, bir kişi, bir kavram, bir neden; yani kısa sorular): **tek sahnelik bir anlatım**dır. İzle'de yalnızca
  altyazı (cümleleri yine vuruşlardır) ve altında **Devamını oku** durur (sahne sayacı, oklar, oynat/hız ve çizelgede sahne noktası
  yoktur); *Devamını oku* (ya da *Metni oku*) aynı yanıtın tam metnini Oku'da açar, kapatınca altyazıya dönülür. Metin altyazıdan
  fazlasını taşımıyorsa (tek kısa cümle) *Devamını oku* da çıkmaz.
- **Güvenlik ağı: düz metin.** Model biçimi hiç izlemez ve yalnızca düz metin yazarsa sayfa metnin **tamamını altyazıya koymaz**: ilk bir
  iki cümleyi (en çok ~220 karakter; tek uzun cümle bir sözcükten, olay adının ortasından değil, kesilir) altyazı yapar, geri kalanı
  Oku'ya bırakır ve altyazının altına *Devamını oku* koyar (`captionFromText`, `hasMore`: `src/ai/narration.ts`). Altyazı cümlelere
  `sentencesOf` ile bölünür (`src/ai/sentences.ts`: nokta, ünlem ya da soru işaretinden sonra büyük harf, rakam ya da tırnakla başlayan
  söz yeni cümledir; `[olay adı](olay:kimlik)` bağlantısının içindeki noktalama ile tek büyük harften, Roma rakamından ya da bir iki haneli
sayıdan sonraki nokta — "I. Süleyman", "6. Ordu", "2. Dünya Savaşı" — cümleyi bölmez).

**İzle, uzun metinler bitmeden başlar.** Model önce, hiç metin yazmadan, adımları ve sahnelerini bildirir; metin sonra akar. Sayfa plan
gelir gelmez İzle'yi başlatır: ilk adımın altyazısı ve haritası hazırdır, "Metin yazılıyor…" yazar; okur o sırada adımlarda gezebilir
(metin gelmemiş adımın okuyucudaki yeri altyazısıyla doludur).

**Nasıl çalışır**

- **Her sahne haritanın sahibidir:** etkin sahne haritada yalnızca kendi gösterimini gösterir (devlet vurguları, oklar, olay
  işaretleri, işaretler, toprak değişimleri, sınır yılı); bir önceki sahnenin gösterimi gider, geri dönülünce o sahnenin gösterimi aynen
  gelir. **İstisna renklerdir:** bir `sides` çağrısıyla boyanan taraflar sonraki sahnelerde, yeni bir çağrı onları değiştirene kadar aynı
  renkte sürer (Almanya 1. sahnede maviyse 8. sahnede de mavidir). Yıl yalnızca sahnenindir: yıl istemeyen sahnede yıl okurun kendi
  imlecidir. Model bu yüzden her sahnede gereken her şeyi kendisi bildirir ve `clear` diye bir araç yoktur.
- **Bağlam.** Model her soruyla birlikte seçili yeri (o yıldaki devleti ve aralıktaki egemenlerini), aralığı, haritadaki yılı, açık
  olayı, aralıkta sınır verisinde bulunan devletlerin listesini (kimlik | ad) ve uygulamanın olay kayıtlarını alır. Bağlam bir **yer
  listesidir** ve her yerin kendi aralığı vardır (bugün hepsi seçili aralık; birden çok yer ya da dönem haritaya bir şey
  koymadan, sohbetin kendisinden gelecek: okur sorusunda başka bir yeri ya da dönemi anacak). Sohbet sürerken
  yer ya da aralık değişirse metinde bir **"Bağlam değişti"** ayırıcısı (eski → yeni) çıkar; okur eski konuya dönerse kalkar; model de
  bir sonraki istekte bunu bir cümleyle öğrenir. Yıl imlecini oynatmak ya da bir olay açmak "yeni konu" sayılmaz. Açık olay kartı
  soru kutusunda bağlam olarak görünür ("açık olay, soruya eklenir"); kartta *Bunu sohbette sor* olayı soruya ekler ve kartı kapatır.
- **Model NEYİ gösterir, uygulama NASIL gösterir: sabit bir görsel dil.** Haritaya çizim yalnızca araç çağrılarıyla olur ve **yedi araç**
  vardır; hiçbiri görünüşle ya da kameralı ilgili değildir. Sırası önem sırasıdır (bir görünüm daha az araca izin verirse ilkleri kalır):
  `step` (sahneyi bildirir: numara, başlık, altyazı ve isteğe bağlı `year`), `show_event` (verideki bir olayı işaretiyle gösterir),
  `highlight` (hangi devletlere işaret edileceğini söyler), `sides` (kim kimin tarafında), `route` (sıralı yerlerden geçen **yönlü ok**),
  `territory_change` (bir devletin iki yıl arasında kazandığı ve kaybettiği toprak) ve `mark` (veride olmayan bir yer için kısa etiketli
  nokta). Her çizim aracı **`beat`** alır: altyazının kaçıncı cümlesi okunurken göründüğü (1'den başlar; verilmezse 1). `set_year`,
  `focus` ve `connect` kalktı: yıl `step`'in parametresidir, bölgeyi uygulama kendisi çerçeveler, iki yer arasına çizgi çekilmez.
  **Her biçimin tek bir anlamı vardır ve bunu uygulama sahiplenir** (model bir görünüş seçmez; aynı şey her seferinde aynı görünür):

  | Biçim | Anlamı | Araç |
  |---|---|---|
  | **Alan** (dolgu) | toprak, denetim | `sides` (taraf boyaması), `territory_change` (kazanılan ve kaybedilen alan); `highlight` alanı boyamaz, yalnızca **işaret eder** (kendi renginde belirginleşir, çevresi çizilir) |
  | **Ok** | gerçek bir hareket: ilerleyiş, geri çekilme, göç, ticaret | `route` |
  | **Nokta** | bir yer ya da olay | `show_event`, `mark` |
  | **Tarama** | işgal ya da belirsizlik | tarafsız ya da tarafı belirsiz devletler (`sides`'ın `neutral`'ı), `territory_change`'in kaybedilen alanı |

  **Olaydan başkente, ya da iki taraf arasında hiçbir çizgi yoktur.** Önceki sürüm her savaş olayına iki başkent arasında bir çizgi
  çiziyor ve `connect` ile ilişki çizgileri ekleniyordu; çizgiler hareket gibi okunuyor, aynı haritada hem çizgi hem ok olunca "çok çizgi"
  yüzünden harita karışıyordu. Şimdi çizgi yalnızca bir hareketi gösterir ve onu model `route` ile söyler.
  - **Vuruşlar ve ömürleri.** Bir aracın `beat`i, çizimin hangi cümle oynarken göründüğünü söyler. **Ok** yalnızca kendi vuruşu oynarken
    görünür ve vuruş bitince solar (hareket serbestken 0,5 sn; "hareketi azalt"ta hemen kalkar); **olay işareti ve `mark`** kendi vuruşunda
    tam işarettir (olayın yılı, işaretin adı), sonra **vuruşun numarasını taşıyan küçük bir nokta** olur ve sahnenin sonuna kadar öyle
    kalır (üstüne gelince adı yine görünür); **`highlight`** kendi vuruşunda belirgindir ve söner; **renkler** (`sides`) ve **toprak
    değişimleri** sonraki vuruşlarda kalır. Sahne bitince yalnızca bunların kalıcı hâli vardır. Bir sahne bittikten sonra geri dönmek
    sahneyi bittiği hâliyle getirir; sahneyi başa sarmak vuruşları yeniden oynatır.
  - **Olay-merkezli gösterim.** Anlatılan şey verideki bir olaysa model yalnızca *hangi olay* olduğunu söyler (`show_event`); uygulama
    olayın **kendi işaretini** koyar (`src/ai/drawing.ts`, `src/map/markers.ts`). Olayın tarafları kendiliğinden öne çıkarılmaz ve çizgi
    çekilmez: hangi devletlerin boyanacağını ya da işaret edileceğini model `sides` / `highlight` ile söyler. Bir olay gösteren sahnede
    haritada **olayın başlangıcındaki sınırlar** görünür, sonrasındakiler değil (`Resolver.showYearOf`). Bir yılın sınırları o yılın
    sonudur: Fransa Üçüncü Cumhuriyeti veride 1939'da biter, bu yüzden 10 Mayıs 1940'ta başlayan Fransa Muharebesi 1940'ın sınırlarında
    Fransa'sız kalırdı. Kural: olayın yılı; ama olayın **ana taraflarından** (veride ilk ikisi ve savaşta her safın ilki) birinin önceki
    yılda sınırı varken o yılda yoksa, o taraf yıl içinde bitmiş demektir ve olay başladığında oradaydı: bir önceki yıl gösterilir
    (Fransa Muharebesi, Dunkirk, Paris'in işgali, Compiègne, Anschluss, Çekoslovakya'nın işgali). Olay bir tarafın sonu olduysa ve hiçbir
    yılda tarafları yoksa en çok üç yıl geriye bakılır (Yugoslavya ve Yunanistan 1941, Waterloo 1815). Bir **toprak değişimi** olan
    sahne `from` yılının sınırlarıyla açılır ve değişimin vuruşunda `to` yılına geçer (aşağıya bakın). Okurun gezdiği yıl değişmez.
    (Nazi Almanyası'nın satırları Cliopatria'da 1944'te biter; küçük düzeltme katmanı 1945'i de ekler, bu yüzden Berlin Muharebesi 1945
    sınırlarıyla görünür.) Zaman çizelgesindeki sahne noktası ise sahnenin **anlatıdaki tarihindedir** (Fransa Muharebesi için Mayıs
    1940), sınırların yılında değil. Model verideki bir olayı `mark` ile çizerse (aynı yer adı ya da olay adı, olayın yerine ≤ 60 km,
    aralıkta tek eşleşme) sayfa onu olay olarak gösterir ve modele bunu söyler.
  - **Okların uçları ve durakları YERLERDİR.** `route`un her durağı bir *yer*dir: (1) bir **şehir** (adıyla; eski ve yerel adlar da aynı
    noktaya çözülür: "Stalingrad", "Danzig", "Königsberg", "Peking"), (2) uygulamanın **olay kayıtlarından** birinin yeri (olay kimliği),
    (3) bir **koordinat** ("52.23, 21.01"), (4) bir **devlet**: o zaman gösterilen yılın **başkenti** (`src/data/capitals.ts`), ya da
    (5) **bir devletin sınırı, bir yere doğru**: `"sınır: nazi-germany → Varşova"` (ayraç `→`, `->`, `=>`, `>`, `;`, `,` ya da
    `toward`/`doğru`/`yönünde` olabilir). Beşincisi, bir ordunun başkentten değil **cepheden** çıkmasını sağlar: ok, devletin o yılki
    sınırının yere en yakın noktasından başlar (`Resolver.borderPoint`; boylam ölçeklenmiş uzaklık, tarih değişim çizgisinde kısa yoldan).
    Bir şehir adı birden çok yere uyuyorsa en tanınmış olan seçilir (başkent, sonra nüfus; `src/data/places.ts`); tanınmayan bir yer
    **sessizce atlanır** (modele "atlandı" denir) ve yanlış bir ok çizilmez. O yılda sınırı olmayan bir devlet durak olamaz.
  - **`route`: yönlü ok.** `via` en az iki, en çok sekiz yer, **sırayla**; `type` dört türden biridir ve her tür hep aynı görünür
    (`src/styles/ai.css`): **ilerleyiş / sefer** (`advance`, kalın düz çizgi, dolu ok), **geri çekilme** (`retreat`, kesikli çizgi, açık
    ok), **göç / sürgün** (`migration`, noktalı çizgi), **ticaret / ikmal yolu** (`trade`, nokta-çizgi). Ok iki yer arasında hafif bir yay,
    daha çoksa duraklardan geçen yumuşak bir eğridir (Catmull-Rom → kübik Bézier, `routePath`) ve ucu hep okludur; çizgi okun ucundan 9 px
    önce biter. Model okun **çizilerek belirip belirmeyeceğine** (`animate`) karar verir; "hareketi azalt" isteyen okurda hiçbir zaman
    canlandırılmaz. Etiket okun üstünde kayarak boş bir yer bulur.
  - **`sides`: ilişki kipi.** Model yalnızca *kim kimin tarafında* olduğunu söyler: en çok **üç taraf** (`{name, polities}`) ve
    tarafsız ya da tarafı belirsiz devletler (`neutral`). Uygulama haritayı **anlatımın odağına göre** boyar (`src/ai/actors.ts`): odak
    tarafı (seçili yerin devletinin tarafı; yoksa ilk taraf) **mavi** (`--side-focus`), karşıt taraflar **kehribar** (`--side-foe-1`) ve
    **şarap kırmızısı** (`--side-foe-2`), tarafsızlar **taramalı** bej (`--side-neutral`). **Karşıt iki taraf asla aynı rengi paylaşmaz**
    (bir tarafın rengi adıyla ya da devletleriyle hatırlanır; yeni bir taraf boş bir karşıt renk alır; odak daha önce boyandıysa ve şimdiki
    taraflar arasında değilse hiçbiri odağın rengini almaz); **renk aktöre aittir ve anlatım boyunca aynı kalır**, bir devlet taraf
    değiştirirse yeni tarafın rengini alır ("Britanya ve Fransa savaş ilan etti": o beat'te iki devlet karşıt renge geçer, aralarına çizgi
    çizilmez). Çağrıda adı geçen boyanır, geçmeyen solar; çağrı yeni bir çağrı gelene kadar sonraki vuruşlarda ve sahnelerde sürer. Tarafların
    adları renkleriyle **altyazının altında** durur (tarafsızlar "Tarafsız ya da belirsiz" adıyla). Anlatımda hiç `sides` çağrısı yoksa harita
    boyanmaz.
  - **`territory_change`: değişim hep görünür.** Model yalnızca *hangi devlet, hangi iki yıl* arasını söyler (`polity`, `from`, `to`);
    uygulama iki yılın sınır verisini karşılaştırır (`src/domain/territory.ts`: Mercator ızgarasında devletin iki yıldaki alanını
    rasterleştirip farkı bulur) ve **kazanılan alanı devletin renginde dolgu, kaybedilen alanı taramalı** gösterir (`src/map/territoryLayer.ts`;
    görünür bölge ve kameranın gideceği bölge içinde, az sayıda uzak serpinti hücresi atılır); vuruş bitince harita `to` yılının sınırlarını
    gösterir. Sınırlar hiçbir zaman **sessizce** değişmez: bir sahne ya da vuruş yılı değiştirdiğinde (bir toprak değişimiyle ya da `step`in
    `year`'ıyla) görünümdeki el değiştiren toprak (yıl farkı ≤ 25, görünümdeki karanın %50'sinden azı) bir an taramayla işaret edilir
    (`MapView.flashYears`); hareketi azalt ayarında vurgu sabittir ve birkaç saniye sonra kalkar. **Bilinen sınır:** sınır verisi
    yıllıktır, aynı yıl içindeki değişiklikler ayrılamaz (Anschluss ile Sudetenland ikisi de 1938'dir; Eylül 1939'daki iki işgal de).
  - **Örtü ve renkler.** Bir şey boyanmış ya da işaret edilmişken haritanın geri kalanı soluktur (üstüne %62 kâğıt rengi bir örtü;
    *bulanıklık yok*) ve vurgulanmayan devlet adları da soluklaşır; işaret edilen devlet kâğıt rengi bir kenar ve mürekkep çerçeveyle örtünün
    üstüne çıkar. **Deniz tek düz açık mavidir** (`--sea`, degrade yok); **mavi serbesttir**: odak tarafının rengi mavidir ve devlet
    tonlarından biri (`--tint-5`) de mavimsidir (önceki sürümde mavi yalnızca denize aitti; renkler anlam değiştiriyordu).
  - **Olay işaretleri metinde.** Altyazıda ve metinde verideki bir olaydan söz edilince model adını `[olay adı](olay:KİMLİK)` biçiminde
    yazar; sayfa onu altı noktalı çizgili bir bağlantıya çevirir (`src/ui/read/segments.ts`). Tıklamak, çizelgedeki olaya tıklamakla
    **aynı şeyi** yapar (olay kartı açılır, görünüm dışındaysa harita yalnızca gerektiği kadar uzaklaşır; ikinci tıklama kapatır).
    Verideki bir olaya çözülmeyen kimlik düz metin kalır; yazılırken yarım kalmış bir bağlantı gösterilmez. Haritadaki olay işaretlerinin
    yanında **ad kutusu yoktur**: ad, işaretin (ya da numaralı noktanın) üstüne gelince görünür (açık olayın kendi adı hariç).
  - **"Bu yerin tarihini anlat" düğmesi** modele **hem seçilen noktayı hem o yılın sınırlarında noktayı içeren devleti** söyler ("Seçtiğim
    yer: 10.00°D, 53.50°K; 1942 sınırlarında bu noktayı içeren devlet: Nazi Almanyası"; işgal altındaki bir toprak çizilen devletle birlikte
    gerçek durumunu da söyler) ve ikisinden hangisini anlatacağını söylemez: hikâyenin ne kadarının noktanın, ne kadarının devletin
    olduğuna model karar verir (`narrationRequest`, `src/ai/prompt.ts`).
  - Modelin yazdığı her başvuru verideki bir şeye çözülmek zorundadır (devlet kimliği ya da adı, olay kimliği ya da adı, haritanın
    içinde bir koordinat, aralığın içinde bir yıl); çözülmeyen çizim **sessizce atlanır** (yalnızca modele "atlandı" denir).
- **Haritada tek anlatıcı.** Bir anda yalnızca biri anlatır: ekranda bir yanıt varsa yapay zekâ, yoksa ve bir yer seçiliyse yer, ikisi de
  yoksa dünya olayları. Anlatıcı varken **dünya olayları haritadan çekilir** (hepsi yer çizelgesinde ve kartın *Aynı sırada, başka yerlerde* listesinde durur; sol alttaki not "Yer seçili · dünya olayları
  haritadan çekildi, seçimi kaldırınca döner", yapay zekâ anlatırken "N olay haritada · gerisi yanıt kapanınca döner" (yerle birlikte
  "gerisi çizelgede") der). Açık olay her zaman haritadadır; yapay
  zekâ bir olaydan söz ederse onun işareti de gelir. Yanıt kapanınca (✕ ya da `Esc`) çizim kalkar ve seçili yer yoksa olaylar geri gelir.
- **Kamera: Harita takibi.** Açıkken (varsayılan) her sahne etkin olduğunda harita o sahnenin gösterimini **bir kez, sahnenin başında**
  **görünür kılar**: sahnenin yerleri (olay işaretleri, okların durakları, işaretler) ve işaret edilen, boyanan ya da toprağı değişen
  devletlerin o yerlerin çevresine uzanan parçaları, **bütün vuruşlarıyla birlikte**, gerektiği kadar kayarak *ve* yakınlaşıp
  uzaklaşarak, yumuşakça (0,8–2,4 sn), haritanın üstündeki her şeyin (bilgi kartı, altyazı ya da kısa yanıt, soru kutusu, okuyucu paneli,
  yakınlaştırma düğmeleri) altında kalmadan (`MapView.frameTarget`, `domain/camera.ts`; ekranın dibi daha çok yer ayırabilir, çünkü
  altyazı ve soru kutusu oradadır). **Vuruşlar sürerken kamera oynamaz** (sahneyi baştan her şeyi içine alacak biçimde çerçevelemek,
  bir vuruştan ötekine kaymaktan daha sakindir); sahne değişince yeni sahneye gider. Kısa bir yanıt metninin büyüyebileceği yer baştan
  ayrılır, böylece harita tek kez çerçevelenir. Çizim zaten iyi çerçevedeyse harita oynamaz. Hiçbir araç kamerayı oynatmaz; **kamera
  sayfanın işidir**; `npm run e2e:ai` bunu her sahnede ve her vuruşta ölçer.
  **Bir devletin hangi parçası?** Bütün toprağı değil, sahneyle ilgili parçası: sahnenin yerlerinin kutusu üçte bir kadar (en az 6° × 4°)
  büyütülür (`surroundings`, `src/domain/camera.ts`) ve devletin bu bölgeye uzanan parçaları, bölgenin kenarında kesilerek kadraja
  girer (`Resolver.boundsAt(kimlik, yıl, çevre)`). Sömürgeler, ada grupları, dışarıda kalmış parçalar ve kıtalar boyu uzanan bir toprağın
  uzak ucu bakışı germez: Normandiya 1944'te ABD vurgulanır ama toprağından hiçbir parça bölgede olmadığı için kadraja bir şey katmaz
  (eskiden Alaska ve Grönland yüzünden dünya görünümüne uzaklaşıyordu); Fransa Muharebesi'nde Fransa ile Birleşik Krallık'ın Guyana'sı,
  Aden'i ya da Filistin'i değil, Batı Avrupa'daki toprakları görünür. Sahnede hiç yer yoksa (sahne yalnızca devletleri işaret ediyorsa)
  devletin **gövdesi** çerçevelenir: en büyük parçası ve ona bitişik (3° içindeki) parçalar.
  **Tarih değişim çizgisi.** Bir ok ya da çerçeve 180° boylamını aşıyorsa kısa yol seçilir: Tokyo'dan Pearl Harbor'a ok Pasifik'i 62°'lik
  yoldan geçer (298°'lik değil; `unwrapPath`, `narrowestArc`: `src/domain/antimeridian.ts`) ve kamera bu yola göre çerçeveler. Haritanın
  doğu ve batı sınırı ±179,9° olduğu için, böyle bir sahne **geçici olarak dünyayı iki kez gösterir** (`setRenderWorldCopies(true)` ve
  ±359,9° sınırı; oklar ve işaretler kopyalarda da çizilir: `src/map/projection.ts`); okur haritayı normal dünyaya
  getirdiği anda (görünüm ±179,9° içine girince) normal harita geri gelir. Bilinen sınır: geniş görünüm yalnızca tarih değişim çizgisini
  aşan sahnelerde açılır ve okur haritayı kendisi normal dünyaya getirene kadar sürer (görünüm çizginin üstündeyken kapatmak MapLibre'ın
  merkezi sıçratmasına yol açar); o sırada okur çizginin ötesine kaydırabilir ve harita dünyayı iki kez gösterir.
  Okurun **küçük** hareketleri takibi kapatmaz: haritanın kısa kenarının üçte birinden az kaydırma, bir kez `+`/`−`. **Önemli** bir harekette
  (üçte bir ya da daha çok kaydırma, ya da `+/−` ile bir buçuk düzeyden çok; hareketler sayfanın bıraktığı kameradan itibaren toplanır)
  haritanın üstünde küçük bir soru çıkar: *Haritayı kendiniz gezdiniz. Adımlar haritayı izlemeyi bıraksın mı?* (*Bıraksın* / *İzlemeye
  devam*), yanında ayarın yeri: **Ayarlar ⚙ → Harita takibi** (tıklanınca soru kutusunun ayarları açılır ve satır işaretlenir). Soru iletişim
  kutusu değildir: odağı çalmaz, haritanın %6'sından azını kaplar, cevaplanmazsa kendiliğinden kalkar (hiçbir şeye karar vermeden) ve
  "İzlemeye devam" denirse o sohbette bir daha sorulmaz. Takibi yalnızca okurun cevabı ya da ayar kapatır; kapalıyken adımlar çizimi
  değiştirir ama haritayı oynatmaz ve soru kutusunun üstünde "Harita takibi kapalı · aç" çipi durur. Yapay zekânın istediği **yıl**, okurun
  kendi imlecinin üstüne biner (imleç değişmez); okur imleci ya da aralığı oynatırsa bir sonraki adıma kadar kendi yılı geçerlidir. Tam
  ekran okuyucunun küçük penceresinde etkin adım her zaman görünür kılınır; takip kapalıysa pencereden çıkınca kamera okurun bıraktığı
  yere döner.
- **Etiketler birbirini örtmez.** Yapay zekâ etiketleri (okun etiketi, serbest işaretin adı) işaretçileri, numaralı noktaları, yer noktasını,
  haritanın kontrollerini ve devlet adlarını engel sayarak yerleşir (`src/map/flags.ts`): önce noktasının dört yanını, sonra daha uzak
  yerleri (köşeler, bir ok için çizgisi boyunca kayma, sonunda biraz daha açıkta) dener; hiçbir boş yer yoksa altındaki devlet adı çekilir
  (işaret edilenlerin adı çekilmez: onlar işaretçiden, olabildiğince az kayarak uzaklaşır). Numaralı noktalar adsızdır ve küçüktür. `npm run
  e2e:ai` bunu sayfada ölçer (her sahnenin ok oynayan vuruşları, son vuruşları ve sonu, üç kamera, iki ekran boyu).

**Model: `sample` yeteneği, anahtar yok.** Uygulama bir Claude artifact'ı olarak yayınlanır ve artifact çalışma zamanının `sample`
yeteneğini (`const sample = await claude.use("sample")`) kullanır: çağrı **okurun kendi Claude hesabına** gider, ilk çağrıda okurdan
izin istenir, yanıt `onText` ile akar, harita eylemleri sayfa işlevleri (`tools`) olarak verilir. Bu yüzden sistem istemi yoktur
(yönergeler ve bağlam baştaki kullanıcı turlarındadır), çağrılar belleksizdir (sayfa sohbet geçmişini kendisi tutar ve her çağrıyla
**tamamını** yollar; aşağıya bakın), sayfanın ağı yoktur (modelin kendi bilgisi + uygulamanın olay kayıtları;
canlı Vikipedi yok). Hız: **Hızlı / Dengeli / Derin** (`modelTier`: quick / default / complex; model adı hiçbir yerde yok; seçim
tarayıcıda saklanır). `not_granted`, `rate_limited`, `tools_unavailable`, `cancelled` ve diğer kodlar yanıtın yerinde, Türkçe olarak
gösterilir; **hiçbir hata kendiliğinden yeniden denenmez** (yalnızca okur *Yeniden dene*'ye basarsa). Yanıt sürerken **Durdur** vardır
(soru kutusunda ve haritanın üstünde); metin ilk kez gelene kadar "Düşünüyor…" yazar.

**Konuşmanın tamamı modele gider; uzayınca eski kısımlar kimse fark etmeden özetlenir.** Model belleksizdir, bu yüzden sayfa oturum boyunca
bütün sohbeti (her soru, her yanıt ve her yanıtın haritaya *ne koyduğu*: `[Haritada gösterdiklerim: 1. adım: öne çıkan: …; olay: …]`)
tutar ve **her çağrıyla yollar**; model neyi söylediğini bilir. Sohbet büyürse `condense` (`src/ai/prompt.ts`) **en eskilerden başlayarak**
kısaltır, hiçbirini atmaz: (1) tam metin geçmişi 60 KB'ı aşınca en eski yanıtlar *özet*le gider (adımlı yanıtta adımların başlık +
altyazısı, tek parçada ilk cümleler; en yeni yanıtlar tam kalır), (2) 200 KB'lık giriş sınırına yine sığmazsa en eski alışverişler tek
satıra iner, (3) en eskilerin satırları tek bir "Sohbetin başı, kısaca" turunda toplanır; her soru yine oradadır. Okur için hiçbir şey
değişmez: ekrandaki sohbet ve metin olduğu gibi kalır. **Sohbeti temizle** soru kutusunda her zaman görünür (dar ekranda ve okuyucu haritanın
yanında açıkken, kutu 560 px'ten daralınca yalnızca çöp kutusu simgesi; soru yazmaya yer kalsın diye): konuşma ve harita temizlenir, model de onu bir daha görmez.

**Model serbest: kurallar nerede, ne kaldırıldı.** Anlatımlar sığ kalıyordu (Nazi Almanyası 1931–1945 için 6 adım, 1933–1939 atlanmış),
çünkü modele zamanla davranış kuralları birikmişti: bir anlatım iskeleti ve "her satır bir adım", "adım ekleme", hangi aracın ne zaman
çağrılacağı, adım sınırı. Kuralları üç türe ayırdım. **(1) Arayüzün ihtiyacı olan biçim sözleşmeleri kalır:** her sahnenin altyazısı ve
tam metni, olay başvuruları (`[ad](olay:kimlik)`), iki turlu protokol, kimliklerin listelerden gelmesi, metnin düz paragraf olması.
**(2) Uygulamanın görüntüleme işi kalır:** kamera, renkler, bir olayın ya da savaşın nasıl çizildiği, hangi yılın sınırlarının
gösterildiği; bunlar modelin üzerindeki bir kısıt değil, uygulamanın işidir. **(3) Bir anlatımı nasıl kuracağına dair davranış kuralları
kaldırıldı:** adım sayısı, yapı, hangi araç ne zaman, iskelet. Yeni kısıtlar yalnızca gerçekten gözlenen sorunlar için, teker teker geri
eklenecek. Aşağıdaki liste, gerekirse geri getirilebilsin diye **kaldırılanları** söyler (ilk sütun eski yeri):

| Yer | Kaldırılan kural (özet) |
|---|---|
| Yönerge dosyası, "Anlatım biçimi" | "Soru tek bir şeyi soruyorsa cevabın tek adımdır", "bir süreci anlatıyorsan adımlara böl"; "haritası öncekinden farklı olmayan adımı önceki adımla birleştir"; "adımları kronolojiye ve ana dönüm noktalarına göre kur, adım sayısını konunun gerektirdiği kadar tut, izlemek yorucu olmasın" |
| Yönerge dosyası, "Konuşma" | tekrar sorulan soruda "önceki anlatıma atıf yap, neyi farklı yapacağını söyle ya da ne merak ettiğini sor"; "anlatıma başlarken ne anlatacağını bir cümleyle söyle, geçiş cümleleri kur"; "başka yer gezerek bağ kuran okurla önceki konuşmaya bağ kur" |
| Yönerge dosyası, "Gösterim" | "gösterim metni desteklemek için, süslemek için değil"; "her adımda yeterince göster, gözü bir iki şeye yönlendir"; "etiketleri kısa tut" ("emin olmadığın konum için çizim yapma" kaldı) |
| Yönerge dosyası, "Elindekiler" | "anlattığın şey veri setinde olay olarak varsa sadece o olayı göster"; "kendi çizgi, yol ve işaretlerini yalnızca veride olmayan şeyler için kullan"; "kullanıcı bağlamı ayrıca yazmak zorunda değil, bağlam değiştiyse yenisini esas al" |
| Yönerge dosyası, "Tartışmalı sınırlar", "Ton" | ayrı bölüm ve "haritadaki sınırlar bir veri setinin yorumudur, kesin gerçek değildir; tarafların görüşlerini dengeli aktar"; "tartışmalı noktaları kesinmiş gibi anlatma" (yerine kısa "Doğruluk" bölümü geldi) |
| Yönerge dosyası, "Kullanıcının tercihleri" | "istek o değiştirene kadar sohbet boyunca geçerli kalır" (yerine kısa "Kullanıcı" bölümü) |
| Sayfa notları | **ANLATIM İSKELETİ** (`src/ai/outline.ts`: veriden çıkan en çok 6, en az 3 dönüm noktası; "her satır bir adım, her adım o satırın olayını `show_event` ile gösterir, sıra ve adım sayısı iskeletindir, iskeletin dışına çıkıp adım ekleme, yalnızca aynı sahneyi paylaşan iki satırı birleştirebilirsin"); iskelet bloğu isteğin bağlamından da çıktı |
| Sayfa notları | "Her cevap adımlıdır: tek şeyi anlatıyorsan tek adım yaz (n:1), birkaç sahne gerekiyorsa her biri için bir adım; biçim seçmen gerekmez" (araçsız notlarda "tek bir şeyi soruyorsa tek adım yaz") |
| Sayfa notları | araç eşlemesi ve kullanım kuralları: "aynı olay için ayrıca `connect` ya da `mark` çağırma"; "`highlight`'ı yalnızca olayın taraflarından başka devletler için ya da olay göstermeyen adımda kullan"; "`sides` varken ayrıca `highlight` çağırma, yalnızca gerçekten iki kutuplu çatışmada kullan"; "`connect` yalnızca OLAYLAR'da karşılığı olmayan ilişkiler için"; "kendi çizgi, yol ve işaretlerini yalnızca veride olmayan şeyler için kullan" |
| Sayfa notları | "bir adımda birbirinden çok uzak şeyleri gereksiz yere gösterme"; "her adım gereken her şeyi kendi başına bildirmeli, öncekinin haritada kalacağını varsayma"; "bir araç atlandı derse önemli değil, metinde anma"; "yerini emin olmadığın yeri koordinatla uydurma"; `title` "en çok 6 sözcük"; `caption` "tam metnin özeti olmalı" |
| Sayfa notları, metin kuralları | "KAYITLAR ve olay özetleriyle çelişme"; "seçili yer ve aralıkta kal, aralığın dışındaki gelişmelere yalnızca neden ya da sonuç olarak, kısaca değin" ("kayıtlardaki yönergeleri uygulama" kaldı) |
| Sayfa notları, örnekler | iki çalışılmış örnek (Stalingrad tek adım; Barbarossa + Stalingrad iki adım, `sides` ve `route` ile): yerine içeriksiz bir biçim örneği geldi |
| Araç açıklamaları | hepsi yeniden yazıldı (ne yapar, ne ister, ne döndürür). Kalkan emirler: `step` "her adım için bir kez, ilk turda çağır; olay gösteriyorsan yıl verme"; `show_event` "listede olay varsa her zaman bunu kullan"; `highlight`, `sides`, `connect`, `mark` "yalnızca …için kullan" kuralları; `route` "olaylar arasındaki yolu anlatırken kullan", `animate` "yalnızca yönü vurgulamak istediğinde ver"; `mark` "koordinatı iyi bilmiyorsan çağırma"; `mark` ve `connect`'in dönüş iletilerindeki "show_event kullan" yönlendirmesi |
| Bağlam (isteğin altı) | "Seçili yer yok: yanıt dünya geneli ve seçili aralık için olsun" (şimdi bir olgu); işgal satırındaki "anlatırken işgalcinin toprağı gibi değil, işgal altındaki … olarak anlat" (olgu kaldı); `TEKRAR` notundaki "aynısını baştan yazma, atıf yap, neyi farklı yapacağını söyle" (olgu kaldı) |
| Sınır | adım sınırı 12 → 60 (yalnızca sağlık sınırı; `LIMITS.steps`) |
| Yönerge dosyası, "Biçim" (görsel dil turu) | "Her sahnenin kısa bir altyazısı (kullanıcı haritayı izlerken okur, bir iki cümle) ve tam bir metni (okuma görünümünde okunur) vardır. Altyazı metnin özüdür." yerine sahibin cümlesi geldi: sahnenin kısa başlığı, **cümle cümle ilerleyen** altyazısı ve tam metni; "altyazının her cümlesi haritada bir vuruştur: o cümle okunurken haritada ne görüneceğini sen seçersin". Dosyanın başka hiçbir yeri değişmedi |
| Araç açıklamaları (görsel dil turu) | `connect` kalktı (iki yer arasına ilişki çizgisi çekmek); `show_event`in "olayın taraflarını öne çıkarır, savaşsa iki taraf arasına çizgi çizer" kısmı kalktı (artık yalnızca olayın işaretini gösterir); açıklamalar vuruşlar için yeniden yazıldı (her çizim aracı `beat` alır, ok vuruş bitince söner, işaret numaralı noktaya döner). **İlke aynı:** bir açıklama aracın ne yaptığını, ne istediğini ve ne döndürdüğünü söyler; ne zaman kullanılacağını söylemez (`tests/ai-tools.test.ts`) |
| Sayfa notları (görsel dil turu) | savaş çizgisi ve `connect` sözleri; notlar şimdi vuruşları, bir vuruş bitince ne kaldığını ve görsel dilin dört anlamını (alan = toprak/denetim, ok = hareket, nokta = yer/olay, tarama = işgal/belirsizlik) söyler; *nasıl kurulacağını* söylemez |

**Modelin yönergeleri ayrı bir düz metin dosyasıdır: [`instructions/okuma-arkadasi.txt`](instructions/okuma-arkadasi.txt).** Siz düzenlersiniz;
uygulama onu **her çağrıda, olduğu gibi** gönderir (baştaki kullanıcı turunun başı; arkasına sayfanın kendi "UYGULAMA NOTLARI"
bölümü gelir). Dosya derleme sırasında uygulamaya gömülür (`src/ai/instructions.ts`, `?raw`): bir değişiklik bir sonraki
`npm run build` / `npm run build:standalone` ile (ve yayında yeniden yayınlayınca) geçerli olur. Dosya kısadır: modelin ne aldığı
("Elindekiler": kamera dahil nasıl görüneceğini uygulama halleder), biçim (sahneler, altyazı + tam metin, olay işareti; "anlatımı nasıl
kuracağın sana kalmış"), doğruluk (uydurma, emin olmadığın konum için çizim yapma, tartışmalıyı tartışmalı anlat, işgali işgal olarak an),
ton ve kullanıcının sözünün geçerliliği. Sayfanın notları modelin *nasıl anlatacağını* değil, uygulamanın *mekaniğini* söyler:
sahneler `step` ile bildirilir, harita yalnızca etkin sahnenin gösterimini gösterir, sınırların yılı nasıl seçilir, listelerden kimlik
alınır, olay metinde nasıl işaretlenir, yanıt hangi iki turda verilir, bir biçim örneği. **Hangi aracın ne yaptığı araç açıklamalarındadır**
(`src/ai/tools.ts`): her açıklama aracın ne yaptığını, ne istediğini (kimliklerin listelerden gelmesi, yerlerin biçimleri) ve ne
döndürdüğünü söyler; "her zaman", "asla", "yalnızca … için kullan" gibi emir yoktur (`tests/ai-tools.test.ts` bunu denetler). Bir olay
metinde `[olay adı](olay:KİMLİK)` biçiminde işaretlenir. Çizgilerin uçlarının ve yolların duraklarının *yer* olduğu (şehir, olayın yeri,
koordinat; devlet verilirse o yılın başkenti) araç açıklamalarında yazar. İşgal altındaki bir yer seçiliyken isteğe, sınır verisinin
orayı işgalcinin toprağı olarak çizdiğini ama gerçekte işgal altında olduğunu söyleyen bir olgu satırı eklenir; ne yapılacağı dosyanın
"Doğruluk" bölümündedir. Adım başına iki metin gerekir: `step` aracı **başlık + altyazı** ister, tam metin sonra "## n. Başlık" altında
gelir.

**Tur sayısı az olsun diye iki turlu bir protokol.** Her araç turu ayrı bir (ücretli) istektir ve araç girdileri akmaz. Bu yüzden adımlı
bir yanıtta model **birinci turda, metin yazmadan, tek seferde** adımları (`step{n, title, caption}`) ve her adımın çizimlerini (`step`
numarasıyla) bildirir; **ikinci turda** yalnızca metni yazar (`## n. Başlık` + paragraf). Tek sahnelik bir yanıt da böyledir (`n: 1`):
"kısa yanıt için ayrı bir biçim" yoktur; kaç sahne olacağı modelindir. Sayfa metni
adımlara ayırır (başlık işaretini, numarayı ve boşluğu bağışlayıcı biçimde okur; başlıksız ama paragraf sayısı adım sayısına eşit
metni de adımlara dağıtır; hiç başlık yoksa bütün metin tek adımdır); altyazı yoksa metnin ilk bir iki cümlesinden çıkarılır (yukarıdaki
güvenlik ağı). En az iki adım (planda ya da metinde) varsa yanıt çok adımlıdır, yoksa tek adımlıdır. Araç yoksa (`limits()` raporlamazsa
ya da `tools_unavailable` gelirse) aynı soru yalnızca metin olarak sorulur (her yanıt yine bir ya da daha çok adımdır, altyazıyı sayfa
çıkarır) ve altyazının altında bunu söyleyen bir not görünür.

**Claude olmayan yerde: deneme kipi.** `claude.use("sample")` boş dönerse (yerel geliştirme, kaydedilmiş dosya, başka bir ev sahibi)
sohbet **komut dosyalı bir sağlayıcıya** düşer ve bunu açıkça yazar (soru kutusunun üstünde "Deneme kipi"). Komut dosyalı sağlayıcı gerçek
bir çağrının yaptığını yapar: düşünür, birinci turdaki araç çağrılarını gerçekten çalıştırır, metni parça parça akıtır. Almanya'nın savaşı
(Nazi Almanyası'ndan bir yer, aralık 1941–1944'ü kapsıyorsa: 8 sahne. İlk sahne, "Savaş başlıyor", dört cümle ve dört vuruştur: Molotov–Ribbentrop
Paktı Moskova'da bir olay işaretiyle gösterilir ve taraflar boyanır (Almanya mavi, Polonya karşıt renk; Sovyetler, Britanya ve Fransa tarafsız,
taramalı); Alman ordusu Polonya'ya **Almanya'nın sınırından çıkan iki kısa okla** girer; Britanya ve Fransa savaş ilan eder (çizgi yok:
ikisi Polonya'nın rengine geçer); Kızıl Ordu doğu sınırından girer ve Sovyetler Birliği'nin 1939'dan 1940'a kazandığı toprak vurgulanır
(`territory_change`); 1940'ın sınırlarında Polonya'nın toprağı Almanya'nın mavisi ile Sovyetler'in şarap kırmızısı arasında bölünmüş görünür. Dördüncü sahnede iki taraf (`sides`: Mihver ve ortakları / Sovyetler Birliği) ve
cepheden Minsk ile Smolensk üzerinden Moskova'ya bir ilerleyiş oku, yedincide Alman geri çekilişi oku, sekizincide Almanya'nın 1944'ten
1945'e yitirdiği toprak), Stalingrad sorusu (tek sahne, iki cümle), Almanya–İtalya ittifakı sorusu (iki cümle: Çelik Pakt tek taraf olarak
boyanır, ikincisinde Üçlü Pakt'ın işareti gelir ve Japonya aynı tarafa katılır; aralarında çizgi çizilmez), Mihver ve Müttefikler sorusu
(iki taraf; ikinci cümlede kenarda kalanlar taramalı), batıdan iki sahne ("Fransa 1940" → Fransa Muharebesi, 1939'un sınırlarında;
"Normandiya" → çıkarma, ABD vurgulanır ama kadraj Batı Avrupa), **düz metin** yanıtı (biçimi izlemeyen bir model: güvenlik ağını sınamak için;
soruda "düz metin" geçerse) ve açık olay sorusu için hazır yanıtları vardır; geri kalan her yer ve aralık için yanıtı uygulamanın kendi
verisinden (yerin egemenleri, olay kayıtları) üretir. Soru metnine `[hata:rate_limited]` gibi bir işaret eklemek hata ekranlarını görmek
için o hatayı üretir.

**Kaynaklar.** Varsayılan kaynak modelin kendi bilgisidir; uygulamanın doğrulanmış olay kayıtları ilgili dönem ve yer için isteme
eklenir (modelin kartlarla çelişmemesi için). `src/ai/sources.ts` içindeki `SourceProvider` arayüzü ileride okurun yüklediği bir kitap
gibi kaynakların takılacağı yerdir: `retrieve({ question, context })` metin parçaları döndürür, gerisi değişmez. Model de küçük bir
arayüzün (`ModelProvider`) arkasındadır: gerçek `SampleProvider` ve komut dosyalı `MockProvider`.

**Henüz yok:** yüklenmiş belge kaynağı. Birden çok yerin bağlamı sohbetin kendisinden gelecek (okur başka bir yeri ya da dönemi
anınca). Bağlamın şekli (yer listesi, yer başına aralık) ve `SourceProvider` bunlar için ayrılmıştır.

## Tasarım kararları ve gerekçeleri

| Karar | Gerekçe |
|---|---|
| **MapLibre GL JS** (vektör, GPU) | Sürükleme/yakınlaştırma akıcı olmalı; sınırlar, vurgu ve katmanlar tek bir yerde çizilebilsin. Dış karo sunucusuna ihtiyaç yok: harita tamamen kendi verimizden çizilir. |
| **Vite + TypeScript + lit-html** (React yok) | Arayüz küçük ve durum odaklı; bir bileşen çerçevesi gereksiz. Mantık (`src/domain`) arayüzden ayrıdır ve birim testlidir. |
| **Sınır verisi: Seshat Cliopatria** (CC BY 4.0) | Devletler için, çoğunlukla aralıksız sınır verir (yıl yıl seçilebilir); zaman sürükleyince sınırlar gerçekten kayar. Alternatif `historical-basemaps` yalnızca birkaç anlık görüntü sunuyor ve GPL-3.0. 1800–2000'de savaş yıllarını da kapsar (yıllık anlık görüntüler; neyi gösterip neyi göstermediği için "Bilinen veri sınırlamaları"). Cliopatria ayrıca her devlet için Wikipedia/Wikidata kimliği ve üst-alt ilişkisi taşır. Bedeli: yalnızca devletleri haritalar; devlet kaydı olmayan karalar noktalı "veri yok" zemini olarak gösterilir. |
| **Yer = bir nokta, devlet = o noktanın o yıldaki sahibi** | Stuttgart 1806'da Württemberg Krallığı, 1942'de Nazi Almanyası, 1946'da Fransız işgal bölgesi, 1950'de Batı Almanya'dır. Zaman çizelgesi, aralık boyunca o noktayı elinde tutan *tüm* devletlerin (ve üst yapılarının, bulunduğu bölgenin) olaylarını toplar; böylece "yerin tarihi" okunur. |
| **Haritadaki olay sayısı: yakınlaştırma bütçesi; önem yalnızca eleme için** | Her olayın içsel bir önem puanı (1–5) vardır, ama arayüz bunu **göstermez** (boyut, rozet, etiket yok): neyin önemli olduğuna kullanıcı karar verir. Puan yalnızca kalabalığı ayıklar: haritada yalnızca puanı ≥3 olanlar yer alır (daha yerel olanlar yalnızca çizelgededir); bütçe *görünümdeki* olaylara harcanır (dünya görünümünde az, yakınlaştıkça o bölgenin daha fazlası) ve ekranda çakışanlardan puanı düşük olan elenir. Sağ alttaki not kaç olayın çizildiğini ve geri kalanının neden görünmediğini söyler. |
| **Açık olay bu elemenin dışındadır, görünüm en az değişir** | Açık olay, bütçeye, önem süzgecine ve çakışmaya bakılmadan çizilir. Görünüm dışındaysa harita merkezi etrafında *yalnızca uzaklaşır* (Web Mercator'da merkezden uzaklık her yakınlaştırma düzeyinde yarıya iner; bu yüzden gereken en az düzey doğrudan hesaplanır, `domain/reveal.ts`) ve kontrollerin (`+/−`, lejant, sayaç) arkasında kalmamasına dikkat edilir. Olay zaten görünürse harita hiç oynamaz; aynı olayı yeniden açmak da haritayı bir daha kımıldatmaz. Harita en geniş görünümüne varmış ve olay yine de sığmıyorsa (tam ekran okuyucunun köşedeki küçük penceresi en küçük yakınlaştırmadadır), yakınlaştırma o en geniş değere iner ve merkez, olayı kenar paylarının içine alan *en kısa yoldan* kaydırılır; harita sınırları aşılmaz. |
| **Aralık seçici: yalnızca cetvel** | Tek yıl da 100 yıl da aynı denetimle seçilir; sayı kutusu ya da hazır süre düğmesi yoktur. Fırçanın içindeki işaret, o aralık içinde hangi yılın sınırlarının çizileceğini seçtirir; seçilen yıl harita başlığının yanındaki notta görünür. Alt bölüm bu yüzden iki ince satırdır (≈ 80 px). |
| **Yer başlığı haritanın üstündedir, haritanın içinde değil** | Başlık ve "… yılının sınırları" notu, haritanın üstündeki sabit yükseklikli bir şeritte durur; hiçbir sınırı ya da işaretçiyi örtemez ve adın uzunluğu haritayı yeniden boyutlandırıp kaymış gibi göstermez. |
| **Bilgi kartı seçimlerle yönlenir: yer bağlam, olay odak** | Kart, `{ type: 'place' \| 'event', id }` başvurularının listesini bölümlere çevirir. Yalnızca yer seçiliyse kart yeri anlatır (ayrıntılar ve "aynı sırada, başka yerlerde" listesi kapalı bölümlerdedir: kart kısa kalır); olay açıksa olayı anlatır ve yer tek satırlık bir başlığa (ad + aralık) küçülür; başlığa tıklamak ya da olayı kapatmak yer görünümüne döndürür. Kart küçüktür, ✕ ile kapanır ve okur bir şey sorunca kendiliğinden bir sekmeye çekilir. |
| **Çizelge yalnızca seçili aralığı gösterir** | Yerin çizelgesinin ekseni tam olarak seçili aralıktır: aralığın öncesinde ve sonrasında ne yıl ne olay vardır (önceki sürüm aralığın iki yanını soluk bağlam olarak gösteriyordu; kaldırıldı). Aralıktan önce başlayıp aralığa uzanan bir olay sol kenarda tam bir nokta olarak durur. Çakışan noktalar (en çok 2 sıra) üst üste biner ama hiçbiri düşürülmez; her olay gerçek tarihinde çizilir. |
| **Model neyi gösterir, uygulama nasıl gösterir** | Anlatımın tutarsızlığı modelin görseli her seferinde serbestçe seçmesindendi. Şimdi model yalnızca *neyi* (hangi olay, hangi devletler hangi tarafta, hangi yerler arasında bir hareket, hangi devletin toprağı hangi yıllar arasında değişti, veride olmayan bir yer) söyler; görünüş (dört biçim ve anlamları, aktör renkleri, olay işaretinin tam işaretten numaralı noktaya dönmesi, okun sönmesi), spot ışığı ve kamera uygulamanındır (`src/map/aiLayer.ts`, `src/map/mapView.ts`, `src/ai/actors.ts`). Aynı şey her seferinde aynı görünür. |
| **Harita sahnenin tamamıdır; geri kalan her şey onun üstünde bir katmandır** | Bilgi kartı, altyazı ya da kısa yanıt, soru kutusu ve okuyucu paneli haritayı yeniden boyutlandırmaz: üstüne biner. Yalnızca tam ekran okuyucuda harita köşede küçük bir pencere olur. Bir yer seçilince başlık şeridinin ya da alt bölümün boyu değişseydi harita kaymış gibi görünürdü; bu yüzden onların boyu durumdan bağımsızdır. Kamera, çizimi bu katmanların altında kalmayacak biçimde çerçeveler. |

### Görsel dil

Basılı bir atlas: sıcak kâğıt, kahverengi-siyah mürekkep, sakin pastel devlet dolguları ve **tek canlı renk**
(vermilyon): "seçtiğiniz şey". Seçili yer halkasız, dolu kırmızı bir nokta ve çevresinde yarıçapsal sönen yumuşak bir
ışımadır; seçili devlet taramalı çizilir; açık olay vermilyon halkayla vurgulanır. **Deniz tek düz açık mavidir** (`--sea`; kıyı
sığlığı, derin deniz ya da degrade yok: önceki sürümdeki ikinci mavi, `--sea-deep`, kalktı). Devlet dolgularının rengi yalnızca
komşuları ayırır (derleme sırasında komşuluk grafiği boyanır; kimlik etiket ve sınırla taşınır). Dokuz ton (`--tint-0…8`;
sonuncusu yedek, veri kullanmaz) **gri ya da kum gibi değildir** (gri bir devlet, noktalı "veri yok" zemini gibi okunuyordu: her ton
belirgin biçimde renklidir ve zeminden en az ΔE 11 uzaktadır) ve **birbirinden en az ΔE 8,5 uzaktadır**: komşu iki devlet net ayrışır.
**Mavi artık serbesttir:** önceki sürümde haritada mavi yalnızca denize aitti ve devlet renkleri bu yüzden mavisizdi; şimdi
anlatımın odağı mavi boyanıyor ve renk anlam değiştirmesin diye devlet tonları arasında da bir mavi (`--tint-5`, menekşe mavisi) ve bir
turkuaz var — yalnız hiçbiri denizin düz mavisine yaklaşmaz (mavimsi tonlar için ΔE ≥ 15, ötekiler için ≥ 11). Tonlar, hangi iki ton
çiftinin haritada en çok yan yana geldiği sayılarak (921 komşuluk) dağıtılmıştır: en sık komşu olan çiftler birbirinden en uzak
renklerdir. Vermilyondan (seçim) da en az ΔE 15, anlatımın aktör renklerinden en az ΔE 8 uzaktadırlar.

**Anlatımda renk aktöre aittir.** Dört aktör rengi vardır (`src/styles/tokens.css`, `src/ai/actors.ts`): **odak** mavi (`--side-focus`),
karşıt iki taraf kehribar (`--side-foe-1`) ve şarap kırmızısı (`--side-foe-2`), tarafsız ya da belirsiz olanlar bej ve **taramalı**
(`--side-neutral`). Model yalnızca kimin hangi tarafta olduğunu söyler; hangi tarafın hangi rengi alacağına uygulama karar verir ve
renk anlatım boyunca değişmez. Üç aktör rengi normal görüşte birbirinden ΔE ≥ 20, protan ve deutan görüşünde ≥ 12 ayrışır; denizden,
kâğıttan, "veri yok" zemininden ve vermilyondan ΔE ≥ 15 uzaktadır. Spot ışığı için ayrı "canlı ikiz" renkler (`--vivid-0…8`) ve eski
taraf renkleri (`--side-0…2`: şarap, kehribar, yeşil) kalktı: boyalı bir devlet doğrudan aktörünün renginde, tam dolgundur ve
haritanın geri kalanı üstüne çekilen kâğıt rengi bir örtüyle solar. `tests/palette.test.ts` bunların hepsini sayıyla korur. Olay
noktalarının çevresindeki kâğıt halkası, noktanın hangi dolgunun üstüne düştüğüne bakmaksızın okunmasını sağlar. Yazı: okuma
metinleri ve başlıklar için **Newsreader**, denetimler için **Instrument Sans**; ikisi de uygulamayla paketlenir.

**Olay işaretçileri haritada, çizelgede, lejantta ve panelde aynı tek işarettir:** aynı şekil (daire), aynı boyut (13 px);
yalnızca renk değişir ve renk kategoriyi anlatır. Boyut önemi anlatmaz. Altı kategori rengi bir renk-ayırt-edilebilirlik
doğrulayıcısından (OKLab ΔE, tüm çiftler, kâğıt zemin) geçirilmiştir: normal görüşte en kötü çift ΔE 15,0; protan/deutan
simülasyonunda en kötü çift ΔE 7,7. Bu değer doğrulayıcının 6–8 "uyarı" bandındadır ve yalnızca ikinci bir kanalla geçerlidir:
lejant, ipucu ve olay kartı kategoriyi **sözle** de söyler. Üç rengin (zeytin sarısı, pembe, turuncu) kâğıda karşı kontrastı
3:1'in altındadır; bu yüzden her noktanın çevresinde kâğıt halkası ve ince mürekkep çizgisi vardır. Lejant başlıksızdır, açılır-kapanır
değildir, haritanın sol üst köşesinde durur ve yalnızca bu altı rengi açıklar.

## Veri

```
public/data/                          yayındaki dönem (şu anda 1800–2000)
  borders/cliopatria-1800-2000.json   sınırlar (üretilmiş; elle düzenlenmez; sıkıştırılmış tamsayı biçimi, aşağıya bakın)
  borders/polities.json               devlet başına türetilmiş bilgiler (Wikipedia/Wikidata, ton, dönem)
  geo/land.json                       kıyı çizgisi / kara (Natural Earth, üretilmiş)
  places.json                         ŞEHİR GÖSTERGELİĞİ (Natural Earth "populated places", üretilmiş; döneme bağlı değil): çizgi uçları ve rota durakları, tarihsel adlarıyla
  capitals.json                       devletlerin YIL YIL BAŞKENTLERİ (elle yazılır; dönemin dosyası)
  entities.json                       DEVLET VE BÖLGE ADLARI + ÖZETLER (Türkçe, elle yazılır)
  categories.json                     olay kategorileri (savaş, siyaset, ekonomi ve teknoloji, toplum ve insan hakları, bilim-sanat-kültür, afet)
  events/index.json                   hangi olay dosyalarının yükleneceği ve uygulamanın hangi aralıkla açılacağı (`open`: 1939–1945)
  events/*.json                       OLAYLAR (Türkçe, elle yazılır): global.json (iki yüzyılın dönüm noktaları), ww2.json (savaş kümesi)
  corrections/ww2.json                DÜZELTME KATMANI (elle yazılır, belgeli): sınır dosyasının üstüne yüklenirken uygulanır; Cliopatria'ya dokunulmaz ("Düzeltme katmanı")
  schema/events.schema.json           olay dosyası için JSON şeması (editörde otomatik tamamlama; isteğe bağlı `versus`: savaşta karşı saf)
data/<başlangıç>-<bitiş>/             YAYIN DIŞI dönemler: aynı dosyalar, aynı düzen (şu anda 1400-1600); bkz. data/README.md
scripts/pipeline/periods/*.json       bir dönemin kendi kuralları (aynı devleti iki adla anan kayıtların birleştirilmesi)
scripts/pipeline/build_places.py      şehir göstergeliğini Natural Earth'ten üretir (+ places-extra.json, places-aliases.json: elle tutulan listeler)
scripts/pipeline/build_correction_shapes.py   düzeltme katmanındaki yamaların şekillerini Natural Earth'ten türetir
```

**Dönemler.** Yayındaki dönem her zaman `public/data`'dadır; ötekiler `data/` altında **tam** durur (sınırlar, devlet kayıtları, olaylar,
kategoriler, kıyı) ve uygulamaya da tek dosya sürümüne de girmez. `npm run data:period -- 1400-1600` o dönemi yayına alır (yayındaki
dönem `data/` altına geçer; dosyalar kopyalanmaz, taşınır). Arşiv testlerde kullanılır (`tests/data.test.ts` arşivi de doğrular,
`tests/helpers/shipped.ts` → `archivedData`), yani bozulursa test kırılır; hat da arşivi **birebir** yeniden üretir (1610 satırın
geometrisi ve özellikleri aynı çıkar).

### Sınırları yeniden üretmek

```bash
python3 -m venv .venv && .venv/bin/pip install -r scripts/pipeline/requirements.txt
.venv/bin/python -I scripts/pipeline/fetch_sources.py        # Cliopatria (46 MB) + Natural Earth → .cache/
.venv/bin/python -I scripts/pipeline/build_borders.py        # varsayılan: 1800–2000 → public/data
.venv/bin/python -I scripts/pipeline/build_borders.py --from 1400 --to 1600 --format geojson --keep-identical --out data/1400-1600
```

Betik: parantezli "şemsiye" kayıtları çizmez (bileşenlerinin birleşimidir); poligonları kıyıya kırpar (kıyı
net olur, denize tıklamak hiçbir şey seçmez; kırpma çok çekirdekle yapılır ve sonucu `.cache/`'e yazar, ikinci çalıştırma saniyeler
sürer); art arda gelen **aynı** satırları birleştirir (1800–2000'de 197 satır); komşuluk grafiğiyle devlet tonlarını boyar; etiket noktalarını
ve her satırın sınır kutusunu (`box`) hesaplar. **Zaman aralığını değiştirmek** için `--from/--to` verilip betik yeniden çalıştırılır;
arayüz aralığı dosyadan okur. Bir dönemin kendine özgü kuralları `scripts/pipeline/periods/<başlangıç>-<bitiş>.json` dosyasındadır
(1800–2000'de: veri setinin aynı devleti iki adla andığı yedi durum, ör. *Denmark-Norway* ve *Denmark* → `denmark`, *Kingdom of
Greece* ve *First Hellenic Republic* → `greece`); dosya yoksa kayıtlar olduğu gibi kalır.

**Boyut ve yükleme (1800–2000).** İki yüzyılın sınırı düz GeoJSON olarak yaklaşık 40 MB tutar (gzip + base64 ile bile ~12,2 MB: 16 MB'lık
sınırın dibi, ve tarayıcı 40 MB metni ayrıştırmak zorunda kalırdı). Bunu **veriyi bozmadan** çözdüm (sadeleştirme yok: sınır şekilleri
1400–1600 ile aynı 0,01° hassasiyetinde kalır): (1) her halka
0,01° adımlarıyla **tamsayı farkları** olarak yazılır (`meta.encoding = "delta-int"`; ~15,6 MB), (2) tek dosya sürümü veri bloklarını
gzip'ler (`DecompressionStream` ile açılır; gzip + base64 ile sınırlar ~5,3 MB, dosyanın tamamı ~7,4 MB), (3) yükleyici (`src/data/borderStore.ts`,
`borderCodec.ts`) satırları **tembel** çözer: kutular dosyadan gelir, bir satırın şekli ancak tıklama ya da çizim ona dokununca açılır,
ve (4) harita yalnızca gösterilen yılın **±10 yıllık penceresindeki** satırları tutar (`MapView`, `BORDER_WINDOW_HALF`); yıl pencerenin
kenarına yaklaşınca pencere kayar ve o sırada başlıkta "· yükleniyor…" yazar (süzgeç, yeni pencere gelene kadar haritanın
elindeki en yakın yılı kullanır). Böylece açılış yaklaşık 7 sn'de biter (yazılım GL'li başsız Chromium'da; bütün satırları haritaya
tek seferde veren ilk denemede 25 sn) ve sayfanın JS belleği ~450 MB yerine açılışta ~55 MB'tır; bütün yıllar gezilince çözülen
satırlar bellekte kaldığı için en çok ~140 MB'a çıkar (ölçüm: 4 yıllık adımlarla 1800–2000).

### Düzeltme katmanı (İkinci Dünya Savaşı)

**Cliopatria'ya dokunulmaz.** Sınır dosyası üretildiği gibi kalır; ona yazan hiçbir betik ya da yükleyici yoktur. Savaşın anlatımını
bozan birkaç boşluk, ayrı, küçük ve belgeli bir dosyayla (`public/data/corrections/ww2.json`) sayfa yüklenirken verinin **üstüne**
uygulanır. Katman bilerek küçüktür ve bir doğruluk turu değildir: her kaydın `note` (neden) ve `source` (Vikipedi makalesi ya da veri
analizi) alanı vardır, dosyanın `meta.knownGaps` listesi de neyi **düzeltmediğini** söyler. Üç boşluğu kapatır:

1. *Nazi Almanyası 1945'te yoktur:* satırları 1944'te biter; 1945'te Berlin, Münih ve Viyana işgal bölgesi satırlarıyla çizilir.
2. *Japon işgalleri kısmen eksiktir:* Singapur 1942–45'te İngiliz, Doğu Timor 1944'e kadar Portekiz çizilir.
3. *İşgal altındaki ülke işgalcinin toprağı gibi çizilir* (Varşova 1942'de "Nazi Almanyası"dır); sayfa onu "Polonya · Alman işgali" diye
   adlandırmalıdır, poligon değişmeden.

**Nasıl uygulanır.** `assembleData` (`src/data/load.ts`) sınır dosyasını okuyunca `applyRowCorrections` çağırır (`src/data/corrections.ts`),
sonra satırları kurar. İki işlem vardır: `copy` bir satırın şeklini yeni yıllara kopyalar (kodlanmış şekli paylaşır; isteğe bağlı `keep`
kutuları, kopyada Almanya dışı parçaları atar) ve `add` kendi şekli olan bir satır ekler (şekil `encodeGeometry` ile dosyanın sıkıştırılmış
biçimine çevrilir; `area`, `box`, `bbox` hesaplanır, `label` boştur: yama ikinci bir ad almaz). Yeni satırlar dosyanın kendi sırasına
(büyükten küçüğe; küçük olan üstüne çizilir, noktayı en küçük satır tutar) yerleştirilir: düzelttikleri daha büyük satırların (işgal bölgeleri,
İngiliz satırı) üstüne, kıyıda yalnızca değdikleri daha küçük satırların (İsviçre, Danimarka) altına çizilir; dosyadaki satırlara dokunulmaz. Dosyada olmayan bir devlete ya da satıra başvuru hata
fırlatır. İşgal adlarını `OccupationIndex` taşır ve kaydın **kendi şekli yoktur**: bir `occupations` kaydı savaş öncesi satırı (`area`:
`{ id, year }`, gerekirse `box` kutularıyla daraltılmış) gösterir; bir noktada ve yılda şu üçü birlikte doğruysa işgal geçerlidir:
yıl `from`–`to` içindedir, o yıl noktayı tutan satır (en küçük alanlı) kaydın `occupiers` listesindendir ve nokta o savaş öncesi
satırın şeklinin (ve kutuların) içindedir; dosyada ilk eşleşen kayıt kazanır, sözcüğü `occupierLabels` verir ("Alman işgali"). Sayfa bunu yer
başlığında ("Polonya · Alman işgali"), bilgi kartında, model için yer bağlamında ve haritada bir ad etiketi olarak gösterir (etiket
noktası `at` o yıl bir işgalcinin elindeyse; etiketin boyutu daraltılmış alanın boyutudur). Yamaların şekli elle çizilmez:
`python3 -I scripts/pipeline/build_correction_shapes.py` onları Natural Earth 1:10m ülke sınırlarından türetir ve haritanın kıyısına
kırpar (`--check` dosyanın kaynaklarla uyumunu denetler). `npm run data:validate` katmanı da denetler (`scripts/validate-corrections.mjs`:
başvurular, şekiller, kimlikler, `note`/`source`, etiket noktasının alanın içinde olması ve her kaydın o noktada en az bir yılda gerçekten
uygulanması); `tests/corrections.test.ts` işleyişi ve verideki sonuçları sayıyla korur. Katman bir dönemin dosyasıdır: dönem
değişince `corrections/` klasörü de onunla taşınır, katmanı olmayan bir dönem (1400–1600) katmansız açılır.

**Satır düzeltmeleri**

| Düzeltme | Yıllar | Neden |
|---|---|---|
| `copy`: Nazi Almanyası'nın 1938 satırı (Avusturya ve Südetler dahil Reich ile Doğu Prusya) kopyalanır | 1945 | 1945'te Berlin "Fransa Dördüncü Cumhuriyeti", Münih "Amerika Birleşik Devletleri", Viyana "Sovyetler Birliği" çizilirdi. Kopya bölge satırlarından küçük olduğu için baskındır, onlardan sonra geldiği için üstlerine çizilir; kurtulmuş görünen ülkeler (Fransa, Belçika, Hollanda, Norveç, İtalya, Yunanistan, Yugoslavya) kopyanın şeklinin dışında kalır; Prag, Varşova, Danzig verinin kendi sahibinde (Sovyetler Birliği) kalır. `keep`: verinin Nazi Almanyası satırlarının hepsi Almanya'dan uzakta ~150 başıbozuk ada ve yama taşır (Hebridler, Gelibolu, Derbent, Ladoga adaları…); kopya bunları taşımaz. |
| `add` (Japonya): **Singapur** yaması, Johor kıyısıyla | 1942–45 | İngiliz satırı Japon satırlarından küçüktür, bu yüzden Singapur adasında ve karşı kıyıda (Johor Bahru) baskındı. Şekil: Natural Earth Singapur + Johor şeridi. |
| `add` (Japonya): **Doğu Timor** yaması | 1942–44 | Veri Portekiz Timoru'nu 1944'e kadar Portekiz çizer, Japon çizimi 1945'te gelir. Şekil: Natural Earth Doğu Timor. |

**İşgal adları** (yıllar: etiket noktasında, verinin o ülkeyi işgalcinin poligonuyla çizdiği yıllar)

| Ad | İşgalci | Yıllar | Neden ve kaynak |
|---|---|---|---|
| Polonya | Almanya | 1940–44 | Varşova "Nazi Almanyası"dır; savaş öncesi şekil. *Invasion of Poland*. Vilnius bölgesi ayrıdır (Litvanya). |
| Doğu Polonya | Sovyetler | 1940–41 | Eylül 1939 Sovyet işgali. *Soviet invasion of Poland*. |
| Bohemya ve Moravya | Almanya | 1939–44 | Mart 1939 işgali; iki kutu Slovakya'yı ve Südetler'i dışarıda bırakır. *Occupation of Czechoslovakia*. |
| Norveç · Hollanda · Belçika · Lüksemburg · Danimarka | Almanya | 1941–44 (Norveç) · 1940–44 | Veri hepsini Nazi Almanyası çizer (1940'ta Norveç satırı daha küçük olduğu için Norveç görünür). *German invasion of Norway*, *Battle of the Netherlands*, *Battle of Belgium*… |
| Fransa | Almanya, İtalya | 1940–44 | Kuzey ve Atlantik kıyısı 1940'tan, güney 1943'ten (veri); Vichy bölgesi adlandırılmaz; Menton gibi İtalyan bölgesi "İtalyan işgali". *German occupation of France*. |
| Yunanistan | Almanya, İtalya | 1941–44 | Atina 1942–43'te İtalyan çizilir. Bulgar bölgesi adlandırılmaz. *Axis occupation of Greece*. |
| Yugoslavya | Almanya, İtalya | 1941–44 | Sırbistan ve Slovenya Alman, Karadağ ve Kosova İtalyan; Hırvatistan Bağımsız Devleti (müttefik kukla devlet) adlandırılmaz. *Axis occupation of Yugoslavia*. |
| Arnavutluk | İtalya | 1939–43 | Nisan 1939 işgali. *Italian invasion of Albania*. |
| Estonya · Letonya · Litvanya (Vilnius bölgesi dahil) | Almanya | 1942–44 | Yalnızca Alman yılları; 1940 Sovyet işgali adlandırılmaz. *Reichskommissariat Ostland*. |
| Belarus · Ukrayna · Rusya | Almanya | 1942–43 | 1940 Sovyetler Birliği satırının kutularla kabaca kesilmiş hali (sınır boyunda komşu adı çıkabilir). *Reichskommissariat Ukraine*, *Eastern Front*. |
| Çin | Japonya | 1938–45 | Çin Cumhuriyeti'nin 1937 şeklinin Japon çizilen kısmı; Mançurya (Mançukuo) bu satırın dışındadır. *Second Sino-Japanese War*. |
| Filipinler | Japonya | 1942–44 | 1945'te ABD çizilir. *Japanese occupation of the Philippines*. |
| Hollanda Doğu Hint Adaları | Japonya | 1943–45 | Veri 1942'de hâlâ Hollanda çizer. *Dutch East Indies campaign*. |
| Burma | Japonya | 1943–44 | Veri 1942'de hâlâ İngiliz çizer; Andaman Adaları dışarıdadır. *Japanese occupation of Burma*. |
| Singapur · Malaya · İngiliz Borneosu · Hong Kong | Japonya | 1942–45 | Singapur için yamaya dayanır; Hong Kong'un satırı veride vardır (İngiliz, 1942–45'te Japon). *Battle of Singapore*, *Malayan campaign*, *Battle of Hong Kong*. |
| Fransız Çinhindi'si | Japonya | 1941–45 | Yalnızca verinin Japon çizdiği kuzey (Tonkin: Hanoi, Haiphong); Vichy ile ortak düzenleme, Fransız yönetimi Mart 1945'e kadar sürdü. *Japanese invasion of French Indochina*. |
| Doğu Timor | Japonya | 1942–45 | Yamaya dayanır. *Battle of Timor*. |

**Bu katman neyi düzeltmez** (dosyada `meta.knownGaps`): Burma, Java ve Sumatra 1942'de hâlâ İngiliz ve Hollanda çizilir (Mart–Mayıs 1942'de
düştüler; 1942 anlık görüntüsü yıl başındaki durumu gösterir gibidir); Yeni Gine (141°D'nin doğusu hiç taranmadı), Andaman Adaları ve Guam
Japon çizilir ama adlandırılmaz; Mançurya, Slovakya, Macaristan'ın ve Bulgaristan'ın ilhak ettiği yerler, Danzig, Südetler ve
Avusturya adlandırılmaz; Macaristan (1944), Kuzey İtalya (1944; Roma ve Napoli o yıl satırsızdır) ve Libya ile Tunus'taki Mihver
elleri (1941–43) Nazi Almanyası çizilir ama listede yoktur; Baltık'ın 1940 Sovyet işgali adlandırılmaz; 1946'dan sonra işgal bölgeleri hâlâ
işgalcinin toprağı gibi çizilir; kukla devletler (Mançukuo, Vichy dışında Quisling, Hırvatistan) ayrı çizilmez.

### Yer göstergeliği (`places.json`)

**Ne işe yarar.** Yapay zekânın çizdiği çizgilerin uçları ve rotaların durakları *yerdir*: verideki bir olay, bu göstergelikteki bir şehir,
bir koordinat ya da (yalnızca devlet söylenmişse) o devletin o yıldaki başkenti. `public/data/places.json` şehirlerin listesidir; `PlaceIndex`
(`src/data/places.ts`) bir yeri Türkçe adıyla, İngilizce adıyla ya da herhangi bir alternatif adıyla bulur (büyük/küçük harf, aksan ve
noktalama önemsizdir: "Köln" = "KOLN"; "İstanbul" = "Istanbul" = "Constantinople"). Dosya döneme bağlı değildir: `npm run data:period` ona
dokunmaz.

**Kaynak ve seçim.** Natural Earth *Populated places* 1:10m (kamu malı; atıf: "Made with Natural Earth."). 7.342 noktadan şunlar alındı: tüm
ulusal başkentler, nüfusu 100.000 ve üzeri olan yerler, ve elle tutulan listelerde (olaylar, başkent tablosu, tarihsel adlar) geçen yerler;
sonuç **3.285 yer, 378 KB** (gzip ~97 KB). Her satırda bir yer vardır, kimliğe göre sıralıdır ve dosyada tarih damgası yoktur (aynı girdi aynı
dosyayı verir):

```json
{"id":"gdansk","tr":"Gdańsk","en":"Gdańsk","lon":18.64,"lat":54.36,"pop":740000,"cc":"PL","key":1,"alt":["Danzig"]}
```

`id` İngilizce adın slug'ıdır; aynı adı paylaşan yerlerde en kalabalık olan düz slug'ı korur, ötekiler `-<ülke>` alır (`london`, `london-ca`).
`tr` kaynağın Türkçe adıdır (Şikago, Barselona, Kazablanka gibi Vikipedi'nin Türkçe yazılışları dahil), `pop` kaynağın en büyük nüfus değeridir
(kişi; kent ve çevresi), `cc` bugünkü ülkenin ISO kodudur, `cap: 1` ulusal başkenttir. `alt`: yerel yazılışlar ve tarihsel/alternatif adlar. `key: 1`
elle tutulan listelerde geçen yeri (618 yer) işaretler: iki yer aynı adı paylaşınca sayfa önce dönemin anlatıcısının kastedeni verir (Salamanca
deyince Meksika'daki değil İspanya'daki; "St. Petersburg" deyince Florida'daki değil Rusya'daki); sıra `key`, kendi adı olan, başkent, nüfus.

**Elle tutulan listeler** (`scripts/pipeline/`):

- `places-extra.json`: Natural Earth'te **olmayan 117 yer** (Sedan, Dunkirk, Pearl Harbor, Treblinka, Wannsee…; Aachen ve Ruhr kentleri gibi
  100.000'i aşan ama kaynakta eksik kentler de) ve kaynakta olup 100.000'in altında kalan, savaşın ihtiyaç duyduğu 43 yer (`include`: Narvik,
  El Alamein, Yalta…). Koordinatlar elle girildi ve ~1 km içinde olmalıdır; emin olunmayan yer eklenmedi. Olay noktalarıyla örtüşenlerin çoğu olayın
  noktasını kullanır (`tests/places.test.ts` aynı yerin göstergelikte ve olayda birbirinden uzak olmadığını sayar).
- `places-aliases.json`: **266 yere ~460 tarihsel ve alternatif ad** (Stalingrad, Danzig, Königsberg, Peking, Selanik, Konstantiniyye, Saigon…).
  Her giriş hedefini İngilizce ad + ülke koduyla verir; hedef yoksa ya da iki yere uyuyorsa derleme durur, ve `tests/places.test.ts` her adın
  hedefine gerçekten ulaştığını sınar. Aynı dosyada: `drop` (kaynağın bozuk yazılışları: "Th nh Pho Ho Chy Minh"), `countries` (Kırım'ın ülke kodu
  `UA` olur; kaynak `RU` yazar) ve `fixes` (kaynağın tek tek hataları).

**Kaynağın hataları.** Natural Earth'te 15 yerin İngilizce adı yerle ilgisizdir ya da başka bir yerin adıdır ("Pochinki" Cuttack'ın, "Saudi Arabia"
Ha'il'in adı olarak yazılmış); bunlar yerin kendi adıyla değiştirilir. Birkaç yer komşusunun nüfusunu taşır (Mazatán, Mazatlán'ın 500.000'ini), birkaçı aynı kentin
ikinci kaydıdır (Adapazarı, Bandar Lampung), birkaçının adı başka şehrinkidir (Pyongsan, Maradi). `fixes` bunları tek tek düzeltir (gerekçe
kaydın `why` alanındadır). `python3 -I scripts/pipeline/build_places.py --audit` yeni bir kaynak dosyadan sonra bakılacakları listeler.

**Yeniden üretmek** (yalnızca standart kütüphane gerekir):

```bash
python3 -I scripts/pipeline/fetch_sources.py     # Natural Earth populated places (19 MB) dahil → .cache/
python3 -I scripts/pipeline/build_places.py      # → public/data/places.json (--check: dosya güncel mi)
```

**Sınırlar.** Natural Earth eksiksiz değildir (Aachen, Częstochowa, Toruń, Bochum, ama Padova, Brescia, Derby, Breda, Girona da yoktur;
`places-extra.json` yalnızca savaşın ve olayların gerektirdiklerini tamamlar). `pop` kentin sınırını değil kaynağın çevre kentlerle birlikte verdiği sayıyı taşır; `cc` bugünkü ülkedir (Danzig `PL`);
tarihsel adlar savaş çağına ve Doğu Avrupa'ya yöneliktir ve eksiksiz değildir. İkisi de listelerde olmayan iki yer aynı adı paylaşırsa sıra kendi
adı olan, başkent, nüfus sırasıdır. `scripts/validate-places.mjs` dosyayı denetler (tek başına da koşar; `validate-data.mjs` işlevlerini çağırır); `tests/places.test.ts` içeriği sayıyla korur.

### Başkentler (`capitals.json`)

**Ne işe yarar.** Bir çizgi ya da rota bir *devletten* başlıyorsa, haritadaki etiket noktası (devletin en büyük parçasının ortası: Normandiya
çizgisi bu yüzden Grönland'dan çıkıyordu) yerine devletin **o yıldaki başkenti** kullanılır. `public/data/capitals.json` bunu yıl yıl söyler;
`CapitalIndex.at(devlet, yıl)` (`src/data/capitals.ts`) bir yer döndürür, tabloda yoksa `null` (uygulama etiket noktasına döner).

```json
"british-raj": [
  {"from": 1859, "to": 1911, "place": "kolkata", "note": "Dönemin adı: Calcutta."},
  {"from": 1912, "to": 1930, "place": "delhi", "note": "Başkent 1911'de Delhi'ye taşındı; Yeni Delhi inşa ediliyordu."},
  {"from": 1931, "to": 1947, "place": "new-delhi", "note": "Yeni Delhi Şubat 1931'de açıldı."}
]
```

**Kurallar.** Anahtar, `entities.json`'daki devletin kimliğidir (takma ad değil asıl kimlik). Yıllar kapsayıcıdır; devletin **çizildiği yılların**
içinde kalır (`borders/polities.json` ve düzeltme katmanının eklediği satırlar: Nazi Almanyası 1945'e kadar), aradaki işgal boşlukları dahil;
bir devletin aralıkları çakışmaz ve başkent değiştiyse birden çok aralık vardır. `place` göstergelikteki bir kimliktir (derleme başkent
yerlerini göstergeliğe kendiliğinden alır; hepsi `key` yerdir). Anayasal başkent ile hükümetin oturduğu şehir ayrıysa **anayasal başkent** yazılır
ve `note` söyler (Hollanda: Amsterdam, hükümet Lahey'de; Bolivya: Sucre, hükümet La Paz'da); savaş dönemi ve geçici başkentler de `note` taşır
(Çin Cumhuriyeti 1938–45 Chongqing; Vichy Fransası Vichy; İspanya Cumhuriyeti Madrid → Valensiya → Barselona; Özgür Fransa Londra → Cezayir).

**Kapsam.** **418 devlet, 467 aralık, 293 yer** (48 KB, gzip ~10 KB): olaylarda `parties`/`versus` olarak geçen 49 devletin hepsi, savaşın
bütün devletleri (Almanya'nın bütün biçimleri, Rusya/SSCB, Britanya ve imparatorluk kayıtları, Fransa'nın bütün biçimleri, İtalya, Japonya,
Çin'in üç dönemi, Osmanlı/Türkiye, Orta Avrupa ve Balkanlar, İskandinavya, Benelüks, İspanya'nın iki tarafı, ABD, Latin Amerika, Orta Doğu,
Afrika ve Asya'nın bağımsız devletleri) ve 19. yüzyılın başlıca devletleri. Tabloda olmayan 131 devlet (kısa ömürlü ayaklanma devletleri,
küçük sultanlıklar, "Alman Afrikası" ve "İtalyan Afrikası" gibi sömürge kümeleri, Hollanda Antilleri) başkentsizdir; olaylarda geçen "İngiliz
Afrikası" ve "Fransız Afrikası" için ülkenin anavatanındaki başkent (Londra, Paris) yazıldı ve `note` söyler. Emin olunmayan aralıklar boş bırakıldı:
Sırbistan 1916–17, Honduras 1840–79, Etiyopya 1800–99 gibi.

**Kaynak ve güvenilirlik.** Elle derlendi (genel başvuru bilgisi, Vikipedi başlıkları anılır); geliştirme ortamından Vikipedi'ye erişilemediğinden
aralıklar makalelerle tek tek **karşılaştırılmadı**. Yıl duyarlığı yıldır: bir başkent yılın ortasında değiştiyse aralık, yılın çoğunda
geçerli olanı yazar ve `note` değişikliği söyler. Devlet o yıl çizilmiyorsa tablo `null` verir (İkinci Polonya Cumhuriyeti 1940–45'te, Fransa 3.
Cumhuriyeti 1940'ta, Özgür Fransa 1945'te, Prusya 1871'de…: olaylarda 18 taraf-yıl çifti); çağıran yılı devletin çizildiği ilk/son yıla sıkıştırabilir.
`scripts/validate-places.mjs` yer ve devlet kimliklerini, çakışmayı, yıl sınırlarını ve olay taraflarının kapsamını denetler;
`tests/capitals.test.ts` verideki sonuçları sayıyla korur. Tablo bir dönemin dosyasıdır: `npm run data:period` onu dönemle birlikte taşır.

### Olay eklemek (kod değişikliği gerekmez)

`public/data/events/` altındaki bir dosyaya (ya da yeni bir dosyaya, `index.json`'a ekleyerek) bir nesne eklemek yeter:

```json
{
  "id": "stalingrad-1942",
  "title": { "tr": "Stalingrad Muharebesi" },
  "summary": { "tr": "Ağustos 1942'de Volga kıyısındaki Stalingrad'a ulaşan Alman 6. Ordusu, kent içinde ağır çatışmalara girdi; …" },
  "date": { "start": "1942-08-23", "end": "1943-02-02" },
  "location": { "name": { "tr": "Stalingrad" }, "coordinates": [44.52, 48.71] },
  "importance": 5,
  "category": "military",
  "parties": ["union-of-soviet-socialist-republics", "nazi-germany"],
  "sources": [{ "wikipedia": "Battle of Stalingrad" }]
}
```

- `date`: `"1453"`, `"1453-05"`, `"1453-05-29"` ya da `{ "start", "end", "approximate" }`.
- `importance`: 5 dönüm noktası · 4 çok önemli · **3 önemli (haritada görünür)** · 2 yerel önem · 1 yerel ayrıntı (yalnızca çizelge).
- `parties`: `entities.json` içindeki devlet/bölge kimlikleri. Olay, bu tarafların çizelgesinde **mesafeden
  bağımsız** görünür. Bir "üst yapı" taraf olarak yazılırsa (ör. `holy-roman-empire`), üyelerinin çizelgesinde de görünür.
- `versus` (isteğe bağlı, yalnızca `military`): savaşta **karşı safın** kimlikleri (`parties` içinden). Sayfa bir savaş olayının çizgisini
  ilk taraf ile ikincisi arasında çizer; ilk ikisi aynı safsa (Dunkirk'te Britanya ve Fransa, Almanya'ya karşı)
  karşı saf burada söylenir. `npm run data:validate` kimliklerin `parties` içinde olduğunu ve ilk tarafı içermediğini denetler.
- `sources`: en az bir Vikipedi makalesi (`wikipedia`, varsayılan dil `en`), Vikiveri kimliği (`wikidata`, `Q123` biçimi)
  ya da `url` (yalnızca `http(s)`). Bunlara uymayan kaynaklar doğrulayıcıda hata olur, çalışma anında ise bağlanmadan atılır.
  Tek bozuk olay uygulamayı durdurmaz: atlanır ve konsola uyarı yazılır.
- Yeni bir **bölge** (devlet kaydı olmayan karalar için, ör. Karayipler) `entities.json`'a `kind: "region"` ve
  `bounds: [batı, güney, doğu, kuzey]` ile eklenir.
- Kategori eklemek için `categories.json`'a kayıt yeterlidir; görünümü `src/domain/categories.ts`'de tanımlanmazsa
  nötr bir yedek biçim kullanılır.

`npm run data:validate` her şeyi denetler (zorunlu alanlar, tarih biçimi, bilinmeyen taraf/kategori, yinelenen id,
kaynak yokluğu, Türkçe ad eksikliği…).

### Bilinen veri sınırlamaları

- Cliopatria **yalnızca devletleri** haritalar: devlet kaydı olmayan kara noktalı "veri yok" zemindir. Bu pay zamanla küçülür (2° ızgarada
  karanın payı: 1803'te ~%43, 1850'de ~%38, 1900'de ~%14, 1942'de %1'den az; Afrika'nın, Amerika'nın güneyinin ve Avustralya'nın büyük
  bölümü erken yıllarda, Orta Afrika 1900'de boştur). Bu yerlere tıklanırsa devlet yerine (varsa) bölge adı gösterilir.
- Veri setinde bazı devletlerin kayıt aralıklarında boşluk vardır; bu yıllarda devlet haritada görünmez. **Uydurma sınır çizilmez.**
- Sınırlar yaklaşıktır (veri setinin kendi uyarısı: bir yorumun yalnızca bir sürümü). Panelde, çizilen sınırın hangi
  kayıt dönemine ait olduğu (ör. "1939–1944") gösterilir.
- **İkinci Dünya Savaşı'nı ne kadar gösterir** (1939–1945'in sınırlarını Cliopatria'ya karşı denetledim; `tests/period-1800-2000.test.ts`
  ve `tests/corrections.test.ts` bunları sayıyla korur). *Cliopatria'nın gösterdikleri:* yıllık anlık görüntüler: ilhaklar ve işgaller yıl
  yıl gelir (Çekoslovakya 1939'da, Polonya'nın batısı ve Varşova 1940'ta, Baltık devletleri 1940'ta Sovyetler'e ve 1942'de Almanya'ya geçer),
  Fransa 1940'ta kuzeyde Alman, güneyde Vichy olur (1942 anlık görüntüsünde de; 1943'te tamamı Alman çizilir), Yunanistan 1940'ta Yunan,
  1942'de İtalyan, 1944'te Alman görünür, Pasifik'te Filipinler ve Hollanda Doğu Hint Adaları Japonya'ya geçer, 1946'da işgal bölgeleri
  görünür. *Cliopatria'nın göstermedikleri:* **işgal ile ilhak ayrımı yoktur** (işgal altındaki bir ülke, işgalcinin poligonuyla çizilir:
  Varşova "Nazi Almanyası"dır, ayrı bir Genel Hükümet ya da kukla devlet yoktur); bazı işgaller eksiktir (Singapur 1942–45'te İngiliz, Doğu
  Timor 1944'e kadar Portekiz çizilir); Nazi Almanyası'nın satırları 1944'te biter (1945'te Berlin Fransız, Münih Amerikan, Viyana Sovyet bölgesi
  çizilir ve 1945 olayları 1944 sınırlarıyla gösterilirdi); 1946'dan sonra işgal bölgeleri işgalcinin kendi topraklarıymış gibi çizilir (Münih
  "Amerika Birleşik Devletleri", Viyana "Sovyetler Birliği"); Berlin'in bir bölümü 1946–1990'da Fransa'ya ait küçük bir parça olarak
  (Fransız sektörü) çizilir. *Düzeltme katmanı bunlardan şunları kapatır* ("Düzeltme katmanı" bölümü; Cliopatria'ya dokunulmadan): Nazi
  Almanyası 1945'te de çizilir (Berlin, Münih, Hamburg, Viyana, Königsberg, Breslau…), Singapur 1942–45'te ve Doğu Timor 1942–44'te Japon
  çizilir, işgal altındaki ülkeler "Polonya · Alman işgali" gibi adlandırılır (yer başlığında, bilgi kartında ve haritadaki etikette; poligon
  yine işgalcinin kalır). *Kalanlar:* Burma, Java ve Sumatra 1942'de hâlâ İngiliz ve Hollanda çizilir; 1946'dan sonraki bölgeler, kukla
  devletler ve ilhaklar (Südetler, Avusturya, Danzig) adlandırılmaz; Mançurya, Slovakya, Macaristan (1944) ve Kuzey İtalya (1944) listede
  yoktur (tam liste: dosyanın `meta.knownGaps` alanı). Bunların hiçbiri uygulamayı engellemez, ama okurun yorumunda bilinmelidir: kukla
  rejimleri ve ilhak ile işgal ayrımını harita değil metin anlatır (komut dosyalı yanıtlar bunu yapar; gerçek bir modelde ilk kullanımda
  gözle bakılmalıdır).
- **Olaylar oyuncak bir kümedir** (74 olay): iki yüzyılın birkaç dönüm noktası (Haiti bağımsızlığı, Waterloo, 1848, Amerikan İç Savaşı,
  Saraybosna, Ekim Devrimi, 1929 çöküşü, Hindistan'ın bölünmesi, Sputnik, Berlin Duvarı, Çernobil, Sovyetlerin dağılması, Ruanda …)
  ve savaş için yoğun bir küme (Spanyol İç Savaşı'ndan Japonya'nın teslimine, 54 olay; her yıl için birkaç tane, ayrıca Holokost,
  Pasifik ve Kuzey Afrika). Doğruluk sonraya bırakıldı (özetler yaygın kabul gören bilgileri verir); **kaynaklar tutuldu**: her olayın en
  az bir Vikipedi başlığı vardır.
- Olayların kaynakları İngilizce Vikipedi makale başlıklarıdır. Geliştirme ortamında Vikipedi'ye doğrudan erişim olmadığından
  başlıklar belleğe dayanır ve bağlantılar tarayıcıda tek tek **açılarak sınanmadı**. Olaylar için Vikiveri kimliği yoktur. Devletlerin
  Vikiveri kimlikleri doğrudan Cliopatria'dan gelir.
- Cliopatria'nın bazı etiketleri ve adlandırmaları tutarsızdır: aynı devlet iki adla anılır (*Denmark-Norway* ve *Denmark*, *Kingdom of
  Greece* ve *First Hellenic Republic*, Macaristan, Bulgaristan, Sırbistan, Romanya ve Monako için de benzeri); hat bunları
  `scripts/pipeline/periods/1800-2000.json` ile **tek devlette** birleştirir (tek kimlik, tek renk, tek ad). Türkçe adlar
  `entities.json`'da yazılır; her polity için tek, benzersiz ve sıra ya da rütbe sözcüğü İngilizce kalmamış bir ad vardır
  (`tests/period-1800-2000.test.ts` bunu sayar: modelin devletlere ada göre başvurması için).
- Aynı devletin iki ayrı adla bölünmüş kayıtları `entities.json`'da `"sameAs": "<kimlik>"` ile tek devlet sayılabilir.
- Tarihler kaynakta yazıldığı gibi tutulur ve (1582 öncesi için Jülyen takvimi kullanan kaynaklarda bir haftayı aşabilen
  farkla) Gregoryen yıl üzerine yerleştirilir; bu, olayı yalnızca kendi yılı içinde kaydırır.

## Mimari

```
src/
  domain/   saf mantık (arayüzsüz, testli): time, geo, events, lanes, categories, placement, reveal, camera, names (adların anahtarı),
            antimeridian (tarih değişim çizgisinde kısa yol), territory (iki yılın sınırından kazanılan ve kaybedilen alan)
  data/     veri yükleyici (`loadData`) ve saf birleştirme (`assembleData`); sınırlar için `borderCodec` (tamsayı fark biçimi),
            `borderStore` (satırları tembel çözen, yıl penceresini veren depo) ve `gzip` (tek dosya sürümündeki sıkıştırılmış bloklar);
            `places` (şehir göstergeliği), `capitals` (devletin o yılki başkenti), `corrections` (düzeltme katmanı: satır düzeltmeleri
            ve işgal adları)
  state/    store (durum + eylemler), derive (görünüm modeli), url (adres çubuğu), panelLayout
  map/      MapLibre görünümü, DOM etiketleri, işaretçiler, yer noktası, yapay zekâ çizim katmanı (aiLayer, flags), toprak değişimi
            vurgusu (territoryLayer) ve coğrafi koordinatı kopyalara/ekrana taşıyan projection
  ui/       cetvel (adım noktalarıyla), zaman çizelgesi, bilgi kartı (infoCard), harita üstü öğeler, ipucu kutusu,
            ask/ (soru kutusu), watch/ (İzle), read/ (Oku)
  styles/   tasarım belirteçleri ve bileşen stilleri (layout, card, ask, watch, read, dock, map, ai)
  ai/       okuma arkadaşı (arayüzsüz, testli): aşağıya bakın
instructions/okuma-arkadasi.txt   modelin yönergeleri (düz metin; sahibi düzenler, derlemede uygulamaya gömülür)
```

`src/ai/`: `resolve` (modelin yazdıklarını verideki devletlere, olaylara, şehirlere, noktalara çözer: `placeRef`, `placePoint`, bir devletin sınırındaki nokta `borderPoint`; devletlerin ana parçalarının kutusu),
`tools` (yedi sayfa işlevi), `eventKinds` (savaş olayının iki safı: sahnenin hangi yılın sınırlarıyla açılacağını seçerken her iki safın da haritada olması istenir; çizim türü seçmez), `sentences` (altyazıyı cümlelere böler: her cümle bir vuruştur), `actors`
(`sides` çağrısından aktör renklerini ve tarafları çıkarır: odak mavi, karşıt iki taraf, tarafsızlar; renk bellek tutar), `drawing` (her sahnenin **kendi** çizimi ve
vuruşları: `TurnPlan`, `drawingOf`, `frameAt(saat)`; yani sahnenin bir vuruştaki hâli; kamera hedefi `frameTargetOf`: sahnenin yerleri ve devletlerin o yerlerin çevresindeki parçaları), `steps`
(metni adımlara ayırır), `narration` (bir yanıtın adımları: plan + metin birleşimi, altyazı, adımlı mı tek parça mı), `presentation`
(İzle / Oku görünümü, okuyucu kipi; vuruşların kendiliğinden oynaması, otomatik oynatma ve hız, `Pacer` ile okuma hızı; adım gezintisi; başsız ve testli), `activeStep` (okuma çizgisi), `context`,
`prompt` (istekler, `narrationRequest`), `instructions` (yönerge dosyası), `sources`, `provider` (arayüz + hata kodları), `sampleProvider`, `mockProvider` + `mockScripts`,
`session` (sohbet, geçmiş, durdurma, hata), `director` (etkin sahne ve vuruşu → çizim, yıl, kamera takibi ve "bıraksın mı" sorusu) ve `settings`. `src/domain/camera.ts`: kamerayı ölçen saf işlevler (sapma, önemli hareket,
çerçeve, dolgu) ve `CameraWatch`.

- Durumda **harita kamerası yoktur**; harita görünümünü yalnızca kullanıcının kendi eylemleri değiştirir: sürükleme,
  tekerlek, çimdik, `+/−` düğmeleri, klavye. **Tek istisna `MapView.revealEvent`'tir:** kullanıcı görünüm dışındaki bir
  olayı çizelgeden, listeden ya da bir bağlantıdan açarsa harita, olay (ve kenar boşluğu) görünene kadar yalnızca uzaklaşır
  (`easeTo`, 0,9–2,6 sn, yumuşak giriş-çıkış). Uzaklaşmak yetmezse (harita en geniş görünümüne, ya da sınırlarının görünümü
  doldurduğu yakınlaşmaya geldi ve olay hâlâ kenar boşluğunda ya da bir denetimin altındaysa; tam ekran Oku'nun köşe haritası bunun
  tipik yeridir) harita o en geniş görünüme gider ve merkezi olayı güvenli alana sokan **en kısa yoldan** kaydırır (`revealMove`,
  `panToRevealAll`: `src/domain/reveal.ts`); sınırların dışına çıkılmaz ve sonuç idempotenttir: aynı olayı yeniden açmak haritayı
  bir daha oynatmaz. (Eskiden bu durumda `fitBounds` kullanılırdı ve olaydan bağımsız bir kayma yapıp her tıklamada haritayı
  doğuya kaydırırdı; El Alamein köşe haritasında hiç görünmezdi.) Zaten görünen olay için (ör. kendi işaretçisine tıklamak)
  hiçbir şey yapılmaz. "Hareketi azalt" tercihinde MapLibre görünümü animasyonsuz değiştirir.
  Çift tıklamayla yakınlaştırma ve klavyeyle döndürme kapalıdır.
- `ViewModel.mapEvents` yalnızca zaman aralığından hesaplanır, işaretçileri seçen `placeMarkers` saf bir işlevdir
  (aynı olaylar + kamera → aynı işaretçiler). **Haritada tek anlatıcı vardır** (`Narrator = 'ai' | 'place'`, `EventMarkers.setNarrator`):
  yanıt ekrandayken ya da bir yer seçiliyken bu küme haritadan çekilir (çizelgede kalır), yalnızca açık olay ve yapay zekânın
  söz ettiği olaylar çizilir; ikisi de yokken küme yine yalnızca zaman aralığına bağlıdır. Seçili yer ayrıca vurgu katmanını, yer
  noktasını, panelin yer kartını ve çizelgeyi değiştirir. Açık olay `EventMarkers.setSelected` ile her zaman çizilir.
- **Bilgi kartı:** `SelectionRef = { type: 'place' | 'event'; id }` (`state/derive.ts`); `panelLayout(places, event)`
  (`state/panelLayout.ts`, saf ve testli) hangi başvurunun *bağlam* (tek satır) hangisinin *odak* (tam bölüm) olduğunu söyler;
  `InfoCard.card(ref, vm, 'full' | 'compact')` her başvuruyu bölüme çevirir. Kart küçüktür, ✕ ile kapanır; okur bir şey sorunca sayfa
  onu bir sekmeye çeker (seçim kalır).
- **Ekranın katmanları:** harita (`.map-wrap`) sahnenin tamamıdır; üstünde sağdan bilgi kartı, altta ortalanmış bir sütun (altyazı ya da
  kısa yanıt + soru kutusu), yan panel olarak ya da tam ekran okuyucu bulunur. `[data-avoid]` işaretli her katman kameranın kaçındığı
  alandır (`MapView.controlRects`); `--side-w` yan paneli, `--foot-h` ekranın dibindeki sütunun yüksekliğini (kısa bir yanıt için en
  uzun hâlini) stillere söyler. `Presentation` hangi görünümün ekranda olduğunu tutar; adım ise tek yerdedir (`Director.active`), bu
  yüzden görünümler arasında korunur.
- **Karşılaştırma moduna hazırlık, dürüst durum:** *hazır olanlar* durum (`places: PlacePoint[]`), adres (`p=` yinelenebilir),
  görünüm modeli (yer başına `PlaceView`), bilgi paneli (başvuru listesinden kartlar, yan yana odak ızgarası) ve haritadaki
  vurgu/yer noktaları (liste). *Eksik olanlar:* `MAX_PLACES` şimdilik 1, ikinci yeri ekleyen bir eylem yok, çizelge yalnızca
  ilk yeri çiziyor (yer başına bir şerit çizilmeli), iki yer için iki vurgu rengi gerekecek ve "yer–olay" karşılaştırmasında
  panelin hangi kartı odak sayacağı (`panelLayout`) yeniden tanımlanmalı. Karşılaştırma bu turda yapılmadı.
- **Sınırlar bir yıl penceresiyle gelir** (`MapView.windowFor`, `loadWindow`, `bordersReady`): haritanın GeoJSON kaynağına yalnızca gösterilen
  yılın ±10 yıllık penceresindeki satırlar verilir; yıl pencerenin kenarına (3 yıl) yaklaşınca pencere kayar (140 ms geciktirmeli) ve
  başlık o sırada "· yükleniyor…" der. Süzgeçler yeni pencere gelene kadar yılı pencerenin içine sıkıştırır (`filterYear`), yani
  harita hiçbir an boş kalmaz. Tıklama ve etiketler pencereye bakmaz: bellekteki satırlarla (`BorderStore`) çalışır. Testler ve e2e
  `window.__ayni.bordersReady()` ile haritanın gösterilen yılın satırlarına sahip olduğunu bekler.
- **Ek katmanlar (din, dil):** `MapView.onLoad` katman listesine yeni kaynak/katman eklemek yeter; zaman filtresi
  (`from/to`) aynı biçimde uygulanır.

## Doğrulama

**Çalışma kuralı (her turda ne koşulur).** Varsayılan: **`npm run smoke`** (tsc + birim testleri + veri doğrulama + derleme + iki
e2e takımının hızlı kipi) ve buna **değişikliği kapsayan gruplar** (`E2E_ONLY=…`). **Tam takım (`npm run full`) yalnızca istenince
koşulur.** Görsel inceleme her yayından sonra elle yapılır; bu yüzden betikler ekran görüntülerini ve rapor dosyalarını yalnızca
`E2E_SHOTS=1` ile yazar (görsel olarak belirsiz bir şey olursa yalnızca o alınır). Aynı kural, oturumlar arasında kalıcı olması için
[`CLAUDE.md`](CLAUDE.md) dosyasında da durur.

| Komut | Ne koşar | Ölçülen süre |
|---|---|---|
| `npm run smoke` | tsc, birim (698 test), veri doğrulama, derleme, hızlı e2e: base bölüm 0–3 (39 denetim) + AI A, B (iki tek adımlı yanıt), G (gerçek `sample` bağdaştırıcısı), H (telefon) ve M (vuruşlar: altyazı okuma hızında oynar) senaryoları (145 denetim) | **≈ 3 dk** (e2e kısmı 2 dk 23 sn: base 12 sn, AI 131 sn) |
| `E2E_ONLY=7,9 node scripts/verify-e2e.mjs` | yalnızca bu base bölümleri (0–6 tek bloktur: biri istenirse hepsi koşar) | bölüm süreleri aşağıda |
| `E2E_ONLY=A3,K node scripts/verify-ai-e2e.mjs` | yalnızca bu AI grupları (harfler raporun başlıklarındaki gibi) | grup süreleri aşağıda |
| `npm run full` | smoke'un ön adımları + tam base e2e + tam AI e2e | bu turda koşulmadı (kural gereği); grup sürelerinin toplamı ≈ 29 dk (base 4 dk 24 sn, AI 24 dk 15 sn; 166 + 513 denetim). Son gerçek tam koşu iki tur önce: 31 dk 2 sn |

Tek koşuda ölçülen süreler (sn, hareket azaltılmış kip): base e2e 0–6 bloğu 34 (yalnız 0–3: 6) · 7: 64 · 8: 21 · 9: 34 · 10: 28 ·
11: 24 · 12: 59; AI e2e L 18 · S 23 · A 53 · V 119 · W 45 · A2 19 · A3 60 · A4 25 · B 41 · C 8 · C2 13 · D 6 · J 49 · K 123 · P 212 ·
R 82 · T 99 · F 100 · E 80 · G 64 · H 42 · Y 47 · N 20 · M 63 · Q 22 · Z 22. (Süreler bu turun koşularından alındı, farklı yüklerde
ölçüldü.) C ve D, B'nin ilk senaryosunun sayfasını kullanır: `E2E_ONLY` ile koşarken B'yle birlikte verilmeli (`E2E_ONLY=B,C,C2,D`).
(Öncesi, animasyonlu kamerayla: base ≈9 dk, AI ≈30 dk, birlikte ≈40 dk.)

Testler varsayılan olarak **"hareketi azalt" kipinde** koşar: her sayfa `reducedMotion: 'reduce'` ile açılır, kamera anında gider
(MapLibre süreyi 0'a çeker; panel kayması ve kaydırma da bu tercihe uyar). Animasyonun kendisini sınayan kontroller animasyonlu
açılır (base e2e bölüm 9'daki "hareket yumuşak" kontrolü: `open(…, { reducedMotion: 'no-preference' })`; AI e2e'de
`open(…, { animated: true })`); hepsini animasyonlu koşmak için `E2E_MOTION=full`. Bu kip beklemeyi azaltır ama yok etmez: süre
çoğunlukla yazılım GL'nin her durum değişikliğinde haritayı yeniden çizmesine, sayfa açılışlarına (~7–9 sn) ve gerçek
zamanlayıcılara (otomatik oynatma, akış) gider. Makine tek tarayıcı koşusuna göre ölçülmüştür; iki koşuyu birlikte çalıştırmayın.

`npm run e2e`, üretim derlemesini gerçek (başsız) Chromium'da şu senaryoyla sınar (ekran görüntüleri ve `RAPOR.md` yalnızca
`E2E_SHOTS=1` ile `docs/verification/` altına yazılır; oradaki görüntüler son `E2E_SHOTS=1` koşusundan kalmadır):

0. Açılış: uygulama savaş yıllarında açılır (aralık 1939–1945, sınır yılı 1942) ve açılıştan sonra başlıkta "yükleniyor…" kalmaz.
1. 1940–1944 aralığında (sınır yılı 1942) Almanya'da bir nokta → **Nazi Almanyası** vurgulanır, çizelgede yalnızca bu aralıktaki Alman
   olayları görünür (aralığın hemen dışındakiler, Polonya'nın işgali 1939 ve Berlin Muharebesi 1945 yok); yer seçilince dünya olayları
   haritadan çekilir (anlatıcı seçili yerdir).
2. Sovyetler Birliği'nde bir nokta → **Sovyetler Birliği** görünür; **harita kamerası (merkez, yakınlaştırma, açı) birebir aynı kalır.**
3. Aralık 1938–1942 → haritanın olay kümesi (veri), aralıktan bağımsız hesaplanan kümeyle birebir aynıdır; yer bırakılınca haritadaki
   işaretçiler bu kümenin görünen kısmıdır.
4. Başlık haritanın üstündeki şeritte, küçük ve "SEÇİLİ YER" etiketsizdir; devlet tonlarının hepsi belirgin renklidir (gri ya da kum
   gibi değil), mavi serbesttir ama denizin renginden ayrışır ve deniz tek düz açık mavidir (CSS belirteçleri, harita boya ifadesi ve ekranda
   çizilmiş devlet pikselleri ölçülür); alt bölüm ≈ 80 px'dir (ilk sürümde 286 px) ve çizelgede kalıcı olay
   adı yoktur (üzerine gelince ve dokununca görünür); seçili yer halkasız dolu bir noktadır ve çevresinde sönen ışıma vardır;
   tüm olay noktaları aynı şekil ve boyuttadır, renkleri lejanttaki türüyle birebir aynıdır; lejant başlıksızdır ve yalnızca
   renkleri anlatır.
5. Çin'e yakınlaşıp çizelgeden Stalingrad'ı (1942) seçmek → harita, kareler boyunca yumuşakça (atlamadan, tek yönde) ve yalnızca
   gerektiği kadar uzaklaşır; önceki görünüm yenisinin içinde kalır; işaretçi vurgulanır; panelde olay odakta, yer tek
   satırlık başlıktadır; başlığa tıklamak, ✕ ya da `Esc` yer görünümüne döndürür ve haritayı oynatmaz. Yakınlaştırma bütçesi
   yüzünden çizilmeyen olaylar seçilince çizilir. Harita-öncelikli düzende bu senaryo, açılış kartı ve yer kartı haritanın bir köşesini
   örttüğü için kartları ✕ ile kapatarak ilerler.

6. **1800–2000.** Sınırlar yıl penceresiyle gelir: 1800–1806'da (ilk yıllar) Paris "Fransa Konsolosluğu"dur ve vurgusu pencereli kaynaktan
   çizilir; 1803'ten 1942'ye uzun bir sıçramadan sonra pencere gelir ve başlıkta "yükleniyor…" kalmaz (aynı nokta artık Nazi
   Almanyası'dır); son yıllar (1994–2000), verinin son (2000) ve ilk (1800) yılı gösterilir; 200 yıllık aralıkta sınır yılı uçtan uca gezdirilir.

Ek olarak: işaretçi/çizelge/deniz tıklamalarının haritayı oynatmadığı (görünür bir olayı açmak dahil), haritanın olay kümesinin
yerden bağımsız olduğu (çizilip çizilmemesi anlatıcıya bağlıdır), düzenin kaymadığı, cetvelin fare ve klavyeyle çalıştığı ve (duyarlılık sınaması olarak) gerçek bir sürüklemenin kamerayı
**gerçekten** hareket ettirdiği denetlenir. Ayrı sayfa yüklemelerinde ayrıca: bozuk bağlantıların uygulamayı çökertmediği, kameranın
adrese yalnızca kullanıcı oynattıktan sonra girdiği, yapıştırılan bağlantının bekleyen bir adres yazımıyla ezilmediği,
işaretçilerin tek Tab durağı olduğu ve ok tuşlarının haritayı kaydırmadan gezdirdiği, ipucunun fareyle işaretçiye gelince
kaybolmadığı, cetvelde uca tıklamanın pencereyi küçültmediği, ekran okuyucu durum satırının çalıştığı, dar pencerede tekerleğin
yakınlaştırdığı, telefon genişliğinde taşma olmadığı, dokunuşun olayı açıp adını gösterdiği (ve ekranda ipucu bırakmadığı) ve
"hareketi azalt" tercihinde görünümün animasyonsuz değiştiği denetlenir.

7. **Düzeltme katmanı (bölüm 12).** İşgal altındaki ülke işgal olarak adlanır: Varşova 1942'de başlıkta ve kartta "Polonya · Alman işgali",
   kartta işgal notu ("bu bir işgaldir, bir devlet değişikliği değil"), haritada Polonya'nın üstünde adı ve altında "(Alman işgali)" (poligon
   yine Nazi Almanyası'nın, vurgulanan çerçeve de); Almanya'nın kendisi (Hamburg) işgal değildir; işgalcinin sözcüğü yılın sahibini izler
   (Atina 1942'de "İtalyan", 1944'te "Alman işgali"); Paris 1942'de "Fransa · Alman işgali", 1939'da yalnızca Fransa; **Berlin 1945'te
   hâlâ Nazi Almanyası** (sınır yılı 1945, haritada en üstte çizilen devlet o); Singapur 1943'te "Singapur · Japon işgali", 1941'de ve
   1946'da İngiliz.

Bu turda tam takım (`npm run full`) koşulmadı (kural gereği). Son ağaçta `npm run smoke` (698 birim testi, base 39 + AI 145 denetim)
ve değişikliği kapsayan gruplar geçti: **base bölüm 0–12'nin hepsi, 166 / 166 denetim** (bölüm 8'in renk denetimleri yeni renk kuralına
göre yazıldı: mavi serbest, deniz tek düz açık mavi) ve **AI e2e'nin 26 grubunun hepsi, 512 denetim** (artı her koşuda bir "konsolda
hata yok" denetimi). Bu turda e2e'nin bulduğu ve düzeltilen gerçek uygulama hataları: (1) yanıt kapanıp okur haritayı normal dünyaya
getirince "dünya iki kez" görünümü geri dönmüyordu (`MapView.setAiFrame(null)`); (2) zaman çizelgesindeki sahne noktaları yıl
yazılarını yarım örtüyordu (artık noktanın altında kalan yıl yazısı çizilmez); (3) etkin (büyük) sahne noktası şeridin ucunda 2,5 px
taşıyordu (artık içeri çekilir). Geri kalan düzeltmeler denetimlerin kendisindeydi (yeni görsel dile ve vuruşlara göre beklentiler).

### Okuma arkadaşı ve temiz harita: `npm run e2e:ai`

Gerçek Chromium'da, komut dosyalı sağlayıcıyla (gerçek model yok; araç çağrıları ve akış gerçek bir yanıttaki gibi çalışır) şunları
sınar (`ai-*.png` ve `AI-RAPOR.md` yalnızca `E2E_SHOTS=1` ile yazılır; gruplar raporda aynı harflerle başlar; `E2E_ONLY=A3,K`
yalnızca o grupları çalıştırır, `E2E_SUITE=smoke` (ya da `--smoke`) hızlı kipi, `E2E_TIMES=1` her senaryonun süresini,
`E2E_VERBOSE=1` duran bir senaryonun hatasını tam yazar). Senaryo, uygulamanın açıldığı dönemdedir: **1800–2000,
savaş yılları** (aralık 1939–1945, sınırlar 1942'nin). Örnek yer Almanya'da bir noktadır (Hamburg: üstünde olay işaretçisi olmayan boş
kara; Berlin, Wannsee'nin işaretçisinin tam altındadır) ve **Nazi Almanyası**dır; komut dosyalı model onu **sekiz sahnede, on yedi
vuruşta** anlatır (1939'da "Savaş başlıyor"dan 1945'te Berlin'e; dördüncüde Barbarossa, altıncıda Stalingrad ve El Alamein). Betikler her
sahneyi **vuruş vuruş** denetlemek için sahneyi bir cümlede tutar (`presentation.replayBeat`) ve sonunu da (`complete`) okur; bu, bir okurun
cümleye tıklamasıyla aynıdır. Olay sayıları, satır sayıları ve yer çizelgesinin uzunluğu sayfadan sayılır, betikte sabit sayı yoktur.

1. **P. Renkler (ekran görüntüsünden okunur).** Stilin istediği renk değil, haritanın **gerçekten gösterdiği** renk ölçülür: harita
   görüntüsü (üstündeki her şey gizlenmiş) bir ızgarada örneklenir, her örneğin hangi devletin içinde olduğu sorulur (yedi görünüm:
   1939–1945'te dünya, Avrupa, Doğu Asya, Hindistan–İran; palet 200 yıla dağıtıldığı için Avrupa 1910–1916, Afrika 1960–1966 ve Avrasya
   1990–1996 da; 259 devlet rengi): hiçbiri gri/grimsi değildir (OKLCH doygunluğu ≥ 0,07; ölçülen en düşüğü 0,093); komşu devletler
   birbirinden ayrışır (her devletin iç rengi karşılaştırılır; ΔE ≥ 8, paletin en yakın çifti 8,9); **mavi artık serbesttir** (eski
   "hiçbir renk mavi değil" denetimi kalktı); **deniz tek düz açık mavidir** (deniz örneklerinin %99'undan fazlası `--sea` renginde,
   degrade yok). Anlatımda her sahnenin sonunda boyalı devletlerin pikselleri **aktörünün renginde** (tam dolgun, saydam değil; odak mavi:
   ton 254°), geri kalanı kâğıt örtüyle solmuştur; aktör renkleri birbirinden ΔE ≥ 20 ayrışır; deniz anlatımda da tek düz (örtüyle solmuş)
   renktir. (Toprak değişiminin vurgusu kalkana kadar beklenir: vurgu renkleri bozar.)
2. **L. Düzen ve açılış.** Uygulama savaş yıllarında açılır (aralık 1939–1945, sınır yılı 1942) ve başlıkta "yükleniyor…" kalmaz. Harita
   ekranın %85'inden fazlası ve sayfa kaymaz; üstte tek ince çubuk, altta ≤ 84 px zaman çizelgesi, soru kutusu onun hemen üstünde ve
   ortada; bilgi kartı sağda, 340 px'ten dar, haritanın yarısından küçük, ✕ ve `Esc` ile kapanır, yer seçmek haritayı oynatmaz; kısa
   tutulur (ayrıntılar kapalı bölümlerde); soru sorulunca kart kendiliğinden sekmeye çekilir (yer seçili kalır), sekme kartı geri
   getirir, yanıt kapanınca kart kendiliğinden döner.
3. **S. Sınırlar yıl penceresiyle gelir.** Açılışta (1990–1996) ve her yıl değişiminden sonra (1939–1945'e, 1900–1906'ya uzak sıçramalar,
   yapıştırılan bir bağlantı `#t=1960-1966`, cetvelde bir tıklama, 60 ms arayla art arda beş değişiklik, 2000 ve 1800) başlıktaki
   "· yükleniyor…" kalkar, `bordersReady()` doğrudur, başlıktaki yıl gösterilen yıldır ve Paris'te çizilen devlet satırın devletidir;
   sonda hiçbir şey takılı kalmaz.
4. **A. İzle: Almanya, 1942.** Almanya'da bir nokta → **Nazi Almanyası**, 1942'nin sınırları, anlatım. **Yer seçilince dünya olayları
   haritadan çekilir** (çizelgede dururlar, not nedenini söyler). **İzle, uzun metinler bitmeden başlar** (ilk altyazı ve "Metin
   yazılıyor…"). **Her sahne vuruş vuruş denetlenir** (sekiz sahne, on yedi vuruş, sekiz sahne sonu): her vuruşta harita yalnızca o vuruşa
   kadar anlatılanı gösterir (o vuruşun olayı tam işaret, öncekiler **numaralı küçük nokta**, o vuruşun okları, vurgusu, taraflar ve renkleri,
   sınır yılı, altyazıda oynayan cümlenin vurgusu); **kamera vuruşlar sürerken yerinde kalır**; etiketler örtüşmez; olay işaretlerinin
   yanında ad kutusu yoktur; **olaydan başkente ya da taraflar arasında çizgi yoktur**. 1. sahne ("Savaş başlıyor"): Molotov–Ribbentrop
   işareti ve taraflar (Almanya mavi, Polonya karşıt renk; Sovyetler, Britanya ve Fransa tarafsız); Polonya saldırısının **iki oku
   Almanya'nın sınırından çıkar** (Berlin'den değil: ilk durak Berlin'e 150 km'den uzak, Varşova ve Kraków'a varır); Britanya ve Fransa
   savaş ilan edince ikisi Polonya'nın rengine geçer; Kızıl Ordu'nun oku Sovyet sınırından (Moskova'dan değil) Lviv'e gider ve **Sovyetler
   Birliği'nin 1939'dan 1940'a kazandığı toprak haritada belirir** (kazanılan ve kaybedilen alan devletin renginde; sınırlar sessizce
   değişmez), taraflar üçe çıkar. 2. sahnede Fransa Muharebesi **1939'un sınırlarında** (Fransa Üçüncü Cumhuriyeti veride 1939'a kadar);
   4. sahnede Mihver ve ortakları ile Sovyetler iki blok, Britanya boyanmaz (son `sides` çağrısı adını anmadı) ve Alman ilerleyişi
   cepheden Moskova'ya dört duraklı bir oktur; 6. sahnede Stalingrad ve El Alamein (2 numaralı nokta); 7. sahnede geri çekilme oku; 8. sahnede
   Berlin 1945: sahne 1944'ün sınırlarıyla açılır, teslim cümlesinde **1945'e geçer ve Almanya'nın yitirdiği toprak gösterilir** (veri
   setinde Nazi Almanyası'nın satırları 1944'te biter; düzeltme katmanı 1938 sınırlarını 1945'e taşır). **Sahne sonunda** tüm olaylar
   numaralı noktadır, ok yoktur, toprak sonucu ve renkler kalır. **Renkler aktörlerindir:** Almanya her sahnede odak mavisi, Britanya
   boyandığı her sahnede aynı karşıt renk, iki karşıt taraf hiçbir yerde aynı rengi paylaşmaz. Kamera sahnenin **adlandırdığı her yeri**
   (olaylar, işaretler, okların durakları) ve işaret edilen ya da boyanan devletlerin **o yerlerin çevresindeki parçalarını**,
   bütün vuruşlarıyla, altyazının ve soru kutusunun **üstündeki** görünür alana bir kez sığdırır (devletin bütün toprağını değil:
   sömürgeler, Alaska, Grönland kadraja girmez; devlet kutularının ≥ %75'i görünür). Altyazı her sahnede aynı yerde ve modelin `step`
   çağrısındaki altyazıdır; önceki sahnelere dönmek o sahnenin **sonunu aynen** getirir; sahne kapanınca toprak vurgusu da kalkar.
5. **V. İzle'de gezinme.** **Sonraki ve Önceki iki aşamalıdır:** sahne oynarken *Sonraki* sahnenin sonunu, ikinci basış sonraki sahneyi
   başından gösterir; sahnenin başındayken *Önceki* bir önceki sahneyi bittiği hâliyle, bitmiş bir sahnede sahneyi başa sarar (uçlarda
   kapanır). `←/→/Home/End` aynı iki aşamayı izler (metin kutusunda ve haritada odak varken yalnızca yazı imleci / sahne; harita kaymaz);
   sekiz sahneyi baştan sona ve sondan başa gezmek (her sahne için iki basış) her durumda sayacı, başlığı, altyazıyı, çizimi, sınır yılını
   ve tarafları denetler. **Zaman çizelgesi ilerleme çubuğudur:** sahne noktaları **alttaki yakınlaştırılmış şeritte** (çizelgenin içinde;
   üstteki 1800–2000 cetvelinde hiçbiri yok), anlatıdaki tarihlerinde (her biri kendi tarihinden ≤ 24 px), soldan sağa sıralı, numaraları
   görünür (≥ 15 px), görülenler dolu ve ilkinden etkin olana bir çizgi uzanır; bir noktaya tıklamak o sahneyi başından başlatır ve okurun
   aralığına dokunmaz. **Cümleler kendiliğinden oynar:** *Oynat* kapalıyken de tek cümlelik bir sahne okunma süresi kadar sürüp biter ve
   sonunda okuru bekler; *Oynat* açıkken bitince kısa bir beklemeden sonra sonraki sahne başlar; hız değişince bekleme yeniden ölçülür;
   duraklat ve elle gezinme oynatmayı durdurur; son sahnenin cümleleri de oynar ve oynatma orada biter (başa dönmez), sonda yeniden *Oynat*
   baştan oynatır.
6. **T. Çizelge.** Yer çizelgesi **yalnızca seçili aralığı** gösterir (1939–1945 ve 1942–1944; cetvel tutamaçları klavyeyle daraltılınca
   çizelge de izler): yıl etiketlerinin hepsi aralıkta ve yerleri aralığa göre, her olay noktası aralıkla kesişir (dışarıdan olay yok;
   aralıktan önce başlayan İspanya İç Savaşı ve Leningrad kuşatması sol kenarda tam bir nokta olarak durur), egemenlik şeridi ve imleç
   aralığın içinde, "bağlam" bandı yok. **Sahne noktaları alttaki şeritte** (üç aralıkta: 1939–1945'te sekiz, 1942–1944'te beş,
   1931–1945'te sekiz nokta; hiçbiri 1800–2000 cetvelinde değil) tarihlerinde ve sıralı durur, çizelgenin ve dock'un dışına taşmaz,
   birbirini örtmez; aralığın dışındaki bir tarih en yakın uca konur; **bir noktanın altında kalacak yıl yazısı çizilmez** (yarım kapalı
   yazı okunmaz).
7. **W. Oku.** *Metni oku*: yan panel (harita yine tam ekran, çizim panelin altında değil, soru kutusu panelin soluna çekilir); **okuyucuda
   sahneler bittiği hâliyle gösterilir** (dört olay numaralı nokta, ok yok, Sovyetler Birliği'nin kazandığı toprak, 1940 sınırları);
   **İzle'de sahnedeyken Oku'ya geçip geri dönmek sahneyi korur**; metni kaydırmak etkin sahneyi ve haritayı taşır; **tam ekran**: harita
   sağ üst köşede küçük bir pencere olur ve o anki sahnenin sonunu gösterir (görünüm dışı ve örtülü nokta yok; ad etiketi yok; yalnızca
   numaralı noktalar; pencere yalnızca küçük sahneleri tam tutabilir), metin sütunu pencereyle çakışmaz, metinde *Haritada göster* ve
   kaydırma pencereyi taşır, `Esc` adım adım kapatır, *Haritayı büyüt* geri döner; **okurken sorulan soru haritayı (ya da küçük
   pencereyi) arka planda günceller** (yanıtın sahnesi bittiği hâliyle: serbest işaret adsız numaralı nokta); yan panel ↔ tam ekran
   geçişinde etkin sahne okuma konumunda kalır. (Haritanın doğu sınırı 179,9°D olduğu için, yan panelin altında kalan en doğu — Japonya,
   Çukotka — kameradan kaçamaz; bu sahneler "okurken harita" denetimlerine alınmaz.)
8. **R. Olay adları.** Haritadaki bir olay işaretinin adı yalnızca üzerine gelince görünür (yanında ad kutusu yok). Altyazıda ve
   metinde verideki olayların adları **tıklanabilir bağlantıdır** (altı noktalı çizili, işaretçi imleç; `[ad](olay:kimlik)` işareti
   görünmez; sekiz altyazının hepsi ve her adımın metni). Altyazıdan, yan panelden ve tam ekran metinden bir olay adına tıklamak,
   çizelgedeki o olayın noktasına tıklamakla **birebir aynı durumu** verir (açık olay, kart ve yeri, işaretçiler, soru kutusundaki çip,
   adım ve görünüm); başka bir ada tıklamak olayı değiştirir, aynı ada bir daha tıklamak kapatır; metindeki bir bağlantı olayı açar ama
   adımı ve sahnesini korur; tek adımlı Stalingrad yanıtının altyazı bağlantısı da aynısını yapar; bir bağlantıya tıklayıp `Esc`'e basıp
   hemen boyut değiştirmek okunan adımı oynatmaz (bu sınama sırasında bulunan bir hata).
9. **B. Her yanıtın altyazısı ve tam metni var.** Bir şeyi soran soru (Almanya–İtalya ittifakı; Stalingrad) **tek sahneli** yanıt alır:
   `[data-testid=watch][data-steps="1"]`, altyazı haritanın üstünde ve soru kutusunun hemen üzerinde, sahne sayacı/oklar/oynat/hız yok,
   **"Devamını oku"** tam metni Oku'da açar (kapatınca altyazıya dönülür); altyazı iki cümle, yani iki vuruştur: ittifak sorusunda ilk
   cümlede Almanya ve İtalya "Çelik Pakt" adıyla odak renginde boyanır (aralarında çizgi yok), ikincisinde Üçlü Pakt'ın işareti gelir ve
   Japonya aynı tarafa katılır, sahne bitince işaret 2 numaralı nokta olur; Stalingrad'ın ilk cümlesinde yalnızca olayın işareti vardır
   (tarafları kendiliğinden öne çıkmaz), ikincisinde model iki tarafı vurgular ve işaret 1 numaralı nokta olur; altyazının ve kutunun
   yüksekliği "Devamını oku" göründüğünde değişmez (kamera çerçeveledikten sonra kutu büyümez; sınama sırasında bulunan bir hata).
   **Güvenlik ağı:** model düz metin yazarsa ("düz metin ver") altyazı metnin tamamı değil ilk bir iki cümlesidir (≤ ~220 karakter,
   metnin başıdır, metnin yarısından kısadır), "Devamını oku" görünür ve Oku'da üç paragrafın hepsi vardır.
10. **A2–A4. Harita takibi.** Kısa sürükleme ve bir kez `+` takibi kapatmaz; iki düzey yakınlaşma ya da haritanın üçte biri kadar
    sürükleme küçük bir soru getirir (haritanın %6'sından az, telefonda %22'sinden az, odağı çalmaz, iletişim kutusu değil; *Ayarlar ⚙ →
    Harita takibi* bağlantısı ayarı açıp satırı işaretler; en geniş görünümde sürükleme sınıra dayandığı için sınama önce sayfayı
    programla yakınlaştırır). *Bıraksın*: takip kapanır, çip çıkar, adım değişince kamera oynamaz; çip ya da *Geri aç* yeniden açar ve
    etkin adım hemen görünür kılınır. *İzlemeye devam*: o sohbette bir daha sorulmaz. Cevaplanmayan soru hiçbir şeye karar vermeden kalkar
    ve yeni bir uzak hareketten sonra döner. Ayar anahtarı aynı şeyi yapar; yeni sohbet takibi yeniden açar.
11. **J. Haritada tek anlatıcı.** Anlatıcı yoksa dünya olayları haritadadır ("11 / 44 olay haritada": sayılar veriden); **yanıt ekrana gelince
    ya da bir yer seçilince** hepsi çekilir, yalnızca yanıtın adını andığı olay kalır (sahne bittiğinde: Stalingrad zaten haritadaydı, Üçlü
    Pakt değildi ama tek başına gelir; çizelge aynen kalır, not nedenini söyler); çizelgeden ya da karttaki listeden tıklanan olay (yerel
    bir olay dahil: Anne Frank) açık kaldığı sürece haritadadır, kapanınca çekilir; yer bırakılınca ve yanıt kapanınca dünya olayları döner
    (kamera yanıtın çerçevesinde kaldığı için küme o görünüme göredir). Bir sahne bir olaydan söz ederse haritada yalnızca o olayın kendi
    işareti olur (cümle oynarken tam işaret: yıl yazılı, düğme; adı hover'da, tıklayınca kart). Model verideki bir olay için `mark`
    çağırırsa (Belgrad) olayın kendi işaretine çevrilir; veride olmayan bir yer (Smolensk) serbest işaret olarak kalır (cümle oynarken
    etiketli eşkenar dörtgen; sonra numaralı nokta).
12. **C, C2, D.** Yanıt ekrandayken olaya tıklamak: kart sağda açılır (yanıtı ve soru kutusunu örtmez), işaretçisi haritaya gelir;
    kapatınca (✕ ya da `Esc`) yanıt yerinde kalır, kart sekmeye döner; *Bunu sohbette sor* olayı soruya ekler ve yanıtta olayın kendi işareti
    çizilir (Barbarossa: olayın yılı; tarafları kendiliğinden öne çıkmaz, çizgi çekilmez). Yanıt yokken olay kartı sağda
    açılır; `Esc` sırası: olay, yanıt, yer. Sohbet sürerken yer ya da aralık değişince metinde "Bağlam değişti" ayırıcısı çıkar (ikinci yer
    Moskova), güncellenir, geri dönülünce kalkar ve model "Konu değişti"yi öğrenir.
13. **F. Metnin sonu.** Tam ekran okumada, yan panelde, dar pencerede (1024×700) ve telefonda metni sonuna kadar kaydırınca son satır
    soru kutusu yığınının (not, olay çipi, kutu) üstünde kalır ve hiçbir şey onu örtmez; olay açıkken de; Almanya anlatımının son adımı ve
    tek adımlı düz metin yanıtı (en uzun tek adımlı metin) için.
14. **K. Etiketler örtüşmez:** her sahnenin ok oynayan vuruşları, son vuruşları ve sonu (19 an) × 3 kamera (çerçeve, yakınlaştırılmış,
    uzaklaştırılmış) × 2 ekran boyunda ne bir etiket bir etiketi, ne bir işaretçiyi ya da numaralı noktayı, ne yer noktasını, ne bir devlet
    adını, ne haritanın kontrollerini örter (sayfada ölçülür; bin iki yüz kadar etiket benzeri öğe sayılır); ek olarak yapay zekânın
    kendi `mark` etiketi ve okunun etiketi için kalabalık bir vuruş (ilk olayın noktası, ikinci olay, ilerleyiş oku ve etiketi, serbest
    işaret ve etiketi) ve Çelik Pakt yanıtı (haritada yapay zekâ etiketi yok: taraflar altyazının altında).
15. **E. Durdurma, hatalar, ayarlar:** Durdur (adımlar ve yazılan kısım kalır; tek adımlı yanıtta altyazı, "Devamını oku" ve "Durduruldu ·
    Yeniden dene" kalır), hata ekranları ve "Yeniden dene" (tek istek), `not_granted`, kalıcı hata (`sampling_disabled`: izin düğmesi ve
    yeniden deneme yok), hız ayarı (soru kutusunun üstündeki menü: Hızlı / Dengeli / Derin, tarayıcıda saklanır; saklanamazsa bozulmaz),
    **"Sohbeti temizle" her zaman görünür** (ayar menüsü kapalıyken de), yazışma varken etkin; basınca yazışmayı, yanıtı ve çizimi siler
    (yanıt sürerken de).
16. **G. Gerçek `sample` bağdaştırıcısı**, tarayıcıda sahte bir artifact çalışma zamanıyla: **ilk tur, yönerge dosyasıyla birebir
    başlar**; yedi araç, önem sırasıyla (`step`, `show_event`, `highlight`, `sides`, `route`, `territory_change`, `mark`; kamera ya da
    görünüş aracı yok, olaydan başkente çizgi çeken `connect` yok) ve `step` aracının numara + başlık + altyazı (+ isteğe bağlı yıl)
    istemesi; sayfa notlarında yalnızca biçim (iki tur, "## n. Başlık", olay işareti, içeriksiz biçim örneği) ve **anlatım kuralı,
    iskelet ya da "araç ne zaman" kuralı yok**; **"Bu yerin tarihini anlat" isteği** seçilen noktayı (derece olarak) ve o yılın
    sınırlarında bu noktayı içeren devleti birlikte söyler, hangisine odaklanılacağını söylemeden (metin birebir denetlenir);
    anlatım isteğinin öteki isteklerle aynı biçimde gitmesi (olay listesi aralıktaki bütün olayları kimlikleriyle bilgi olarak verir);
    `cache` gönderilmemesi; **konuşmanın tamamının her çağrıyla gitmesi** (önceki soru, önceki yanıtın tam metni ve o yanıtın haritada ne
    gösterdiği; tek adımlı yanıt "1. adım:" olmadan), "Sohbeti temizle"den sonra hiçbir şeyin gitmemesi; `modelTier`; metin
    tutulurken (yalnızca plan geldiğinde) İzle'nin başlaması (tek adımlı yanıtta "Devamını oku"nun yeri ayrılmıştır ama gizlidir,
    metin gelince görünür, kutu ve kamera oynamaz); **düz metin yazan model** (araç çağrısı yok, başlık yok): altyazı ilk cümleler,
    "Devamını oku", Oku'da üç paragraf; araçsız ortamda "yalnızca metin" notu; `not_granted` / `rate_limited` ve `permissions.manage`
    düğmesi.
17. **H. Telefon:** harita tüm sahne (yatay taşma yok), bilgi kartı üstte küçük bir sayfa, altyazı ve soru kutusu altta (kontroller tek
    satırda ve kutudan taşmadan, düğmeler ≥ 30 px), yakınlaştırma düğmeleri ve sayaç bu sütunun üstünde; metin tam ekran, küçük harita
    başlığın altında ve adım korunur; tek adımlı yanıtta altyazı ve görünür "Devamını oku", adım denetimi yok; hata ve izin kutuları
    ekranın içinde; Harita takibi sorusu telefonda küçük kalır.
18. **Y. Yerler, yollar ve taraflar** (sahte çalışma zamanıyla; model yerleri adlarıyla söyler): okun uçları ve duraklar **yerdir**
    ("Stalingrad" ve "Danzig" eski adlardır; ok bugünkü Volgograd'ın ve Gdańsk'ın noktalarında başlar ve biter, devletlerin ortasında
    değil); dört yol türünün (ilerleyiş, geri çekilme, göç, ticaret yolu) çizgi deseni, kalınlığı ve ok ucu birbirinden farklıdır, ok
    **son duraktadır** ve yolun gittiği yönü gösterir, etiketler örtüşmez, kamera her durağı sığdırır; **canlandırılması istenen yol**
    "hareketi azalt"ta hiç canlanmaz ve baştan sona görünür, hareket serbestken çizilerek belirir (animasyon yarıda durdurulup ekran
    görüntüsünde çizginin yalnızca başı göründüğü, bitince hepsi göründüğü ölçülür: maske yolu kapatmaz); **taraflar** (en çok üç blok ve
    tarafsızlar) tek blok olarak, aktörünün renginde boyanır (ekran görüntüsünden: boyalı örneklerin %95'inden fazlası tarafının
    renginde, iki taraf birbirinden ΔE ≥ 20), adları renkleriyle anlatım kutusundadır ve taraf bildirmeyen sahneye dönünce boyama ve kutu
    gider; "Mihver ve Müttefikler kimdi?" sorusu tek adımlı bir yanıtla bu iki bloğu, ikinci cümlede kenarda kalanları (İsveç, İsviçre,
    Türkiye: taramalı) gösterir.
19. **N. Olay sahneleri** (sınırlar olayın başlangıcında, kamera sahnenin yerlerinde): "Fransa 1940" sahnesinde olay Mayıs 1940'ta
    başlar ama haritada **1939'un sınırları** vardır (Fransa Üçüncü Cumhuriyeti veride 1939'a kadar); ikinci cümlede model Fransa ve
    Birleşik Krallık'ı vurgular (olayın tarafları kendiliğinden öne çıkmaz, olaydan başkente çizgi çekilmez); kamera Batı Avrupa'yı
    çerçeveler (yakınlaştırma ≥ 3,8; dünya görünümü ≈ 2), Paris ve Londra görünür alandadır, sömürgeler kadraja girmez. "Normandiya"
    sahnesinde ikinci cümlede Birleşik Krallık, ABD ve Almanya vurgulanır ama ABD'nin toprağından hiçbir parça kadraja girmez (Alaska ve
    Grönland yüzünden dünyaya uzaklaşılmaz); kamera yine Batı Avrupa'dadır. (Ayrıca A grubunda 2. sahne aynı sınırı ve çizgisizliği, T
    grubunda adım noktaları aralığın içinde kalmayı sınar.)
20. **M. Vuruşlar** (altyazının her cümlesi bir vuruştur): sahne **kendiliğinden** başlar (Oynat kapalıyken de) ve cümleler okuma hızında
    oynar: oynayan cümle işaretleyici zeminde, gelecekler solgun, okunanlar normal; süre sözcük sayısından hesaplanır (hız ayarı
    uygulanır) ve ölçülen süre hesaplanana yakındır. **Biten vuruşun oku söner, işareti küçük numaralı
    noktaya döner**, sahne bitince tüm olaylar numaralı nokta, ok yok ve bütün cümleler okunmuştur; *Oynat* kapalıyken sahne
    bitince okuru bekler (bekleme süresi dolsa da sonda kalır). **Bir cümleye tıklamak** o vuruşu yeniden oynatır (oku yeniden çizilir,
    işareti yeniden tam işaret) ve orada **tutar** (süre geçse de ilerlemez); aynı cümleye bir daha tıklamak baştan oynatır, *Oynat*
    tutulan cümleden devam ettirir. Hareket serbestken biten vuruşun oku hemen silinmez, solar (`.is-leaving`) ve bir an sonra kalkar;
    **kamera vuruşlar arasında oynamaz** (sahnenin başında bir kez çerçevelenir).
21. **Q. Değişim hep görünür:** anlatım sınırların yılını sahneden sahneye değiştirdiğinde (2. sahne 1939, 3. sahne 1940) o aralıktaki
    toprak değişimi, görünümde kalan kısmıyla, haritada **bir an vurgulanır** (`terr-*` katmanları: hareketi azaltta sabit, birkaç
    saniye; hareket serbestken yumuşak) ve kendiliğinden kalkar; öncesinde sessizdir; anlatım kapanınca vurgu da kalkar. (Toprak değişimi
    aracının kendisi A grubunda sahne sahne denetlenir: 1. sahnede Sovyetler Birliği'nin 1939'dan 1940'a, 8. sahnede Almanya'nın 1944'ten
    1945'e değişimi.)
22. **Z. Tarih değişim çizgisi:** model Tokyo'dan Pearl Harbor'a ok çekince çizgi **kısa yoldan** gider (62° boylam farkı; ikinci durak
    ≈ 202°D, −158° değil), harita sahne boyunca **dünyayı iki kez gösterir** (geniş görünüm) ve kamera iki ucu birlikte altyazının ve soru
    kutusunun üstündeki görünür alana sığdırır, olay işareti dünya kopyasındaki yerinde görünür, hiçbir etiket başka bir etiketi
    örtmez; okur haritayı normal dünyaya (±179,9° içine) getirince geniş görünüm kapanır ve sınırlar eskisi gibi bir kez çizilir.

Bu turda (sabit görsel dil, ilişki kipi, vuruşlar, toprak değişimi, tarih değişim çizgisi, çizelge şeridindeki sahne noktaları) tam
takım koşulmadı; doğrulama kuralı gereği smoke ve değişikliği kapsayan gruplar koşuldu ve hepsi geçti: **AI e2e'nin 26 grubu, 512
denetim** (L 17 · S 13 · A 94 · V 34 · W 30 · A2 3 · A3 19 · A4 4 · B 29 · C 13 · C2 6 · D 10 · J 24 · K 6 · P 8 · R 25 · T 19 · F 20 ·
E 30 · G 45 · H 18 · Y 20 · N 4 · M 13 · Q 3 · Z 5; sonuncuları bu turda eklenen M, Q ve Z). Son tam AI koşusu iki tur önce
yapıldı (tüm gruplar, hareket azaltılmış kip, 24 dk 51 sn).

**Neyi sınamıyor:** gerçek bir modelin istemi ne kadar iyi izlediğini. Gerçek `sample` bu ortamdan çağrılamaz; model çıktısı biçimine
karşı bağışlayıcı okunur (yukarıya bakın) ama ilk gerçek kullanımda gözle bakılmalıdır.

## Bilinen sınırlar ve sonraki adımlar

- Karşılaştırma modu henüz yok (veri yapıları ve panel yapısı hazır; yukarıya bakın).
- **1800–2000 senaryolarının bulduğu, düzeltilmeyen sınırlar** (`npm run e2e:ai` bunları sözleriyle denetimlere yazar):
  haritanın doğu sınırı 179,9°D olduğu için yan okuyucu panelin altında kalan en doğudaki içerik (Japonya, Çukotka) kameradan
  kaçamaz (tarih değişim çizgisini aşan bir sahne hariç: orada harita geçici olarak dünyayı iki kez gösterir); birbirinden çok uzak
  yerler arasındaki bir ok (Pasifik'te Tokyo–Pearl Harbor, Atlantik'te Londra–Washington) kamerayı iki ucu birlikte sığdırmak için
  uzaklaştırır ve devlet kutuları en küçük yakınlaştırmada tümüyle sığmaz (kamera sahnenin adlandırdığı her yeri garanti eder; işaret
  edilen devletin kutusunun en az %75'ini gösterir); yer noktası bazen bir olay işaretinin yıl yazısına biner (Hamburg ve Dover);
  haritaya hiçbir şey çizmeyen (düz metin) bir yanıt, yer seçili değilken dünya olaylarını yanıt kapanana kadar haritadan çeker (tek
  anlatıcı kuralı) ve daha önce çizilmiş bir sahnenin üstüne gelirse o sahneyi olduğu gibi bırakır.
- Okuma arkadaşı: gerçek model çıktısı bu ortamda sınanamadı (yukarıya bakın); serbest bırakılan modelin anlatımlarının derinliği
  (ör. Nazi Almanyası 1931–1945) ve yeni görsel dilin (vuruşlar, taraf renkleri, toprak değişimi) gerçek bir modelle nasıl göründüğü ilk
  gerçek kullanımda gözle bakılmalı, gözlenen her sorun için kural teker teker geri eklenmeli (yukarıdaki kaldırılanlar tablosu).
  Zaman çizelgesindeki sahne noktaları tarihlerinde durur; aralık çok genişse ve sahneler birkaç yıla toplanmışsa noktalar küçülür
  (15 px'ten 7 px'e), tarihlerinden en az kayarak açılır ve yine sığmazsa üst üste biner. Gezinme için İzle'nin düğmeleri ve oklar
  zaten vardır (testler de telefonda öyle gezer). Yönerge dosyasını düzenlemek uygulamayı yeniden derlemeyi ve yeniden yayınlamayı
  gerektirir (dosya derlemede gömülür). Vuruşların süresi (cümle başına 1,1 sn + sözcük başına 0,33 sn, en az 2,4 en çok 11 sn;
  sahnenin ilk cümlesine 0,9 sn; sahneler arası 1,6 sn; hızlar 0,65 / 1 / 1,8) ve nokta boyları ilk sürümün varsayılanlarıdır
  (`src/ai/presentation.ts` ve `src/domain/spread.ts` başındaki sabitler); gerçek kullanımda ayarlanması gerekebilir. **Sesli
  okuma yok:** bir vuruşun ne zaman bittiğini `Pacer` söyler (şimdi okuma süresi), sesli okuma eklenirse cümlenin okunup bittiği an
  olur. Yüklenmiş belge kaynağı henüz yok.
- **Yerler, yollar, taraflar.** Başkent tablosu elle derlendi ve makalelerle tek tek karşılaştırılamadı; 131 devletin başkenti yoktur
  (bir yol durağı olarak o devlet söylenirse nokta, devletin en büyük parçasının ortasıdır; model "sınır: devlet → yer" ile cepheyi de
  söyleyebilir). Bir yolun en çok 8 durağı, bir anlatımın en çok 3 tarafı (ve tarafsızlar) vardır; üçten fazla taraf boyanmaz; taraf
  kutusu yalnızca İzle'dedir (Oku'da yoktur). Bir şehir adı birden çok yere uyuyorsa en tanınmış olan seçilir ("Salamanca" İspanya'dakidir);
  göstergelik ~3.300 yerdir, Natural Earth'te olmayan küçük bir yer tanınmaz ve atlanır. İşgal adları "doğruluk turu" değildir: bazı
  ifadeler tartışmaya açıktır (Çin ve Çinhindi'si için "Japon işgali" kukla yönetimleri de kapsar; Lüksemburg ve Alsace-Lorraine fiilen
  ilhak edilmişti; Arnavutluk'un 1939'daki şahsi birliği bir işgal olarak adlandırılır; Zadar ve Rijeka "İtalyan işgali"dir) ve bazı
  işgaller **adlandırılmaz** (Macaristan 1944, Kuzey İtalya 1943–45, Libya ve Tunus'taki Mihver elleri, Mançurya, Slovakya, Hırvatistan
  Bağımsız Devleti, Baltık'ın 1940 Sovyet işgali; tam liste `corrections/ww2.json` içindeki `meta.knownGaps`). 1942 anlık görüntüsünde
  Burma, Java ve Sumatra hâlâ İngiliz ve Hollanda çizilir (veri yıl başındaki durumu gösterir gibidir); 1945'te Varşova ve Prag verinin
  kendi sahibinde (Sovyetler Birliği) kalır, 1946'dan sonraki işgal bölgeleri işgalcinin toprağı olarak çizilmeye devam eder.
- **Görsel dil, vuruşlar ve toprak değişimi (bu turun sınırları).** (1) **Sınır verisi yıllıktır:** bir yıl içindeki değişiklikler
  (Anschluss ile Sudetenland ikisi de 1938; Eylül 1939'daki iki işgal) ayrılamaz; `territory_change` iki *yıl* arasını karşılaştırır ve
  kazanılan ya da kaybedilen alanın tarihi o yıllardır, günü değil. (2) Toprak farkı bir ızgarada (uzun kenarda en çok 1600 hücre)
  hesaplanır: kıyı şeritleri ve çok küçük adalar farkta kaybolabilir; çok küçük serpinti hücreleri atılır. (3) **Yıl değişimi vurgusu**
  yalnızca yıl farkı ≤ 25 ve görünümdeki karanın %50'sinden azı el değiştiriyorsa gösterilir; bir toprak değişimi aracı o vuruşta zaten
  oynuyorsa ikinci bir vurgu yapılmaz; haritada hiç görünmeyen bir değişim vurgulanamaz. (4) **Tarih değişim çizgisi:** geniş görünüm
  (dünya iki kez) okur haritayı normal dünyaya getirene kadar sürer ve o sırada okur çizginin ötesine kaydırabilir. (5) **Tek vuruşlu
  sahne** bittiğinde olayın işareti de küçük numaralı bir noktaya döner: tek sahneli bir yanıt sonunda vurgusuz, küçük bir numaralı
  nokta bırakır (üstüne gelince adı görünür). (6) Bir cümleye tıklamak vuruşu orada tutar; sahne kendi başına bitmez, *Oynat* ya da
  *Sonraki* gerekir. (7) README'deki ekran görüntüleri bir önceki turdandır (görsel dil ve vuruşlar için yeniler `E2E_SHOTS=1` ile
  alınacak).
- Görünüm dışındaki bir olayı açınca harita yalnızca uzaklaşır; uzaklaşmak yetmezse (en geniş görünüm) merkezi olayı güvenli alana sokan
  en kısa yoldan kaydırır, sınırların dışına çıkmaz ve aynı olayı yeniden açmak haritayı bir daha oynatmaz (yukarıya bakın).
- Renk-körlüğü payı dardır: protan/deutan simülasyonunda iki kategori rengi arasındaki en küçük ΔE 7,7'dir (6–8 "uyarı" bandı).
  Renkler tek başına taşıyıcı değildir (lejant, ipucu ve kart kategoriyi sözle de söyler) ama bir olayın türünü yalnızca
  noktanın renginden okuyan renk-körü bir kullanıcı zeytin sarısı ile turuncuyu karıştırabilir.
- Haritada devlet seçimi yalnızca fare/dokunma ile yapılır; klavye ile devlet seçimi için bir arama kutusu eklenebilir.
- Karanlık tema yok (renkler `tokens.css`'te belirteç olarak duruyor).
- İlk yükleme ~15,6 MB sınır verisi indirir (ağda gzip ile ~4 MB; tek dosya sürümünde zaten dosyanın içindedir). Haritanın (iş parçacığındaki
  döşeme dizini) belleği yıl penceresiyle sınırlıdır; sayfanın JS belleği açılışta ~55 MB, bütün yıllar gezilince ~140 MB'tır (çözülen
  satırlar atılmaz). Daha uzun bir dönem (örneğin 1500–2000) için sınırlar yıl dilimlerine bölünüp ağdan istek üzerine alınmalıdır.
- Kod için lisans henüz seçilmedi; veri ve kütüphane atıfları için [`public/NOTICE.txt`](public/NOTICE.txt) dosyasına bakın.
