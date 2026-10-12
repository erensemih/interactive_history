# Aynı Zamanda

**Aynı sırada, dünyanın başka yerlerinde ne oluyordu?**

Bir bölgenin tarihini tek başına okumak, olayları birbirinden kopuk bir listeye çevirir. *Aynı Zamanda*, bu
soruyu kolay yanıtlamak için tasarlanmış, zamanı ön plana alan etkileşimli bir tarih haritasıdır. Kullanıcı iki şey
seçer: bir **zaman aralığı** (tek yıl, 5 yıl, 100 yıl; kararı kullanıcı verir) ve haritada bir **yer**.

- **Harita zamana bağlıdır ve herkes için aynıdır:** o dönemin siyasi sınırlarını ve dünyanın dört bir yanından bir
  olay seçkisini gösterir. Hangi yerin seçili olduğu haritanın *içeriğini* değiştirmez.
- **Zaman çizelgesi yere bağlıdır:** seçilen yerle doğrudan ilgili olayları, dünya tarihinde önemsiz olsalar bile,
  gösterir.

Bu ilk prototip, görsel dili ve etkileşimi oturtmak içindir; veri bilerek küçüktür (1400–1600, 72 olay).

![Anadolu, 1500](docs/verification/02-anadolu-1500.png)

| Çin seçili, aynı harita | Aralık 1450–1500 | Olay ayrıntısı |
|---|---|---|
| ![](docs/verification/03-cin-1500.png) | ![](docs/verification/04-aralik-1450-1500.png) | ![](docs/verification/05-olay-detayi.png) |

Çizelgeden görünüm dışındaki bir olay (Mohaç, 1526) seçilince harita yumuşakça, yalnızca gerektiği kadar uzaklaşır:

| Önce: Çin'e yakınlaşılmış | Sonra: Macaristan görünür, işaretçi vurgulu | Olay kapatılınca |
|---|---|---|
| ![](docs/verification/11-mohac-once-cin.png) | ![](docs/verification/12-mohac-sonra.png) | ![](docs/verification/13-olay-kapaninca.png) |

## Çalıştırma

En kolay yol **tek dosya sürümüdür**: sunucu da, kurulum da gerekmez.

```bash
npm install
npm run build:standalone   # → dist-standalone/ayni-zamanda.html (~11 MB)
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
npm run data:validate
```

Gerekenler: Node 20.19+ (22 önerilir). Veri hattını yeniden çalıştırmak için ayrıca Python 3 ve `shapely` gerekir;
uygulamanın kendisi Python'a ihtiyaç duymaz, çünkü üretilen veri depoda durur.

## Kullanım

| Ne yapmak istiyorsunuz | Nasıl |
|---|---|
| Zaman aralığını seçmek | Alttaki cetvelde aralık çubuğunu sürükleyin; kenarlarından sürükleyerek uzunluğunu ayarlayın; boş yere tıklarsanız aralık oraya taşınır. Başka denetim yoktur (yıl kutusu, hazır süre düğmesi yok). Klavyeyle: çubukta `←/→` 1 yıl, `Shift` ile 10 yıl, `Home/End` uçlara |
| Haritada hangi yılın sınırlarının çizildiğini seçmek | Aralığın içindeki küçük işareti (çizgi + nokta) sürükleyin (varsayılan: aralığın ortası). Seçili yıl, haritanın üstündeki başlıkta "… yılının sınırları" notunda yazar |
| Bir yeri seçmek | Haritada bir devletin üzerine tıklayın. **Harita yerinden oynamaz**: yalnızca sürükleme, tekerlek, çimdik ve `+/−` düğmeleri haritayı hareket ettirir (istisnalar aşağıda: görünüm dışındaki bir olayı açmak; bir yanıt ekrandayken, siz açık tutarsanız, *Harita takibi*). Sağdaki küçük bilgi kartı haritanın bir köşesini örter: ✕ ile kapatın |
| Bir olayı okumak | Haritadaki işaretçiye, çizelgedeki noktaya ya da kartın *Aynı sırada, başka yerlerde* bölümüne tıklayın (bir yanıt ekrandayken olay işaretçileri haritadan çekilir: çizelgeden tıklayın, işaretçisi haritaya gelir). Çizelgede olay adları kalıcı yazılmaz: noktanın üstüne gelince (dokunmatikte dokununca) adı görünür; açık olayın adı noktasının yanında kalır. Klavyeyle: `Tab` ile işaretçi grubuna girin, ok tuşlarıyla işaretçiler arasında gezinin, `Enter` ile açın (odak olay kartına gider) |
| Olaydan yer görünümüne dönmek | Kartın üstündeki tek satırlık yer başlığına tıklayın (ad + aralık), olay kartında ✕'e basın ya da `Esc` |
| Seçimi kaldırmak | Kartta ✕ ya da `Esc` (önce açık olayı kapatır; ekranda yanıt yoksa ikincisi yer seçimini kaldırır) |
| Bir şey sormak | Alttaki soru kutusuna yazın (`Enter`); kartta *Bu yerin tarihini anlat* / *Soru sor* da aynı kutuyu kullanır. Kart kenara çekilir, yanıt haritanın üstünde görünür |
| Bir anlatımı izlemek | **İzle**: `←` / `→` (`Home` / `End`) ya da düğmeler; *Oynat* ve hız seçici (Yavaş / Normal / Hızlı) kendiliğinden ilerletir; zaman çizelgesindeki numaralı noktalar o adıma götürür |
| Metni okumak | *Metni oku* (ya da soru kutusundaki metin düğmesi): yan panel; ⤢ tam ekran (köşede küçük harita); *İzle* geri döner. Adım her geçişte korunur; `Esc` adım adım kapatır |

**Açık olay her zaman haritadadır.** Çizelgeden ya da listeden bir olay açtığınızda işaretçisi, yakınlaştırma bütçesi veya
eleme yüzünden normalde çizilmeyecek olsa bile, çizilir ve belirgin biçimde vurgulanır (kalın vermilyon halka, ışıma,
adı yanında). Yeri o anki görünümün dışındaysa harita, yeri görünene kadar **yalnızca uzaklaşır** (kaydırmak yerine
uzaklaşmak tercih edilir; önceki görünüm yeni görünümün içinde kalır) ve bunu sıçramadan, yumuşakça yapar. Zaten görünen
bir olayı açmak (örneğin kendi işaretçisine tıklamak) haritayı hiç oynatmaz.

Adres çubuğu durumu taşır (`#t=1450-1500&p=32.85,39.93&e=...`), bu yüzden bir görünümü bağlantıyla paylaşabilirsiniz.
Harita kamerası (`v=yakınlaştırma/enlem/boylam`) adrese yalnızca siz haritayı kendiniz oynattıktan sonra yazılır; açılıştaki
otomatik çerçeve herkes için aynıdır ve bağlantıya girmez. Bozuk ya da yarım bir bağlantı (ör. `p=32.85,`) yok sayılır;
uygulamayı çökertmez. Fare olan cihazlarda tekerlek haritayı yakınlaştırır (dar pencerede de); dokunmatik ekranlarda sayfa
kaydırması ile harita hareketi karışmasın diye harita iki parmakla gezilir.

## Okuma arkadaşı: haritayla birlikte okuyan sohbet

Düzen **harita öncelikli**dir: harita ekranın neredeyse tamamıdır (1440×900'de %86); üstte tek ince çubuk (ad, yer ve yıl, atıf),
altta ince zaman çizelgesi (≈ 80 px) ve onun hemen üstünde **soru kutusu** durur. Sağdaki **bilgi kartı** küçüktür (≈ 330 px), ✕ ile
kapanır ve okur bir şey sorunca **kendiliğinden kenara çekilir**: yalnızca yerin adını taşıyan küçük bir sekme kalır (yer seçili kalır,
soru onunla ilgilidir; sekme kartı geri getirir; yanıt kapanınca ya da başka bir yer seçilince kart kendiliğinden döner).
Şimdiye kadarki uygulama sohbetin **bağlam seçicisidir**: seçili yer, zaman aralığı ve açık olay modele kendiliğinden gider; harita ise
model anlatırken üzerine çizdiği şeydir. Çalışanların hiçbiri değişmedi: harita yine yalnızca zamana, zaman çizelgesi yine yalnızca
seçili yere bağlıdır.

| Harita öncelikli düzen | İzle: sabit yerde altyazı, adım adım |
|---|---|
| ![](docs/verification/ai-0-yeni-duzen.png) | ![](docs/verification/ai-1b-anlatim-adim2.png) |

| Oku: yan panel (3. adım) | Oku: tam ekran, köşede küçük harita (3. adım) |
|---|---|
| ![](docs/verification/ai-w2-oku-yan-panel.png) | ![](docs/verification/ai-w3-oku-tam-ekran.png) |

| Kısa yanıt: adımsız, tek sahne | Zaman çizelgesi ilerleme çubuğu |
|---|---|
| ![](docs/verification/ai-2-kisa-yanit.png) | ![](docs/verification/ai-v1-ilerleme-cubugu.png) |

**Bir anlatımı iki biçimde izlemek: İzle ve Oku.** Çok adımlı bir anlatım iki görünümde izlenir; ikisi de **aynı adımı** paylaşır.

- **İzle** (varsayılan): harita tam ekran kalır, anlatım adım adım ilerler. Her adımın **kısa altyazısı** (bir iki cümle) haritanın üstünde,
  soru kutusunun hemen üzerindeki sabit bir yerde durur, altyazı gibi; kutunun yeri adımdan adıma değişmez. Adımlar **← / →** (ve
  `Home` / `End`), *önceki* / *sonraki* düğmeleri, adım noktaları ya da zaman çizelgesindeki noktalarla gezilir. **Otomatik oynatma isteğe
  bağlıdır** (kendiliğinden başlamaz) ve hızı seçilir: *Yavaş / Normal / Hızlı*. Bir adım, altyazısının okunma süresi kadar kalır
  (2,2 sn + sözcük başına 0,36 sn, en az 4,5 en çok 16 sn; hıza bölünür: 0,65 / 1 / 1,8). Elle adım değiştirmek, görünümü değiştirmek ya da
  duraklat oynatmayı durdurur; son adımın altyazısı da okunduktan sonra oynatma biter (başa dönmez). Oklar metin kutusunda, ayar
  listesinde ve kaydırıcılarda kendi işlerini yapar; harita odaktayken de haritayı kaydırmaz.
- **Oku**: tam metin. **Kapalı**, **yan panel** (≈ 460 px, haritanın üstünde bir katman: harita yine tam ekrandır, çizim panelin
  altında kalmayacak biçimde görünür kılınır) ya da **tam ekran** olur. Tam ekranda harita sağ üst köşede **küçük bir pencere** olur
  (≈ 340×236) ve **o anki adımı** gösterir; pencerede yalnızca çizimin kendisi vardır (devlet adları, çizgiler, işaretler; ad
  etiketleri metnin yanında olduğu için yazılmaz), köşedeki düğmeyle harita yeniden büyür. Metni kaydırmak okuma çizgisindeki adımı etkin
  yapar ve harita (ya da küçük pencere) ona geçer. Telefonda metin her zaman tam ekrandır ve küçük harita başlığın altındadır.
- **Geçişte adım korunur.** İzle'de 3. adımdayken *Metni oku*: metin açılır, 3. adım okuma konumundadır ve etkindir; geri dönünce
  altyazı yine 3. adımındır. Yan panel ↔ tam ekran geçişinde de etkin adım okuma konumunda kalır (metin yeni genişlikte yeniden
  dizilir). Okuyucu en son kullanılan kipte açılır. `Esc` önce açık olay kartını, sonra tam ekranı yan panele, sonra metni, sonra
  ekrandaki yanıtı, en sonda yer seçimini kapatır.
- **Okurken sorulan soru haritayı arka planda günceller:** yanıt metne eklenir, okuyucu açık kalır ve arkadaki harita (ya da küçük pencere)
  yeni yanıtın sahnesine geçer.
- **Zaman çizelgesi ilerleme çubuğudur** (adımlı bir anlatım ekrandayken): adımlar, sahnelerinin yılında numaralı noktalardır (yan
  yana düşenler birbirine değmesin diye en çok 26 px kaydırılır), görülenler dolu, etkin olan işaretli ve ilkinden ona bir çizgi uzanır;
  bir noktaya tıklamak o adıma götürür ve okurun aralığına ya da imlecine dokunmaz. Yılsız adımlar çubukta yoktur.

**Yanıtın iki biçimi: modelin kararı.** Yönerge dosyası (aşağıda) iki biçim tanımlar ve hangisini seçeceğini modele bırakır:

- **Adımlı** (anlatım, çok parçalı konular): her adımın bir **başlığı**, bir **kısa altyazısı** ve bir **tam metni** vardır. Adımlar **sahnedir**:
  her adım kendi harita durumunu bildirir.
- **Tek parça** (kısa sorular): adım yok; kısa bir metin ve **en çok bir** harita sahnesi. Metin İzle'de haritanın üstünde, soru
  kutusunun hemen üzerinde durur (uzunsa kendi içinde kayar); zaman çizelgesinde adım noktası ve altyazı denetimleri yoktur.
  *Metni oku* aynı metni numarasız, tek parça olarak açar.

**İzle, uzun metinler bitmeden başlar.** Model önce, hiç metin yazmadan, adımları ve sahnelerini bildirir; metin sonra akar. Sayfa plan
gelir gelmez İzle'yi başlatır: ilk adımın altyazısı ve haritası hazırdır, "Metin yazılıyor…" yazar; okur o sırada adımlarda gezebilir
(metin gelmemiş adımın okuyucudaki yeri altyazısıyla doludur).

**Nasıl çalışır**

- **Her adım haritanın sahibidir:** etkin adım haritada yalnızca kendi çizimlerini gösterir (devlet vurguları, bağlantılar, olay
  işaretçileri, işaretler, sınır yılı); bir önceki adımın çizimleri gider, geri dönülünce o adımın çizimi aynen gelir. Hiçbir adım ötekinden
  bir şey devralmaz (yıl dahil: yıl istemeyen adımda yıl okurun kendi imlecidir); bu yüzden model her adımda gereken her şeyi kendisi
  bildirir ve `clear` diye bir araç yoktur.
- **Bağlam.** Model her soruyla birlikte seçili yeri (o yıldaki devleti ve aralıktaki egemenlerini), aralığı, haritadaki yılı, açık
  olayı, aralıkta sınır verisinde bulunan devletlerin listesini (kimlik | ad) ve uygulamanın olay kayıtlarını alır. Bağlam bir **yer
  listesidir** ve her yerin kendi aralığı vardır (bugün hepsi seçili aralık; birden çok yer ya da dönem haritaya bir şey
  koymadan, sohbetin kendisinden gelecek: okur sorusunda başka bir yeri ya da dönemi anacak). Sohbet sürerken
  yer ya da aralık değişirse metinde bir **"Bağlam değişti"** ayırıcısı (eski → yeni) çıkar; okur eski konuya dönerse kalkar; model de
  bir sonraki istekte bunu bir cümleyle öğrenir. Yıl imlecini oynatmak ya da bir olay açmak "yeni konu" sayılmaz. Açık olay kartı
  soru kutusunda bağlam olarak görünür ("açık olay, soruya eklenir"); kartta *Bunu sohbette sor* olayı soruya ekler ve kartı kapatır.
- **Haritaya çizim, yalnızca araç çağrılarıyla** (yedi araç, bu sırayla; görünüm daha az araca izin verirse sondakiler düşer):
  `step` (adımı bildirir: numara, başlık, altyazı), `highlight` (devlet vurgusu), `connect` (savaş / ittifak / ticaret / antlaşma çizgisi,
  isteğe bağlı kısa etiket), `show_event` (uygulamanın bir olayını **kendi işaretçisiyle** göstermek), `mark` (koordinat + kısa etiket),
  `set_year` (seçili aralığın içinde) ve `focus` (bir bölgeyi göstermek). Çizimler **mürekkep ve kâğıt** dilindedir: veri katmanlarıyla aynı
  görsel dil ama onlardan ayrı (vurgu = mürekkep kenar + ters yönde ince tarama; savaş = kalın çizgi ve ×, ittifak = çift çizgi, ticaret
  = kesikli ve çift oklu, antlaşma = noktalı ve ◇; serbest işaret = mürekkep eşkenar dörtgen ve etiket). Renk kullanılmaz: vermilyon
  yalnızca okurun seçimidir, olay noktaları kendi renklerini korur. Modelin yazdığı her başvuru verideki bir şeye çözülmek zorundadır
  (devlet kimliği ya da adı, olay kimliği ya da adı, haritanın içinde bir koordinat, aralığın içinde bir yıl); çözülmeyen çizim
  **sessizce atlanır** (yalnızca modele "atlandı" denir).
- **Haritada tek anlatıcı.** Ekranda bir yanıt varken (İzle ya da Oku) haritayı yapay zekâ anlatır: **olay işaretçileri haritadan çekilir**
  (hepsi çizelgede durur; sayaç "0 olay haritada · gerisi çizelgede" der). Bir olay haritaya iki yoldan gelir: okur çizelgeden tıklar
  (kartı açık kaldığı sürece işaretçisi haritadadır; kart kapanınca bilgi kartı sekmeye döner) ya da etkin adım ondan söz eder. Anlatılan
  şey uygulamanın verisinde bir olaysa model işaret çizmez, `show_event` der ve haritada **olayın kendi işaretçisi** (yıl yazılı, adı
  yanında; tıklanınca kartını açar) belirir. `mark` yalnızca verinin bilmediği yerler içindir (bir kent, geçit, liman). Model yine de
  verideki bir olayı `mark` ile çizerse (aynı yer adı ya da olay adı, olayın yerine ≤ 60 km, aralıkta tek eşleşme) sayfa onu olayın kendi
  işaretçisine çevirir ve modele bunu söyler: haritada aynı şey için iki işaret olmaz. Yanıt kapanınca (✕ ya da `Esc`) çizim haritadan
  kalkar, olay işaretçileri geri gelir ve harita yine okurundur.
- **Kamera: Harita takibi.** Açıkken (varsayılan) her adım etkin olduğunda harita o adımın çizimlerini **görünür kılar**: vurgulanan
  devletlerin ana parçaları, bağlantı uçları, işaretler ve olaylar birlikte, gerektiği kadar kayarak *ve* yakınlaşıp uzaklaşarak,
  yumuşakça (0,8–2,4 sn), haritanın üstündeki her şeyin (bilgi kartı, altyazı ya da kısa yanıt, soru kutusu, okuyucu paneli, yakınlaştırma
  düğmeleri) altında kalmadan (`MapView.frameTarget`, `domain/camera.ts`; ekranın dibi daha çok yer ayırabilir, çünkü altyazı ve soru kutusu
  oradadır). Kısa bir yanıt metninin büyüyebileceği yer baştan ayrılır, böylece harita tek kez çerçevelenir. Çizim zaten iyi çerçevedeyse
  harita oynamaz. Hiçbir araç kamerayı oynatmaz (yalnızca `focus`, çizimin kapsamadığı bir bölgeyi çerçeveye katar); takip sayfanın işidir.
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
- **Etiketler birbirini örtmez.** Yapay zekâ etiketleri (bağlantı adı, serbest işaret adı, olay adı) işaretçileri, yer noktasını,
  haritanın kontrollerini, kendi çizimlerinin simgelerini ve devlet adlarını engel sayarak yerleşir (`src/map/flags.ts`): önce
  noktasının dört yanını, sonra daha uzak yerleri (köşeler, bir bağlantı için çizgisi boyunca kayma, sonunda biraz daha açıkta) dener;
  hiçbir boş yer yoksa altındaki devlet adı çekilir (vurgulananların adı çekilmez: onlar işaretçiden, olabildiğince az kayarak uzaklaşır).
  Bağlantı simgesi (×, ◇…) de bir işaretçinin altında kalmaz, çizgisi boyunca kayar. `npm run e2e:ai` bunu sayfada ölçer (her adım, üç
  kamera, iki ekran boyu).

**Model: `sample` yeteneği, anahtar yok.** Uygulama bir Claude artifact'ı olarak yayınlanır ve artifact çalışma zamanının `sample`
yeteneğini (`const sample = await claude.use("sample")`) kullanır: çağrı **okurun kendi Claude hesabına** gider, ilk çağrıda okurdan
izin istenir, yanıt `onText` ile akar, harita eylemleri sayfa işlevleri (`tools`) olarak verilir. Bu yüzden sistem istemi yoktur
(yönergeler ve bağlam baştaki kullanıcı turlarındadır), çağrılar belleksizdir (sayfa sohbet geçmişini kendisi tutar ve her çağrıyla
yollar; 256 KiB sınırı için en eski karşılıklar atılır), sayfanın ağı yoktur (modelin kendi bilgisi + uygulamanın olay kayıtları;
canlı Vikipedi yok). Hız: **Hızlı / Dengeli / Derin** (`modelTier`: quick / default / complex; model adı hiçbir yerde yok; seçim
tarayıcıda saklanır). `not_granted`, `rate_limited`, `tools_unavailable`, `cancelled` ve diğer kodlar yanıtın yerinde, Türkçe olarak
gösterilir; **hiçbir hata kendiliğinden yeniden denenmez** (yalnızca okur *Yeniden dene*'ye basarsa). Yanıt sürerken **Durdur** vardır
(soru kutusunda ve haritanın üstünde); metin ilk kez gelene kadar "Düşünüyor…" yazar.

**Modelin yönergeleri ayrı bir düz metin dosyasıdır: [`instructions/okuma-arkadasi.txt`](instructions/okuma-arkadasi.txt).** Siz düzenlersiniz;
uygulama onu **her çağrıda, olduğu gibi** gönderir (baştaki kullanıcı turunun başı; arkasına sayfanın kendi "UYGULAMA NOTLARI"
bölümü gelir). Dosya derleme sırasında uygulamaya gömülür (`src/ai/instructions.ts`, `?raw`): bir değişiklik bir sonraki
`npm run build` / `npm run build:standalone` ile (ve yayında yeniden yayınlayınca) geçerli olur. Dosyada adı geçen harita eylemlerini
sayfanın notları gerçek araçlara eşler: devletleri vurgulamak → `highlight`, iki yeri bağlamak → `connect`, bir noktayı etiketle
işaretlemek → `mark`, sınır yılını değiştirmek → `set_year`, bir bölgeyi göstermek → `focus`, veri setindeki olayı göstermek →
`show_event`, adımları bildirmek → `step`. Notlar modelin *nasıl konuşacağını* değil, uygulamanın *mekaniğini* anlatır (hangi araç ne yapar,
yanıt hangi iki turda verilir, hangi biçim neye benzer, örnek); üslup ve içerik dosyanın, yani sizin işinizdir. Adım başına iki metin gerekir: `step`
aracı **başlık + altyazı** ister, tam metin sonra "## n. Başlık" altında gelir.

**Tur sayısı az olsun diye iki turlu bir protokol.** Her araç turu ayrı bir (ücretli) istektir ve araç girdileri akmaz. Bu yüzden adımlı
bir yanıtta model **birinci turda, metin yazmadan, tek seferde** adımları (`step{n, title, caption}`) ve her adımın çizimlerini (`step`
numarasıyla) bildirir; **ikinci turda** yalnızca metni yazar (`## n. Başlık` + paragraf). Tek parça yanıtta `step` çağrılmaz, araçlar
numarasız çağrılır (tek sahne) ve doğrudan kısa metin yazılır. Sayfa metni adımlara ayırır (başlık işaretini, numarayı ve boşluğu
bağışlayıcı biçimde okur; başlıksız ama paragraf sayısı adım sayısına eşit metni de adımlara dağıtır); altyazı yoksa metnin ilk
cümlelerinden çıkarılır. En az iki adım (planda ya da metinde) varsa yanıt adımlıdır. Araç yoksa (`limits()` raporlamazsa ya da
`tools_unavailable` gelirse) aynı soru yalnızca metin olarak sorulur ve altyazının altında bunu söyleyen bir not görünür.

**Claude olmayan yerde: deneme kipi.** `claude.use("sample")` boş dönerse (yerel geliştirme, kaydedilmiş dosya, başka bir ev sahibi)
sohbet **komut dosyalı bir sağlayıcıya** düşer ve bunu açıkça yazar (soru kutusunun üstünde "Deneme kipi"). Komut dosyalı sağlayıcı gerçek
bir çağrının yaptığını yapar: düşünür, birinci turdaki araç çağrılarını gerçekten çalıştırır, metni parça parça akıtır. Osmanlı
anlatımı, Fransa ittifakı sorusu ve açık olay sorusu için hazır yanıtları vardır; geri kalan her yer ve aralık için yanıtı uygulamanın kendi
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
| **Sınır verisi: Seshat Cliopatria** (CC BY 4.0) | 1400–1600 arasında devletler için 5–20 yıllık kayıt dönemleriyle, çoğunlukla aralıksız sınır verir (yıl yıl seçilebilir); zaman sürükleyince sınırlar gerçekten kayar. Alternatif `historical-basemaps` bu aralıkta yalnızca 5 anlık görüntü (1400, 1492, 1500, 1530, 1600) sunuyor ve GPL-3.0. Cliopatria ayrıca her devlet için Wikipedia/Wikidata kimliği ve üst-alt (ör. Brandenburg → Kutsal Roma) ilişkisi taşır. Bedeli: yalnızca devletleri haritalar; devlet kaydı olmayan karalar noktalı "veri yok" zemini olarak gösterilir. |
| **Yer = bir nokta, devlet = o noktanın o yıldaki sahibi** | Konya 1450'de Karamanoğulları, 1475'te Osmanlı'dır. Zaman çizelgesi, aralık boyunca o noktayı elinde tutan *tüm* devletlerin (ve üst yapılarının, bulunduğu bölgenin) olaylarını toplar; böylece "yerin tarihi" okunur. |
| **Haritadaki olay sayısı: yakınlaştırma bütçesi; önem yalnızca eleme için** | Her olayın içsel bir önem puanı (1–5) vardır, ama arayüz bunu **göstermez** (boyut, rozet, etiket yok): neyin önemli olduğuna kullanıcı karar verir. Puan yalnızca kalabalığı ayıklar: haritada yalnızca puanı ≥3 olanlar yer alır (daha yerel olanlar yalnızca çizelgededir); bütçe *görünümdeki* olaylara harcanır (dünya görünümünde az, yakınlaştıkça o bölgenin daha fazlası) ve ekranda çakışanlardan puanı düşük olan elenir. Sağ alttaki not kaç olayın çizildiğini ve geri kalanının neden görünmediğini söyler. |
| **Açık olay bu elemenin dışındadır, görünüm en az değişir** | Açık olay, bütçeye, önem süzgecine ve çakışmaya bakılmadan çizilir. Görünüm dışındaysa harita merkezi etrafında *yalnızca uzaklaşır* (Web Mercator'da merkezden uzaklık her yakınlaştırma düzeyinde yarıya iner; bu yüzden gereken en az düzey doğrudan hesaplanır, `domain/reveal.ts`) ve kontrollerin (`+/−`, lejant, sayaç) arkasında kalmamasına dikkat edilir. |
| **Aralık seçici: yalnızca cetvel** | Tek yıl da 100 yıl da aynı denetimle seçilir; sayı kutusu ya da hazır süre düğmesi yoktur. Fırçanın içindeki işaret, o aralık içinde hangi yılın sınırlarının çizileceğini seçtirir; seçilen yıl harita başlığının yanındaki notta görünür. Alt bölüm bu yüzden iki ince satırdır (≈ 80 px). |
| **Yer başlığı haritanın üstündedir, haritanın içinde değil** | Başlık ve "… yılının sınırları" notu, haritanın üstündeki sabit yükseklikli bir şeritte durur; hiçbir sınırı ya da işaretçiyi örtemez ve adın uzunluğu haritayı yeniden boyutlandırıp kaymış gibi göstermez. |
| **Bilgi kartı seçimlerle yönlenir: yer bağlam, olay odak** | Kart, `{ type: 'place' \| 'event', id }` başvurularının listesini bölümlere çevirir. Yalnızca yer seçiliyse kart yeri anlatır (ayrıntılar ve "aynı sırada, başka yerlerde" listesi kapalı bölümlerdedir: kart kısa kalır); olay açıksa olayı anlatır ve yer tek satırlık bir başlığa (ad + aralık) küçülür; başlığa tıklamak ya da olayı kapatmak yer görünümüne döndürür. Kart küçüktür, ✕ ile kapanır ve okur bir şey sorunca kendiliğinden bir sekmeye çekilir. |
| **Çizelge, aralığın biraz ötesini soluk gösterir** | Tek yıllık bir seçimde bile yerin komşu yıllardaki olayları okunur; aralığın içindekiler vurgulu, dışındakiler soluktur. Çakışan noktalar (en çok 3 sıra) üst üste biner ama hiçbiri düşürülmez; her olay gerçek tarihinde çizilir. |
| **Harita sahnenin tamamıdır; geri kalan her şey onun üstünde bir katmandır** | Bilgi kartı, altyazı ya da kısa yanıt, soru kutusu ve okuyucu paneli haritayı yeniden boyutlandırmaz: üstüne biner. Yalnızca tam ekran okuyucuda harita köşede küçük bir pencere olur. Bir yer seçilince başlık şeridinin ya da alt bölümün boyu değişseydi harita kaymış gibi görünürdü; bu yüzden onların boyu durumdan bağımsızdır. Kamera, çizimi bu katmanların altında kalmayacak biçimde çerçeveler. |

### Görsel dil

Basılı bir atlas: sıcak kâğıt, kahverengi-siyah mürekkep, sakin pastel devlet dolguları ve **tek canlı renk**
(vermilyon): "seçtiğiniz şey". Seçili yer halkasız, dolu kırmızı bir nokta ve çevresinde yarıçapsal sönen yumuşak bir
ışımadır; seçili devlet taramalı çizilir; açık olay vermilyon halkayla vurgulanır. Devlet dolgularının rengi yalnızca
komşuları ayırır (derleme sırasında komşuluk grafiği boyanır; kimlik etiket ve sınırla taşınır) ve **hiçbiri mavi, turkuaz ya
da mor değildir**: haritada mavi yalnızca deniz ve göllere aittir (`tests/palette.test.ts` bunu sayıyla korur). Yazı: okuma
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

- Cliopatria **yalnızca devletleri** haritalar: Amerika, Afrika ve Sibirya'nın büyük bölümü noktalı "veri yok"
  zemindir. Bu yerlere tıklanırsa devlet yerine (varsa) bölge adı gösterilir.
- Veri setinde bazı devletlerin kayıt aralıklarında boşluk vardır (ör. Bizans 1402–1406, Macaristan 1450–1458);
  bu yıllarda devlet haritada görünmez. **Uydurma sınır çizilmez.**
- Sınırlar yaklaşıktır (veri setinin kendi uyarısı: bir yorumun yalnızca bir sürümü). Panelde, çizilen sınırın hangi
  kayıt dönemine ait olduğu (ör. "1492–1501") gösterilir.
- Olayların kaynakları İngilizce Vikipedi makale başlıklarıdır. Geliştirme ortamında Vikipedi'ye doğrudan erişim
  olmadığından başlıklar, arama sonuçlarındaki `en.wikipedia.org` adresleriyle karşılaştırılarak düzeltildi (72 başlığın
  15'i değişti); yine de bağlantılar tarayıcıda tek tek **açılarak sınanmadı**. Olaylar için Vikiveri kimliği yoktur.
  Devletlerin Vikiveri kimlikleri doğrudan Cliopatria'dan gelir.
- Cliopatria'nın bazı etiketleri dönemle uyuşmuyor (ör. "Mahdids" kaydı Umman'ın iç kesimini, "Ngô Dynasty" 1400–1406'da
  Vietnam'ı, "Hashemite Arab Federation" Mezopotamya'yı, "Kingdom of Pajana" Orta Java'yı gösteriyor; "County of
  Brabant/Béarn/Savoy" aslında dükalık/vikontluk). Sınır verisine dokunulmadı; Türkçe adlar `entities.json`'da coğrafyaya
  göre düzeltildi, yanlış Vikipedi/Vikiveri bağlantıları ise `wikipedia`/`wikidata` alanlarıyla değiştirildi ya da
  `null` ile kaldırıldı. Her düzeltmenin nedeni aynı kayıttaki `note` alanındadır (arayüzde gösterilmez).
- Aynı devletin iki ayrı adla bölünmüş kayıtları (ör. Lan Na, Makuria) `entities.json`'da `"sameAs": "<kimlik>"`
  ile tek devlet sayılır.
- Tarihler kaynakta yazıldığı gibi tutulur ve (1582 öncesi için Jülyen takvimi kullanan kaynaklarda bir haftayı aşabilen
  farkla) Gregoryen yıl üzerine yerleştirilir; bu, olayı yalnızca kendi yılı içinde kaydırır.

## Mimari

```
src/
  domain/   saf mantık (arayüzsüz, testli): time, geo, events, lanes, categories, placement, reveal, camera
  data/     veri yükleyici (`loadData`) ve saf birleştirme (`assembleData`)
  state/    store (durum + eylemler), derive (görünüm modeli), url (adres çubuğu), panelLayout
  map/      MapLibre görünümü, DOM etiketleri, işaretçiler, yer noktası, yapay zekâ çizim katmanı (aiLayer, flags)
  ui/       cetvel (adım noktalarıyla), zaman çizelgesi, bilgi kartı (infoCard), harita üstü öğeler, ipucu kutusu,
            ask/ (soru kutusu), watch/ (İzle), read/ (Oku)
  styles/   tasarım belirteçleri ve bileşen stilleri (layout, card, ask, watch, read, dock, map, ai)
  ai/       okuma arkadaşı (arayüzsüz, testli): aşağıya bakın
instructions/okuma-arkadasi.txt   modelin yönergeleri (düz metin; sahibi düzenler, derlemede uygulamaya gömülür)
```

`src/ai/`: `resolve` (modelin yazdıklarını verideki devletlere, olaylara, noktalara çözer; devletlerin ana parçalarının kutusu),
`tools` (yedi sayfa işlevi), `drawing` (her adımın **kendi** çizimi: `TurnPlan`, `drawingOf`; kamera hedefi `frameTargetOf`), `steps`
(metni adımlara ayırır), `narration` (bir yanıtın adımları: plan + metin birleşimi, altyazı, adımlı mı tek parça mı), `presentation`
(İzle / Oku görünümü, okuyucu kipi, otomatik oynatma ve hız; adım gezintisi; başsız ve testli), `activeStep` (okuma çizgisi), `context`,
`prompt`, `instructions` (yönerge dosyası), `sources`, `provider` (arayüz + hata kodları), `sampleProvider`, `mockProvider` + `mockScripts`,
`session` (sohbet, geçmiş, durdurma, hata), `director` (etkin adım → çizim, yıl, kamera takibi ve "bıraksın mı" sorusu) ve `settings`. `src/domain/camera.ts`: kamerayı ölçen saf işlevler (sapma, önemli hareket,
çerçeve, dolgu) ve `CameraWatch`.

- Durumda **harita kamerası yoktur**; harita görünümünü yalnızca kullanıcının kendi eylemleri değiştirir: sürükleme,
  tekerlek, çimdik, `+/−` düğmeleri, klavye. **Tek istisna `MapView.revealEvent`'tir:** kullanıcı görünüm dışındaki bir
  olayı çizelgeden, listeden ya da bir bağlantıdan açarsa harita, olay (ve kenar boşluğu) görünene kadar yalnızca uzaklaşır
  (`easeTo`, 0,9–2,6 sn, yumuşak giriş-çıkış). Dünyanın kenar sınırı uzaklaşmayı tek başına yetirmezse ya da olay en uzak
  görünümde bile sığmazsa `fitBounds` ile eski görünümü ve olayı kapsayan en küçük görünüme gidilir. Zaten görünen olay
  için (ör. kendi işaretçisine tıklamak) hiçbir şey yapılmaz. "Hareketi azalt" tercihinde MapLibre görünümü animasyonsuz değiştirir.
  Çift tıklamayla yakınlaştırma ve klavyeyle döndürme kapalıdır.
- `ViewModel.mapEvents` yalnızca zaman aralığından hesaplanır, işaretçileri seçen `placeMarkers` saf bir işlevdir
  (aynı olaylar + kamera → aynı işaretçiler). Seçili yer yalnızca vurgu katmanını, yer noktasını, panelin yer kartını
  ve çizelgeyi değiştirir. Açık olay `EventMarkers.setSelected` ile her zaman çizilir (kendi kümesinde olmasa bile);
  haritanın olay kümesi yine yalnızca zaman aralığına bağlıdır.
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
- **Ek katmanlar (din, dil):** `MapView.onLoad` katman listesine yeni kaynak/katman eklemek yeter; zaman filtresi
  (`from/to`) aynı biçimde uygulanır.

## Doğrulama

`npm test` (birim testleri) ve `npm run e2e:ai` (okuma arkadaşı, aşağıda) bu bölümdeki kabul senaryosuna ek olarak çalışır.

`npm run e2e`, üretim derlemesini gerçek (başsız) Chromium'da şu senaryoyla sınar ve `docs/verification/` altına
ekran görüntüleri ve `RAPOR.md` yazar:

1. 1500'de Anadolu'da bir nokta → **Osmanlı** vurgulanır, çizelgede Osmanlı olayları görünür.
2. Çin'de bir nokta → **Ming** görünür; **harita kamerası (merkez, yakınlaştırma, açı) birebir aynı kalır.**
3. Aralık 1450–1500 → haritadaki olay kümesi, aralıktan bağımsız hesaplanan kümeyle birebir aynıdır.
4. Başlık haritanın üstündeki şeritte, küçük ve "SEÇİLİ YER" etiketsizdir; hiçbir devlet mavi değildir (CSS belirteçleri, harita
   boya ifadesi ve ekranda çizilmiş devlet pikselleri ölçülür); alt bölüm ≈ 80 px'dir (ilk sürümde 286 px) ve çizelgede kalıcı olay
   adı yoktur (üzerine gelince ve dokununca görünür); seçili yer halkasız dolu bir noktadır ve çevresinde sönen ışıma vardır;
   tüm olay noktaları aynı şekil ve boyuttadır, renkleri lejanttaki türüyle birebir aynıdır; lejant başlıksızdır ve yalnızca
   renkleri anlatır.
5. Çin'e yakınlaşıp çizelgeden Mohaç'ı (1526) seçmek → harita, kareler boyunca yumuşakça (atlamadan, tek yönde) ve yalnızca
   gerektiği kadar uzaklaşır; önceki görünüm yenisinin içinde kalır; işaretçi vurgulanır; panelde olay odakta, yer tek
   satırlık başlıktadır; başlığa tıklamak, ✕ ya da `Esc` yer görünümüne döndürür ve haritayı oynatmaz. Yakınlaştırma bütçesi
   yüzünden çizilmeyen olaylar seçilince çizilir. Harita-öncelikli düzende bu senaryo, açılış kartı ve yer kartı haritanın bir köşesini
   örttüğü için kartları ✕ ile kapatarak ilerler.

Ek olarak: işaretçi/çizelge/deniz tıklamalarının haritayı oynatmadığı (görünür bir olayı açmak dahil), haritanın yerden bağımsız
olduğu, düzenin kaymadığı, cetvelin fare ve klavyeyle çalıştığı ve (duyarlılık sınaması olarak) gerçek bir sürüklemenin kamerayı
**gerçekten** hareket ettirdiği denetlenir. Ayrı sayfa yüklemelerinde ayrıca: bozuk bağlantıların uygulamayı çökertmediği, kameranın
adrese yalnızca kullanıcı oynattıktan sonra girdiği, yapıştırılan bağlantının bekleyen bir adres yazımıyla ezilmediği,
işaretçilerin tek Tab durağı olduğu ve ok tuşlarının haritayı kaydırmadan gezdirdiği, ipucunun fareyle işaretçiye gelince
kaybolmadığı, cetvelde uca tıklamanın pencereyi küçültmediği, ekran okuyucu durum satırının çalıştığı, dar pencerede tekerleğin
yakınlaştırdığı, telefon genişliğinde taşma olmadığı, dokunuşun olayı açıp adını gösterdiği (ve ekranda ipucu bırakmadığı) ve
"hareketi azalt" tercihinde görünümün animasyonsuz değiştiği denetlenir.

### Okuma arkadaşı ve düzen: `npm run e2e:ai`

Gerçek Chromium'da, komut dosyalı sağlayıcıyla (gerçek model yok; araç çağrıları ve akış gerçek bir yanıttaki gibi çalışır) şunları
sınar ve `docs/verification/AI-RAPOR.md` ile `ai-*.png` yazar (gruplar raporda aynı harflerle başlar):

1. **L. Düzen.** Harita ekranın %85'inden fazlası ve sayfa kaymaz; üstte tek ince çubuk, altta ≤ 84 px zaman çizelgesi, soru kutusu onun
   hemen üstünde ve ortada; bilgi kartı sağda, 340 px'ten dar, haritanın yarısından küçük, ✕ ve `Esc` ile kapanır, yer seçmek haritayı
   oynatmaz; kısa tutulur (ayrıntılar kapalı bölümlerde); soru sorulunca kart kendiliğinden sekmeye çekilir (yer seçili kalır), sekme
   kartı geri getirir, yanıt kapanınca kart kendiliğinden döner.
2. **A. İzle.** Anadolu'da bir nokta, 1500–1550, anlatım: **İzle, uzun metinler bitmeden başlar** (ilk altyazı ve "Metin yazılıyor…");
   her adım yalnızca **kendi** çizimini gösterir (6 adımın her biri için tam küme: vurgulanan devletler, bağlantı, olay işaretçileri, serbest
   işaret, yıl; öteki adımların hiçbir izi yok); altyazı modelin `step` çağrısındaki altyazıdır ve her adımda **aynı yerdedir**; kamera
   adımı izler (çizimin bütün noktaları görünür ve kartın, altyazının, soru kutusunun altında değil); önceki adımlara dönmek (4, 2, 6, 3,
   5, 1) o adımın çizimini aynen getirir; etiketler örtüşmez.
3. **V. İzle'de gezinme.** Düğmeler (uçlarda kapanır), `←/→/Home/End` (metin kutusunda ve haritada odak varken yalnızca yazı imleci /
   adım; harita kaymaz); **otomatik oynatma isteğe bağlıdır** (kendiliğinden başlamaz), hızda adım altyazısının süresi kadar kalır, hız
   değişince bekleme yeniden ölçülür, duraklat ve elle gezinme durdurur, son adımda biter, sonda yeniden oynat baştan başlar;
   **zaman çizelgesi ilerleme çubuğudur** (adım noktaları tarihlerinde, birbirine değmeden, görülenler dolu; tıklamak adıma götürür ve
   okurun aralığına dokunmaz).
4. **W. Oku.** *Metni oku*: yan panel (harita yine tam ekran, çizim panelin altında değil, soru kutusu panelin soluna çekilir); **İzle'de 3.
   adımdayken Oku'ya geçip geri dönmek adımı korur**; metni kaydırmak etkin adımı ve haritayı taşır; **tam ekran**: harita sağ üst köşede
   küçük bir pencere olur ve o anki adımı tam gösterir (görünüm dışı ve örtülü nokta yok), metin sütunu pencereyle çakışmaz, metinde
   *Haritada göster* ve kaydırma pencereyi taşır, `Esc` adım adım kapatır, *Haritayı büyüt* geri döner; **okurken sorulan soru haritayı
   (ya da küçük pencereyi) arka planda günceller**; yan panel ↔ tam ekran geçişinde etkin adım okuma konumunda kalır.
5. **B. Kısa yanıt.** Osmanlı–Fransa ittifakı (1536) sorusu: **adımsız**, kısa metin haritanın üstünde ve soru kutusunun hemen üzerinde (adım
   sayacı, noktalar, oynat/hız yok; çizelgede adım noktası yok); **tek sahne**: iki devlet vurgulanır ve bağlanır, kamera ikisini de
   metnin ve soru kutusunun altında kalmadan görünür kılar; *Metni oku* aynı metni numarasız, tek parça olarak açar.
6. **A2–A4. Harita takibi.** Kısa sürükleme ve bir kez `+` takibi kapatmaz; iki düzey yakınlaşma ya da haritanın üçte biri kadar
   sürükleme küçük bir soru getirir (haritanın %6'sından az, telefonda %22'sinden az, odağı çalmaz, iletişim kutusu değil; *Ayarlar ⚙ →
   Harita takibi* bağlantısı ayarı açıp satırı işaretler). *Bıraksın*: takip kapanır, çip çıkar, adım değişince kamera oynamaz; çip ya da
   *Geri aç* yeniden açar ve etkin adım hemen görünür kılınır. *İzlemeye devam*: o sohbette bir daha sorulmaz. Cevaplanmayan soru hiçbir
   şeye karar vermeden kalkar ve yeni bir uzak hareketten sonra döner. Ayar anahtarı aynı şeyi yapar; yeni sohbet takibi yeniden açar.
7. **J. Haritada tek anlatıcı.** Yanıt ekrana gelince haritadaki bütün olay işaretçileri çekilir (çizelge aynen kalır, sayaç nedenini söyler);
   çizelgeden tıklanan olay kartı açık kaldığı sürece haritadadır; adım bir olaydan söz ederse haritada yalnızca o olayın kendi
   işaretçisi ve adı olur (serbest işaret çizilmez; yalnızca verinin bilmediği yer, örneğin Mercidabık, serbest işaret olur). Model verideki
   bir olay için `mark` çağırırsa olayın kendi işaretçisine çevirilir. Yanıtı kapatmak olay işaretçilerini geri getirir.
8. **C, C2, D.** Yanıt ekrandayken olaya tıklamak: kart sağda açılır (yanıtı ve soru kutusunu örtmez), işaretçisi haritaya gelir;
   kapatınca (✕ ya da `Esc`) yanıt yerinde kalır, kart sekmeye döner; *Bunu sohbette sor* olayı soruya ekler ve yanıtta olay kendi
   işaretiyle görünür. Yanıt yokken olay kartı sağda açılır; `Esc` sırası: olay, yanıt, yer. Sohbet sürerken yer ya da aralık
   değişince metinde "Bağlam değişti" ayırıcısı çıkar, güncellenir, geri dönülünce kalkar ve model "Konu değişti"yi öğrenir.
9. **K. Etiketler örtüşmez:** 6 adım × 3 kamera (çerçeve, yakınlaştırılmış, uzaklaştırılmış) × 2 ekran boyunda yapay zekâ etiketleri ne bir
   etiketi, ne bir işaretçiyi, ne yer noktasını, ne bir devlet adını, ne haritanın kontrollerini örter (sayfada ölçülür; haritanın kenarının
   kestiği bir devlet adı ve bir çizgi simgesinin bir yıl yazısına 120 px²'den az değmesi sayılmaz).
10. **E. Durdurma, hatalar, ayarlar:** Durdur (adımlar ve yazılan kısım kalır), hata ekranları ve "Yeniden dene" (tek istek),
    `not_granted`, hız ayarı (soru kutusunun üstündeki menü, tarayıcıda saklanır), "Sohbeti temizle".
11. **G. Gerçek `sample` bağdaştırıcısı**, tarayıcıda sahte bir artifact çalışma zamanıyla: **ilk tur, yönerge dosyasıyla birebir
    başlar**; yedi araç ve sırası; `step` aracının numara + başlık + altyazı istemesi; `cache` gönderilmemesi; geçmişin her çağrıyla
    gitmesi; `modelTier`; metin tutulurken (yalnızca plan geldiğinde) İzle'nin başlaması; araçsız ortamda "yalnızca metin" notu;
    `not_granted` / `rate_limited` ve `permissions.manage` düğmesi.
12. **H. Telefon:** harita tüm sahne (yatay taşma yok), bilgi kartı üstte küçük bir sayfa, altyazı ve soru kutusu altta (düğmeler ≥ 30 px),
    yakınlaştırma düğmeleri ve sayaç bu sütunun üstünde; metin tam ekran, küçük harita başlığın altında ve 3. adım korunur; Harita takibi
    sorusu telefonda küçük kalır.

**Neyi sınamıyor:** gerçek bir modelin istemi ne kadar iyi izlediğini. Gerçek `sample` bu ortamdan çağrılamaz; model çıktısı biçimine
karşı bağışlayıcı okunur (yukarıya bakın) ama ilk gerçek kullanımda gözle bakılmalıdır.

## Bilinen sınırlar ve sonraki adımlar

- Karşılaştırma modu henüz yok (veri yapıları ve panel yapısı hazır; yukarıya bakın).
- Okuma arkadaşı: gerçek model çıktısı bu ortamda sınanamadı (yukarıya bakın). Yönerge dosyasını düzenlemek uygulamayı yeniden
  derlemeyi ve yeniden yayınlamayı gerektirir (dosya derlemede gömülür). Otomatik oynatma süreleri (2,2 sn + sözcük başına
  0,36 sn; hızlar 0,65 / 1 / 1,8) ve ilerleme çubuğunda yan yana düşen noktaların kaydırılması (en çok 26 px) ilk sürümün varsayılanlarıdır
  (`src/ai/presentation.ts` ve `src/ui/ruler.ts` başındaki sabitler); gerçek kullanımda ayarlanması gerekebilir. Bir bağlantının uç noktası devletin etiket noktasıdır
  (çok parçalı devletlerde, karşı uca en yakın büyük parçanın ortası); tek parça ve çok büyük devletlerde (1517 sonrası Osmanlı) bu
  nokta sınırdan uzakta olabilir ve çizginin ucundaki küçük daire devletin adının üstüne gelebilir (etiketlerin değil, yalnızca
  çizgi ucunun örttüğü tek şey budur). Yüklenmiş belge kaynağı henüz yok.
- Görünüm dışındaki bir olayı açınca harita yalnızca uzaklaşır; ancak dünyanın kenar sınırı (`maxBounds`) çok büyük uzaklaşmalarda
  merkezi de kaydırır (ör. Çin'den Macaristan'a: merkez 112°D'den 75°D'ya kayar). Bu hâlâ tek, sürekli ve yumuşak bir harekettir;
  önceki görünüm yeni görünümün içinde kalır.
- Renk-körlüğü payı dardır: protan/deutan simülasyonunda iki kategori rengi arasındaki en küçük ΔE 7,7'dir (6–8 "uyarı" bandı).
  Renkler tek başına taşıyıcı değildir (lejant, ipucu ve kart kategoriyi sözle de söyler) ama bir olayın türünü yalnızca
  noktanın renginden okuyan renk-körü bir kullanıcı zeytin sarısı ile turuncuyu karıştırabilir.
- Haritada devlet seçimi yalnızca fare/dokunma ile yapılır; klavye ile devlet seçimi için bir arama kutusu eklenebilir.
- Karanlık tema yok (renkler `tokens.css`'te belirteç olarak duruyor).
- İlk yükleme ~9 MB sınır verisi indirir (sıkıştırılmış ~1,7 MB); büyük aralıklar için sınırlar yıl dilimlerine bölünebilir.
- Kod için lisans henüz seçilmedi; veri ve kütüphane atıfları için [`public/NOTICE.txt`](public/NOTICE.txt) dosyasına bakın.
