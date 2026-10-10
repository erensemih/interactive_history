# Sohbet arkadaşı: doğrulama raporu

157/157 denetim geçti (`npm run e2e:ai`). Model olarak komut dosyalı deneme kipi kullanıldı; G grubu gerçek `sample` bağdaştırıcısını sahte bir çalışma zamanıyla sınar.

## A. Anlatım: Anadolu’da bir nokta, 1500–1550, sohbet açık; her adım haritanın sahibi, kamera adımı izliyor

- ✅ Aralık 1500–1550 — 1500–1550
- ✅ Anadolu’daki nokta seçildi: Osmanlı İmparatorluğu
- ✅ Yer kartında “Bu yerin tarihini anlat” ve “Soru sor” var
- ✅ Sohbet açıldı; panel yer kartı yerine sohbeti gösteriyor
- ✅ Yer, aynı tek satırlık başlığa (ad + aralık) küçüldü — ‹ Osmanlı İmparatorluğu 1500–1550 (44 px)
- ✅ Panel sohbet için genişledi (410 → 540 px), harita o kadar daraldı — 410 → 540 px; harita 1030 → 900
- ✅ Harita yerinden oynamadı: aynı enlem-boylam aynı pikselde (sol kenar sabit) — Δ = 0.00 px
- ✅ Genişleme tek ve yumuşak bir hareket: genişlik yalnızca artar, ara kareler var — 12 ara kare
- ✅ Hareket boyunca haritanın içeriği hiçbir karede kaymadı
- ✅ Harita tek kez yeniden boyutlandı (hareket sırasında değil, sonunda) — 1
- ✅ Haritanın sağ kenarındaki denetimler panelin kenarıyla birlikte kayıyor, sonda sıçramıyor
- ✅ Sohbet, Claude olmadığını açıkça söylüyor (deneme kipi)
- ✅ Sohbet açılınca olay işaretçileri haritadan çekildi (çizelgede duruyorlar) — 8 → 0 işaretçi
- ✅ Yanıt gelmeden önce “Düşünüyor…” ve Durdur düğmesi var
- ✅ Yanıt numaralı adımlara bölünmüş (6 adım, hepsinin başlığı var) — 1,2,3,4,5,6
- ✅ İlk adım etkin, diğerleri değil
- ✅ Etkin adımda “Haritada gösteriliyor”, diğerlerinde “Haritada göster”
- ✅ Yapay zekâ yılı kullanıcının imlecini değiştirmez (yalnızca üstüne biner) — başlıkta 1505, imleç 0.5
- ✅ 1. adım yalnızca kendi çizimini gösteriyor: 2 devlet, bağlantı yok, 1 olay işareti, 0 serbest işaret, 1505 — 2 devlet · işaretçiler: safevi-1501 · Safevî Devleti'nin kuruluşu
- ✅ 1. adım: kamera çizimi görünür kıldı (9 nokta, görünüm dışında 0) — merkez 33.9, 40.7 · yakınlaştırma 4.00
- ✅ 1. adım: hiçbir etiket başka bir etiketi ya da işaretçiyi örtmüyor (19 öğe)
- ✅ 2. adım yalnızca kendi çizimini gösteriyor: 2 devlet, war, 1 olay işareti, 0 serbest işaret, 1514 — 2 devlet · işaretçiler: caldiran-1514 · savaş | Çaldıran Muharebesi
- ✅ 2. adım: kamera çizimi görünür kıldı (11 nokta, görünüm dışında 0) — merkez 42.0, 35.3 · yakınlaştırma 3.46
- ✅ 2. adım: hiçbir etiket başka bir etiketi ya da işaretçiyi örtmüyor (26 öğe)
- ✅ 3. adım yalnızca kendi çizimini gösteriyor: 2 devlet, war, 1 olay işareti, 1 serbest işaret, 1517 — 2 devlet · işaretçiler: ridaniye-1517 · savaş | Mercidabık | Ridaniye Savaşı ve Mısır'ın f…
- ✅ 3. adım: kamera çizimi görünür kıldı (12 nokta, görünüm dışında 0) — merkez 35.1, 29.5 · yakınlaştırma 3.29
- ✅ 3. adım: hiçbir etiket başka bir etiketi ya da işaretçiyi örtmüyor (31 öğe)
- ✅ 4. adım yalnızca kendi çizimini gösteriyor: 3 devlet, war, 2 olay işareti, 0 serbest işaret, 1526 — 3 devlet · işaretçiler: mohac-1526, viyana-1529 · savaş | Mohaç Muharebesi | Birinci Viyana Kuşatması
- ✅ 4. adım: kamera çizimi görünür kıldı (16 nokta, görünüm dışında 0) — merkez 29.2, 31.2 · yakınlaştırma 3.15
- ✅ 4. adım: hiçbir etiket başka bir etiketi ya da işaretçiyi örtmüyor (33 öğe)
- ✅ 5. adım yalnızca kendi çizimini gösteriyor: 2 devlet, alliance, 0 olay işareti, 0 serbest işaret, 1536 — 2 devlet · işaretçiler: — · İttifak, 1536
- ✅ 5. adım: kamera çizimi görünür kıldı (10 nokta, görünüm dışında 0) — merkez 22.9, 32.0 · yakınlaştırma 3.08
- ✅ 5. adım: hiçbir etiket başka bir etiketi ya da işaretçiyi örtmüyor (24 öğe)
- ✅ 6. adım yalnızca kendi çizimini gösteriyor: 3 devlet, war, 1 olay işareti, 0 serbest işaret, 1538 — 3 devlet · işaretçiler: preveze-1538 · savaş | Preveze Deniz Muharebesi
- ✅ 6. adım: kamera çizimi görünür kıldı (15 nokta, görünüm dışında 0) — merkez 22.9, 32.0 · yakınlaştırma 3.08
- ✅ 6. adım: hiçbir etiket başka bir etiketi ya da işaretçiyi örtmüyor (29 öğe)
- ✅ Anlatım başlayınca kamera ilk adımın çizimine gitti (dünya görünümünden yakınlaştı) — 1.48 → 4.00
- ✅ Adım değiştikçe kamera adımı izliyor: komşu adımların çoğunda harita kaydı ya da yakınlaştı/uzaklaştı — 4/5 geçişte oynadı
- ✅ Okurken harita adımı izliyor: kaydırdıkça etkin adım 1’den 6’ya sırayla ilerliyor — 1 1 2 2 3 3 4 4 5 6 6 6
- ✅ Son adımda harita son adımın durumunda (1538, Preveze olayı kendi işaretiyle) ve kamera onu görünür kıldı
- ✅ Geri dönülünce 1. adımın harita durumu aynen geri geliyor
- ✅ Önceki adımlara dönmek (4, 2, 6, 3, 5, 1) her seferinde yalnızca o adımın çizimini aynen getiriyor
- ✅ Okur zaman imlecini oynatınca yapay zekâ yılı kenara çekiliyor; sonraki adımda geri geliyor — 1520 → 1517
- ✅ Başlığa tıklamak yer kartına döndürür; sohbet kapanınca yapay zekâ çizimi haritadan kalkar
- ✅ Sohbet kapanınca olay işaretçileri haritaya geri döner (anlatıcı yalnızca sohbet açıkken) — 8 → 0 → 9
- ✅ Panel eski genişliğine döndü; harita yine yerinden oynamadı; kapanış da tek yeniden boyutlandırma — Δ = 0.00 px
- ✅ Kapanışta başlıktaki yıl kullanıcının imlecine döner (yapay zekâ yılı yok)
- ✅ Sohbet geri açılınca yazışma ve okuma konumu aynen duruyor — kaydırma 478 → 478
- ✅ Çizim yeniden haritada (etkin adımın durumu) ve olay işaretçileri yine yalnızca anlatılan olay

## A2. Sohbetten önce haritayı gezmek “Harita takibi”ni kapatmaz; takip ilk adımdan çalışır

- ✅ Sohbet açılmadan önce haritayı sürüklemek ve yakınlaştırmak takibi kapatmaz, soru da çıkmaz
- ✅ İlk adım açılınca kamera çizimi görünür kıldı (okurun kendi gezdiği görünümden) — 4.20 → 4.00
- ✅ 2. adım: harita iki devleti de görünür kılıyor (Osmanlı ve Safevî) — yakınlaştırma 4.00 → 3.46

## A3. Harita takibi: küçük hareketler kapatmaz, büyük hareketten sonra küçük bir soru çıkar

- ✅ Başlangıç: takip açık, soru yok, “serbest” uyarısı yok
- ✅ Kısa bir sürükleme takibi kapatmaz ve soru çıkarmaz
- ✅ Bir kez + düğmesi (bir yakınlaştırma düzeyi) de takibi kapatmaz ve soru çıkarmaz
- ✅ Önemli bir hareketten (iki düzey yakınlaşma) sonra küçük bir soru çıkıyor; takip kendiliğinden kapanmıyor
- ✅ Soru küçük ve sakin: haritanın %6’sından azını kaplar, yakınlaştırma düğmelerini örtmez, odağı çalmaz, iletişim kutusu değil — 420×68 px, %4.5
- ✅ Soru neyi sorduğunu ve ayarın nerede durduğunu söylüyor (Ayarlar ⚙ → Harita takibi) — Haritayı kendiniz gezdiniz. Adımlar haritayı izlemeyi bıraksın mı? Bıraksın İzlemeye devam Ayarlar ⚙ → Harita takibi
- ✅ Soru birkaç saniye içinde kendiliğinden kaybolmuyor (okunacak kadar kalıyor)
- ✅ Ayarlar bağlantısı sohbet ayarlarını açar, “Harita takibi” satırını işaretler ve anahtara odaklanır — Harita takibi
- ✅ Ayarın açıklaması küçük kaydırmaların kapatmadığını söyler
- ✅ “Bıraksın”: takip kapandı, “Harita takibi kapalı” çipi çıktı, kapandığı ve nerede açılacağı söyleniyor
- ✅ Takip kapalıyken adım değişince çizim değişir ama kamera oynamaz (okurla savaşmaz)
- ✅ Çiple yeniden açılınca etkin adım hemen görünür kılınır; çip kalkar
- ✅ Haritanın üçte biri kadar sürüklemek (önemli hareket) soruyu yeniden getirir
- ✅ “İzlemeye devam”: soru kalkar, takip açık kalır
- ✅ “İzlemeye devam” denildikten sonra aynı sohbette soru bir daha sorulmaz
- ✅ Takip açıkken sonraki adım haritayı yeniden çizime getirir (okurun uzak gezintisi geri alınır)
- ✅ Ayarlardaki anahtar açık
- ✅ Ayarlardaki anahtar takibi kapatıp açıyor
- ✅ Yeni sohbet takibi yeniden açar

## A4. Soru zaman aşımına uğrar ve “Geri aç” çalışır

- ✅ Büyük sürükleme soruyu getirdi
- ✅ Cevaplanmayan soru kendiliğinden kalkınca hiçbir şeye karar vermez: takip açık, “serbest” çipi yok, soru yok
- ✅ Başka bir büyük hareketten sonra soru yeniden çıkar
- ✅ “Geri aç”: takip yeniden açık ve çizim görünür

## B. Soru: Osmanlı–Fransa ittifakı (1536) — her yanıtın tek harita durumu var, kamera onu görünür kılar

- ✅ “Soru sor” sohbeti açar; yeni sohbette tanıtım ve öneriler var
- ✅ Tanıtım yeni davranışı anlatıyor: her adımın kendi çizimi, Harita takibi, olay işaretleri çizelgede
- ✅ Soru kutusuna odak gitti
- ✅ Soru gönderilince kutu temizlendi, “Düşünüyor…” görünür
- ✅ Soru yanıtı tek adım: numarasız, tek bölüm
- ✅ Her iki devlet de vurgulandı (Osmanlı ve Fransa) — ottoman-empire+kingdom-of-france
- ✅ İki devletin adı da haritada mürekkep renginde, kalın — Osmanlı İmparatorluğu | Fransa Krallığı
- ✅ İkisi ittifak çizgisiyle bağlandı: “İttifak, 1536” — İttifak, 1536
- ✅ Harita sınırları 1536’ya getirildi
- ✅ Kamera ittifakın iki ucunu da görünür kıldı (Fransa’dan Osmanlı’ya) ve haritada hiç olay işaretçisi yok — yakınlaştırma 1.48 → 3.08
- ✅ Etiketler birbirini ve işaretçileri örtmüyor

## C. Olay: sohbet açıkken çizelgeden bir olaya tıklamak, kartı sohbetin üstünde açar ve işaretçisini haritaya getirir

- ✅ Tıklamadan önce haritada olay işaretçisi yok; olaylar çizelgede
- ✅ Olay kartı sohbetin üstünde açıldı (sohbet altta duruyor, kart onu örtüyor)
- ✅ Tıklanan olay haritaya gelir: yalnızca onun işaretçisi, vurgulu — mohac-1526
- ✅ Kart soru kutusunu örtmüyor; arkadaki sohbet erişilemez (inert) ve ekran okuyuculardan gizli
- ✅ Yer, başlıkta tek satır olarak kalıyor ve açık olay soru kutusunda bağlam olarak görünüyor
- ✅ Açık olayın adı ve işaretçisi başka etiketlerle çakışmıyor
- ✅ Kartı kapatmak sohbete döndürür; okuma konumu aynı; olayın işaretçisi haritadan yeniden çekilir
- ✅ Esc de kartı kapatır; sohbet açık kalır
- ✅ Olay kartında “Bunu sohbette sor” düğmesi var
- ✅ Düğme olayı sohbete gönderdi: kart kapandı, kullanıcı mesajında olay çipi var
- ✅ Model olayı bağlam olarak aldı (açık olay kartı, kimliğiyle + soru)
- ✅ Yanıtın haritası: olay kendi işaretiyle (adı yanında), taraflar vurgulu, olayın yılı; serbest işaret yok — Mohaç Muharebesi · 1526

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

## J. Tek anlatıcı: sohbet açıkken olay işaretçileri haritadan çekilir; anılan ve tıklanan olay işaretçisini getirir

- ✅ Sohbet kapalıyken hiçbir şey değişmedi: haritada olay işaretçileri ve “n / m olay haritada” notu var — 8 işaretçi · 8 / 18 olay haritada · yakınlaştıkça artar
- ✅ Sohbet açılınca tüm olay işaretçileri haritadan çekilir, çizelgede aynen kalır — harita 8 → 0 · çizelge 16 → 16
- ✅ Not nedenini söylüyor: “0 olay haritada · gerisi çizelgede” — 0 olay haritada · gerisi çizelgede
- ✅ Hiçbir şey sorulmadan sohbeti kapatmak haritayı birebir eski hâline getirir (aynı işaretçiler)
- ✅ Çizelgeden tıklanan olay haritada belirir (yalnızca o) ve kartı açıktır
- ✅ Kart kapanınca olayın işaretçisi yeniden haritadan çekilir
- ✅ 2. adım Çaldıran’dan söz ediyor: haritada Çaldıran’ın kendi işaretçisi ve adı var, başka olay yok — caldiran-1514 · Çaldıran Muharebesi
- ✅ Anılan olayın işaretçisi sıradan olay işaretçisiyle aynı (yıl yazılı, düğme, vurgulu değil)
- ✅ Anılan olayın işaretçisine tıklamak olay kartını sohbetin üstünde açar
- ✅ Hem anılan hem açık olduğunda adı bir kez yazılı (açık olayın etiketi), çakışma yok
- ✅ Kart kapanınca olay yine anlatılan olay olarak haritada kalır
- ✅ Model verideki bir olay (Belgrad’ın fethi) için mark çağırınca olayın kendi işareti gösterilir, ikinci bir işaret çizilmez — tamam: «Belgrad'ın fethi» uygulamanın olay kaydı; kendi işaretiyle gösterildi (böyle olaylar için show_event kullan)
- ✅ Verinin bilmediği bir yer (Konya) serbest işaret olarak kalır: mürekkep eşkenar dörtgen ve etiketi — savaş, Mohaç Muharebesi, Birinci Viyana Kuşatması, Konya, Belgrad'ın fethi
- ✅ Bu kalabalık adımda da (3 olay + 1 işaret + bağlantı) etiketler birbirini ve işaretçileri örtmüyor
- ✅ Sohbet kapanınca anlatıcının işaretçileri ve çizimi gider, haritanın olayları geri gelir — caldiran-1514, ridaniye-1517, luther-95-tez-1517, magellan-elcano-1519, rodos-1522, mohac-1526, habes-adal-savasi-1529, viyana-1529, preveze-1538, suleymaniye-1550

## K. Etiket çakışması: her adımda, farklı kameralarda ve ekran boyutlarında hiçbir etiket başkasını örtmüyor

- ✅ 1440×900: 6 adım × 3 kamera (çerçeve, +0,9, −0,9) = 18 durumda 33 yapay zekâ etiketi hiçbir etiketi ya da işaretçiyi örtmüyor
- ✅ 1180×760: 6 adım × 3 kamera (çerçeve, +0,9, −0,9) = 18 durumda 33 yapay zekâ etiketi hiçbir etiketi ya da işaretçiyi örtmüyor

## E. Durdurma, hatalar, ayarlar

- ✅ Durdur: yanıt hemen “durduruldu” olur, yazılan kısım kalır — 334 karakter
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
- ✅ Altı araç: step, highlight, connect, show_event, mark, set_year (focus ve clear yok: her adım haritanın sahibi, kamera okurun ayarı)
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
- ✅ Telefon: Harita takibi sorusu haritanın içinde kalır, yakınlaştırma düğmelerini ve sayacı örtmez, haritanın %22’sinden azını kaplar — %19.0

## I. Genel

- ✅ Hiçbir sayfada konsol ya da sayfa hatası yok

## Ekran görüntüleri

- `ai-0-yer-karti.png`, `ai-0-bos-sohbet.png`: yer kartı ve açılan sohbet
- `ai-1a-anlatim-adim1.png`, `ai-1b-anlatim-adim2.png`, `ai-1d-anlatim-adim3.png`, `ai-1e-anlatim-adim4.png`, `ai-1c-anlatim-adim6.png`: anlatım; her adım yalnızca kendi çizimini gösterir, kamera adımı izler
- `ai-1f-tek-anlatici.png`: sohbet açıkken haritada yalnızca anılan ve tıklanan olayların işaretçileri
- `ai-2-ittifak-sorusu.png`: Osmanlı–Fransa ittifakı sorusu (iki devlet vurgulu ve bağlı, kamera ikisini de görünür kıldı)
- `ai-9-harita-takibi-sorusu.png`, `ai-9b-harita-takibi-ayari.png`, `ai-9c-harita-takibi-kapali.png`, `ai-9d-harita-takibi-telefon.png`: büyük bir gezintiden sonra küçük soru; ayarın yeri; kapalıyken çip; telefonda soru
- `ai-3a-olay-sohbetin-ustunde.png`, `ai-3b-bunu-sohbette-sor.png`: olay kartı sohbetin üstünde; “Bunu sohbette sor”
- `ai-4-baglam-degisti.png`: seçili yer değişince sohbette “Bağlam değişti”
- `ai-5-hata.png`, `ai-6-mobil.png`, `ai-7-ayarlar.png`, `ai-8-gercek-sample.png`
