# Sohbet arkadaşı: doğrulama raporu

96/96 denetim geçti (`npm run e2e:ai`). Model olarak komut dosyalı deneme kipi kullanıldı; G grubu gerçek `sample` bağdaştırıcısını sahte bir çalışma zamanıyla sınar.

## A. Anlatım: Anadolu’da bir nokta, 1500–1550, sohbet açık, adımlar ve harita

- ✅ Aralık 1500–1550 — 1500–1550
- ✅ Anadolu’daki nokta seçildi: Osmanlı İmparatorluğu
- ✅ Yer kartında “Bu yerin tarihini anlat” ve “Soru sor” var
- ✅ Yanıt gelmeden önce “Düşünüyor…” ve Durdur düğmesi var
- ✅ Sohbet açıldı; panel yer kartı yerine sohbeti gösteriyor
- ✅ Yer, aynı tek satırlık başlığa (ad + aralık) küçüldü — ‹ Osmanlı İmparatorluğu 1500–1550 (44 px)
- ✅ Panel sohbet için genişledi (410 → 540 px), harita o kadar daraldı — 410 → 540 px; harita 1030 → 900
- ✅ Harita yerinden oynamadı: aynı enlem-boylam aynı pikselde (sol kenar sabit) — Δ = 0.00 px
- ✅ Genişleme tek ve yumuşak bir hareket: genişlik yalnızca artar, ara kareler var — 12 ara kare
- ✅ Hareket boyunca haritanın içeriği hiçbir karede kaymadı
- ✅ Harita tek kez yeniden boyutlandı (hareket sırasında değil, sonunda) — 1
- ✅ Haritanın sağ kenarındaki denetimler panelin kenarıyla birlikte kayıyor, sonda sıçramıyor
- ✅ Sohbet, Claude olmadığını açıkça söylüyor (deneme kipi)
- ✅ Yanıt numaralı adımlara bölünmüş (6 adım, hepsinin başlığı var) — 1,2,3,4,5,6
- ✅ İlk adım etkin, diğerleri değil
- ✅ Etkin adımda “Haritada gösteriliyor”, diğerlerinde “Haritada göster”
- ✅ Yapay zekâ yılı kullanıcının imlecini değiştirmez (yalnızca üstüne biner) — başlıkta 1505, imleç 0.5
- ✅ 1. adım: Osmanlı ve Safevî vurgulu, Tebriz işaretli, bağlantı yok — ottoman-empire+safavid-dynasty · Tebriz
- ✅ 2. adım gösterilince harita değişti: 1514, Osmanlı–Safevî savaş çizgisi, Çaldıran işareti — war · Tebriz, savaş, Çaldıran
- ✅ Odak yalnızca uzaklaşarak oldu: merkez aynı, yakınlaştırma azaldı ya da aynı kaldı — 1.48 → 1.48
- ✅ 3. adım (odak istemez): çizim değişti ama harita hiç oynamadı — ottoman-empire+mamluk-sultanate
- ✅ Vurgu, bağlantı ve işaret haritayı hiçbir adımda oynatmadı (merkez 1., 2. ve 3. adımda aynı)
- ✅ Okurken harita adımı izliyor: kaydırdıkça etkin adım 1’den 6’ya sırayla ilerliyor — 1 1 2 2 3 3 4 4 5 6 6 6
- ✅ Son adımda harita son adımın durumunda (1538, Preveze)
- ✅ Geri dönülünce 1. adımın harita durumu aynen geri geliyor
- ✅ Okur haritayı kendisi sürükleyince “Harita serbest” çıkıyor
- ✅ Artık adımlar haritayı oynatmıyor (5. adım odak istese de): okurla savaşmıyor — 1.48 = 1.48
- ✅ “Adımı izlet” ile odak yeniden etkin; uyarı kalktı
- ✅ Okur zaman imlecini oynatınca yapay zekâ yılı kenara çekiliyor; sonraki adımda geri geliyor — 1520 → 1517
- ✅ Başlığa tıklamak yer kartına döndürür; sohbet kapanınca yapay zekâ çizimi haritadan kalkar
- ✅ Panel eski genişliğine döndü; harita yine yerinden oynamadı; kapanış da tek yeniden boyutlandırma — Δ = 0.00 px
- ✅ Kapanışta başlıktaki yıl kullanıcının imlecine döner (yapay zekâ yılı yok)
- ✅ Sohbet geri açılınca yazışma ve okuma konumu aynen duruyor — kaydırma 478 → 478
- ✅ Çizim yeniden haritada (etkin adımın durumu)

## A2. Sohbetten önce haritayı gezmek kamerayı elinizden almaz

- ✅ Sohbet açılmadan önce haritayı sürüklemek ve yakınlaştırmak “Harita serbest” yapmaz
- ✅ Adımın odağı çalışır (okur kamerayı sohbet sırasında almadı): harita uzaklaşır ve iki devlet de görünür olur — 4.20 → 2.03

## B. Soru: Osmanlı–Fransa ittifakı (1536) — her yanıtın tek harita durumu var, harita oynamaz

- ✅ “Soru sor” sohbeti açar; yeni sohbette tanıtım ve öneriler var
- ✅ Soru kutusuna odak gitti
- ✅ Soru gönderilince kutu temizlendi, “Düşünüyor…” görünür
- ✅ Soru yanıtı tek adım: numarasız, tek bölüm
- ✅ Her iki devlet de vurgulandı (Osmanlı ve Fransa) — ottoman-empire+kingdom-of-france
- ✅ İki devletin adı da haritada mürekkep renginde, kalın — Osmanlı İmparatorluğu | Fransa Krallığı
- ✅ İkisi ittifak çizgisiyle bağlandı: “İttifak, 1536” — İttifak, 1536
- ✅ Harita sınırları 1536’ya getirildi
- ✅ Harita hiç oynamadı (merkez ve yakınlaştırma birebir aynı) — zoom 1.478

## C. Olay: sohbet açıkken bir olaya tıklamak, kartı sohbetin üstünde açar

- ✅ Olay kartı sohbetin üstünde açıldı (sohbet altta duruyor, kart onu örtüyor)
- ✅ Kart soru kutusunu örtmüyor; arkadaki sohbet erişilemez (inert) ve ekran okuyuculardan gizli
- ✅ Yer, başlıkta tek satır olarak kalıyor ve haritada seçili olay vurgulu
- ✅ Açık olay soru kutusunda bağlam olarak görünüyor
- ✅ Kartı kapatmak sohbete döndürür; okuma konumu aynı
- ✅ Esc de kartı kapatır; sohbet açık kalır
- ✅ Olay kartında “Bunu sohbette sor” düğmesi var
- ✅ Düğme olayı sohbete gönderdi: kart kapandı, kullanıcı mesajında olay çipi var
- ✅ Model olayı bağlam olarak aldı (açık olay kartı + soru)
- ✅ Yanıtın haritası: olayın yeri işaretli, taraflar vurgulu, olayın yılı — Mohaç · 1526

## C2. Olay: kart sohbet kapalıyken açılırsa; çizelgeden; Esc

- ✅ Sohbet kapalıyken olay kartı normal panelde açılır (sohbet yok)
- ✅ “Bunu sohbette sor” sohbeti açar ve olayı gönderir
- ✅ Çizelgedeki noktaya tıklamak da kartı sohbetin üstünde açar
- ✅ Esc önce olay kartını kapatır, sohbet açık kalır
- ✅ Bir daha Esc sohbeti kapatır ve yer kartına döner (yer seçili kalır)

## D. Bağlam: sohbet sürerken seçili yer değişirse sohbet bunu gösterir

- ✅ Yer değişmeden ayırıcı yok
- ✅ Yer değişince sohbette tek bir “Bağlam değişti” ayırıcısı çıkıyor
- ✅ Ayırıcı eski ve yeni konuyu söylüyor — BAĞLAM DEĞİŞTİ Osmanlı İmparatorluğu · 1500–1550 → Fransa Krallığı · 1500–1550
- ✅ Başlık yeni yeri gösteriyor
- ✅ Soru kutusu yeni yeri söylüyor
- ✅ Aralık da değişince aynı ayırıcı güncelleniyor (ikincisi eklenmiyor)
- ✅ Okur konuya dönerse ayırıcı kalkıyor
- ✅ Model bağlamın değiştiğini söylendi (“Konu değişti”)
- ✅ Ayırıcı yazışmada, değişiklikten sonraki sorunun önünde kalıyor

## E. Durdurma, hatalar, ayarlar

- ✅ Durdur: yanıt hemen “durduruldu” olur, yazılan kısım kalır — 263 karakter
- ✅ Durdurunca gönder düğmesi geri gelir, sohbet kilitlenmez
- ✅ rate_limited: hata yazışmada, yazıldığı yerde; yazılan metin kalır; yeniden dene düğmesi var
- ✅ rate_limited sohbeti kilitlemez; kendiliğinden yeniden denemez (tek istek)
- ✅ “Yeniden dene” yalnızca okur basınca ve bir kez soruyor
- ✅ not_granted: kalıcı uyarı, soru kutusu kapalı, izin paneli düğmesi
- ✅ Ayarlar: üç hız (Hızlı, Dengeli, Derin), varsayılan Dengeli; model adı yok
- ✅ Seçilen hız modele gidiyor (quick)
- ✅ Seçim tarayıcıda saklanıyor
- ✅ Yenilenince seçim korunuyor
- ✅ “Sohbeti temizle” yazışmayı ve haritadaki çizimi siler

## G. Gerçek sample bağdaştırıcısı (sahte çalışma zamanıyla, tarayıcıda)

- ✅ Claude çalışma zamanı varken deneme kipi uyarısı yok; sağlayıcı “sample”
- ✅ Çağrı: yönergeler başa ayrı kullanıcı turu, hız “default”, iptal sinyali, geçerli araç şemaları — user,user
- ✅ Araçlarla çağrıda cache hiç gönderilmiyor (çalışma zamanı reddederdi)
- ✅ Yedi araç: step, highlight, connect, mark, set_year, focus, clear
- ✅ Araçlar sayfada çalıştı; tanınmayan devlet sessizce atlandı ama modele söylendi
- ✅ Harita: iki devlet vurgulu, bağlantı çizili, yıl 1536
- ✅ Metin akışla geldi ve tamamlandı
- ✅ İkinci çağrı: önceki yazışma gönderilir (model bir şey hatırlamaz), hız “complex”
- ✅ Yeni çağrının bağlamında önceki çizimler söyleniyor
- ✅ Araç desteği yoksa (limits) araçsız ve cache:false ile istenir; sohbet “yalnızca metin” notunu gösterir
- ✅ Gerçek not_granted: izin verilmedi uyarısı, kutu kapalı, bir istek
- ✅ “İzinleri aç” yalnızca düğmeyle, platformun izin panelini açar (permissions.manage)
- ✅ Gerçek rate_limited: hata gösterilir, e.text korunur, kilit yok, otomatik yeniden deneme yok

## H. Telefon: harita yukarıda kalır, sohbet kalan yeri doldurur

- ✅ Telefon: harita üstte yapışık, sohbet haritanın hemen altında — harita 344 px, panel 344 px
- ✅ Telefon: soru kutusu ekranın içinde, yatay taşma yok — 824 / 844

## I. Genel

- ✅ Hiçbir sayfada konsol ya da sayfa hatası yok

## Ekran görüntüleri

- `ai-0-yer-karti.png`, `ai-0-bos-sohbet.png`: yer kartı ve açılan sohbet
- `ai-1a-anlatim-adim1.png`, `ai-1b-anlatim-adim2.png`, `ai-1c-anlatim-adim6.png`: anlatım, adım değiştikçe harita
- `ai-2-ittifak-sorusu.png`: Osmanlı–Fransa ittifakı sorusu (iki devlet vurgulu ve bağlı, harita oynamadı)
- `ai-3a-olay-sohbetin-ustunde.png`, `ai-3b-bunu-sohbette-sor.png`: olay kartı sohbetin üstünde; “Bunu sohbette sor”
- `ai-4-baglam-degisti.png`: seçili yer değişince sohbette “Bağlam değişti”
- `ai-5-hata.png`, `ai-6-mobil.png`, `ai-7-ayarlar.png`, `ai-8-gercek-sample.png`
