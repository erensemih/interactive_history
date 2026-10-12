# Okuma arkadaşı ve harita öncelikli düzen: doğrulama raporu

242/242 denetim geçti (`npm run e2e:ai`). Model olarak komut dosyalı deneme kipi kullanıldı; G grubu gerçek `sample` bağdaştırıcısını sahte bir çalışma zamanıyla sınar.

## L. Düzen: harita neredeyse tam ekran, ince zaman çizelgesi, soru kutusu hemen üstünde, küçük ve kolay kapanan bilgi kartı

- ✅ Harita neredeyse tüm ekranı kaplıyor: genişlikte tamamı, ekranın %85’inden fazlası; sayfa kaymıyor — %86 · 1440×776 / 1440×900
- ✅ Üstte tek ince çubuk (ad, yer ve yıl, atıf) var; harita ile zaman çizelgesi arasında başka bir şerit yok — çubuk 44 px · başlık: Dünya
- ✅ Zaman çizelgesi ince: en çok 84 px (ekranın %10’undan az), altta — 80 px
- ✅ Soru kutusu zaman çizelgesinin hemen üstünde ve ortada — aralık 12 px
- ✅ Bilgi kartı sağda, eskisinden (410 px) küçük, haritanın yarısından az yer tutar; ekranın üst yarısında — 328×374 px
- ✅ Tanıtım kartı ✕ ile kapanır ve sağ taraf boşalır
- ✅ Yer seçilince küçük kart sağda açılır (Osmanlı İmparatorluğu); harita yerinden oynamaz
- ✅ Kart kısa tutuluyor: ayrıntılar ve “aynı sırada, başka yerlerde” listesi kapalı bölümlerde — özet 88 px
- ✅ Kapalı liste açılınca olaylar satır satır orada (tıklanabilir)
- ✅ Karttaki ✕ kartı kapatır ve yer seçimini kaldırır (başlık “Dünya”)
- ✅ Esc de kartı kapatır
- ✅ Soru sorulunca kart kendiliğinden çekilir: yalnızca küçük bir sekme kalır; yer seçili kalır — 196×36 px
- ✅ Soru yine de o yerle ilgili: bağlamda yer var
- ✅ Sekmeye tıklamak kartı geri getirir
- ✅ Yanıt kapatılınca kart kendiliğinden geri gelir

## A. İzle: çok adımlı anlatım adım adım ilerler; her adım yalnızca kendi çizimini gösterir; kamera adımı izler

- ✅ Anadolu’daki nokta seçildi: Osmanlı İmparatorluğu; kartta “Bu yerin tarihini anlat” ve “Soru sor” var
- ✅ Yanıt gelmeden önce haritanın üstünde “Düşünüyor…” ve Durdur var; soru kutusunda da Durdur düğmesi
- ✅ Çağrı yapıldı: kart kenara çekildi (sekme), yer seçili kaldı
- ✅ İzle, uzun metinler bitmeden başladı: ilk adımın altyazısı var, metin hâlâ yazılıyor (“Metin yazılıyor…”) — streaming · 108 karakter · 1 / 6
- ✅ Metin bitince “Metin yazılıyor…” kalkar; adım sayısı 6; altyazılar ve başlıklar dolu
- ✅ Altyazı modelin step çağrısındaki altyazıdır, bir iki cümle (en çok ~200 karakter) ve metinden kısa — 129 karakter
- ✅ Yapay zekâ yılı kullanıcının imlecini değiştirmez (yalnızca üstüne biner) — başlıkta 1505, imleç 0.5
- ✅ Anlatım sürerken olay işaretçileri haritadan çekildi (çizelgede duruyorlar); yalnızca anlatılan olay haritada — 11 → 1 işaretçi
- ✅ Sohbet, Claude olmadığını açıkça söylüyor (deneme kipi)
- ✅ 1. adım yalnızca kendi çizimini gösteriyor: 2 devlet, bağlantı yok, 1 olay işareti, 0 serbest işaret, 1505 — 2 devlet · işaretçiler: safevi-1501 · Safevî Devleti'nin kuruluşu
- ✅ 1. adım: altyazı ve sayaç bu adımın (“1 / 6”, “Doğuda yeni bir komşu”)
- ✅ 1. adım: kamera çizimi görünür kıldı (9 nokta, görünüm dışında 0) ve hiçbiri kartın, altyazının ya da soru kutusunun altında kalmadı (0) — merkez 33.8, 39.4 · yakınlaştırma 4.33
- ✅ 1. adım: hiçbir etiket başka bir etiketi ya da işaretçiyi örtmüyor (22 öğe)
- ✅ 2. adım yalnızca kendi çizimini gösteriyor: 2 devlet, war, 1 olay işareti, 0 serbest işaret, 1514 — 2 devlet · işaretçiler: caldiran-1514 · savaş | Çaldıran Muharebesi
- ✅ 2. adım: altyazı ve sayaç bu adımın (“2 / 6”, “Çaldıran: doğu sınırı çiziliyor”)
- ✅ 2. adım: kamera çizimi görünür kıldı (11 nokta, görünüm dışında 0) ve hiçbiri kartın, altyazının ya da soru kutusunun altında kalmadı (0) — merkez 42.0, 32.2 · yakınlaştırma 3.41
- ✅ 2. adım: hiçbir etiket başka bir etiketi ya da işaretçiyi örtmüyor (42 öğe)
- ✅ 3. adım yalnızca kendi çizimini gösteriyor: 2 devlet, war, 1 olay işareti, 1 serbest işaret, 1517 — 2 devlet · işaretçiler: ridaniye-1517 · savaş | Mercidabık | Ridaniye Savaşı ve Mısır'ın f…
- ✅ 3. adım: altyazı ve sayaç bu adımın (“3 / 6”, “Memlük topraklarının alınması”)
- ✅ 3. adım: kamera çizimi görünür kıldı (12 nokta, görünüm dışında 0) ve hiçbiri kartın, altyazının ya da soru kutusunun altında kalmadı (0) — merkez 35.4, 24.1 · yakınlaştırma 2.84
- ✅ 3. adım: hiçbir etiket başka bir etiketi ya da işaretçiyi örtmüyor (37 öğe)
- ✅ 4. adım yalnızca kendi çizimini gösteriyor: 3 devlet, war, 2 olay işareti, 0 serbest işaret, 1526 — 3 devlet · işaretçiler: mohac-1526, viyana-1529 · savaş | Mohaç Muharebesi | Birinci Viyana Kuşatması
- ✅ 4. adım: altyazı ve sayaç bu adımın (“4 / 6”, “Süleyman ve Orta Avrupa”)
- ✅ 4. adım: kamera çizimi görünür kıldı (16 nokta, görünüm dışında 0) ve hiçbiri kartın, altyazının ya da soru kutusunun altında kalmadı (0) — merkez 29.5, 25.2 · yakınlaştırma 2.69
- ✅ 4. adım: hiçbir etiket başka bir etiketi ya da işaretçiyi örtmüyor (35 öğe)
- ✅ 5. adım yalnızca kendi çizimini gösteriyor: 2 devlet, alliance, 0 olay işareti, 0 serbest işaret, 1536 — 2 devlet · işaretçiler: — · İttifak, 1536
- ✅ 5. adım: altyazı ve sayaç bu adımın (“5 / 6”, “Fransa ile ittifak”)
- ✅ 5. adım: kamera çizimi görünür kıldı (10 nokta, görünüm dışında 0) ve hiçbiri kartın, altyazının ya da soru kutusunun altında kalmadı (0) — merkez 23.2, 25.8 · yakınlaştırma 2.63
- ✅ 5. adım: hiçbir etiket başka bir etiketi ya da işaretçiyi örtmüyor (29 öğe)
- ✅ 6. adım yalnızca kendi çizimini gösteriyor: 3 devlet, war, 1 olay işareti, 0 serbest işaret, 1538 — 3 devlet · işaretçiler: preveze-1538 · savaş | Preveze Deniz Muharebesi
- ✅ 6. adım: altyazı ve sayaç bu adımın (“6 / 6”, “Akdeniz’de güç dengesi”)
- ✅ 6. adım: kamera çizimi görünür kıldı (15 nokta, görünüm dışında 0) ve hiçbiri kartın, altyazının ya da soru kutusunun altında kalmadı (0) — merkez 23.2, 25.8 · yakınlaştırma 2.63
- ✅ 6. adım: hiçbir etiket başka bir etiketi ya da işaretçiyi örtmüyor (34 öğe)
- ✅ Altyazı sabit bir yerde: kutunun alt kenarı ve yatay konumu her adımda aynı (altyazı gibi) — 716 716 716 716 716 716
- ✅ Anlatım başlayınca kamera ilk adımın çizimine gitti (dünya görünümünden yakınlaştı) — 1.97 → 4.33
- ✅ Adım değiştikçe kamera adımı izliyor: komşu adımların çoğunda harita kaydı ya da yakınlaştı/uzaklaştı — 4/5 geçişte oynadı
- ✅ Önceki adımlara dönmek (4, 2, 6, 3, 5, 1) her seferinde yalnızca o adımın çizimini aynen getiriyor
- ✅ Okur zaman imlecini oynatınca yapay zekâ yılı kenara çekiliyor; sonraki adımda geri geliyor — 1520 → 1517
- ✅ Anlatımı kapatmak (✕) yapay zekâ çizimini haritadan kaldırır; olay işaretçileri geri gelir; kart geri gelir — 11 → 1 → 12
- ✅ Kapanışta başlıktaki yıl kullanıcının imlecine döner (yapay zekâ yılı yok)
- ✅ Yazışma silinmedi: soru kutusundaki metin düğmesi duruyor, yanıt hâlâ okunabilir

## V. İzle’de gezinme: düğmeler, ok tuşları, isteğe bağlı otomatik oynatma ve hız; çizelgede ilerleme çubuğu

- ✅ Otomatik oynatma isteğe bağlı: kendiliğinden başlamaz (yanıt bittikten sonra da 1. adımda, oynatma kapalı) — adım 1/6 · oynatma false
- ✅ 1. adımda “Önceki” kapalı, “Sonraki” açık
- ✅ “Sonraki” 2. adıma geçirir: sayaç “2 / 6”, harita 2. adımın çizimi (Osmanlı + Safevî, savaş); “Önceki” açıldı
- ✅ “Önceki” 1. adıma döndürür ve kendini yeniden kapatır
- ✅ Ok tuşları: → sonraki, ← önceki adım (1 → 2 → 3 → 2) — 2, 3, 2
- ✅ End son adıma, Home ilk adıma götürür; harita her seferinde o adımın çizimini gösterir; son adımda “Sonraki” kapalı — ottoman-empire,republic-of-venice,papal-states | ottoman-empire,safavid-dynasty
- ✅ Soru kutusundayken ok tuşları yazı imlecinindir: anlatım yerinde kalır
- ✅ Harita odaktayken de oklar anlatımındır: haritayı kaydırmaz (son adımda → hiçbir şey yapmaz, kamera yerinde) — harita odakta: true
- ✅ Çizelge ilerleme çubuğu: 6 adımın 6 noktası, 1’den 6’ya soldan sağa, tarihleriyle (1505, 1514, 1517, 1526, 1536, 1538) — 1:1505 2:1514 3:1517 4:1526 5:1536 6:1538
- ✅ Her nokta kendi yılının hizasında (yan yana düşenler en çok 26 px kaydırılmış) ve birbirine değmiyor (en az 14 px) — en dar aralık 16 px · kayma -0, -0, -0, -0, -0, 4
- ✅ Noktalar zaman çizelgesi bandının içinde ve band ince kalıyor (en çok 84 px) — 80 px
- ✅ İlerleme: 3. adımdayken 1–2 dolu (görüldü), 3 işaretli, 4–6 boş; çizgi birinci noktadan üçüncüye uzanıyor — past past on - - -
- ✅ Çizelgedeki 5 numaralı noktaya tıklamak 5. adıma götürür (altyazı “5 / 6”, harita 5. adımın çizimi, başlıkta 1536)
- ✅ Bu tıklama okurun kendi aralığına ve imlecine dokunmaz (ilerleme çubuğu zaman seçimi değildir) — {"range":{"from":1500,"to":1550},"cursor":0.5}
- ✅ Oynat düğmesi basılı değil; hız seçici üç seçenek sunuyor (Yavaş, Normal, Hızlı), Normal seçili — slow:Yavaş normal:Normal fast:Hızlı
- ✅ Hızı değiştirmek tek başına oynatmaz
- ✅ Oynat’a basınca düğme “Duraklat” olur, basılı görünür ve anlatım oynar
- ✅ Hızlıda adım, altyazısının okunma süresi kadar (~4.6 sn) kalıp kendiliğinden 2. adıma geçer — 4681 ms
- ✅ Oynarken 2. adımın çizimi haritada; oynatma sürüyor
- ✅ Hız “Yavaş” yapılınca bekleme yeniden ölçülür: hızlıda geçecek süre dolduğu hâlde adım hâlâ 2 ve oynatma sürüyor — 2. adım
- ✅ Duraklat oynatmayı durdurur
- ✅ Elle adım değiştirmek (Sonraki) oynatmayı durdurur: okur kontrolü alır — 3. adım · oynatma false
- ✅ Durdurulmuş anlatım, süre dolsa da yerinde kalır
- ✅ Oynatma son adımda biter: son adımın altyazısına da süre tanır, sonra 6. adımda durur (başa dönmez); düğme yeniden “Oynat” — 6. adım · oynatma false
- ✅ Sonda yeniden Oynat’a basmak anlatımı baştan oynatır
- ✅ Anlatımı kapatmak çizelgedeki adım noktalarını kaldırır

## W. Oku: yan panel ve tam ekran (köşede küçük harita); Oku ↔ İzle geçişinde adım korunur; okurken sorulan soru haritayı arka planda günceller

- ✅ İzle’de harita tüm sahne; metin kapalı (Oku paneli yok), altyazı haritanın üstünde; soru kutusunda metin düğmesi basılı değil
- ✅ (Hazırlık) 3. adımda otomatik oynatma açıldı
- ✅ “Metni oku”: metin yan panel olarak açıldı; harita hâlâ tüm sahne (panel haritanın üstünde, altyazı kalktı) — panel 461×776 px
- ✅ Görünüm değişince otomatik oynatma durur (okurun iki elinden biri metinde)
- ✅ Adım korundu: metinde 3. adım etkin, “Haritada gösteriliyor” orada ve okuma konumunda (görünür) — üstten 116 px / 727
- ✅ Arkadaki harita 3. adımın çiziminde kaldı (Osmanlı + Memlûk, savaş, 1517) ve panelin altında kalan bir şey yok — görünüm dışı 0, örtülü 0
- ✅ Soru kutusu panelin soluna çekildi (örtüşmüyor); başlıkta yer ve aralık yazıyor
- ✅ Yan panel açıkken etiketler birbirini ve işaretçileri örtmüyor
- ✅ Oku’dayken oklar metni kaydırır, anlatımı ilerletmez (adım 3’te kaldı)
- ✅ Oku → İzle: 3. adım korundu (altyazı “3 / 6”), metin kapandı, harita 3. adımda — watch · 3
- ✅ Metni kaydırdıkça okuma çizgisindeki adım haritaya gelir (yukarı kaydırmadan 5. adıma ulaşıldı); etkin adım tek — 5. adım · ottoman-empire+kingdom-of-france
- ✅ Okurken ulaşılan adım İzle’ye taşınır (altyazı o adımın) — 5. adım
- ✅ Soru kutusundaki metin düğmesi okuyucuyu açar (basılı), bir daha basınca kapatır ve İzle’ye döner; adım korunur
- ✅ …kapatınca İzle’ye döner, 3. adım
- ✅ Tam ekran: metin sahneyi kapladı; harita köşede küçük bir pencere (sağ üst), tarayıcı penceresinin içinde — pencere 338×234 px, sağ üstte (1083, 101)
- ✅ Küçük harita o anki adımı gösteriyor: 3. adımın çizimi, tamamı pencerenin içinde ve hiçbir şeyin altında değil — 12 nokta · görünüm dışı 0 · örtülü 0
- ✅ Tam ekranda da adım korundu: metinde 3. adım etkin ve görünür; “Haritada gösteriliyor” orada
- ✅ Metin rahat bir sütun (en çok 720 px) ve küçük haritayla yan yana: ikisi birbirini örtmüyor — sütun 720 px
- ✅ Pencerede “Haritayı büyüt” düğmesi var
- ✅ Küçük haritada çizimin ad etiketleri yok (pencereyi kalabalıklaştırmaz; metin yanında), çizim ve işaretçiler yerinde — 0 etiket · war · ridaniye-1517
- ✅ Metindeki 5. adımda “Haritada göster”: küçük harita 5. adımın çizimine geçer (Osmanlı + Fransa, ittifak, 1536) ve onu tam gösterir — ottoman-empire+kingdom-of-france · görünüm dışı 0
- ✅ Tam ekranda metni yukarı kaydırmak küçük haritadaki adımı da geri götürür — 2. adım
- ✅ Esc önce tam ekranı yan panele küçültür (harita yeniden tüm sahne), adım korunur
- ✅ Bir daha Esc metni kapatıp İzle’ye döner; adım hâlâ aynı
- ✅ “Haritayı büyüt”: harita yeniden tüm sahne, İzle’ye dönüldü, adım korundu ve çizim yine tam görünür — 2. adım · 2 ad etiketi geri geldi
- ✅ Okuyucu en son kullanılan kipte açılır (burada tam ekran) ve 4. adımda başlar — full · 4. adım
- ✅ Okurken soru: yanıt metne eklendi, okuyucu açık kaldı (yan panel); yeni yanıt adımsız, tek parça — 2 yanıt
- ✅ Arkadaki harita yeni soruya geçti (Osmanlı + Fransa, ittifak çizgisi, 1536) ve çizim paneli ile soru kutusunun dışında — ottoman-empire+kingdom-of-france · 1536
- ✅ Tam ekranda okurken soru: küçük harita yeni yanıtın sahnesine geçer (görünür, örtülü değil); okuyucu açık — ottoman-empire · işaret 1
- ✅ İzle’ye dönünce son yanıt kısa yanıt olarak haritanın üstünde (adım sayacı yok)

## A2. Anlatımdan önce haritayı gezmek “Harita takibi”ni kapatmaz; takip ilk adımdan çalışır

- ✅ Anlatımdan önce haritayı sürüklemek ve yakınlaştırmak takibi kapatmaz, soru da çıkmaz
- ✅ İlk adım açılınca kamera çizimi görünür kıldı (okurun kendi gezdiği görünümden) — 4.20 → 4.33
- ✅ 2. adım: harita iki devleti de görünür kılıyor (Osmanlı ve Safevî) — yakınlaştırma 4.33 → 3.41

## A3. Harita takibi: küçük hareketler kapatmaz, büyük hareketten sonra küçük bir soru çıkar

- ✅ Başlangıç: takip açık, soru yok, “serbest” uyarısı yok
- ✅ Kısa bir sürükleme takibi kapatmaz ve soru çıkarmaz
- ✅ Bir kez + düğmesi (bir yakınlaştırma düzeyi) de takibi kapatmaz ve soru çıkarmaz
- ✅ Önemli bir hareketten (iki düzey yakınlaşma) sonra küçük bir soru çıkıyor; takip kendiliğinden kapanmıyor
- ✅ Soru küçük ve sakin: haritanın %6’sından azını kaplar, kartı, altyazıyı, soru kutusunu ve yakınlaştırma düğmelerini örtmez, odağı çalmaz, iletişim kutusu değil — 420×68 px, %2.6
- ✅ Soru neyi sorduğunu ve ayarın nerede durduğunu söylüyor (Ayarlar ⚙ → Harita takibi) — Haritayı kendiniz gezdiniz. Adımlar haritayı izlemeyi bıraksın mı? Bıraksın İzlemeye devam Ayarlar ⚙ → Harita takibi
- ✅ Soru birkaç saniye içinde kendiliğinden kaybolmuyor (okunacak kadar kalıyor)
- ✅ Ayarlar bağlantısı soru kutusunun ayarlarını açar, “Harita takibi” satırını işaretler ve anahtara odaklanır — Harita takibi
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

## B. Kısa yanıt: adımsız, kısa bir metin ve en çok tek harita sahnesi (Osmanlı–Fransa ittifakı, 1536); metin haritanın üstünde, soru kutusunun hemen üzerinde

- ✅ “Soru sor” soru kutusuna odaklanır; ilk soru öncesi öneriler (Bu yerin tarihini anlat, …) çıkar
- ✅ Soru gönderilince kutu temizlendi; yanıt gelene kadar haritanın üstünde “Düşünüyor…” ve Durdur görünür
- ✅ Yanıt kısa yanıt olarak haritanın üstünde: adım sayacı, noktalar, önceki/sonraki, oynat ve hız yok; çizelgede adım noktaları yok — adımlı: false
- ✅ Metin kısa (en çok 3 paragraf, 1500 karakter), Fransa Kralı I. François’yı anlatıyor; “Metni oku” ve Kapat var — 743 karakter
- ✅ Metin soru kutusunun hemen üstünde (en çok 24 px aralık) ve kutuyu örtmüyor — aralık 10 px
- ✅ En çok tek sahne: iki devlet vurgulandı (Osmanlı ve Fransa), ikisi ittifak çizgisiyle bağlı; serbest işaret ve olay yok — ottoman-empire+kingdom-of-france · İttifak, 1536
- ✅ İki devletin adı da haritada mürekkep renginde, kalın — Osmanlı İmparatorluğu | Fransa Krallığı
- ✅ Harita sınırları 1536’ya getirildi
- ✅ Kamera ittifakın iki ucunu da görünür kıldı (Fransa’dan Osmanlı’ya), metnin ve soru kutusunun altında kalan bir şey yok; haritada olay işaretçisi yok — yakınlaştırma 1.97 → 1.73 · örtülü 0
- ✅ Etiketler birbirini, işaretçileri ve metni örtmüyor
- ✅ Soru sorulunca yer kartı kenara çekildi (sekme), yer seçili kaldı
- ✅ “Metni oku”: tek parça, numarasız (adım numarası yok); haritadaki sahne “Haritada gösteriliyor”; aynı metin — 1 bölüm
- ✅ İzle’ye dönünce yine kısa yanıt (sayaç yok)

## C. Olay: yanıt ekrandayken çizelgeden bir olaya tıklamak, kartı sağda açar ve işaretçisini haritaya getirir

- ✅ Tıklamadan önce haritada olay işaretçisi yok; olaylar çizelgede
- ✅ Olay kartı sağda açıldı (yer kartının yerinde); kısa yanıt ve soru kutusu yerinde
- ✅ Tıklanan olay haritaya gelir: yalnızca onun işaretçisi, vurgulu — mohac-1526
- ✅ Olay kartı küçük (en çok 340 px) ve sağ kenarda; yanıtın metnini ve soru kutusunu örtmez — 328 px
- ✅ Yer, kartın üstünde tek satır olarak duruyor; açık olay soru kutusunda bağlam olarak görünüyor
- ✅ Açık olayın adı ve işaretçisi başka etiketlerle çakışmıyor
- ✅ Kartı kapatmak yanıtı yerinde bırakır; olayın işaretçisi haritadan çekilir; yer kartı sekmeye döner (önceki hâli)
- ✅ Esc de olay kartını kapatır; yanıt ekranda kalır
- ✅ Olay kartında “Bunu sohbette sor” düğmesi var
- ✅ Düğme olayı soruya ekledi: kart kapandı, yer kartı sekmede; yeni yanıt kısa yanıt olarak ekranda
- ✅ Model olayı bağlam olarak aldı (açık olay kartı, kimliğiyle + soru)
- ✅ Yanıtın haritası: olay kendi işaretiyle (adı yanında), taraflar vurgulu, olayın yılı; serbest işaret yok — ottoman-empire+kingdom-of-hungary+habsburg-monarchy · mohac-1526 · Mohaç Muharebesi · 1526 · işaret 0 · görünüm dışı 0 · örtülü 0
- ✅ Metinde kullanıcı mesajının altında olay çipi var (Mohaç Muharebesi)

## C2. Olay: yanıt yokken kart sağda açılır; “Bunu sohbette sor”; çizelgeden; Esc sırası

- ✅ Yanıt yokken olay kartı sağdaki kartta açılır (altyazı, metin ya da sekme yok)
- ✅ “Bunu sohbette sor” olayı soruya ekler: yanıt haritanın üstünde, olay kartı kapandı, yer kartı sekmede
- ✅ Çizelgedeki noktaya tıklamak da kartı sağda açar (Çaldıran); yanıt yerinde
- ✅ Esc önce olay kartını kapatır, yanıt ekranda kalır
- ✅ Bir daha Esc yanıtı kapatır ve yer kartı geri gelir (yer seçili kalır, harita okurun)
- ✅ Bir daha Esc yer seçimini kaldırır

## D. Bağlam: yanıt sürerken seçili yer değişirse metin bunu gösterir

- ✅ Yer değişmeden ayırıcı yok
- ✅ Yer değişince metinde tek bir “Bağlam değişti” ayırıcısı çıkıyor
- ✅ Ayırıcı eski ve yeni konuyu söylüyor — BAĞLAM DEĞİŞTİ Osmanlı İmparatorluğu · 1500–1550 → Fransa Krallığı · 1500–1550
- ✅ Üst çubuk yeni yeri gösteriyor
- ✅ Soru kutusu yeni yeri söylüyor
- ✅ Yeni yerin kartı sağda geri geldi (seçim kartı sekmeden çıktı)
- ✅ Aralık da değişince aynı ayırıcı güncelleniyor (ikincisi eklenmiyor)
- ✅ Okur konuya dönerse ayırıcı kalkıyor
- ✅ Model bağlamın değiştiğini söylendi (“Konu değişti”)
- ✅ Ayırıcı metinde, değişiklikten sonraki sorunun önünde kalıyor

## J. Tek anlatıcı: yanıt ekrandayken olay işaretçileri haritadan çekilir; anılan ve tıklanan olay işaretçisini getirir

- ✅ Yanıt yokken hiçbir şey değişmedi: haritada olay işaretçileri ve “n / m olay haritada” notu var — 11 işaretçi · 11 / 18 olay haritada · yakınlaştıkça artar
- ✅ Soru kutusuna geçmek haritaya dokunmaz: işaretçiler yerinde (anlatıcı, ekrana bir yanıt gelince başlar)
- ✅ Yanıt ekrana gelince tüm olay işaretçileri haritadan çekilir, çizelgede aynen kalır — harita 11 → 0 · çizelge 16 → 16
- ✅ Not nedenini söylüyor: “0 olay haritada · gerisi çizelgede” — 0 olay haritada · gerisi çizelgede
- ✅ Çizelgeden tıklanan olay haritada belirir (yalnızca o) ve kartı açıktır
- ✅ Kart kapanınca olayın işaretçisi yeniden haritadan çekilir
- ✅ Yanıtı kapatmak (✕) olay işaretçilerini haritaya geri getirir, yapay zekâ çizimi gider, eski not döner (kamera yerinde kalır) — 10 işaretçi · 10 / 18 olay haritada · yakınlaştıkça artar
- ✅ 2. adım Çaldıran’dan söz ediyor: haritada Çaldıran’ın kendi işaretçisi ve adı var, başka olay yok — caldiran-1514 · Çaldıran Muharebesi
- ✅ Anılan olayın işaretçisi sıradan olay işaretçisiyle aynı (yıl yazılı, düğme, vurgulu değil)
- ✅ Anılan olayın işaretçisine tıklamak olay kartını sağda açar; altyazı yerinde kalır
- ✅ Hem anılan hem açık olduğunda adı bir kez yazılı (açık olayın etiketi), çakışma yok
- ✅ Kart kapanınca olay yine anlatılan olay olarak haritada kalır
- ✅ Model verideki bir olay (Belgrad’ın fethi) için mark çağırınca olayın kendi işareti gösterilir, ikinci bir işaret çizilmez — tamam: «Belgrad'ın fethi» uygulamanın olay kaydı; kendi işaretiyle gösterildi (böyle olaylar için show_event kullan)
- ✅ Verinin bilmediği bir yer (Konya) serbest işaret olarak kalır: mürekkep eşkenar dörtgen ve etiketi — savaş, Mohaç Muharebesi, Birinci Viyana Kuşatması, Konya, Belgrad'ın fethi
- ✅ Bu kalabalık adımda da (3 olay + 1 işaret + bağlantı) etiketler birbirini ve işaretçileri örtmüyor
- ✅ Anlatım kapanınca anlatıcının işaretçileri ve çizimi gider, haritanın olayları geri gelir — kabral-brezilya-1500, malaka-1511, caldiran-1514, ridaniye-1517, luther-95-tez-1517, magellan-elcano-1519, rodos-1522, panipat-1526, mohac-1526, habes-adal-savasi-1529, viyana-1529, preveze-1538, kopernik-1543, suleymaniye-1550

## K. Etiket çakışması: her adımda, farklı kameralarda ve ekran boyutlarında hiçbir etiket başkasını örtmüyor

- ✅ 1440×900: 6 adım × 3 kamera (çerçeve, +0,9, −0,9) = 18 durumda 34 yapay zekâ etiketi hiçbir etiketi ya da işaretçiyi örtmüyor
- ✅ 1180×760: 6 adım × 3 kamera (çerçeve, +0,9, −0,9) = 18 durumda 34 yapay zekâ etiketi hiçbir etiketi ya da işaretçiyi örtmüyor

## E. Durdurma, hatalar, ayarlar

- ✅ Durdur: yanıt hemen “durduruldu” olur; adımlar ve yazılan kısım kalır, altyazı ekranda — 216 karakter
- ✅ Durdurunca gönder düğmesi geri gelir, sohbet kilitlenmez; “Yeniden dene” yalnızca okur basınca
- ✅ Metin okuyucuda da yarım kalan kısım ve “Durduruldu” notu var — 1076 karakter
- ✅ rate_limited: hata yanıtın yerinde; yazılan metin kalır; yeniden dene düğmesi var
- ✅ rate_limited sohbeti kilitlemez; kendiliğinden yeniden denemez (tek istek)
- ✅ “Yeniden dene” yalnızca okur basınca ve bir kez soruyor
- ✅ not_granted: kalıcı uyarı soru kutusunun üstünde, kutu kapalı, izin paneli düğmesi
- ✅ Ayarlar: üç hız (Hızlı, Dengeli, Derin), varsayılan Dengeli; model adı yok
- ✅ Ayar menüsü soru kutusunun hemen üstünde açılır ve ekranın içinde kalır — 320×307 px
- ✅ Seçilen hız modele gidiyor (quick)
- ✅ Seçim tarayıcıda saklanıyor
- ✅ Yenilenince seçim korunuyor
- ✅ Yanıt var: haritada çizim, soru kutusunda metin düğmesi
- ✅ “Sohbeti temizle” yazışmayı, ekrandaki yanıtı ve haritadaki çizimi siler; metin düğmesi kalkar

## G. Gerçek sample bağdaştırıcısı (sahte çalışma zamanıyla, tarayıcıda)

- ✅ Claude çalışma zamanı varken deneme kipi uyarısı yok; sağlayıcı “sample”
- ✅ Metin henüz yokken (araç turu bitti, uzun metin yazılmıyor) İzle başladı: 1. adımın altyazısı ve “Metin yazılıyor…” — waiting · 0 karakter · 1 / 2
- ✅ Haritada 1. adımın çizimi şimdiden var (iki devlet, ittifak çizgisi, 1536); tanınmayan devlet sessizce atlandı — ottoman-empire+kingdom-of-france
- ✅ Metin yazılmadan 2. adıma da geçilebiliyor: Osmanlı + Venedik, Preveze işareti, 1538 — ottoman-empire+republic-of-venice · preveze-1538
- ✅ Metin yazılmadan Oku açılırsa her adımın altyazısı yerinde duruyor (“yazılıyor” sürerken boş kalmaz)
- ✅ Metin gelince “Metin yazılıyor…” kalkar; oynatılan adım (2) yerinde kalır
- ✅ Çağrı: yönergeler başa ayrı kullanıcı turu, hız “default”, iptal sinyali, geçerli araç şemaları — user,user
- ✅ İlk tur, sahibin yönerge dosyasıyla BİREBİR başlıyor; arkasından uygulama notları geliyor — 2728 karakter
- ✅ Araçlarla çağrıda cache hiç gönderilmiyor (çalışma zamanı reddederdi)
- ✅ Yedi araç, bu sırayla: step, highlight, connect, show_event, mark, set_year, focus — step,highlight,connect,show_event,mark,set_year,focus
- ✅ Adım aracı iki metin ister: numara, başlık ve altyazı (caption)
- ✅ Araçlar sayfada çalıştı; tanınmayan devlet sessizce atlandı ama modele söylendi
- ✅ Metin akışla geldi ve tamamlandı: iki adımın tam metni okuyucuda
- ✅ İkinci çağrı: önceki yazışma gönderilir (model bir şey hatırlamaz), hız “complex”; yönergeler yine başta — user,user,assistant,user
- ✅ Yeni çağrının bağlamında önceki çizimler söyleniyor
- ✅ Araç desteği yoksa (limits) araçsız ve cache:false ile istenir; altyazının altında “yalnızca metin” notu görünür
- ✅ Aynı not okuyucuda da var
- ✅ Gerçek not_granted: izin verilmedi uyarısı, kutu kapalı, bir istek
- ✅ “İzinleri aç” yalnızca düğmeyle, platformun izin panelini açar (permissions.manage)
- ✅ Gerçek rate_limited: hata gösterilir, e.text korunur, kilit yok, otomatik yeniden deneme yok

## H. Telefon: harita tüm sahne; kart üstte küçük bir sayfa; altyazı ve soru kutusu altta; metin her zaman tam ekran

- ✅ Telefon: harita genişliğin tamamı ve dikeyde üst çubuk ile zaman çizelgesi arasındaki her yer; yatay taşma yok — 390×724 / 390×844
- ✅ Telefon: bilgi kartı haritanın üstünde küçük bir sayfa (genişlik ekrandan 16 px dar, yükseklik haritanın yarısından az); soru kutusu zaman çizelgesinin hemen üstünde — kart 374×333 px
- ✅ Telefon: altyazı soru kutusunun hemen üstünde, ikisi de ekranın içinde; denetimler altyazı kutusundan taşmıyor; yatay taşma yok — altyazı 370×196 px
- ✅ Telefon: yer kartı kenara çekildi (küçük sekme); renk anahtarı anlatım sürerken gizli; altyazının düğmeleri en az 30 px — sekme 196×36 px
- ✅ Telefon: kamera 1. adımı altyazının ve soru kutusunun altında kalmayacak biçimde gösterdi — görünüm dışı 0, örtülü 0
- ✅ Telefon: “Metni oku” metni tam ekran açar (yan panel yok, boyut düğmesi yok); harita başlığın altında küçük bir pencere; 3. adım korunur — pencere 177×126 px
- ✅ Telefon: küçük harita 3. adımı tam gösteriyor; metin pencerenin altından başlıyor, soru kutusu ekranda — görünüm dışı 0 · metin 227 px’de, pencere 219 px’de biter
- ✅ Telefon: “Haritayı büyüt” İzle’ye döner, adım 3 kalır
- ✅ Telefon: Harita takibi sorusu haritanın içinde kalır, yakınlaştırma düğmelerini, sayacı, altyazıyı ve sekmeyi örtmez, haritanın %22’sinden azını kaplar — %8.0

## I. Genel

- ✅ Hiçbir sayfada konsol ya da sayfa hatası yok

## Ekran görüntüleri

- `ai-0-yeni-duzen.png`: harita neredeyse tam ekran; üstte ince çubuk, altta ince zaman çizelgesi, hemen üstünde soru kutusu, sağda küçük bilgi kartı
- `ai-0-yer-karti.png`: bir yer seçilince küçük kart
- `ai-1a-anlatim-adim1.png`, `ai-1b-anlatim-adim2.png`, `ai-1d-anlatim-adim3.png`, `ai-1e-anlatim-adim4.png`, `ai-1c-anlatim-adim6.png`: İzle; her adım yalnızca kendi çizimini gösterir, altyazı sabit yerde, kamera adımı izler
- `ai-1f-tek-anlatici.png`: yanıt ekrandayken haritada yalnızca anılan ve tıklanan olayların işaretçileri
- `ai-v1-ilerleme-cubugu.png`: zaman cetveli ilerleme çubuğu (adımlar tarihlerinde, görülenler dolu)
- `ai-w1-izle-adim3.png`, `ai-w2-oku-yan-panel.png`, `ai-w3-oku-tam-ekran.png`: aynı adım (3) üç görünümde: İzle, Oku yan panel, Oku tam ekran (köşede küçük harita)
- `ai-w4-oku-sirasinda-soru.png`: okurken sorulan soru, arkadaki haritayı günceller
- `ai-2-kisa-yanit.png`: kısa yanıt (adımsız, tek sahne; Osmanlı–Fransa ittifakı)
- `ai-9-harita-takibi-sorusu.png`, `ai-9b-harita-takibi-ayari.png`, `ai-9c-harita-takibi-kapali.png`, `ai-9d-harita-takibi-telefon.png`: büyük bir gezintiden sonra küçük soru; ayarın yeri; kapalıyken çip; telefonda soru
- `ai-3a-olay-karti.png`, `ai-3b-bunu-sor.png`: yanıt ekrandayken olay kartı; “Bunu sohbette sor”
- `ai-4-baglam-degisti.png`: seçili yer değişince metinde “Bağlam değişti”
- `ai-5-hata.png`, `ai-6-mobil.png`, `ai-6b-mobil-oku.png`, `ai-7-ayarlar.png`, `ai-8-gercek-sample.png`
