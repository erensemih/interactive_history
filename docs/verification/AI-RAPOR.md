# Okuma arkadaşı, sade harita ve tutarlı sohbet: doğrulama raporu

302/302 denetim geçti (`npm run e2e:ai`). Model olarak komut dosyalı deneme kipi kullanıldı; G grubu gerçek `sample` bağdaştırıcısını sahte bir çalışma zamanıyla sınar.

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
- ✅ Yer seçilince dünya olayları haritadan çekilir (hiçbiri çizilmez); hiçbir şey seçili değilken 11 olay işaretçisi vardı; not: “Yer seçili · dünya olayları haritadan çekildi” — 11 → 0 · not: “Yer seçili · dünya olayları haritadan çekildi, seçimi kaldırınca döner” · çizelgede 10 olay
- ✅ Yanıt gelmeden önce haritanın üstünde “Düşünüyor…” ve Durdur var; soru kutusunda da Durdur düğmesi
- ✅ Çağrı yapıldı: kart kenara çekildi (sekme), yer seçili kaldı
- ✅ İzle, uzun metinler bitmeden başladı: ilk adımın altyazısı var, metin hâlâ yazılıyor (“Metin yazılıyor…”) — streaming · 72 karakter · 1 / 6
- ✅ Metin bitince “Metin yazılıyor…” kalkar; adım sayısı 6; altyazılar ve başlıklar dolu
- ✅ Altyazı modelin step çağrısındaki altyazıdır, bir iki cümle (en çok ~200 karakter) ve metinden kısa — 117 karakter
- ✅ Yapay zekâ yılı kullanıcının imlecini değiştirmez (yalnızca üstüne biner) — başlıkta 1505, imleç 0.5
- ✅ Anlatım sürerken dünya olayları haritada yok (çizelgede duruyorlar); yalnızca anlatılan olay haritada — 11 → 0 → 1 işaretçi
- ✅ Sohbet, Claude olmadığını açıkça söylüyor (deneme kipi)
- ✅ 1. adım yalnızca kendi çizimini gösteriyor: 3 devlet öne çıkar, 0 savaş çizgisi, kendi çizgisi yok, 1 olay işareti, 0 serbest işaret, 1505 — 3 devlet · işaretçiler: safevi-1501 · 
- ✅ 1. adım spot ışığı: öne çıkan 3 devlet dolgun ve canlı, haritanın geri kalanı soluk (örtü 0.62), öne çıkmayan adlar soluk, tarama yok — soluk ad 34 · öne çıkan ad 3 · soluk olmayan 0
- ✅ 1. adım: olay işaretlerinin yanında ad kutusu yok (ad üstüne gelince görünür) — 0 kutu · 0 açık olay adı
- ✅ 1. adım: altyazı ve sayaç bu adımın (“1 / 6”, “Doğuda yeni bir komşu”)
- ✅ 1. adım: kamera adımın gösterdiği her şeyi (13 nokta: öne çıkan devletlerin kutuları, olaylar, çizgi uçları) altyazı ve soru kutusunun ÜSTÜNDEKİ görünür alana sığdırdı: görünüm dışında 0, ekranın dibindeki sütunun altında 0, savaş çizgisi uçları dışarıda 0, örtülen 0 — merkez 39.3, 33.8 · yakınlaştırma 3.56
- ✅ 1. adım: hiçbir etiket başka bir etiketi ya da işaretçiyi örtmüyor (40 öğe)
- ✅ 2. adım yalnızca kendi çizimini gösteriyor: 2 devlet öne çıkar, 1 savaş çizgisi, kendi çizgisi yok, 1 olay işareti, 0 serbest işaret, 1514 — 2 devlet · işaretçiler: caldiran-1514 · 
- ✅ 2. adım spot ışığı: öne çıkan 2 devlet dolgun ve canlı, haritanın geri kalanı soluk (örtü 0.62), öne çıkmayan adlar soluk, tarama yok — soluk ad 32 · öne çıkan ad 2 · soluk olmayan 0
- ✅ 2. adım: olay işaretlerinin yanında ad kutusu yok (ad üstüne gelince görünür) — 0 kutu · 0 açık olay adı
- ✅ 2. adım: savaş çizgisi ile olay işareti tek birim: işaret çizginin üzerinde (≤ 2 px) ve halkanın ortasında (≤ 1 px) — çizgi 0.7 · halka 0.0
- ✅ 2. adım: altyazı ve sayaç bu adımın (“2 / 6”, “Çaldıran: doğu sınırı çiziliyor”)
- ✅ 2. adım: kamera adımın gösterdiği her şeyi (9 nokta: öne çıkan devletlerin kutuları, olaylar, çizgi uçları) altyazı ve soru kutusunun ÜSTÜNDEKİ görünür alana sığdırdı: görünüm dışında 0, ekranın dibindeki sütunun altında 0, savaş çizgisi uçları dışarıda 0, örtülen 0 — merkez 39.3, 33.8 · yakınlaştırma 3.56
- ✅ 2. adım: hiçbir etiket başka bir etiketi ya da işaretçiyi örtmüyor (37 öğe)
- ✅ 3. adım yalnızca kendi çizimini gösteriyor: 2 devlet öne çıkar, 1 savaş çizgisi, kendi çizgisi yok, 1 olay işareti, 1 serbest işaret, 1517 — 2 devlet · işaretçiler: ridaniye-1517 · Mercidabık
- ✅ 3. adım spot ışığı: öne çıkan 2 devlet dolgun ve canlı, haritanın geri kalanı soluk (örtü 0.62), öne çıkmayan adlar soluk, tarama yok — soluk ad 35 · öne çıkan ad 2 · soluk olmayan 0
- ✅ 3. adım: olay işaretlerinin yanında ad kutusu yok (ad üstüne gelince görünür) — 0 kutu · 0 açık olay adı
- ✅ 3. adım: savaş çizgisi ile olay işareti tek birim: işaret çizginin üzerinde (≤ 2 px) ve halkanın ortasında (≤ 1 px) — çizgi 0.0 · halka 0.0
- ✅ 3. adım: altyazı ve sayaç bu adımın (“3 / 6”, “Memlük topraklarının alınması”)
- ✅ 3. adım: kamera adımın gösterdiği her şeyi (10 nokta: öne çıkan devletlerin kutuları, olaylar, çizgi uçları) altyazı ve soru kutusunun ÜSTÜNDEKİ görünür alana sığdırdı: görünüm dışında 0, ekranın dibindeki sütunun altında 0, savaş çizgisi uçları dışarıda 0, örtülen 0 — merkez 35.3, 26.5 · yakınlaştırma 2.98
- ✅ 3. adım: hiçbir etiket başka bir etiketi ya da işaretçiyi örtmüyor (42 öğe)
- ✅ 4. adım yalnızca kendi çizimini gösteriyor: 3 devlet öne çıkar, 2 savaş çizgisi, kendi çizgisi yok, 2 olay işareti, 0 serbest işaret, 1526 — 3 devlet · işaretçiler: mohac-1526, viyana-1529 · 
- ✅ 4. adım spot ışığı: öne çıkan 3 devlet dolgun ve canlı, haritanın geri kalanı soluk (örtü 0.62), öne çıkmayan adlar soluk, tarama yok — soluk ad 25 · öne çıkan ad 3 · soluk olmayan 0
- ✅ 4. adım: olay işaretlerinin yanında ad kutusu yok (ad üstüne gelince görünür) — 0 kutu · 0 açık olay adı
- ✅ 4. adım: savaş çizgisi ile olay işareti tek birim: işaret çizginin üzerinde (≤ 2 px) ve halkanın ortasında (≤ 1 px) — çizgi 0.1 · halka 0.0 | çizgi 0.1 · halka 0.0
- ✅ 4. adım: altyazı ve sayaç bu adımın (“4 / 6”, “Süleyman ve Orta Avrupa”)
- ✅ 4. adım: kamera adımın gösterdiği her şeyi (14 nokta: öne çıkan devletlerin kutuları, olaylar, çizgi uçları) altyazı ve soru kutusunun ÜSTÜNDEKİ görünür alana sığdırdı: görünüm dışında 0, ekranın dibindeki sütunun altında 0, savaş çizgisi uçları dışarıda 0, örtülen 0 — merkez 29.4, 27.9 · yakınlaştırma 2.84
- ✅ 4. adım: hiçbir etiket başka bir etiketi ya da işaretçiyi örtmüyor (33 öğe)
- ✅ 5. adım yalnızca kendi çizimini gösteriyor: 2 devlet öne çıkar, 0 savaş çizgisi, alliance, 0 olay işareti, 0 serbest işaret, 1536 — 2 devlet · işaretçiler: — · İttifak, 1536
- ✅ 5. adım spot ışığı: öne çıkan 2 devlet dolgun ve canlı, haritanın geri kalanı soluk (örtü 0.62), öne çıkmayan adlar soluk, tarama yok — soluk ad 28 · öne çıkan ad 2 · soluk olmayan 0
- ✅ 5. adım: olay işaretlerinin yanında ad kutusu yok (ad üstüne gelince görünür) — 0 kutu · 0 açık olay adı
- ✅ 5. adım: altyazı ve sayaç bu adımın (“5 / 6”, “Fransa ile ittifak”)
- ✅ 5. adım: kamera adımın gösterdiği her şeyi (10 nokta: öne çıkan devletlerin kutuları, olaylar, çizgi uçları) altyazı ve soru kutusunun ÜSTÜNDEKİ görünür alana sığdırdı: görünüm dışında 0, ekranın dibindeki sütunun altında 0, savaş çizgisi uçları dışarıda 0, örtülen 0 — merkez 23.1, 28.6 · yakınlaştırma 2.77
- ✅ 5. adım: hiçbir etiket başka bir etiketi ya da işaretçiyi örtmüyor (33 öğe)
- ✅ 6. adım yalnızca kendi çizimini gösteriyor: 4 devlet öne çıkar, 1 savaş çizgisi, kendi çizgisi yok, 1 olay işareti, 0 serbest işaret, 1538 — 4 devlet · işaretçiler: preveze-1538 · 
- ✅ 6. adım spot ışığı: öne çıkan 4 devlet dolgun ve canlı, haritanın geri kalanı soluk (örtü 0.62), öne çıkmayan adlar soluk, tarama yok — soluk ad 16 · öne çıkan ad 4 · soluk olmayan 0
- ✅ 6. adım: olay işaretlerinin yanında ad kutusu yok (ad üstüne gelince görünür) — 0 kutu · 0 açık olay adı
- ✅ 6. adım: savaş çizgisi ile olay işareti tek birim: işaret çizginin üzerinde (≤ 2 px) ve halkanın ortasında (≤ 1 px) — çizgi 0.1 · halka 0.0
- ✅ 6. adım: altyazı ve sayaç bu adımın (“6 / 6”, “Akdeniz’de güç dengesi”)
- ✅ 6. adım: kamera adımın gösterdiği her şeyi (17 nokta: öne çıkan devletlerin kutuları, olaylar, çizgi uçları) altyazı ve soru kutusunun ÜSTÜNDEKİ görünür alana sığdırdı: görünüm dışında 0, ekranın dibindeki sütunun altında 0, savaş çizgisi uçları dışarıda 0, örtülen 0 — merkez -28.4, 18.8 · yakınlaştırma 2.57
- ✅ 6. adım: hiçbir etiket başka bir etiketi ya da işaretçiyi örtmüyor (23 öğe)
- ✅ Altyazı sabit bir yerde: kutunun alt kenarı ve yatay konumu her adımda aynı (altyazı gibi) — 716 716 716 716 716 716
- ✅ Anlatım başlayınca kamera ilk adımın çizimine gitti (dünya görünümünden yakınlaştı) — 1.97 → 3.56
- ✅ Adım değiştikçe kamera adımı izliyor: komşu adımların çoğunda harita kaydı ya da yakınlaştı/uzaklaştı — 4/5 geçişte oynadı
- ✅ Önceki adımlara dönmek (4, 2, 6, 3, 5, 1) her seferinde yalnızca o adımın çizimini aynen getiriyor
- ✅ Okur zaman imlecini oynatınca yapay zekâ yılı kenara çekiliyor; sonraki adımda geri geliyor — 1520 → 1517
- ✅ Anlatımı kapatmak (✕) yapay zekâ çizimini ve spot ışığını kaldırır; yer hâlâ seçili olduğundan dünya olayları dönmez; kart geri gelir — 11 → 1 → 0
- ✅ Kapanışta başlıktaki yıl kullanıcının imlecine döner (yapay zekâ yılı yok)
- ✅ Yazışma silinmedi: soru kutusundaki metin düğmesi duruyor, yanıt hâlâ okunabilir

## V. İzle’de gezinme: düğmeler, ok tuşları, isteğe bağlı otomatik oynatma ve hız; çizelgede ilerleme çubuğu

- ✅ Otomatik oynatma isteğe bağlı: kendiliğinden başlamaz (yanıt bittikten sonra da 1. adımda, oynatma kapalı) — adım 1/6 · oynatma false
- ✅ 1. adımda “Önceki” kapalı, “Sonraki” açık
- ✅ “Sonraki” 2. adıma geçirir: sayaç “2 / 6”, harita 2. adımın çizimi (Osmanlı + Safevî, savaş); “Önceki” açıldı
- ✅ “Önceki” 1. adıma döndürür ve kendini yeniden kapatır
- ✅ Ok tuşları: → sonraki, ← önceki adım (1 → 2 → 3 → 2) — 2, 3, 2
- ✅ End son adıma, Home ilk adıma götürür; harita her seferinde o adımın çizimini gösterir; son adımda “Sonraki” kapalı — ottoman-empire,republic-of-venice,papal-states,spanish-empire | ottoman-empire,safavid-dynasty,aq-qoyunlu
- ✅ Soru kutusundayken ok tuşları yazı imlecinindir: anlatım yerinde kalır
- ✅ Harita odaktayken de oklar anlatımındır: haritayı kaydırmaz (son adımda → hiçbir şey yapmaz, kamera yerinde) — harita odakta: true
- ✅ Çizelge ilerleme çubuğu: 6 adımın 6 noktası, 1’den 6’ya soldan sağa, tarihleriyle (1505, 1514, 1517, 1526, 1536, 1538) — 1:1505 2:1514 3:1517 4:1526 5:1536 6:1538
- ✅ Adım noktaları birbirine değmiyor (etkin olanın büyütülmüş hâli de: merkezler en az 22 px arayla) ve yıllarının çevresinde duruyor — en dar aralık 22 px · kayma -0, -2, 2, -0, -5, 5
- ✅ Noktalar aralık yazısının üstüne binmiyor: fırçanın kendi yazısı noktalar varken gizli (aralık, cetvelin yanındaki büyük yazıda duruyor) — fırça yazısı: none
- ✅ Noktalar zaman çizelgesi bandının içinde ve band ince kalıyor (en çok 84 px) — 80 px
- ✅ İlerleme: 3. adımdayken 1–2 dolu (görüldü), 3 işaretli, 4–6 boş; çizgi birinci noktadan üçüncüye uzanıyor — past past on - - -
- ✅ Çizelgedeki 5 numaralı noktaya tıklamak 5. adıma götürür (altyazı “5 / 6”, harita 5. adımın çizimi, başlıkta 1536)
- ✅ Bu tıklama okurun kendi aralığına ve imlecine dokunmaz (ilerleme çubuğu zaman seçimi değildir) — {"range":{"from":1500,"to":1550},"cursor":0.5}
- ✅ Oynat düğmesi basılı değil; hız seçici üç seçenek sunuyor (Yavaş, Normal, Hızlı), Normal seçili — slow:Yavaş normal:Normal fast:Hızlı
- ✅ Hızı değiştirmek tek başına oynatmaz
- ✅ Oynat’a basınca düğme “Duraklat” olur, basılı görünür ve anlatım oynar
- ✅ Hızlıda adım, altyazısının okunma süresi kadar (~4.2 sn) kalıp kendiliğinden 2. adıma geçer — 4269 ms
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
- ✅ Metni kaydırdıkça okuma çizgisindeki adım haritaya gelir (yukarı kaydırmadan 5. adıma ulaşıldı); etkin adım tek — 6. adım · ottoman-empire+republic-of-venice+papal-states+spanish-empire
- ✅ Okurken ulaşılan adım İzle’ye taşınır (altyazı o adımın) — 6. adım
- ✅ Soru kutusundaki metin düğmesi okuyucuyu açar (basılı), bir daha basınca kapatır ve İzle’ye döner; adım korunur
- ✅ …kapatınca İzle’ye döner, 3. adım
- ✅ Tam ekran: metin sahneyi kapladı; harita köşede küçük bir pencere (sağ üst), tarayıcı penceresinin içinde — pencere 338×234 px, sağ üstte (1083, 101)
- ✅ Küçük harita o anki adımı gösteriyor: 3. adımın çizimi, tamamı pencerenin içinde ve hiçbir şeyin altında değil — 10 nokta · görünüm dışı 0 · örtülü 0
- ✅ Tam ekranda da adım korundu: metinde 3. adım etkin ve görünür; “Haritada gösteriliyor” orada
- ✅ Metin rahat bir sütun (en çok 720 px) ve küçük haritayla yan yana: ikisi birbirini örtmüyor — sütun 720 px
- ✅ Pencerede “Haritayı büyüt” düğmesi var
- ✅ Küçük haritada çizimin ad etiketleri yok (pencereyi kalabalıklaştırmaz; metin yanında); savaş tek parça (işaret + çizgi) ve serbest işaret yerinde — 0 etiket · 1 savaş · ridaniye-1517
- ✅ Metindeki 5. adımda “Haritada göster”: küçük harita 5. adımın çizimine geçer (Osmanlı + Fransa, ittifak, 1536) ve onu tam gösterir — ottoman-empire+kingdom-of-france · görünüm dışı 0
- ✅ Tam ekranda metni yukarı kaydırmak küçük haritadaki adımı da geri götürür — 2. adım
- ✅ Esc önce tam ekranı yan panele küçültür (harita yeniden tüm sahne), adım korunur
- ✅ Bir daha Esc metni kapatıp İzle’ye döner; adım hâlâ aynı
- ✅ “Haritayı büyüt”: harita yeniden tüm sahne, İzle’ye dönüldü, adım korundu ve çizim yine tam görünür — 2. adım · 1 savaş · işaretçi caldiran-1514 · 0 ad kutusu
- ✅ Okuyucu en son kullanılan kipte açılır (burada tam ekran) ve 4. adımda başlar — full · 4. adım
- ✅ Okurken soru: yanıt metne eklendi, okuyucu açık kaldı (yan panel); yeni yanıt adımsız, tek parça — 2 yanıt
- ✅ Arkadaki harita yeni soruya geçti (Osmanlı + Fransa, ittifak çizgisi; yanıt olay da yıl da vermediği için okurun kendi yılı, 1525) ve çizim paneli ile soru kutusunun dışında — ottoman-empire+kingdom-of-france · 1525
- ✅ Tam ekranda okurken soru: küçük harita yeni yanıtın sahnesine geçer (görünür, örtülü değil); okuyucu açık — ottoman-empire · işaret 1
- ✅ İzle’ye dönünce son yanıt kısa yanıt olarak haritanın üstünde (adım sayacı yok)

## A2. Anlatımdan önce haritayı gezmek “Harita takibi”ni kapatmaz; takip ilk adımdan çalışır

- ✅ Anlatımdan önce haritayı sürüklemek ve yakınlaştırmak takibi kapatmaz, soru da çıkmaz
- ✅ İlk adım açılınca kamera çizimi görünür kıldı (okurun kendi gezdiği görünümden) — 4.20 → 3.56
- ✅ 2. adım: harita iki devleti de görünür kılıyor (Osmanlı ve Safevî) — yakınlaştırma 3.56 → 3.56

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
- ✅ Tek parçalı yanıt, olay göstermiyorsa yıl seçmez: harita okurun kendi yılında (1525) kalır — başlıkta 1525
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
- ✅ Yanıtın haritası: yalnızca olay söylendi; uygulama onu kendi işaretiyle (ad kutusu yok), tarafları öne çıkarılmış ve savaş çizgisiyle çizdi; olayın yılı; serbest işaret yok — ottoman-empire+kingdom-of-hungary+habsburg-monarchy · mohac-1526 ·  · 1526 · işaret 0 · görünüm dışı 0 · örtülü 0
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
- ✅ Soru kutusu yeni yeri söylüyor — “Fransa Krallığı hakkında sorun…” · kutu 264 px
- ✅ Yeni yerin kartı sağda geri geldi (seçim kartı sekmeden çıktı)
- ✅ Aralık da değişince aynı ayırıcı güncelleniyor (ikincisi eklenmiyor)
- ✅ Okur konuya dönerse ayırıcı kalkıyor
- ✅ Model bağlamın değiştiğini söylendi (“Konu değişti”)
- ✅ Ayırıcı metinde, değişiklikten sonraki sorunun önünde kalıyor

## J. Tek anlatıcı: yer seçiliyken ya da yanıt ekrandayken dünya olayları haritadan çekilir; anılan ve tıklanan olay işaretçisini getirir

- ✅ Hiçbir şey seçili değilken dünya olayları haritada: işaretçiler ve “n / m olay haritada” notu — 11 işaretçi · 11 / 18 olay haritada · yakınlaştıkça artar
- ✅ Yanıt ekrana gelince (anlatıcı yapay zekâ) dünya olayları haritadan çekilir; not nedenini söyler — 11 → 0 · 0 olay haritada · gerisi yanıt kapanınca döner
- ✅ Yanıtı kapatmak (✕) dünya olaylarını haritaya geri getirir (kamera yanıtın çerçevesinde kaldığı için küme o görünüme göre), yapay zekâ çizimi gider, eski not döner — 10 işaretçi · 10 / 18 olay haritada · yakınlaştıkça artar
- ✅ Bir yer seçilince dünya olaylarının hiçbiri haritada kalmaz (anlatıcı yer); çizelge o yerin olaylarıyla dolu; not: “Yer seçili” — 11 → 0 işaretçi · çizelgede 10 olay · Yer seçili · dünya olayları haritadan çekildi, seçimi kaldırınca döner
- ✅ Kartın “başka yerlerde” listesinden ya da çizelgeden açılan olay haritaya gelir (yalnızca o), kartı açıktır — kabral-brezilya-1500 (kabral-brezilya-1500)
- ✅ Olay kartı kapanınca işaretçisi haritadan yine çekilir
- ✅ Seçim kalkınca dünya olayları haritaya döner (aynı küme) ve not eski hâline gelir — 11 işaretçi
- ✅ 2. adım Çaldıran’dan söz ediyor: haritada Çaldıran’ın kendi işaretçisi var (yanında ad kutusu yok), başka olay yok — caldiran-1514
- ✅ Anılan olayın işaretçisi sıradan olay işaretçisiyle aynı (yıl yazılı, düğme, vurgulu değil)
- ✅ Olay işaretinin adı üstüne gelince görünür (ipucu)
- ✅ Anılan olayın işaretçisine tıklamak olay kartını sağda açar; altyazı yerinde kalır
- ✅ Hem anılan hem açık olduğunda yapay zekâ tarafında ad kutusu yok (açık olayın kendi adı kartta ve işaretinde), çakışma yok
- ✅ Kart kapanınca olay yine anlatılan olay olarak haritada kalır (ad kutusu yok)
- ✅ Model verideki bir olay (Belgrad’ın fethi) için mark çağırınca olayın kendi işareti gösterilir, ikinci bir işaret çizilmez — tamam: «Belgrad'ın fethi» uygulamanın olay kaydı; olay olarak gösterildi (böyle olaylar için show_event kullan) · 3 savaş çizgisi
- ✅ Verinin bilmediği bir yer (Konya) serbest işaret olarak kalır: mürekkep eşkenar dörtgen ve etiketi — Konya
- ✅ Bu kalabalık adımda da (3 olay + 1 işaret + bağlantı) etiketler birbirini ve işaretçileri örtmüyor
- ✅ Anlatım kapanınca anlatıcının işaretçileri ve çizimi gider; yer hâlâ seçili olduğundan dünya olayları dönmez

## K. Etiket çakışması: her adımda, farklı kameralarda ve ekran boyutlarında hiçbir etiket başkasını örtmüyor

- ✅ 1440×900: 6 adım × 3 kamera (çerçeve, +0,9, −0,9) = 18 durumda 6 yapay zekâ etiketi hiçbir etiketi ya da işaretçiyi örtmüyor
- ✅ 1180×760: 6 adım × 3 kamera (çerçeve, +0,9, −0,9) = 18 durumda 6 yapay zekâ etiketi hiçbir etiketi ya da işaretçiyi örtmüyor

## P. Devlet renkleri: ekranda görünen renkler gri/grimsi ya da mavi değil, komşular birbirinden ayrışıyor; spot ışığında öne çıkanlar canlı, gerisi soluk

- ✅ Ekran görüntüsünden okunan renkler (4 görünüm, 186 devlet): her görünümde en az 10 devlet, iç örneklerin %97’sinden fazlası stilin istediği renkte — dünya, 1500–1550: 50 devlet, 856/864 örnek · Avrupa, 1400–1450: 62 devlet, 2579/2584 örnek · Doğu Asya, 1550–1600: 30 devlet, 2923/2932 örnek · Hindistan ve İran, 1450–1500: 44 devlet, 3548/3548 örnek
- ✅ Hiçbir devlet gri ya da grimsi değil: en soluk devletin doygunluğu (OKLCH C) 0.090 (en az 0,07; kum rengi “veri yok” zemini gibi görünen yok)
- ✅ Hiçbir devlet mavi, turkuaz ya da mor değil (ton 180°–310° dışında; mavi yalnızca deniz ve göllerin)
- ✅ Komşu devletler belirgin ayrışıyor: 324 komşu çiftte en küçük renk farkı ΔE 8.6 (en az 8)
- ✅ Spot ışığı, ekran görüntüsünden: her adımda öne çıkan devletlerin pikselleri kendi canlı renginde (tam dolgun, saydam değil), haritanın geri kalanı kâğıt örtüyle solmuş renkte — 1. adım: 493 öne çıkan örnek (renk sapması 2), 2229 soluk örnek (sapma 2), doygunluk 0.16 → 0.05 · 2. adım: 762 öne çıkan örnek (renk sapması 3), 1965 soluk örnek (sapma 2), doygunluk 0.17 → 0.05 · 3. adım: 187 öne çıkan örnek (renk sapması 3), 1560 soluk örnek (sapma 6), doygunluk 0.15 → 0.05 · 4. adım: 167 öne çıkan örnek (renk sapması 4), 1403 soluk örnek (sapma 3), doygunluk 0.17 → 0.04 · 5. adım: 170 öne çıkan örnek (renk sapması 5), 1273 soluk örnek (sapma 6), doygunluk 0.17 → 0.05 · 6. adım: 117 öne çıkan örnek (renk sapması 3), 334 soluk örnek (sapma 0), doygunluk 0.17 → 0.05
- ✅ Öne çıkanlar belirgin ayrışıyor: canlı devletlerin doygunluğu soluk devletlerinkinin en az iki katı, soluk olanlar daha açık — 1: 3.5× · açıklık 0.74 / 0.91 · 2: 3.7× · açıklık 0.67 / 0.91 · 3: 3.4× · açıklık 0.69 / 0.90 · 4: 3.8× · açıklık 0.75 / 0.90 · 5: 3.7× · açıklık 0.75 / 0.90 · 6: 3.6× · açıklık 0.75 / 0.90
- ✅ Canlı renkler de gri ya da mavi değil: öne çıkan devletlerin ortalama doygunluğu en az 0,10 — 1: 0.16 · 2: 0.17 · 3: 0.15 · 4: 0.17 · 5: 0.17 · 6: 0.17

## R. Olay adları: altyazıda ve metinde tıklanabilir bağlantı; çizelgedeki bir olaya tıklamakla aynı şeyi yapar

- ✅ 4. adımın altyazısında Mohaç ve Viyana birer bağlantı (olay kimlikleriyle): altı çizili, işaretçi imleçli; cümlenin içinde düz yazı gibi duruyor — “Mohaç” “Viyana”
- ✅ Altyazının görünen yazısında bağlantı işaretleri yok (köşeli ayraç, “olay:” görünmüyor) — I. Süleyman döneminde cephe Avrupa'ya kaydı: 1526'da Mohaç'ta Macar ordusu yenil
- ✅ Haritadaki olay işaretçisinin adı üzerine gelince görünür (yanında kalıcı bir ad kutusu yok): “Mohaç Muharebesi” — Savaş ve fetih Mohaç Muharebesi 29 Ağustos 1526 · Mohaç
- ✅ Altyazıdaki “Mohaç”, çizelgedeki Mohaç noktasına tıklamakla aynı şeyi yapar: aynı olay açık, aynı kart (aynı yerde, aynı başlık), aynı işaretçiler, soru kutusunda aynı çip; adım ve görünüm yerinde — {"event":"mohac-1526","card":true,"cardRect":{"left":1117,"top":106,"right":1411,"bottom":536},"title":"Mohaç Muharebesi","selectedMarker":["mohac-1526"],"markers":["mohac-1526","viyana-1529"],"chip":"Mohaç Muharebesi açık olay, soruya eklenir","step":4,"view":"watch","read":"side"}
- ✅ Aynı altyazıdaki “Viyana” kartı o olaya çevirir (tek kart, açık olay Viyana, işaretçisi vurgulu); altyazı ve 4. adım yerinde — Birinci Viyana Kuşatması
- ✅ Aynı bağlantıya bir daha tıklamak olayı kapatır (çizelgedeki nokta gibi); yer kartı sekmeye döner, adım yerinde
- ✅ Okuyucudaki metinde de olay adları bağlantı: 4. adımda Mohaç ve Viyana, tüm metinde 6 (Safevî, Çaldıran, Ridaniye, Mohaç, Viyana, Preveze); işaret sözdizimi görünmüyor — 6 bağlantı
- ✅ Okuyucuda (yan panel) metindeki “Mohaç” da çizelgedeki noktayla aynı şeyi yapar: aynı olay, aynı kart; kart okuyucunun soluna sığıyor (üstüne binmiyor); okuyucu açık, adım 4 yerinde — {"left":656,"top":106,"right":950,"bottom":536}
- ✅ Esc önce olay kartını kapatır; okuyucu ve adım yerinde
- ✅ Bir bağlantıya tıklayıp Esc’e bastıktan hemen sonra tam ekrana geçmek okunan adımı oynatmaz (4. adım kalır; eskiden metin sonuna kayıp 6. adıma geçiyordu) — 4. adım
- ✅ Tam ekranda da metindeki bağlantı çizelgedeki noktayla aynı şeyi yapar: olay açık, işaretçisi küçük haritada vurgulu, soru kutusunda olay çipi; okuyucu ve adım yerinde — Birinci Viyana Kuşatması açık olay, soruya eklenir
- ✅ Tam ekranda Esc açık olayı kaldırır (okuyucu tam ekran kalır)

## T. Çizelge: yalnızca seçili aralık (ondan önce ve sonra hiçbir şey yok); adım noktaları aralık yazısına ve birbirine binmiyor

- ✅ 1500–1550: eksen yalnızca 1500–1550: yıl etiketlerinin hepsi bu aralıkta, 10 etiket, yerleri aralığa göre (yıl başına 23.9 px); ilk ve son yıl çizelgenin kenarlarına yakın — 1500 1505 1510 1515 1520 1525 1530 1535 1540 1545 · “10 olay · 1500–1550”
- ✅ 1500–1550: çizelgedeki 10 olay noktasının hepsi bu aralıkla kesişiyor (dışarıdan olay yok) ve çizelgenin içinde; sınırda başlayan olay kenara yapışık duruyor — dışarıda olan yok
- ✅ 1500–1550: yer egemenlik şeridi de aralığın dışına taşmıyor; imleç (1525) yerinde; “bağlam” bandı ya da aralık dışı etiketi yok — imleç 610 px · 1 parça
- ✅ 1514–1520: eksen yalnızca 1514–1520: yıl etiketlerinin hepsi bu aralıkta, 7 etiket, yerleri aralığa göre (yıl başına 174.3 px); ilk ve son yıl çizelgenin kenarlarına yakın — 1514 1515 1516 1517 1518 1519 1520 · “2 olay · 1514–1520”
- ✅ 1514–1520: çizelgedeki 2 olay noktasının hepsi bu aralıkla kesişiyor (dışarıdan olay yok) ve çizelgenin içinde; sınırda başlayan olay kenara yapışık duruyor — dışarıda olan yok
- ✅ 1514–1520: yer egemenlik şeridi de aralığın dışına taşmıyor; imleç (1517) yerinde; “bağlam” bandı ya da aralık dışı etiketi yok — imleç 610 px · 1 parça
- ✅ Aralık 1500–1550: 6 adım noktası (yılları 1505 1514 1517 1526 1536 1538; en kalabalık yılda 1) birbirine ve aralık yazısına (büyük yazı, fırçanın etiketi, cetvel yılları) binmiyor; fırçanın kendi etiketi gizli; hepsi cetvelin içinde — merkezler arası 53 22 53 56 22 px
- ✅ Aralık 1514–1520: 5 adım noktası (yılları 1514 1517 1517 1517 1518; en kalabalık yılda 3) birbirine ve aralık yazısına (büyük yazı, fırçanın etiketi, cetvel yılları) binmiyor; fırçanın kendi etiketi gizli; hepsi cetvelin içinde — merkezler arası 22 22 22 22 px

## F. Oku: metnin son satırı soru kutusunun (ve üstündeki notun, çipin) altında kalmıyor; tam ekranda, yan panelde, dar pencerede ve telefonda

- ✅ masaüstü 1440×900 · tam ekran: metnin sonuna kaydırınca son satır (“Haritada göster…”) soru kutusu yığınının (not, çip, kutu) üstünde kalıyor — son satırın altı 635 px, yığının üstü 726 px (yığın metnin altında) · örtülen uç 0/3
- ✅ masaüstü 1440×900 · tam ekran · olay açıkken (çip de var): metnin sonuna kaydırınca son satır (“Haritada göster…”) soru kutusu yığınının (not, çip, kutu) üstünde kalıyor — son satırın altı 594 px, yığının üstü 685 px (yığın metnin altında) · örtülen uç 0/3
- ✅ masaüstü 1440×900 · yan panel: metnin sonuna kaydırınca son satır (“Haritada göster…”) soru kutusu yığınının (not, çip, kutu) üstünde kalıyor — son satırın altı 636 px, yığının üstü 726 px (yığın haritanın yanında) · örtülen uç 0/3
- ✅ masaüstü 1440×900 · yan panel · olay açıkken (çip de var): metnin sonuna kaydırınca son satır (“Haritada göster…”) soru kutusu yığınının (not, çip, kutu) üstünde kalıyor — son satırın altı 595 px, yığının üstü 685 px (yığın haritanın yanında) · örtülen uç 0/3
- ✅ dar pencere 1024×700 · tam ekran: metnin sonuna kaydırınca son satır (“Haritada göster…”) soru kutusu yığınının (not, çip, kutu) üstünde kalıyor — son satırın altı 435 px, yığının üstü 526 px (yığın metnin altında) · örtülen uç 0/3
- ✅ dar pencere 1024×700 · tam ekran · olay açıkken (çip de var): metnin sonuna kaydırınca son satır (“Haritada göster…”) soru kutusu yığınının (not, çip, kutu) üstünde kalıyor — son satırın altı 394 px, yığının üstü 485 px (yığın metnin altında) · örtülen uç 0/3
- ✅ dar pencere 1024×700 · yan panel: metnin sonuna kaydırınca son satır (“Haritada göster…”) soru kutusu yığınının (not, çip, kutu) üstünde kalıyor — son satırın altı 435 px, yığının üstü 526 px (yığın haritanın yanında) · örtülen uç 0/3
- ✅ dar pencere 1024×700 · yan panel · olay açıkken (çip de var): metnin sonuna kaydırınca son satır (“Haritada göster…”) soru kutusu yığınının (not, çip, kutu) üstünde kalıyor — son satırın altı 394 px, yığının üstü 485 px (yığın haritanın yanında) · örtülen uç 0/3
- ✅ telefon 390×844 · tam ekran: metnin sonuna kaydırınca son satır (“Haritada göster…”) soru kutusu yığınının (not, çip, kutu) üstünde kalıyor — son satırın altı 580 px, yığının üstü 674 px (yığın metnin altında) · örtülen uç 0/3
- ✅ telefon 390×844 · tam ekran · olay açıkken (çip de var): metnin sonuna kaydırınca son satır (“Haritada göster…”) soru kutusu yığınının (not, çip, kutu) üstünde kalıyor — son satırın altı 539 px, yığının üstü 633 px (yığın metnin altında) · örtülen uç 0/3

## E. Durdurma, hatalar, ayarlar

- ✅ Durdur: yanıt hemen “durduruldu” olur; adımlar ve yazılan kısım kalır, altyazı ekranda — 216 karakter
- ✅ Durdurunca gönder düğmesi geri gelir, sohbet kilitlenmez; “Yeniden dene” yalnızca okur basınca
- ✅ Metin okuyucuda da yarım kalan kısım ve “Durduruldu” notu var — 1087 karakter
- ✅ rate_limited: hata yanıtın yerinde; yazılan metin kalır; yeniden dene düğmesi var
- ✅ rate_limited sohbeti kilitlemez; kendiliğinden yeniden denemez (tek istek)
- ✅ “Yeniden dene” yalnızca okur basınca ve bir kez soruyor
- ✅ not_granted: kalıcı uyarı soru kutusunun üstünde, kutu kapalı, izin paneli düğmesi
- ✅ Ayarlar: üç hız (Hızlı, Dengeli, Derin), varsayılan Dengeli; model adı yok
- ✅ Ayar menüsü soru kutusunun hemen üstünde açılır ve ekranın içinde kalır — 320×277 px
- ✅ Seçilen hız modele gidiyor (quick)
- ✅ Seçim tarayıcıda saklanıyor
- ✅ Yenilenince seçim korunuyor
- ✅ Yanıt var: haritada çizim, soru kutusunda metin düğmesi
- ✅ “Sohbeti temizle” her zaman görünür (ayar menüsü kapalıyken de, soru kutusunun üstünde), yazışma varken etkin — {"visible":true,"label":"Sohbeti temizle","disabled":false}
- ✅ “Sohbeti temizle” yazışmayı, ekrandaki yanıtı ve haritadaki çizimi siler; metin düğmesi kalkar; düğme görünür kalır ama boştayken kapalı

## G. Gerçek sample bağdaştırıcısı (sahte çalışma zamanıyla, tarayıcıda)

- ✅ Claude çalışma zamanı varken deneme kipi uyarısı yok; sağlayıcı “sample”
- ✅ Metin henüz yokken (araç turu bitti, uzun metin yazılmıyor) İzle başladı: 1. adımın altyazısı ve “Metin yazılıyor…” — waiting · 0 karakter · 1 / 2
- ✅ Haritada 1. adımın çizimi şimdiden var (iki devlet, ittifak çizgisi, 1536); tanınmayan devlet sessizce atlandı — ottoman-empire+kingdom-of-france
- ✅ Metin yazılmadan 2. adıma da geçilebiliyor: model yalnızca Osmanlı + Venedik ve Preveze’yi söyledi; uygulama olayın taraflarını da öne çıkardı, savaş çizgisini çizdi, yılı olayınkinden aldı (1538) — ottoman-empire+republic-of-venice+papal-states+spanish-empire · preveze-1538 · savaş 1
- ✅ Altyazıdaki olay adı bağlantı: “Preveze” → preveze-1538 (gösterilen metin, [ad](olay:kimlik) işareti değil) — [["Preveze","preveze-1538"]]
- ✅ Metin yazılmadan Oku açılırsa her adımın altyazısı yerinde duruyor (“yazılıyor” sürerken boş kalmaz)
- ✅ Metin gelince “Metin yazılıyor…” kalkar; oynatılan adım (2) yerinde kalır
- ✅ Çağrı: yönergeler başa ayrı kullanıcı turu, hız “default”, iptal sinyali, geçerli araç şemaları — user,user
- ✅ İlk tur, sahibin yönerge dosyasıyla BİREBİR başlıyor; arkasından uygulama notları geliyor — 3553 karakter
- ✅ Araçlarla çağrıda cache hiç gönderilmiyor (çalışma zamanı reddederdi)
- ✅ Beş araç, bu sırayla: step, show_event, highlight, connect, mark (kamera ya da görünüş aracı yok) — step,show_event,highlight,connect,mark
- ✅ Adım aracı iki metin ister: numara, başlık ve altyazı (caption); yıl isteğe bağlı
- ✅ Araçlar sayfada çalıştı; tanınmayan devlet sessizce atlandı ama modele söylendi
- ✅ Metin akışla geldi ve tamamlandı: iki adımın tam metni okuyucuda
- ✅ İkinci çağrı: önceki yazışma gönderilir (model bir şey hatırlamaz), hız “complex”; yönergeler yine başta — user,user,assistant,user
- ✅ Konuşmanın tamamı modele gidiyor: önceki sorunun kendisi, önceki yanıtın tam metni (iki adım) ve o yanıtın haritada ne gösterdiği — [Haritada gösterdiklerim: 1. adım: öne çıkan: Osmanlı İmparatorluğu, Fransa Krallığı; Osmanlı İmparatorluğu – Fransa Krallığı: ittifak (Gerçek yol); sınır yılı 1536 · 2. adım: öne çıkan: Osmanlı İmparatorluğu, Venedik Cu
- ✅ Yeni çağrının bağlamında önceki çizimler söyleniyor
- ✅ “Sohbeti temizle”den sonra sorulan soruda önceki konuşma modele gitmez (yalnızca yönergeler ve yeni istek) — user,user
- ✅ Araç desteği yoksa (limits) araçsız ve cache:false ile istenir; altyazının altında “yalnızca metin” notu görünür
- ✅ Aynı not okuyucuda da var
- ✅ Gerçek not_granted: izin verilmedi uyarısı, kutu kapalı, bir istek
- ✅ “İzinleri aç” yalnızca düğmeyle, platformun izin panelini açar (permissions.manage)
- ✅ Gerçek rate_limited: hata gösterilir, e.text korunur, kilit yok, otomatik yeniden deneme yok

## H. Telefon: harita tüm sahne; kart üstte küçük bir sayfa; altyazı ve soru kutusu altta; metin her zaman tam ekran

- ✅ Telefon: harita genişliğin tamamı ve dikeyde üst çubuk ile zaman çizelgesi arasındaki her yer; yatay taşma yok — 390×724 / 390×844
- ✅ Telefon: bilgi kartı haritanın üstünde küçük bir sayfa (genişlik ekrandan 16 px dar, yükseklik haritanın yarısından az); soru kutusu zaman çizelgesinin hemen üstünde — kart 374×333 px
- ✅ Telefon: altyazı soru kutusunun hemen üstünde, ikisi de ekranın içinde; denetimler altyazı kutusundan taşmıyor; yatay taşma yok — altyazı 370×118 px
- ✅ Telefon: yer kartı kenara çekildi (küçük sekme); renk anahtarı anlatım sürerken gizli; altyazının düğmeleri en az 30 px — sekme 196×36 px
- ✅ Telefon: kamera 1. adımı altyazının ve soru kutusunun altında kalmayacak biçimde gösterdi — görünüm dışı 0, örtülü 0
- ✅ Telefon: “Metni oku” metni tam ekran açar (yan panel yok, boyut düğmesi yok); harita başlığın altında küçük bir pencere; 3. adım korunur — pencere 177×126 px
- ✅ Telefon: küçük harita 3. adımı tam gösteriyor; metin pencerenin altından başlıyor, soru kutusu ekranda — görünüm dışı 0 · metin 227 px’de, pencere 219 px’de biter
- ✅ Telefon: “Haritayı büyüt” İzle’ye döner, adım 3 kalır
- ✅ Telefon: Harita takibi sorusu haritanın içinde kalır, yakınlaştırma düğmelerini, sayacı, altyazıyı ve sekmeyi örtmez, haritanın %22’sinden azını kaplar — %8.0

## I. Genel

- ✅ Hiçbir sayfada konsol ya da sayfa hatası yok

## Ekran görüntüleri

- `ai-p1-renkler-dunya.png`, `ai-p2-renkler-avrupa.png`: devlet renkleri (gri ve mavi yok, komşular ayrışıyor)
- `ai-0-yeni-duzen.png`: harita neredeyse tam ekran; üstte ince çubuk, altta ince zaman çizelgesi, hemen üstünde soru kutusu, sağda küçük bilgi kartı
- `ai-0-yer-karti.png`: bir yer seçilince küçük kart
- `ai-1a-anlatim-adim1.png`, `ai-1b-anlatim-adim2.png`, `ai-1d-anlatim-adim3.png`, `ai-1e-anlatim-adim4.png`, `ai-1c-anlatim-adim6.png`: İzle; her adım yalnızca kendi çizimini gösterir, altyazı sabit yerde, kamera adımı izler
- `ai-1f-tek-anlatici.png`: yanıt ekrandayken haritada yalnızca anılan ve tıklanan olayların işaretçileri
- `ai-j2-yer-secili-olaylar-cekildi.png`: bir yer seçilince dünya olayları haritadan çekilir (not nedenini söyler, çizelge o yerin olaylarıyla dolu)
- `ai-v1-ilerleme-cubugu.png`: zaman cetveli ilerleme çubuğu (adımlar tarihlerinde, görülenler dolu)
- `ai-t1-cizelge-aralik.png`, `ai-t2-cizelge-dar-aralik.png`: yer çizelgesi yalnızca seçili aralığı gösterir; `ai-t3-adim-noktalari-kalabalik.png`: aynı yıla düşen üç adımın noktaları birbirine binmeden açılır
- `ai-r1-altyazida-olay-adi.png`, `ai-r2-metinde-olay-adi.png`, `ai-r3-tam-ekranda-olay-adi.png`: altyazıdaki ve metindeki olay adları tıklanabilir; çizelgedeki tıklamayla aynı sonuç
- `ai-f1-metnin-sonu-tam-ekran.png`: tam ekran okumada metnin son satırı soru kutusunun üstünde
- `ai-w1-izle-adim3.png`, `ai-w2-oku-yan-panel.png`, `ai-w3-oku-tam-ekran.png`: aynı adım (3) üç görünümde: İzle, Oku yan panel, Oku tam ekran (köşede küçük harita)
- `ai-w4-oku-sirasinda-soru.png`: okurken sorulan soru, arkadaki haritayı günceller
- `ai-2-kisa-yanit.png`: kısa yanıt (adımsız, tek sahne; Osmanlı–Fransa ittifakı)
- `ai-9-harita-takibi-sorusu.png`, `ai-9b-harita-takibi-ayari.png`, `ai-9c-harita-takibi-kapali.png`, `ai-9d-harita-takibi-telefon.png`: büyük bir gezintiden sonra küçük soru; ayarın yeri; kapalıyken çip; telefonda soru
- `ai-3a-olay-karti.png`, `ai-3b-bunu-sor.png`: yanıt ekrandayken olay kartı; “Bunu sohbette sor”
- `ai-4-baglam-degisti.png`: seçili yer değişince metinde “Bağlam değişti”
- `ai-5-hata.png`, `ai-6-mobil.png`, `ai-6b-mobil-oku.png`, `ai-7-ayarlar.png`, `ai-8-gercek-sample.png`
