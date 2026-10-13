# Okuma arkadaşı, sade harita ve tutarlı sohbet: doğrulama raporu

437/437 denetim geçti (`npm run e2e:ai`). Dönem 1800–2000: uygulama İkinci Dünya Savaşı aralığında (1939–1945, 1942 sınırları) açılır; örnek yer Almanya’dır. Model olarak komut dosyalı deneme kipi kullanıldı; G grubu gerçek `sample` bağdaştırıcısını sahte bir çalışma zamanıyla sınar.

## L. Düzen: harita neredeyse tam ekran, ince zaman çizelgesi, soru kutusu hemen üstünde, küçük ve kolay kapanan bilgi kartı

- ✅ Açılış: aralık 1939–1945, sınır yılı (aralığın ortası) 1942; başlıkta “· yükleniyor…” yok ve 1942’nin sınırları haritada — yıl 1942 · sınırlar 55 ms’de hazır
- ✅ Harita neredeyse tüm ekranı kaplıyor: genişlikte tamamı, ekranın %85’inden fazlası; sayfa kaymıyor — %86 · 1440×776 / 1440×900
- ✅ Üstte tek ince çubuk (ad, yer ve yıl, atıf) var; harita ile zaman çizelgesi arasında başka bir şerit yok — çubuk 44 px · başlık: Dünya
- ✅ Zaman çizelgesi ince: en çok 84 px (ekranın %10’undan az), altta — 80 px
- ✅ Soru kutusu zaman çizelgesinin hemen üstünde ve ortada — aralık 12 px
- ✅ Bilgi kartı sağda, eskisinden (410 px) küçük, haritanın yarısından az yer tutar; ekranın üst yarısında — 328×374 px
- ✅ Tanıtım kartı ✕ ile kapanır ve sağ taraf boşalır
- ✅ Seçilen nokta (Hamburg, 10°D 53,5°K) boş kara: üstünde olay işaretçisi ya da başka bir öğe yok, yalnızca harita tuvali — CANVAS
- ✅ Yer seçilince küçük kart sağda açılır (Nazi Almanyası); harita yerinden oynamaz
- ✅ Kart kısa tutuluyor: ayrıntılar ve “aynı sırada, başka yerlerde” listesi kapalı bölümlerde; özet en çok ~7 satır (180 px), kartın tamamı haritanın %60’ından az — özet 154 px · kart 394 px
- ✅ Kapalı liste açılınca olaylar satır satır orada (tıklanabilir): satır sayısı rozetle ve veriyle (aralığın küresel olaylarından Almanya’yı ilgilendirmeyenler) aynı — 7 satır
- ✅ Karttaki ✕ kartı kapatır ve yer seçimini kaldırır (başlık “Dünya”)
- ✅ Esc de kartı kapatır
- ✅ Soru sorulunca kart kendiliğinden çekilir: yalnızca küçük bir sekme kalır; yer seçili kalır — 143×36 px
- ✅ Soru yine de o yerle ilgili: bağlamda yer var
- ✅ Sekmeye tıklamak kartı geri getirir
- ✅ Yanıt kapatılınca kart kendiliğinden geri gelir

## S. Sınırlar yıl penceresiyle gelir: açılışta ve her yıl değişiminden sonra (uzak bir aralık, yapıştırılan bir bağlantı, cetvel, art arda değişiklikler) başlıkta “· yükleniyor…” takılı kalmaz; ekrandaki sınırlar gösterilen yılındır

- ✅ Açılış uzak bir yılda (#t=1990-1996): sınır yılı 1993; başlıkta “· yükleniyor…” yok, harita hazır; Paris’te haritanın çizdiği devlet verinin dediği devlet, seçili yerin çizgisi çizili — 1993 · çizilen french-fifth-republic · veri french-fifth-republic · 64 ms
- ✅ Uzun sıçrama (1993 → 1942, aralık 1939–1945 yeniden): pencere gelir, en çok 15 sn içinde başlıkta “· yükleniyor…” kalkar, harita hazır; ekrandaki sınırlar 1942’nin (Paris Nazi Almanyası’nda) — 1942 · çizilen nazi-germany · veri nazi-germany · 3434 ms · ilk anda pencere yetti
- ✅ …ve haritanın çizdiği o yılın devleti Nazi Almanyası — nazi-germany
- ✅ Pencerenin içinde yıl değiştirmek (imleç 1939’a): sınırlar 1939’un (Paris Fransa Üçüncü Cumhuriyeti’nde), başlıkta “yükleniyor…” yok — 1939 · çizilen french-third-republic · veri french-third-republic · 1453 ms · ilk anda pencere yetti
- ✅ …ve haritanın çizdiği devlet Fransa Üçüncü Cumhuriyeti — french-third-republic
- ✅ Çok daha eski bir aralığa geçmek (1900–1906, yıl 1903): pencere gelir, “yükleniyor…” kalkar; ekrandaki sınırlar 1903’ün — 1903 · çizilen french-third-republic · veri french-third-republic · 2938 ms · ilk anda yükleniyor yazıyordu
- ✅ Yapıştırılan bağlantı (#t=1960-1966): yıl 1963; pencere gelir, başlıkta “yükleniyor…” kalmaz; ekrandaki sınırlar 1963’ün — 1963 · çizilen french-fifth-republic · veri french-fifth-republic · 2186 ms · ilk anda yükleniyor yazıyordu
- ✅ Cetvelde boş yere tıklamak aralığı oraya taşır (1850): pencere gelir, başlıkta “yükleniyor…” kalmaz; ekrandaki sınırlar gösterilen yılın — 1851 · çizilen french-second-republic · veri french-second-republic · 2087 ms · ilk anda yükleniyor yazıyordu
- ✅ …ve gösterilen yıl tıklanan yılın çevresinde (1847–1853 içinde) — 1851
- ✅ Art arda hızlı değişiklikler (1810, 1860, 1910, 1960, 1985; 60 ms arayla): son yılın (1985) penceresi gelir, başlıkta “yükleniyor…” takılı kalmaz; ekrandaki sınırlar 1985’in — 1985 · çizilen french-fifth-republic · veri french-fifth-republic · 2058 ms · ilk anda yükleniyor yazıyordu
- ✅ Verinin son yılı (2000) gösterilir: pencere gelir, başlıkta “yükleniyor…” yok; ekrandaki sınırlar 2000’in — 2000 · çizilen french-fifth-republic · veri french-fifth-republic · 2387 ms · ilk anda yükleniyor yazıyordu
- ✅ İlk yıl (1800): pencere gelir; ekrandaki sınırlar 1800’ün — 1800 · çizilen french-consulate · veri french-consulate · 2271 ms · ilk anda pencere yetti
- ✅ Hiçbir değişiklikten sonra başlıkta “· yükleniyor…” takılı kalmadı (hepsi en çok 15 sn içinde yerleşti) — sıçrama 3434 ms · imleç 1453 ms · eski aralık 2938 ms · bağlantı 2186 ms · cetvel 2087 ms · art arda 2058 ms · son yıl 2387 ms · ilk yıl 2271 ms

## A. İzle: Almanya, 1942 (kullanıcının örneği): çok adımlı anlatım adım adım ilerler; her adım yalnızca kendi çizimini gösterir; savaş olayları doğru görünür; kamera adımı izler

- ✅ Almanya’daki nokta seçildi: kartta ve haritanın üstündeki başlıkta Nazi Almanyası, 1942’nin sınırları (haritada o noktada çizilen devlet de o); kartta “Bu yerin tarihini anlat” ve “Soru sor” var — 1942 · nazi-germany
- ✅ Yer seçilince dünya olayları haritadan çekilir (hiçbiri çizilmez); hiçbir şey seçili değilken 11 olay işaretçisi vardı; not: “Yer seçili · dünya olayları haritadan çekildi”; çizelge yerin olaylarıyla dolu — 11 → 0 · not: “Yer seçili · dünya olayları haritadan çekildi, seçimi kaldırınca döner” · çizelgede 39 olay
- ✅ Yanıt gelmeden önce haritanın üstünde “Düşünüyor…” ve Durdur var; soru kutusunda da Durdur düğmesi
- ✅ Çağrı yapıldı: kart kenara çekildi (sekme), yer seçili kaldı
- ✅ İzle, uzun metinler bitmeden başladı: ilk adımın altyazısı var, metin hâlâ yazılıyor (“Metin yazılıyor…”) — streaming · 36 karakter · 1 / 8
- ✅ Metin bitince “Metin yazılıyor…” kalkar; adım sayısı 8; altyazılar ve başlıklar dolu
- ✅ Çok adımlı İzle’de “Devamını oku” satırı yok (tam metin için “Metni oku” var), adım denetimleri (önceki, sonraki, oynat, hız) görünür; kutunun yüksekliği ve ekranın dibindeki sütun, metin yazılırken ve bitince de aynı — 181 kare · kutu 97.5 px · sütunun üstü 618.4 px
- ✅ Altyazı modelin step çağrısındaki altyazıdır, bir iki cümle (en çok ~220 karakter) ve metinden kısa — 94 karakter
- ✅ Yapay zekâ yılı kullanıcının imlecini değiştirmez (yalnızca üstüne biner) — başlıkta 1939, imleç 0.5
- ✅ Anlatım sürerken dünya olayları haritada yok (çizelgede duruyorlar); yalnızca anlatılan olay haritada — 11 → 0 → 1 işaretçi
- ✅ Sohbet, Claude olmadığını açıkça söylüyor (deneme kipi)
- ✅ 1. adım yalnızca kendi çizimini gösteriyor: 2 devlet öne çıkar, 1 savaş çizgisi, kendi çizgisi yok, 1 olay işareti, 0 serbest işaret, 1939 — 2 devlet · işaretçiler: polonya-isgali-1939 · 
- ✅ 1. adım spot ışığı: öne çıkan 2 devlet dolgun ve canlı, haritanın geri kalanı soluk (örtü 0.62), öne çıkmayan adlar soluk, tarama yok — soluk ad 13 · öne çıkan ad 2 · soluk olmayan 0
- ✅ 1. adım: olay işaretlerinin yanında ad kutusu yok (ad üstüne gelince görünür) — 0 kutu · 0 açık olay adı
- ✅ 1. adım: savaş çizgisi ile olay işareti tek birim: işaret çizginin üzerinde (≤ 2 px) ve halkanın ortasında (≤ 1 px) — çizgi 0.4 · halka 0.0
- ✅ 1. adım: altyazı, başlık ve sayaç bu adımın (“1 / 8”, “Polonya’ya saldırı”)
- ✅ 1. adım: kamera adımın gösterdiği her şeyi (9 nokta: öne çıkan devletlerin kutuları, olaylar, çizgi uçları) altyazı ve soru kutusunun ÜSTÜNDEKİ görünür alana sığdırdı: görünüm dışında 0, ekranın dibindeki sütunun altında 0, savaş çizgisi uçları dışarıda 0, örtülen 0, devlet kutularının en az görünen payı %100 — merkez 17.3, 50.1 · yakınlaştırma 4.39
- ✅ 1. adım: hiçbir etiket başka bir etiketi ya da işaretçiyi örtmüyor (18 öğe)
- ✅ 2. adım yalnızca kendi çizimini gösteriyor: 3 devlet öne çıkar, 1 savaş çizgisi, kendi çizgisi yok, 2 olay işareti, 0 serbest işaret, 1940 — 3 devlet · işaretçiler: fransa-muharebesi-1940, compiegne-ateskesi-1940 · 
- ✅ 2. adım spot ışığı: öne çıkan 3 devlet dolgun ve canlı, haritanın geri kalanı soluk (örtü 0.62), öne çıkmayan adlar soluk, tarama yok — soluk ad 26 · öne çıkan ad 3 · soluk olmayan 0
- ✅ 2. adım: olay işaretlerinin yanında ad kutusu yok (ad üstüne gelince görünür) — 0 kutu · 0 açık olay adı
- ✅ 2. adım: savaş çizgisi ile olay işareti tek birim: işaret çizginin üzerinde (≤ 2 px) ve halkanın ortasında (≤ 1 px) — çizgi 0.1 · halka 0.0
- ✅ 2. adım: altyazı, başlık ve sayaç bu adımın (“2 / 8”, “Batıda yıldırım savaşı”)
- ✅ 2. adım: kamera adımın gösterdiği her şeyi (14 nokta: öne çıkan devletlerin kutuları, olaylar, çizgi uçları) altyazı ve soru kutusunun ÜSTÜNDEKİ görünür alana sığdırdı: görünüm dışında 0, ekranın dibindeki sütunun altında 0, savaş çizgisi uçları dışarıda 0, örtülen 0, devlet kutularının en az görünen payı %100 — merkez 3.3, 36.0 · yakınlaştırma 1.67
- ✅ 2. adım: hiçbir etiket başka bir etiketi ya da işaretçiyi örtmüyor (34 öğe)
- ✅ 3. adım yalnızca kendi çizimini gösteriyor: 2 devlet öne çıkar, 1 savaş çizgisi, kendi çizgisi yok, 1 olay işareti, 0 serbest işaret, 1940 — 2 devlet · işaretçiler: britanya-muharebesi-1940 · 
- ✅ 3. adım spot ışığı: öne çıkan 2 devlet dolgun ve canlı, haritanın geri kalanı soluk (örtü 0.62), öne çıkmayan adlar soluk, tarama yok — soluk ad 26 · öne çıkan ad 2 · soluk olmayan 0
- ✅ 3. adım: olay işaretlerinin yanında ad kutusu yok (ad üstüne gelince görünür) — 0 kutu · 0 açık olay adı
- ✅ 3. adım: savaş çizgisi ile olay işareti tek birim: işaret çizginin üzerinde (≤ 2 px) ve halkanın ortasında (≤ 1 px) — çizgi 0.0 · halka 0.0
- ✅ 3. adım: altyazı, başlık ve sayaç bu adımın (“3 / 8”, “Britanya direniyor”)
- ✅ 3. adım: kamera adımın gösterdiği her şeyi (9 nokta: öne çıkan devletlerin kutuları, olaylar, çizgi uçları) altyazı ve soru kutusunun ÜSTÜNDEKİ görünür alana sığdırdı: görünüm dışında 0, ekranın dibindeki sütunun altında 0, savaş çizgisi uçları dışarıda 0, örtülen 0, devlet kutularının en az görünen payı %100 — merkez 3.3, 36.0 · yakınlaştırma 1.67
- ✅ 3. adım: hiçbir etiket başka bir etiketi ya da işaretçiyi örtmüyor (31 öğe)
- ✅ 4. adım yalnızca kendi çizimini gösteriyor: 3 devlet öne çıkar, 2 savaş çizgisi, kendi çizgisi yok, 2 olay işareti, 0 serbest işaret, 1941 — 3 devlet · işaretçiler: barbarossa-1941, leningrad-kusatmasi-1941 · 
- ✅ 4. adım spot ışığı: öne çıkan 3 devlet dolgun ve canlı, haritanın geri kalanı soluk (örtü 0.62), öne çıkmayan adlar soluk, tarama yok — soluk ad 22 · öne çıkan ad 3 · soluk olmayan 0
- ✅ 4. adım: olay işaretlerinin yanında ad kutusu yok (ad üstüne gelince görünür) — 0 kutu · 0 açık olay adı
- ✅ 4. adım: savaş çizgisi ile olay işareti tek birim: işaret çizginin üzerinde (≤ 2 px) ve halkanın ortasında (≤ 1 px) — çizgi 0.3 · halka 0.0 | çizgi 0.8 · halka 0.0
- ✅ 4. adım: altyazı, başlık ve sayaç bu adımın (“4 / 8”, “Doğuya saldırı”)
- ✅ 4. adım: kamera adımın gösterdiği her şeyi (14 nokta: öne çıkan devletlerin kutuları, olaylar, çizgi uçları) altyazı ve soru kutusunun ÜSTÜNDEKİ görünür alana sığdırdı: görünüm dışında 0, ekranın dibindeki sütunun altında 0, savaş çizgisi uçları dışarıda 0, örtülen 0, devlet kutularının en az görünen payı %100 — merkez 36.5, 57.5 · yakınlaştırma 1.82
- ✅ 4. adım: hiçbir etiket başka bir etiketi ya da işaretçiyi örtmüyor (30 öğe)
- ✅ 4. adım, Barbarossa: olayın kendi işareti haritada (düğme, yılı 1941, seçili değil: yalnızca anlatılan olay), çizgisi iki tarafı (Sovyetler Birliği ile Nazi Almanyası) birleştiriyor: uçları o iki devletin içinde — 1941 · nazi-germany ↔ union-of-soviet-socialist-republics
- ✅ 4. adım: Sovyetler Birliği ve Nazi Almanyası öne çıkarılmış (canlı renk, adları mürekkep renginde) ve sınırlar 1941’in — Finlandiya | Nazi Almanyası | Sovyetler Birliği
- ✅ 5. adım yalnızca kendi çizimini gösteriyor: 1 devlet öne çıkar, 0 savaş çizgisi, kendi çizgisi yok, 1 olay işareti, 0 serbest işaret, 1942 — 1 devlet · işaretçiler: wannsee-1942 · 
- ✅ 5. adım spot ışığı: öne çıkan 1 devlet dolgun ve canlı, haritanın geri kalanı soluk (örtü 0.62), öne çıkmayan adlar soluk, tarama yok — soluk ad 14 · öne çıkan ad 1 · soluk olmayan 0
- ✅ 5. adım: olay işaretlerinin yanında ad kutusu yok (ad üstüne gelince görünür) — 0 kutu · 0 açık olay adı
- ✅ 5. adım: altyazı, başlık ve sayaç bu adımın (“5 / 8”, “Berlin’de verilen karar”)
- ✅ 5. adım: kamera adımın gösterdiği her şeyi (5 nokta: öne çıkan devletlerin kutuları, olaylar, çizgi uçları) altyazı ve soru kutusunun ÜSTÜNDEKİ görünür alana sığdırdı: görünüm dışında 0, ekranın dibindeki sütunun altında 0, savaş çizgisi uçları dışarıda 0, örtülen 0, devlet kutularının en az görünen payı %100 — merkez 17.7, 50.0 · yakınlaştırma 3.52
- ✅ 5. adım: hiçbir etiket başka bir etiketi ya da işaretçiyi örtmüyor (18 öğe)
- ✅ 6. adım yalnızca kendi çizimini gösteriyor: 5 devlet öne çıkar, 2 savaş çizgisi, kendi çizgisi yok, 2 olay işareti, 0 serbest işaret, 1942 — 5 devlet · işaretçiler: stalingrad-1942, el-alamein-1942 · 
- ✅ 6. adım spot ışığı: öne çıkan 5 devlet dolgun ve canlı, haritanın geri kalanı soluk (örtü 0.62), öne çıkmayan adlar soluk, tarama yok — soluk ad 21 · öne çıkan ad 5 · soluk olmayan 0
- ✅ 6. adım: olay işaretlerinin yanında ad kutusu yok (ad üstüne gelince görünür) — 0 kutu · 0 açık olay adı
- ✅ 6. adım: savaş çizgisi ile olay işareti tek birim: işaret çizginin üzerinde (≤ 2 px) ve halkanın ortasında (≤ 1 px) — çizgi 0.7 · halka 0.0 | çizgi 0.5 · halka 0.0
- ✅ 6. adım: altyazı, başlık ve sayaç bu adımın (“6 / 8”, “Dönüm noktası: Stalingrad”)
- ✅ 6. adım: kamera adımın gösterdiği her şeyi (22 nokta: öne çıkan devletlerin kutuları, olaylar, çizgi uçları) altyazı ve soru kutusunun ÜSTÜNDEKİ görünür alana sığdırdı: görünüm dışında 0, ekranın dibindeki sütunun altında 0, savaş çizgisi uçları dışarıda 0, örtülen 0, devlet kutularının en az görünen payı %100 — merkez 0.0, 48.0 · yakınlaştırma 1.49 · en geniş görünüm
- ✅ 6. adım: hiçbir etiket başka bir etiketi ya da işaretçiyi örtmüyor (31 öğe)
- ✅ 6. adım, Stalingrad: olayın kendi işareti haritada (düğme, yılı 1942, seçili değil: yalnızca anlatılan olay), çizgisi iki tarafı (Sovyetler Birliği ile Nazi Almanyası) birleştiriyor: uçları o iki devletin içinde — 1942 · union-of-soviet-socialist-republics ↔ nazi-germany
- ✅ 6. adım, El Alamein: Stalingrad’ın yanında El Alamein de kendi işaretiyle (1942, seçili değil); iki olay iki savaş çizgisi; sınırlar 1942’nin — 1942
- ✅ 7. adım yalnızca kendi çizimini gösteriyor: 5 devlet öne çıkar, 2 savaş çizgisi, kendi çizgisi yok, 2 olay işareti, 0 serbest işaret, 1944 — 5 devlet · işaretçiler: normandiya-1944, bagration-1944 · 
- ✅ 7. adım spot ışığı: öne çıkan 5 devlet dolgun ve canlı, haritanın geri kalanı soluk (örtü 0.62), öne çıkmayan adlar soluk, tarama yok — soluk ad 21 · öne çıkan ad 5 · soluk olmayan 0
- ✅ 7. adım: olay işaretlerinin yanında ad kutusu yok (ad üstüne gelince görünür) — 0 kutu · 0 açık olay adı
- ✅ 7. adım: savaş çizgisi ile olay işareti tek birim: işaret çizginin üzerinde (≤ 2 px) ve halkanın ortasında (≤ 1 px) — çizgi 0.4 · halka 0.0 | çizgi 0.6 · halka 0.0
- ✅ 7. adım: altyazı, başlık ve sayaç bu adımın (“7 / 8”, “İkinci cephe”)
- ✅ 7. adım: kamera adımın gösterdiği her şeyi (22 nokta: öne çıkan devletlerin kutuları, olaylar, çizgi uçları) altyazı ve soru kutusunun ÜSTÜNDEKİ görünür alana sığdırdı: görünüm dışında 0, ekranın dibindeki sütunun altında 0, savaş çizgisi uçları dışarıda 0, örtülen 0, devlet kutularının en az görünen payı %87 — merkez -0.0, 35.9 · yakınlaştırma 1.49 · en geniş görünüm
- ✅ 7. adım: hiçbir etiket başka bir etiketi ya da işaretçiyi örtmüyor (31 öğe)
- ✅ 8. adım yalnızca kendi çizimini gösteriyor: 5 devlet öne çıkar, 1 savaş çizgisi, kendi çizgisi yok, 2 olay işareti, 0 serbest işaret, 1944 — 5 devlet · işaretçiler: berlin-muharebesi-1945, almanya-teslimi-1945 · 
- ✅ 8. adım spot ışığı: öne çıkan 5 devlet dolgun ve canlı, haritanın geri kalanı soluk (örtü 0.62), öne çıkmayan adlar soluk, tarama yok — soluk ad 21 · öne çıkan ad 5 · soluk olmayan 0
- ✅ 8. adım: olay işaretlerinin yanında ad kutusu yok (ad üstüne gelince görünür) — 0 kutu · 0 açık olay adı
- ✅ 8. adım: savaş çizgisi ile olay işareti tek birim: işaret çizginin üzerinde (≤ 2 px) ve halkanın ortasında (≤ 1 px) — çizgi 0.7 · halka 0.0
- ✅ 8. adım: altyazı, başlık ve sayaç bu adımın (“8 / 8”, “Berlin ve teslim”)
- ✅ 8. adım: kamera adımın gösterdiği her şeyi (22 nokta: öne çıkan devletlerin kutuları, olaylar, çizgi uçları) altyazı ve soru kutusunun ÜSTÜNDEKİ görünür alana sığdırdı: görünüm dışında 0, ekranın dibindeki sütunun altında 0, savaş çizgisi uçları dışarıda 0, örtülen 0, devlet kutularının en az görünen payı %87 — merkez 0.0, 35.9 · yakınlaştırma 1.49 · en geniş görünüm
- ✅ 8. adım: hiçbir etiket başka bir etiketi ya da işaretçiyi örtmüyor (31 öğe)
- ✅ 8. adım, Berlin Muharebesi: olayın kendi işareti haritada (düğme, yılı 1945, seçili değil: yalnızca anlatılan olay), çizgisi iki tarafı (Sovyetler Birliği ile Nazi Almanyası) birleştiriyor: uçları o iki devletin içinde — 1945 · union-of-soviet-socialist-republics ↔ nazi-germany
- ✅ 8. adım, Berlin 1945: iki olay 1945’in olayı (işaret yılları 1945) ama veri setindeki Nazi Almanyası 1944’te biter (1945’te sınırı yok), bu yüzden sınır yılı 1944’e döner (başlıkta 1944); savaşın iki tarafı da 1944’te var — işaretler 1945, 1945 · sınır yılı 1944
- ✅ Altyazı sabit bir yerde: kutunun alt kenarı ve yatay konumu her adımda aynı (altyazı gibi) — 716 716 716 716 716 716 716 716
- ✅ Anlatım başlayınca kamera ilk adımın çizimine gitti (dünya görünümünden yakınlaştı) — 1.97 → 4.39
- ✅ Adım değiştikçe kamera adımı izliyor: komşu adımların çoğunda harita kaydı ya da yakınlaştı/uzaklaştı — 5/7 geçişte oynadı
- ✅ Önceki adımlara dönmek (4, 2, 7, 3, 8, 5, 6, 1) her seferinde yalnızca o adımın çizimini aynen getiriyor
- ✅ Okur zaman imlecini oynatınca yapay zekâ yılı kenara çekiliyor; sonraki adımda geri geliyor — 1943 → 1940
- ✅ Anlatımı kapatmak (✕) yapay zekâ çizimini ve spot ışığını kaldırır; yer hâlâ seçili olduğundan dünya olayları dönmez; kart geri gelir — 11 → 1 → 0
- ✅ Kapanışta başlıktaki yıl kullanıcının imlecine döner (yapay zekâ yılı yok)
- ✅ Yazışma silinmedi: soru kutusundaki metin düğmesi duruyor, yanıt hâlâ okunabilir

## V. İzle’de gezinme: düğmeler, ok tuşları, isteğe bağlı otomatik oynatma ve hız; çizelgede ilerleme çubuğu

- ✅ Otomatik oynatma isteğe bağlı: kendiliğinden başlamaz (yanıt bittikten sonra da 1. adımda, oynatma kapalı) — adım 1/8 · oynatma false
- ✅ 1. adımda “Önceki” kapalı, “Sonraki” açık
- ✅ “Sonraki” 2. adıma geçirir: sayaç “2 / 8”, harita 2. adımın çizimi (Nazi Almanyası, Birleşik Krallık ve Vichy Fransası, Fransa Muharebesi’nin savaş çizgisi); “Önceki” açıldı
- ✅ “Önceki” 1. adıma döndürür ve kendini yeniden kapatır
- ✅ Ok tuşları: → sonraki, ← önceki adım (1 → 2 → 3 → 2) — 2, 3, 2
- ✅ End son adıma, Home ilk adıma götürür; harita her seferinde o adımın çizimini gösterir; son adımda “Sonraki” kapalı — union-of-soviet-socialist-republics,nazi-germany,united-states-of-america,kingdom-of-great-britain,free-french | nazi-germany,second-polish-republic
- ✅ Soru kutusundayken ok tuşları yazı imlecinindir: anlatım yerinde kalır
- ✅ Harita odaktayken de oklar anlatımındır: haritayı kaydırmaz (son adımda → hiçbir şey yapmaz, kamera yerinde) — harita odakta: true
- ✅ “Sonraki” ile 1’den 8’e: her adımda sayaç, başlık, altyazı, harita çizimi ve sınır yılı o adımın; “Önceki” yalnızca 1’de, “Sonraki” yalnızca 8’de kapalı — 1:1939 2:1940 3:1940 4:1941 5:1942 6:1942 7:1944 8:1944
- ✅ ← ile 8’den 1’e: her adımda yine o adımın sayacı, başlığı, altyazısı, çizimi ve sınır yılı — 8:1944 7:1944 6:1942 5:1942 4:1941 3:1940 2:1940 1:1939
- ✅ → ile 1’den 8’e de aynı: her adım kendi altyazısı ve çiziminde; sonda → bir şey yapmaz — 2 3 4 5 6 7 8
- ✅ Çizelge ilerleme çubuğu: 8 adımın 8 noktası, 1’den 8’e soldan sağa, tarihleriyle (1939, 1940, 1940, 1941, 1942, 1942, 1944, 1944) — 1:1939 2:1940 3:1940 4:1941 5:1942 6:1942 7:1944 8:1944
- ✅ Adım noktaları birbirine değmiyor (etkin olanın büyütülmüş hâli de: merkezler en az 22 px arayla) ve yıllarının çevresinde yayılıyor: sekiz nokta altı yıla sığmaz, en az kaymayla açılırlar (ortalama kayma ≤ 4 px, hiçbiri yılından zincirin yarısından fazla uzakta değil) — en dar aralık 22 px · kayma -62, -46, -24, -8, 8, 30, 40, 62 (ortalama -0.0)
- ✅ Noktalar aralık yazısının üstüne binmiyor: fırçanın kendi yazısı noktalar varken gizli (aralık, cetvelin yanındaki büyük yazıda duruyor) — fırça yazısı: none
- ✅ Noktalar zaman çizelgesi bandının içinde ve band ince kalıyor (en çok 84 px) — 80 px
- ✅ İlerleme: 3. adımdayken 1–2 dolu (görüldü), 3 işaretli, 4–8 boş; çizgi birinci noktadan üçüncüye uzanıyor — past past on - - - - -
- ✅ Çizelgedeki 5 numaralı noktaya tıklamak 5. adıma götürür (altyazı “5 / 8”, harita 5. adımın çizimi, başlıkta 1942)
- ✅ Bu tıklama okurun kendi aralığına ve imlecine dokunmaz (ilerleme çubuğu zaman seçimi değildir) — {"range":{"from":1939,"to":1945},"cursor":0.5}
- ✅ Oynat düğmesi basılı değil; hız seçici üç seçenek sunuyor (Yavaş, Normal, Hızlı), Normal seçili — slow:Yavaş normal:Normal fast:Hızlı
- ✅ Hızı değiştirmek tek başına oynatmaz
- ✅ Oynat’a basınca düğme “Duraklat” olur, basılı görünür ve anlatım oynar
- ✅ Hızlıda adım, altyazısının okunma süresi kadar (~4.2 sn) kalıp kendiliğinden 2. adıma geçer — 4284 ms
- ✅ Oynarken 2. adımın çizimi haritada; oynatma sürüyor
- ✅ Hız “Yavaş” yapılınca bekleme yeniden ölçülür: hızlıda geçecek süre dolduğu hâlde adım hâlâ 2 ve oynatma sürüyor — 2. adım
- ✅ Duraklat oynatmayı durdurur
- ✅ Elle adım değiştirmek (Sonraki) oynatmayı durdurur: okur kontrolü alır — 3. adım · oynatma false
- ✅ Durdurulmuş anlatım, süre dolsa da yerinde kalır
- ✅ Oynatma son adımda biter: son adımın altyazısına da süre tanır, sonra 8. adımda durur (başa dönmez); düğme yeniden “Oynat” — 8. adım · oynatma false
- ✅ Sonda yeniden Oynat’a basmak anlatımı baştan oynatır
- ✅ Anlatımı kapatmak çizelgedeki adım noktalarını kaldırır

## W. Oku: yan panel ve tam ekran (köşede küçük harita); Oku ↔ İzle geçişinde adım korunur; okurken sorulan soru haritayı arka planda günceller

- ✅ İzle’de harita tüm sahne; metin kapalı (Oku paneli yok), altyazı haritanın üstünde; soru kutusunda metin düğmesi basılı değil
- ✅ (Hazırlık) 1. adımda otomatik oynatma açıldı
- ✅ “Metni oku”: metin yan panel olarak açıldı; harita hâlâ tüm sahne (panel haritanın üstünde, altyazı kalktı) — panel 461×776 px
- ✅ Görünüm değişince otomatik oynatma durur (okurun iki elinden biri metinde)
- ✅ Adım korundu: metinde 1. adım etkin, “Haritada gösteriliyor” orada ve okuma konumunda (görünür) — üstten 116 px / 727
- ✅ Arkadaki harita 1. adımın çiziminde kaldı (Almanya + Polonya, Polonya’nın işgalinin savaş çizgisi, 1939) ve panelin altında kalan bir şey yok — görünüm dışı 0, örtülü 0
- ✅ Soru kutusu panelin soluna çekildi (örtüşmüyor); başlıkta yer ve aralık yazıyor
- ✅ Yan panel açıkken etiketler birbirini ve işaretçileri örtmüyor
- ✅ Oku’dayken oklar metni kaydırır, anlatımı ilerletmez (adım 1’de kaldı)
- ✅ Oku → İzle: 1. adım korundu (altyazı “1 / 8”), metin kapandı, harita 1. adımda — watch · 1
- ✅ Metni kaydırdıkça okuma çizgisindeki adım haritaya gelir (aşağı kaydırarak 5. adıma ya da ötesine ulaşıldı); etkin adım tek — 6. adım · union-of-soviet-socialist-republics+nazi-germany+kingdom-of-great-britain+kingdom-of-egypt+kingdom-of-italy
- ✅ Okurken ulaşılan adım İzle’ye taşınır (altyazı o adımın) — 6. adım
- ✅ Soru kutusundaki metin düğmesi okuyucuyu açar (basılı), bir daha basınca kapatır ve İzle’ye döner; adım korunur
- ✅ …kapatınca İzle’ye döner, 1. adım
- ✅ Tam ekran: metin sahneyi kapladı; harita köşede küçük bir pencere (sağ üst), tarayıcı penceresinin içinde — pencere 338×234 px, sağ üstte (1083, 101)
- ✅ Küçük harita o anki adımı gösteriyor: 1. adımın çizimi (Almanya + Polonya, 1939), tamamı pencerenin içinde (ya da pencere dünyanın en geniş görünümündeyse her devletin kutusunun çoğu) ve hiçbir şeyin altında değil — 9 nokta · görünüm dışı 0 · örtülü 0 · kutu payı %100
- ✅ Tam ekranda da adım korundu: metinde 1. adım etkin ve görünür; “Haritada gösteriliyor” orada
- ✅ Metin rahat bir sütun (en çok 720 px) ve küçük haritayla yan yana: ikisi birbirini örtmüyor — sütun 720 px
- ✅ Pencerede “Haritayı büyüt” düğmesi var
- ✅ Küçük haritada çizimin ad etiketleri yok (pencereyi kalabalıklaştırmaz; metin yanında); savaş tek parça (işaret + çizgi), serbest işaret ve kendi çizgisi yok — 0 etiket · 1 savaş · polonya-isgali-1939
- ✅ Metindeki 5. adımda “Haritada göster”: küçük harita 5. adımın çizimine geçer (Nazi Almanyası, Wannsee Konferansı, 1942) ve onu tam gösterir — nazi-germany · görünüm dışı 0
- ✅ Tam ekranda metni yukarı kaydırmak küçük haritadaki adımı da geri götürür — 3. adım
- ✅ Esc önce tam ekranı yan panele küçültür (harita yeniden tüm sahne), adım korunur
- ✅ Bir daha Esc metni kapatıp İzle’ye döner; adım hâlâ aynı
- ✅ “Haritayı büyüt”: harita yeniden tüm sahne, İzle’ye dönüldü, adım korundu ve çizim yine tam görünür — 3. adım · 1 savaş · işaretçi britanya-muharebesi-1940 · 0 ad kutusu
- ✅ Okuyucu en son kullanılan kipte açılır (burada tam ekran) ve 4. adımda başlar — full · 4. adım
- ✅ Okurken soru: yanıt metne eklendi, okuyucu açık kaldı (yan panel); yeni yanıt tek adımlı (adım sayacı, oynatma yok) — 2 yanıt
- ✅ Arkadaki harita yeni soruya geçti (yerin devleti Nazi Almanyası öne çıkar, yerin noktası serbest işaretle ve adıyla; yanıt olay da yıl da vermediği için okurun kendi yılı, 1942) ve çizim paneli ile soru kutusunun dışında — nazi-germany · 1942
- ✅ Tam ekranda okurken soru: küçük harita yeni yanıtın sahnesine geçer (yeni yerin devleti Birleşik Krallık ve serbest işareti; adı kutusu yok; görünür, örtülü değil); okuyucu açık — kingdom-of-great-britain · işaret 1 · kutu payı %100
- ✅ İzle’ye dönünce son yanıt tek adımlı: altyazısı haritanın üstünde, “Devamını oku” altında; adım sayacı yok

## A2. Anlatımdan önce haritayı gezmek “Harita takibi”ni kapatmaz; takip ilk adımdan çalışır

- ✅ Anlatımdan önce haritayı sürüklemek ve yakınlaştırmak takibi kapatmaz, soru da çıkmaz
- ✅ İlk adım açılınca kamera çizimi görünür kıldı (okurun kendi gezdiği görünümden) — 4.20 → 4.39
- ✅ 4. adım: harita iki devleti de görünür kılıyor (Almanya’nın başkenti Berlin ve Sovyetler Birliği’nin başkenti Moskova) — yakınlaştırma 4.39 → 1.82

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
- ✅ Haritanın üçte biri kadar sürüklemek (önemli hareket) soruyu yeniden getirir — kamera 25.5, 55.1, 3.21 → -3.3, 60.0, 3.21 · takip true · soru true
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

## B. Her yanıtın kısa bir altyazısı ve tam bir metni var: tek şeyi soran soru tek adımlı yanıt alır (altyazı haritanın üstünde, adım denetimi yok, “Devamını oku” tam metni açar); düz metin yazan modelde de altyazı metnin tamamı değildir

- ✅ “Soru sor” soru kutusuna odaklanır; ilk soru öncesi öneriler (Bu yerin tarihini anlat, …) çıkar
- ✅ Soru gönderilince kutu temizlendi; yanıt gelene kadar haritanın üstünde “Düşünüyor…” ve Durdur görünür
- ✅ Yanıt tek adımlı: İzle’de [data-steps="1"]; adım sayacı, önceki/sonraki, oynat, hız ve “Metni oku” yok; çizelgede adım noktaları yok; kapat düğmesi var — adımlı: false · olan denetimler: —
- ✅ Her yanıtın altyazısı var: modelin kendi altyazısı (bir iki cümle, en çok 220 karakter), başlığı “Almanya ve İtalya” ve tam metnin (iki paragraf) çok altında; olay adı (Üçlü Pakt) bağlantı — altyazı 114 karakter · metin 604 karakter
- ✅ “Devamını oku” altyazının hemen altında görünür (düğme, kutunun içinde) — Devamını oku · görünür
- ✅ Altyazı kutusunun yüksekliği yanıt boyunca değişmez: “Devamını oku” satırı baştan yerinde (metin gelene dek görünmez, gelince görünür), ekranın dibindeki sütunun üstü hiç oynamaz (kamera sahneyi bir kez, bu sütunun üstüne sığdırır) — 76 kare · kutu 118.8 px · sütunun üstü 596.7 px
- ✅ Altyazı soru kutusunun hemen üstünde (en çok 24 px aralık) ve kutuyu örtmüyor — aralık 10 px
- ✅ Haritada o yanıtın tek sahnesi: Nazi Almanyası ile İtalya ittifak çizgisiyle bağlı (“Çelik Pakt, 1939”, modelin kendi çizgisi), Üçlü Pakt’ın taraflarıyla (Japonya da) öne çıkarılmış ve işareti konmuş; adımın adını koyduğu 1939’un sınırları; serbest işaret yok — nazi-germany+kingdom-of-italy+empire-of-japan · Çelik Pakt, 1939 · 1939
- ✅ Öne çıkan devletlerin adları haritada mürekkep renginde, kalın (Nazi Almanyası ve İtalya Krallığı dahil) — Nazi Almanyası | Japon İmparatorluğu | İtalya Krallığı
- ✅ Kamera sahnenin her şeyini (ittifakın iki ucu, Üçlü Pakt’ın işareti, devletlerin kutuları) altyazının ve soru kutusunun ÜSTÜNDEKİ görünür alana sığdırdı: görünüm dışında yok, örtülen yok; harita yerinden oynadı — yakınlaştırma 1.97 → 2.85 · görünüm dışı 0 · altta 0 · örtülü 0
- ✅ Etiketler birbirini, işaretçileri ve altyazıyı örtmüyor
- ✅ Soru sorulunca yer kartı kenara çekildi (sekme), yer seçili kaldı
- ✅ “Devamını oku” tam metni Oku’da açar: tek bölüm, numarasız (adım numarası yok); haritadaki sahne “Haritada gösteriliyor”; iki paragrafın ikisi de orada (Mihver, Çelik Pakt ve Üçlü Pakt) ve altyazıdan çok daha uzun — 1 bölüm · 2 paragraf
- ✅ İzle’ye dönünce yine tek adımlı yanıt: altyazı ve “Devamını oku” yerinde, adım sayacı yok; harita aynı sahnede
- ✅ Stalingrad sorusunun yanıtı tek adımlı: İzle’de [data-steps="1"], başlığı “Stalingrad”, altyazısı tek cümle ve olay adı (Stalingrad Muharebesi) bağlantı; adım denetimi yok — Stalingrad Muharebesi'nde Alman 6. Ordusu kuşatılıp teslim oldu; doğu cephesinde inisiyatif Sovyetlere geçti.
- ✅ Altyazı kısa (tek cümle) ve uzun metnin yerine geçmiyor: metin iki paragraf, altyazının en az dört katı; “Devamını oku” altında görünür — altyazı 109 · metin 652 karakter
- ✅ Kutu yüksekliği ve ekranın dibindeki sütun yanıt boyunca değişmez (“Devamını oku” belirince kamera çerçevesi bozulmaz) — 78 kare · kutu 118.8 px · sütunun üstü 596.7 px
- ✅ Haritada olayın sahnesi: Stalingrad’ın kendi işareti (1942, yalnızca o), iki tarafı (Sovyetler Birliği, Nazi Almanyası) öne çıkarılmış ve aralarında tek savaş çizgisi; modelin kendi çizgisi ve serbest işareti yok — union-of-soviet-socialist-republics+nazi-germany · stalingrad-1942 · 1942
- ✅ Kamera sahneyi altyazının ve soru kutusunun ÜSTÜNDEKİ alana sığdırdı (savaş çizgisinin uçları, işaret, iki devletin kutuları): görünüm dışında yok, altında ve örtülen yok; harita yerinden oynadı — görünüm dışı 0 · altta 0 · örtülü 0 · yakınlaştırma 1.75
- ✅ Oku’da uzun metin: tek bölüm (“Stalingrad”), iki paragrafın ikisi de (kuşatma ve sonuçları), olay adı bağlantı; uzun metin altyazının birkaç katı — 2 paragraf · 646 karakter
- ✅ Geri dönünce altyazı aynı tek cümle
- ✅ Düz metin yazan modelde de yanıt bir adım: araç çağrısı ve başlık yok (plan boş), İzle’de [data-steps="1"] ve adım denetimi yok; haritada yapay zekâ çizimi yok — plan boş: true · sahne: false
- ✅ Güvenlik ağı: sayfa altyazıyı kendisi çıkarır, metnin tamamını altyazıya koymaz: ilk bir iki cümle (en çok ~220 karakter, burada ilk cümle), metnin bir önekidir ve cümle sonunda biter; metnin yarısından kısa — altyazı 75 · metin 857 karakter
- ✅ “Devamını oku” altyazının altında görünür (kalan metin Oku’da); kutunun altyazı dışındaki kısmı (satır dahil) yanıt boyunca aynı yükseklikte; yanıt bitince kutu yerleşik — 73 kare · kutu 118.8 px · altyazı dışı 73.3 px · satır önce gizliydi
- ✅ Oku’da metnin tamamı: üç paragrafın üçü de (hava gücü, bombardıman, atom bombaları), tek bölüm, numarasız; haritada gösterecek sahne olmadığı için “Haritada göster” yok — 3 paragraf · 855 karakter
- ✅ İzle’ye dönünce altyazı yine yalnızca ilk cümle ve “Devamını oku” duruyor

## C. Olay: yanıt ekrandayken çizelgeden bir olaya tıklamak, kartı sağda açar ve işaretçisini haritaya getirir

- ✅ Tıklamadan önce haritada yalnızca yanıtın anlattığı olayın işaretçisi var (Üçlü Pakt); dünya olayları çizelgede, Barbarossa da orada — uclu-pakt-1940
- ✅ Olay kartı sağda açıldı (yer kartının yerinde); tek adımlı yanıtın altyazısı ve soru kutusu yerinde
- ✅ Tıklanan olay haritaya gelir: işaretçisi vurgulu (tek seçili); yanıtın kendi olayının işaretçisi de yerinde kalır — uclu-pakt-1940,barbarossa-1941 · seçili barbarossa-1941
- ✅ Olay kartı küçük (en çok 340 px) ve sağ kenarda; yanıtın metnini ve soru kutusunu örtmez — 328 px
- ✅ Yer, kartın üstünde tek satır olarak duruyor; açık olay soru kutusunda bağlam olarak görünüyor
- ✅ Açık olayın adı ve işaretçisi başka etiketlerle çakışmıyor
- ✅ Kartı kapatmak yanıtı yerinde bırakır; tıklanan olayın işaretçisi haritadan çekilir (yanıtın kendi olayınınki kalır); yer kartı sekmeye döner (önceki hâli)
- ✅ Esc de olay kartını kapatır; yanıt ekranda kalır
- ✅ Olay kartında “Bunu sohbette sor” düğmesi var
- ✅ Düğme olayı soruya ekledi: kart kapandı, yer kartı sekmede; yeni yanıt tek adımlı altyazı olarak ekranda, “Devamını oku” altında
- ✅ Model olayı bağlam olarak aldı (açık olay kartı, kimliğiyle + soru)
- ✅ Yanıtın haritası: yalnızca olay söylendi; uygulama onu kendi işaretiyle (ad kutusu yok), tarafları öne çıkarılmış ve savaş çizgisiyle çizdi; olayın yılı; serbest işaret yok — nazi-germany+union-of-soviet-socialist-republics · barbarossa-1941 ·  · 1941 · işaret 0 · görünüm dışı 0 · örtülü 0
- ✅ Metinde kullanıcı mesajının altında olay çipi var (Barbarossa Harekâtı)

## C2. Olay: yanıt yokken kart sağda açılır; “Bunu sohbette sor”; çizelgeden; Esc sırası

- ✅ Yanıt yokken olay kartı sağdaki kartta açılır (altyazı, metin ya da sekme yok)
- ✅ “Bunu sohbette sor” olayı soruya ekler: yanıt haritanın üstünde (tek adımlı), olay kartı kapandı, yer kartı sekmede
- ✅ Çizelgedeki noktaya tıklamak da kartı sağda açar (Wannsee Konferansı); yanıt yerinde
- ✅ Esc önce olay kartını kapatır, yanıt ekranda kalır
- ✅ Bir daha Esc yanıtı kapatır ve yer kartı geri gelir (yer seçili kalır, harita okurun)
- ✅ Bir daha Esc yer seçimini kaldırır

## D. Bağlam: yanıt sürerken seçili yer değişirse metin bunu gösterir

- ✅ Yer değişmeden ayırıcı yok
- ✅ Yer değişince metinde tek bir “Bağlam değişti” ayırıcısı çıkıyor — 1 ayırıcı · Nazi Almanyası · 1939–1945 → Sovyetler Birliği · 1939–1945
- ✅ Ayırıcı eski ve yeni konuyu söylüyor — BAĞLAM DEĞİŞTİ Nazi Almanyası · 1939–1945 → Sovyetler Birliği · 1939–1945
- ✅ Üst çubuk yeni yeri gösteriyor
- ✅ Soru kutusu yeni yeri söylüyor — “Sovyetler Birliği hakkında sorun…” · kutu 264 px
- ✅ Yeni yerin kartı sağda geri geldi (seçim kartı sekmeden çıktı)
- ✅ Aralık da değişince aynı ayırıcı güncelleniyor (ikincisi eklenmiyor)
- ✅ Okur konuya dönerse ayırıcı kalkıyor — 0 ayırıcı ·  · yer [{"lon":9.85169491525113,"lat":53.53700149886075}]
- ✅ Model bağlamın değiştiğini söylendi (“Konu değişti”)
- ✅ Ayırıcı metinde, değişiklikten sonraki sorunun önünde kalıyor

## J. Tek anlatıcı: yer seçiliyken ya da yanıt ekrandayken dünya olayları haritadan çekilir; anılan ve tıklanan olay işaretçisini getirir

- ✅ Hiçbir şey seçili değilken dünya olayları haritada: işaretçiler (hepsi aralığın dünya olaylarından) ve “n / m olay haritada” notu — 11 işaretçi, aralığın 44 dünya olayından · 11 / 44 olay haritada · yakınlaştıkça artar
- ✅ Stalingrad yanıtı ekrana gelince (anlatıcı yapay zekâ) dünya olayları haritadan çekilir: yalnızca yanıtın andığı olay kalır; not nedenini söyler — 11 → 1 (stalingrad-1942; dünya işaretçileri arasında vardı) · 1 olay haritada · gerisi yanıt kapanınca döner
- ✅ Stalingrad yanıtı kapatılınca (✕) dünya olayları haritaya geri gelir (kamera yanıtın çerçevesinde kaldığı için küme o görünüme göre), yapay zekâ çizimi gider, eski not döner — 10 işaretçi · 10 / 44 olay haritada · yakınlaştıkça artar
- ✅ Almanya–İtalya ittifakı yanıtı ekrana gelince (anlatıcı yapay zekâ) dünya olayları haritadan çekilir: yalnızca yanıtın andığı olay kalır; not nedenini söyler — 11 → 1 (uclu-pakt-1940; dünya işaretçileri arasında yoktu) · 1 olay haritada · gerisi yanıt kapanınca döner
- ✅ Almanya–İtalya ittifakı yanıtı kapatılınca (✕) dünya olayları haritaya geri gelir (kamera yanıtın çerçevesinde kaldığı için küme o görünüme göre), yapay zekâ çizimi gider, eski not döner — 18 işaretçi · 18 / 44 olay haritada · yakınlaştıkça artar
- ✅ Hiçbir şey çizmeyen bir yanıt da anlatıcıdır: dünya olaylarının hiçbiri haritada kalmaz, not “0 olay haritada · gerisi yanıt kapanınca döner” der — 18 → 0 · 0 olay haritada · gerisi yanıt kapanınca döner
- ✅ Bu yanıtı kapatmak da dünya olaylarını haritaya geri getirir — 18 işaretçi
- ✅ Bir yer seçilince dünya olaylarının hiçbiri haritada kalmaz (anlatıcı yer); çizelge o yerin olaylarıyla dolu; not: “Yer seçili” — 11 → 0 işaretçi · çizelgede 39 olay · Yer seçili · dünya olayları haritadan çekildi, seçimi kaldırınca döner
- ✅ Kartın “başka yerlerde” listesinden ya da çizelgeden açılan olay haritaya gelir (yalnızca o), kartı açıktır — sovyet-polonya-isgali-1939 (sovyet-polonya-isgali-1939)
- ✅ Olay kartı kapanınca işaretçisi haritadan yine çekilir
- ✅ Çizelgeden açılan yerel olay (dünya olayları arasında olmayan, önemi düşük) da haritaya gelir: yalnızca o, kartı açık — anne-frank-saklanma-1942 (önem 2) · yerin çizelgesinde 2 yerel olay
- ✅ Yerel olayın kartı kapanınca onun işaretçisi de çekilir
- ✅ Seçim kalkınca dünya olayları haritaya döner (aynı kamerada aynı küme) ve not eski hâline gelir — 11 işaretçi
- ✅ 3. adım Britanya Muharebesi’nden söz ediyor: haritada onun kendi işaretçisi var (yanında ad kutusu yok), başka olay yok — britanya-muharebesi-1940
- ✅ Yer seçiliyken de yanıt ekrandaysa anlatan yapay zekâdır: not “n olay haritada · gerisi çizelgede” der (n = anlatılan olay sayısı) — 1 olay haritada · gerisi çizelgede
- ✅ Anılan olayın işaretçisi sıradan olay işaretçisiyle aynı (yıl yazılı, düğme, vurgulu değil) — 1940
- ✅ Olay işaretinin adı üstüne gelince görünür (ipucu) — Britanya Muharebesi
- ✅ Anılan olayın işaretçisine tıklamak olay kartını sağda açar; altyazı yerinde kalır
- ✅ Hem anılan hem açık olduğunda yapay zekâ tarafında ad kutusu yok (açık olayın kendi adı kartta ve işaretinde), çakışma yok
- ✅ Kart kapanınca olay yine anlatılan olay olarak haritada kalır (ad kutusu yok)
- ✅ Model verideki bir olay (Yugoslavya ve Yunanistan'ın işgali) için mark çağırınca olayın kendi işareti gösterilir, ikinci bir işaret çizilmez — tamam: «Yugoslavya ve Yunanistan'ın işgali» uygulamanın olay kaydı; olay olarak gösterildi (böyle olaylar için show_event kullan) · 3 savaş çizgisi
- ✅ Verinin bilmediği bir yer (Smolensk) serbest işaret olarak kalır: mürekkep eşkenar dörtgen ve etiketi — Smolensk
- ✅ Bu kalabalık adımda da (3 olay + 1 işaret) etiketler birbirini ve işaretçileri örtmüyor
- ✅ Anlatım kapanınca anlatıcının işaretçileri ve çizimi gider; yer hâlâ seçili olduğundan dünya olayları dönmez

## K. Etiket çakışması: her adımda, farklı kameralarda ve ekran boyutlarında hiçbir etiket başkasını örtmüyor

- ✅ 1440×900: 8 adım × 3 kamera (çerçeve, +0,9, −0,9) = 24 durumda 544 öğe (devlet adları, olay işaretleri ve yılları, yer noktası) hiçbir etiketi ya da işaretçiyi örtmüyor
- ✅ 1440×900: kalabalık 4. adım (3 olay, 3 savaş çizgisi, serbest işaret ve etiketi) × 3 kamera = 3 durumda 3 yapay zekâ etiketi hiçbir etiketi ya da işaretçiyi örtmüyor ve harita dışına taşmıyor — kamera başına etiket: 1 / 1 / 1
- ✅ 1440×900: Çelik Pakt yanıtı × 3 kamera = 3 durumda 2 yapay zekâ etiketi (bağlantı etiketi; çerçevede var) hiçbir etiketi ya da işaretçiyi örtmüyor ve harita dışına taşmıyor — kamera başına etiket: 1 / 0 / 1
- ✅ 1180×760: 8 adım × 3 kamera (çerçeve, +0,9, −0,9) = 24 durumda 460 öğe (devlet adları, olay işaretleri ve yılları, yer noktası) hiçbir etiketi ya da işaretçiyi örtmüyor
- ✅ 1180×760: kalabalık 4. adım (3 olay, 3 savaş çizgisi, serbest işaret ve etiketi) × 3 kamera = 3 durumda 3 yapay zekâ etiketi hiçbir etiketi ya da işaretçiyi örtmüyor ve harita dışına taşmıyor — kamera başına etiket: 1 / 1 / 1
- ✅ 1180×760: Çelik Pakt yanıtı × 3 kamera = 3 durumda 2 yapay zekâ etiketi (bağlantı etiketi; çerçevede var) hiçbir etiketi ya da işaretçiyi örtmüyor ve harita dışına taşmıyor — kamera başına etiket: 1 / 0 / 1

## P. Devlet renkleri: ekranda görünen renkler gri/grimsi ya da mavi değil, komşular birbirinden ayrışıyor; spot ışığında öne çıkanlar canlı, gerisi soluk

- ✅ Ekran görüntüsünden okunan renkler (7 görünüm, 259 devlet): her görünümde en az 10 devlet, iç örneklerin %97’sinden fazlası stilin istediği renkte — dünya, 1939–1945 (sınırlar 1942): 51 devlet, 2491/2513 örnek · Avrupa, 1939–1945 (sınırlar 1942): 20 devlet, 3343/3349 örnek · Doğu Asya, 1939–1945 (sınırlar 1942): 17 devlet, 3552/3564 örnek · Hindistan ve İran, 1939–1945 (sınırlar 1942): 25 devlet, 4308/4311 örnek · Avrupa, 1910–1916 (sınırlar 1913): 23 devlet, 3372/3377 örnek · Afrika, 1960–1966 (sınırlar 1963): 53 devlet, 1882/1884 örnek · Avrasya, 1990–1996 (sınırlar 1993): 70 devlet, 3376/3390 örnek
- ✅ Hiçbir devlet gri ya da grimsi değil: en soluk devletin doygunluğu (OKLCH C) 0.090 (en az 0,07; kum rengi “veri yok” zemini gibi görünen yok)
- ✅ Hiçbir devlet mavi, turkuaz ya da mor değil (ton 180°–310° dışında; mavi yalnızca deniz ve göllerin)
- ✅ Komşu devletler belirgin ayrışıyor: 430 komşu çiftte (her devletin kendi içinde gösterdiği renk) en küçük renk farkı ΔE 8.6 (en az 8) — en yakın çift: francoist-spain | vichy-france; paletin birbirine en yakın iki rengi ΔE 8.6
- ✅ Spot ışığı, ekran görüntüsünden: her adımda öne çıkan devletlerin pikselleri kendi canlı renginde (tam dolgun, saydam değil), haritanın geri kalanı kâğıt örtüyle solmuş renkte — 1. adım: 1165 öne çıkan örnek (renk sapması 4), 3562 soluk örnek (sapma 3), doygunluk 0.14 → 0.05 · 2. adım: 25 öne çıkan örnek (renk sapması 0), 2071 soluk örnek (sapma 16), doygunluk 0.14 → 0.05 · 3. adım: 24 öne çıkan örnek (renk sapması 0), 2072 soluk örnek (sapma 16), doygunluk 0.14 → 0.05 · 4. adım: 1124 öne çıkan örnek (renk sapması 28), 1217 soluk örnek (sapma 14), doygunluk 0.17 → 0.05 · 5. adım: 929 öne çıkan örnek (renk sapması 6), 2627 soluk örnek (sapma 6), doygunluk 0.14 → 0.05 · 6. adım: 675 öne çıkan örnek (renk sapması 20), 1090 soluk örnek (sapma 10), doygunluk 0.17 → 0.05 · 7. adım: 997 öne çıkan örnek (renk sapması 35), 681 soluk örnek (sapma 11), doygunluk 0.16 → 0.05 · 8. adım: 997 öne çıkan örnek (renk sapması 35), 681 soluk örnek (sapma 11), doygunluk 0.16 → 0.05
- ✅ Öne çıkanlar belirgin ayrışıyor: canlı devletlerin doygunluğu soluk devletlerinkinin en az iki katı, soluk olanlar daha açık — 1: 3.0× · açıklık 0.68 / 0.91 · 2: 3.1× · açıklık 0.64 / 0.91 · 3: 3.1× · açıklık 0.64 / 0.91 · 4: 3.7× · açıklık 0.75 / 0.89 · 5: 2.9× · açıklık 0.64 / 0.91 · 6: 3.6× · açıklık 0.75 / 0.89 · 7: 3.5× · açıklık 0.72 / 0.89 · 8: 3.5× · açıklık 0.72 / 0.89
- ✅ Canlı renkler de gri ya da mavi değil: öne çıkan devletlerin ortalama doygunluğu en az 0,10 ve hiçbir devletin tonu (canlı ya da soluk) 180°–310° arasında değil — 1: 0.14 · 2: 0.14 · 3: 0.14 · 4: 0.17 · 5: 0.14 · 6: 0.17 · 7: 0.16 · 8: 0.16

## R. Olay adları: altyazıda ve metinde tıklanabilir bağlantı; çizelgedeki bir olaya tıklamakla aynı şeyi yapar

- ✅ Her adımın altyazısında olay adları bağlantı: 1’den 8’e hepsinde, altyazının işaretlediği olay kimlikleriyle (4. adımda Barbarossa, 6. adımda Stalingrad ve El Alamein, 7. adımda Normandiya ve Bagration…); görünen yazıda işaret yok — 1: 1 · 2: 1 · 3: 1 · 4: 1 · 5: 1 · 6: 2 · 7: 2 · 8: 2
- ✅ 6. adımın altyazısında Stalingrad ve El Alamein birer bağlantı (olay kimlikleriyle): noktalı alt çizgili, işaretçi imleçli; cümlenin içinde düz yazı gibi duruyor — “Stalingrad” “El Alamein”
- ✅ Altyazının görünen yazısında bağlantı işaretleri yok (köşeli ayraç, “olay:” görünmüyor); sözcükler aynı — Şubat 1943'te Stalingrad'da Alman 6. Ordusu teslim oldu; aynı aylarda El Alamein
- ✅ Haritadaki olay işaretçisinin adı üzerine gelince görünür (yanında kalıcı bir ad kutusu yok): “Stalingrad Muharebesi” — Savaş ve çatışma Stalingrad Muharebesi 23 Ağustos 1942 – 2 Şubat 1943 
- ✅ Altyazıdaki “Stalingrad”, çizelgedeki Stalingrad noktasına tıklamakla aynı şeyi yapar: aynı olay açık, aynı kart (aynı yerde, aynı başlık), aynı işaretçiler, soru kutusunda aynı çip; adım ve görünüm yerinde — {"event":"stalingrad-1942","card":true,"cardRect":{"left":1117,"top":106,"right":1411,"bottom":536},"title":"Stalingrad Muharebesi","selectedMarker":["stalingrad-1942"],"markers":["el-alamein-1942","stalingrad-1942"],"chip":"Stalingrad Muharebesi açık olay, soruya eklenir","step":6,"view":"watch","read":"side"}
- ✅ Aynı altyazıdaki “El Alamein” kartı o olaya çevirir (tek kart, açık olay El Alamein, işaretçisi vurgulu); altyazı ve 6. adım yerinde — İkinci El Alamein Muharebesi
- ✅ Aynı bağlantıya bir daha tıklamak olayı kapatır (çizelgedeki nokta gibi); yer kartı sekmeye döner, adım yerinde
- ✅ Okuyucudaki metinde de olay adları bağlantı: her adımın metninde yazının işaretlediği olaylar (4. adımda Barbarossa ve Leningrad, 6. adımda Stalingrad ve El Alamein), tüm metinde 16 bağlantı, her biri bir düğme; işaret sözdizimi görünmüyor — 16 bağlantı · 3 2 1 2 1 2 3 2
- ✅ Okuyucuda (yan panel) metindeki “Stalingrad” da çizelgedeki noktayla aynı şeyi yapar: aynı olay, aynı kart; kart okuyucunun soluna sığıyor (üstüne binmiyor); okuyucu açık, adım 6 yerinde — kart {"left":656,"top":106,"right":950,"bottom":536} · Stalingrad işaretçisi (829, 480) kartın altında
- ✅ Metindeki başka bir ad (El Alamein) kartı o olaya çevirir (tek kart, işaretçisi vurgulu); aynı adın ikinci tıklaması olayı kapatır; okuyucu açık, adım 6 yerinde — İkinci El Alamein Muharebesi
- ✅ 7. adımın metnindeki “Normandiya” bağlantısı olayı açar ama adımı değiştirmez: 6. adım etkin, haritada 6. adımın sahnesi kalır (bir bağlantıya tıklamak “adımı göster” sayılmaz); ikinci tıklama kapatır — etkin adım 6
- ✅ Esc önce olay kartını kapatır; okuyucu ve adım yerinde
- ✅ Bir bağlantıya tıklayıp Esc’e bastıktan hemen sonra tam ekrana geçmek okunan adımı oynatmaz (6. adım kalır; eskiden metin sonuna kayıp 8. adıma geçiyordu) — 6. adım
- ✅ Tam ekranda da metindeki bağlantı çizelgedeki noktayla aynı şeyi yapar: olay açık, işaretçisi küçük haritada vurgulu, soru kutusunda olay çipi; okuyucu ve adım yerinde — İkinci El Alamein Muharebesi açık olay, soruya eklenir
- ✅ Tam ekranda Esc açık olayı kaldırır (okuyucu tam ekran kalır)
- ✅ Tam ekranda aynı bağlantıya bir daha tıklamak olayı kapatır (soru kutusundaki çip de gider); okuyucu ve adım yerinde
- ✅ Tek adımlı Stalingrad yanıtının altyazısında “Stalingrad Muharebesi” bir bağlantı (olay kimliğiyle): noktalı alt çizgili, işaretçi imleçli; görünen yazıda işaret yok — “Stalingrad Muharebesi”
- ✅ Tek adımlı yanıtın altyazısındaki “Stalingrad Muharebesi” de çizelgedeki noktayla aynı şeyi yapar: aynı olay, aynı kart, aynı işaretçiler, soru kutusunda aynı çip; yanıt ekranda kalır — {"event":"stalingrad-1942","card":true,"cardRect":{"left":1117,"top":106,"right":1411,"bottom":536},"title":"Stalingrad Muharebesi","selectedMarker":["stalingrad-1942"],"markers":["stalingrad-1942"],"chip":"Stalingrad Muharebesi açık olay, soruya eklenir","step":1,"view":"watch","read":"side"}
- ✅ Aynı bağlantıya bir daha tıklamak olayı kapatır; tek adımlı yanıt (altyazı, “Devamını oku”) yerinde
- ✅ Tek adımlı yanıtın metninde de olay adı bağlantı (Stalingrad Muharebesi); işaret sözdizimi görünmüyor — stalingrad-1942
- ✅ Tek adımlı yanıtın metnindeki bağlantı da çizelgedeki noktayla aynı şeyi yapar (yan panel): aynı olay, aynı kart, kart okuyucunun soluna sığıyor; okuyucu açık, adım yerinde — {"left":656,"top":106,"right":950,"bottom":536}
- ✅ Başka bir tek adımlı yanıtın (Almanya–İtalya) altyazısındaki “Üçlü Pakt” bağlantısı da çizelgedeki noktayla aynı şeyi yapar, olay haritanın gösterdiği yıldan (1939) başka bir yılda (1940) olsa da — {"event":"uclu-pakt-1940","card":true,"cardRect":{"left":1117,"top":106,"right":1411,"bottom":495},"title":"Üçlü Pakt","selectedMarker":["uclu-pakt-1940"],"markers":["uclu-pakt-1940"],"chip":"Üçlü Pakt açık olay, soruya eklenir","step":1,"view":"watch","read":"side"}

## T. Çizelge: yalnızca seçili aralık (ondan önce ve sonra hiçbir şey yok); adım noktaları aralık yazısına ve birbirine binmiyor

- ✅ 1939–1945: eksen yalnızca 1939–1945: yıl etiketlerinin hepsi bu aralıkta, 7 etiket, yerleri aralığa göre (yıl başına 174.3 px); ilk etiket (1939) çizelgenin sol kenarında, son etiket (1945) sağ kenara yakın — 1939 1940 1941 1942 1943 1944 1945 · “39 olay · 1939–1945”
- ✅ 1939–1945: çizelgedeki 39 olay noktasının hepsi bu aralıkla kesişiyor (dışarıdan olay yok) ve çizelgenin içinde; aralıktan önce başlayan 1 olay kenara yapışık duruyor — dışarıda olan yok · kenarda: ispanya-ic-savasi-1936
- ✅ 1939–1945: yer egemenlik şeridi de aralığın dışına taşmıyor; imleç (1942) yerinde; “bağlam” bandı ya da aralık dışı etiketi yok — imleç 610 px · 2 parça
- ✅ Aralık çizelge açıkken daraltılınca (başlangıç 3 yıl ileri, bitiş 1 yıl geri) aralık 1942–1944 olur — 1942–1944
- ✅ 1942–1944 (daraltıldıktan sonra): eksen yalnızca 1942–1944: yıl etiketlerinin hepsi bu aralıkta, 3 etiket, yerleri aralığa göre (yıl başına 406.7 px); ilk etiket (1942) çizelgenin sol kenarında, son etiket (1944) sağ kenara yakın — 1942 1943 1944 · “13 olay · 1942–1944”
- ✅ 1942–1944 (daraltıldıktan sonra): çizelgedeki 13 olay noktasının hepsi bu aralıkla kesişiyor (dışarıdan olay yok) ve çizelgenin içinde; aralıktan önce başlayan 1 olay kenara yapışık duruyor — dışarıda olan yok · kenarda: leningrad-kusatmasi-1941
- ✅ 1942–1944 (daraltıldıktan sonra): yer egemenlik şeridi de aralığın dışına taşmıyor; imleç (1943) yerinde; “bağlam” bandı ya da aralık dışı etiketi yok — imleç 610 px · 1 parça
- ✅ 1942–1944: eksen yalnızca 1942–1944: yıl etiketlerinin hepsi bu aralıkta, 3 etiket, yerleri aralığa göre (yıl başına 406.7 px); ilk etiket (1942) çizelgenin sol kenarında, son etiket (1944) sağ kenara yakın — 1942 1943 1944 · “13 olay · 1942–1944”
- ✅ 1942–1944: çizelgedeki 13 olay noktasının hepsi bu aralıkla kesişiyor (dışarıdan olay yok) ve çizelgenin içinde; aralıktan önce başlayan 1 olay kenara yapışık duruyor — dışarıda olan yok · kenarda: leningrad-kusatmasi-1941
- ✅ 1942–1944: yer egemenlik şeridi de aralığın dışına taşmıyor; imleç (1943) yerinde; “bağlam” bandı ya da aralık dışı etiketi yok — imleç 610 px · 1 parça
- ✅ Aralık 1939–1945: 8 adım noktası (yılları 1939 1940 1940 1941 1942 1942 1944 1944; en kalabalık yılda 2) birbirine (büyütülmüş hâlleriyle de), aralık yazısına (büyük yazı, fırçanın etiketi) ve cetvel yıllarına (“1950” dahil; büyütülmüş nokta yıl yazısının kutusuna en çok 3 px girebilir: nokta eksenin üstünde, yıl altında) binmiyor; fırçanın kendi etiketi gizli; hepsi cetvelin içinde — merkezler arası 22 22 22 22 22 22 22 px · yıl yazısına en çok 2.8 px
- ✅ Aralık 1939–1945: aynı yıla düşen adımların noktaları da en az 22 px arayla açılıyor (merkezden merkeze en dar 22.0 px) ve soldan sağa 1’den 8’e sıralı — sıra 1 2 3 4 5 6 7 8
- ✅ Aralık 1942–1944: 5 adım noktası (yılları 1941 1941 1942 1942 1944; en kalabalık yılda 2) birbirine (büyütülmüş hâlleriyle de), aralık yazısına (büyük yazı, fırçanın etiketi) ve cetvel yıllarına (“1950” dahil; büyütülmüş nokta yıl yazısının kutusuna en çok 3 px girebilir: nokta eksenin üstünde, yıl altında) binmiyor; fırçanın kendi etiketi gizli; hepsi cetvelin içinde — merkezler arası 22 22 22 22 px · yıl yazısına en çok 2.8 px
- ✅ Aralık 1942–1944: aynı yıla düşen adımların noktaları da en az 22 px arayla açılıyor (merkezden merkeze en dar 22.0 px) ve soldan sağa 1’den 5’e sıralı — sıra 1 2 3 4 5

## F. Oku: metnin son satırı soru kutusunun (ve üstündeki notun, çipin) altında kalmıyor; tam ekranda, yan panelde, dar pencerede ve telefonda

- ✅ Almanya anlatımı (8 adım) · masaüstü 1440×900 · tam ekran: metnin sonuna kaydırınca son satır (“Haritada gösteriliyor…”) soru kutusu yığınının (not, çip, kutu) üstünde kalıyor — son satırın altı 636 px, yığının üstü 726 px (yığın metnin altında) · örtülen uç 0/3 · metin kayıyor
- ✅ Almanya anlatımı (8 adım) · masaüstü 1440×900 · tam ekran · olay açıkken (çip de var): metnin sonuna kaydırınca son satır (“Haritada gösteriliyor…”) soru kutusu yığınının (not, çip, kutu) üstünde kalıyor — son satırın altı 595 px, yığının üstü 685 px (yığın metnin altında) · örtülen uç 0/3 · metin kayıyor
- ✅ Almanya anlatımı (8 adım) · masaüstü 1440×900 · yan panel: metnin sonuna kaydırınca son satır (“Haritada gösteriliyor…”) soru kutusu yığınının (not, çip, kutu) üstünde kalıyor — son satırın altı 636 px, yığının üstü 726 px (yığın haritanın yanında) · örtülen uç 0/3 · metin kayıyor
- ✅ Almanya anlatımı (8 adım) · masaüstü 1440×900 · yan panel · olay açıkken (çip de var): metnin sonuna kaydırınca son satır (“Haritada gösteriliyor…”) soru kutusu yığınının (not, çip, kutu) üstünde kalıyor — son satırın altı 595 px, yığının üstü 685 px (yığın haritanın yanında) · örtülen uç 0/3 · metin kayıyor
- ✅ Almanya anlatımı (8 adım) · dar pencere 1024×700 · tam ekran: metnin sonuna kaydırınca son satır (“Haritada gösteriliyor…”) soru kutusu yığınının (not, çip, kutu) üstünde kalıyor — son satırın altı 436 px, yığının üstü 526 px (yığın metnin altında) · örtülen uç 0/3 · metin kayıyor
- ✅ Almanya anlatımı (8 adım) · dar pencere 1024×700 · tam ekran · olay açıkken (çip de var): metnin sonuna kaydırınca son satır (“Haritada gösteriliyor…”) soru kutusu yığınının (not, çip, kutu) üstünde kalıyor — son satırın altı 395 px, yığının üstü 485 px (yığın metnin altında) · örtülen uç 0/3 · metin kayıyor
- ✅ Almanya anlatımı (8 adım) · dar pencere 1024×700 · yan panel: metnin sonuna kaydırınca son satır (“Haritada gösteriliyor…”) soru kutusu yığınının (not, çip, kutu) üstünde kalıyor — son satırın altı 437 px, yığının üstü 526 px (yığın haritanın yanında) · örtülen uç 0/3 · metin kayıyor
- ✅ Almanya anlatımı (8 adım) · dar pencere 1024×700 · yan panel · olay açıkken (çip de var): metnin sonuna kaydırınca son satır (“Haritada gösteriliyor…”) soru kutusu yığınının (not, çip, kutu) üstünde kalıyor — son satırın altı 396 px, yığının üstü 485 px (yığın haritanın yanında) · örtülen uç 0/3 · metin kayıyor
- ✅ Almanya anlatımı (8 adım) · telefon 390×844 · tam ekran: metnin sonuna kaydırınca son satır (“Haritada gösteriliyor…”) soru kutusu yığınının (not, çip, kutu) üstünde kalıyor — son satırın altı 580 px, yığının üstü 674 px (yığın metnin altında) · örtülen uç 0/3 · metin kayıyor
- ✅ Almanya anlatımı (8 adım) · telefon 390×844 · tam ekran · olay açıkken (çip de var): metnin sonuna kaydırınca son satır (“Haritada gösteriliyor…”) soru kutusu yığınının (not, çip, kutu) üstünde kalıyor — son satırın altı 539 px, yığının üstü 633 px (yığın metnin altında) · örtülen uç 0/3 · metin kayıyor
- ✅ tek adımlı yanıt (düz metin) · masaüstü 1440×900 · tam ekran: metnin sonuna kaydırınca son satır (“Sonunda Hiroşima ve Nagasaki'ye atılan a…”) soru kutusu yığınının (not, çip, kutu) üstünde kalıyor — son satırın altı 527 px, yığının üstü 725 px (yığın metnin altında) · örtülen uç 0/3 · metin sığıyor
- ✅ tek adımlı yanıt (düz metin) · masaüstü 1440×900 · tam ekran · olay açıkken (çip de var): metnin sonuna kaydırınca son satır (“Sonunda Hiroşima ve Nagasaki'ye atılan a…”) soru kutusu yığınının (not, çip, kutu) üstünde kalıyor — son satırın altı 527 px, yığının üstü 684 px (yığın metnin altında) · örtülen uç 0/3 · metin sığıyor
- ✅ tek adımlı yanıt (düz metin) · masaüstü 1440×900 · yan panel: metnin sonuna kaydırınca son satır (“Sonunda Hiroşima ve Nagasaki'ye atılan a…”) soru kutusu yığınının (not, çip, kutu) üstünde kalıyor — son satırın altı 637 px, yığının üstü 725 px (yığın haritanın yanında) · örtülen uç 0/3 · metin kayıyor
- ✅ tek adımlı yanıt (düz metin) · masaüstü 1440×900 · yan panel · olay açıkken (çip de var): metnin sonuna kaydırınca son satır (“Sonunda Hiroşima ve Nagasaki'ye atılan a…”) soru kutusu yığınının (not, çip, kutu) üstünde kalıyor — son satırın altı 596 px, yığının üstü 684 px (yığın haritanın yanında) · örtülen uç 0/3 · metin kayıyor
- ✅ tek adımlı yanıt (düz metin) · dar pencere 1024×700 · tam ekran: metnin sonuna kaydırınca son satır (“Sonunda Hiroşima ve Nagasaki'ye atılan a…”) soru kutusu yığınının (not, çip, kutu) üstünde kalıyor — son satırın altı 437 px, yığının üstü 525 px (yığın metnin altında) · örtülen uç 0/3 · metin kayıyor
- ✅ tek adımlı yanıt (düz metin) · dar pencere 1024×700 · tam ekran · olay açıkken (çip de var): metnin sonuna kaydırınca son satır (“Sonunda Hiroşima ve Nagasaki'ye atılan a…”) soru kutusu yığınının (not, çip, kutu) üstünde kalıyor — son satırın altı 396 px, yığının üstü 484 px (yığın metnin altında) · örtülen uç 0/3 · metin kayıyor
- ✅ tek adımlı yanıt (düz metin) · dar pencere 1024×700 · yan panel: metnin sonuna kaydırınca son satır (“Sonunda Hiroşima ve Nagasaki'ye atılan a…”) soru kutusu yığınının (not, çip, kutu) üstünde kalıyor — son satırın altı 437 px, yığının üstü 525 px (yığın haritanın yanında) · örtülen uç 0/3 · metin kayıyor
- ✅ tek adımlı yanıt (düz metin) · dar pencere 1024×700 · yan panel · olay açıkken (çip de var): metnin sonuna kaydırınca son satır (“Sonunda Hiroşima ve Nagasaki'ye atılan a…”) soru kutusu yığınının (not, çip, kutu) üstünde kalıyor — son satırın altı 396 px, yığının üstü 484 px (yığın haritanın yanında) · örtülen uç 0/3 · metin kayıyor
- ✅ tek adımlı yanıt (düz metin) · telefon 390×844 · tam ekran: metnin sonuna kaydırınca son satır (“Sonunda Hiroşima ve Nagasaki'ye atılan a…”) soru kutusu yığınının (not, çip, kutu) üstünde kalıyor — son satırın altı 581 px, yığının üstü 673 px (yığın metnin altında) · örtülen uç 0/3 · metin kayıyor
- ✅ tek adımlı yanıt (düz metin) · telefon 390×844 · tam ekran · olay açıkken (çip de var): metnin sonuna kaydırınca son satır (“Sonunda Hiroşima ve Nagasaki'ye atılan a…”) soru kutusu yığınının (not, çip, kutu) üstünde kalıyor — son satırın altı 540 px, yığının üstü 632 px (yığın metnin altında) · örtülen uç 0/3 · metin kayıyor

## E. Durdurma, hatalar, ayarlar

- ✅ Durdur: yanıt hemen “durduruldu” olur; planın 8 adımı ve o ana kadar yazılan metin kalır, 1. adımın altyazısı ekranda — 252 karakter · 8 adım
- ✅ Durdurunca gönder düğmesi geri gelir, sohbet kilitlenmez; “Yeniden dene” yalnızca okur basınca (kendiliğinden bir istek daha gitmez)
- ✅ Metin okuyucuda da yarım kalan kısım, planın tüm adımları (henüz yazılmayanlar altyazılarıyla) ve “Durduruldu” notu var — 1358 karakter · 8 adım, 7 tanesinin metni yazılmamış
- ✅ Tek adımlı yanıt da durdurulabilir: altyazısı, yazılan kısım için “Devamını oku” ve “Durduruldu · Yeniden dene” ekranda; adım denetimi yok — 252 karakter yazılmıştı
- ✅ “Yeniden dene” durdurulan yanıtın yerine bir kez soruyor: yanıt bu sefer tamamlanır, konuşmada soru ve yanıt birer tane kalır — 252 → 652 karakter
- ✅ rate_limited: hata yanıtın yerinde (altyazı kutusunun içinde); yazılan metin altyazı olarak kalır; yeniden dene düğmesi var
- ✅ rate_limited sohbeti kilitlemez; kendiliğinden yeniden denemez (tek istek)
- ✅ “Yeniden dene” yalnızca okur basınca ve bir kez soruyor (yeniden de hata gelse başka istek gitmez); konuşmada soru bir tane kalır — 2 istek
- ✅ Metin okuyucuda da hata yerinde: yazılan kısım, hata iletisi ve “Yeniden dene”
- ✅ not_granted: kalıcı uyarı soru kutusunun üstünde, kutu kapalı, izin paneli düğmesi var; “Yeniden dene” yok (yeniden denemek işe yaramaz)
- ✅ Hata ekranı “upstream_error”: yanıtın yerinde, kendi başlığıyla; “Yeniden dene” var; yazılan kısım altyazı olarak kalır; sohbet kilitlenmez, kendiliğinden yeniden denenmez — Yanıt yarım kaldı · 1 istek
- ✅ Hata ekranı “empty_completion”: yanıtın yerinde, kendi başlığıyla; “Yeniden dene” var; yazılan kısım altyazı olarak kalır; sohbet kilitlenmez, kendiliğinden yeniden denenmez — Model boş yanıt verdi · 1 istek
- ✅ Hata ekranı “refused”: yanıtın yerinde, kendi başlığıyla; “Yeniden dene” yok; yazılan kısım geri çekilir (altyazı yok); sohbet kilitlenmez, kendiliğinden yeniden denenmez — Model bu isteği yanıtlamadı · 1 istek
- ✅ Hata ekranı “prompt_too_large”: yanıtın yerinde, kendi başlığıyla; “Yeniden dene” yok; yazılan kısım altyazı olarak kalır; sohbet kilitlenmez, kendiliğinden yeniden denenmez — Sohbet çok uzadı · 1 istek
- ✅ “Sohbet çok uzadı”dan sonra “Sohbeti temizle” yeniden çalışır hâle getirir: hata kalkar, yeni soru yanıtlanır
- ✅ sampling_disabled: kalıcı uyarı soru kutusunun üstünde, kutu kapalı; izin paneli düğmesi ve “Yeniden dene” yok (kullanıcının yapabileceği bir şey yok)
- ✅ Düşünürken Durdur (kutudaki bağlantı): yanıt “durduruldu”, hiçbir şey gelmemiş ve çizilmemiş (harita okurun); “Durduruldu” kutusunda “Yeniden dene” ve kapat düğmesi var — 0 karakter, 1 istek
- ✅ “Yeniden dene” aynı soruyu bir kez daha sorar: yanıt bu sefer gelir ve haritada çizilir (ittifak çizgisi); konuşmada soru ve yanıt birer tane
- ✅ Ayarlar: üç hız (Hızlı, Dengeli, Derin), varsayılan Dengeli; menüde model adı ya da sürüm numarası yok
- ✅ Ayar menüsü soru kutusunun hemen üstünde açılır ve ekranın içinde kalır — 320×277 px
- ✅ Seçilen hız modele gidiyor (quick)
- ✅ Seçim tarayıcıda saklanıyor
- ✅ Yenilenince seçim korunuyor
- ✅ Yanıt var: haritada çizim (Çelik Pakt’ın ittifak çizgisi), soru kutusunda metin düğmesi
- ✅ “Sohbeti temizle” her zaman görünür (ayar menüsü kapalıyken de, soru kutusunun üzerinde), yazışma varken etkin — {"visible":true,"label":"Sohbeti temizle","disabled":false,"onTheBox":true}
- ✅ “Sohbeti temizle” yazışmayı, ekrandaki yanıtı ve haritadaki çizimi siler; metin düğmesi kalkar; düğme görünür kalır ama boştayken kapalı
- ✅ Temizlenince harita yeniden okurun: yer seçili kalır, bilgi kartı geri gelir
- ✅ Yanıt yazılırken “Sohbeti temizle” etkin (ayar menüsü açıkken de görünür ve menünün altında kalmaz; tıklanınca menü kapanır): çağrı iptal edilir, yazışma ve çizim silinir, sonradan hiçbir şey geri gelmez
- ✅ Tarayıcı depolaması hata verse de ayar çalışır: seçilen hız (complex) modele gidiyor, yanıt gelir, sayfa bozulmaz
- ✅ Depolama yokken seçim yenilenince kalmaz: sayfa yine varsayılan hızla (Dengeli) açılır

## G. Gerçek sample bağdaştırıcısı (sahte çalışma zamanıyla, tarayıcıda)

- ✅ Gerçek çalışma zamanı varken deneme kipi uyarısı yok; sağlayıcı “sample”
- ✅ Metin henüz yokken (araç turu bitti, uzun metin yazılmıyor) İzle başladı: 1. adımın altyazısı ve “Metin yazılıyor…”; çok adımlı İzle’de “Devamını oku” satırı yok — waiting · 0 karakter · 1 / 2
- ✅ Haritada 1. adımın çizimi şimdiden var (Almanya ve İtalya, ittifak çizgisi ve etiketi, 1939); tanınmayan devlet sessizce atlandı — nazi-germany+kingdom-of-italy
- ✅ Metin yazılmadan 2. adıma da geçilebiliyor: model yalnızca Almanya + İtalya’yı ve El Alamein’i söyledi; uygulama olayın öbür taraflarını da öne çıkardı, savaş çizgisini çizdi, yılı olayınkinden aldı (1942) — nazi-germany+kingdom-of-italy+kingdom-of-great-britain+kingdom-of-egypt · el-alamein-1942 · savaş 1
- ✅ Altyazıdaki olay adı bağlantı: “El Alamein” → el-alamein-1942 (gösterilen metin, [ad](olay:kimlik) işareti değil) — [["El Alamein","el-alamein-1942"]]
- ✅ Metin yazılmadan Oku açılırsa her iki adımın altyazısı yerinde duruyor (“yazılıyor” sürerken boş kalmaz)
- ✅ Metin gelince “Metin yazılıyor…” kalkar; oynatılan adım (2) yerinde kalır
- ✅ Çağrı: yönergeler başa ayrı kullanıcı turu, hız “default”, iptal sinyali, geçerli araç şemaları — user,user
- ✅ İlk tur, sahibin yönerge dosyasıyla BİREBİR başlıyor; arkasından uygulama notları geliyor — 3828 karakter
- ✅ Yönerge dosyası altyazıyı ve tek adımlı cevabı anlatıyor; sayfanın notları da: her cevap adımlı, tek şey için n:1, iki tur, örnekler
- ✅ Araçlarla çağrıda cache hiç gönderilmiyor (çalışma zamanı reddederdi)
- ✅ Beş araç, bu sırayla: step, show_event, highlight, connect, mark (kamera ya da görünüş aracı yok) — step,show_event,highlight,connect,mark
- ✅ Adım aracı iki metin ister: numara, başlık ve altyazı (caption); yıl isteğe bağlı
- ✅ Araçlar sayfada çalıştı; tanınmayan devlet sessizce atlandı ama modele söylendi
- ✅ Son tur sayfanın o anki durumunu söylüyor: seçili yer (Nazi Almanyası) ve aralık (1939–1945), modelin kullanabileceği devlet ve olay kimlikleri (hepsi veri setinde), istek en sonda — 93 devlet · 47 olay
- ✅ Metin akışla geldi ve tamamlandı: iki adımın tam metni okuyucuda
- ✅ İkinci çağrı: önceki yazışma gönderilir (model bir şey hatırlamaz), hız “complex”; yönergeler yine başta — user,user,assistant,user
- ✅ Konuşmanın tamamı modele gidiyor: önceki sorunun kendisi, önceki yanıtın tam metni (iki adım, olay işaretleriyle) ve o yanıtın haritada ne gösterdiği (adım adım) — [Haritada gösterdiklerim: 1. adım: öne çıkan: Nazi Almanyası, İtalya Krallığı; Nazi Almanyası – İtalya Krallığı: ittifak (Çelik Pakt); sınır yılı 1939 · 2. adım: öne çıkan: Nazi Almanyası, İtalya Krallığı; olay: İkinci E
- ✅ Yeni çağrının bağlamında önceki çizimler söyleniyor; konu değişmediği için “konu değişti” notu ve tekrar notu yok
- ✅ “Sohbeti temizle”den sonra sorulan soruda önceki konuşma modele gitmez (yalnızca yönergeler ve yeni istek): ne önceki soru, ne yanıtın metni, ne haritada gösterdikleri, ne tekrar ya da konu değişti notu — user,user
- ✅ Hız seçimi sohbeti temizlemekten etkilenmez: üçüncü çağrı da “complex” — complex
- ✅ Tek adımlı yanıt (n:1): plan gelince, metin yokken İzle başladı: tek altyazı ve “Metin yazılıyor…”; adım denetimi ve çizelgede adım noktaları yok; “Devamını oku”nun yeri ayrılmış ama görünmüyor — waiting · 0 karakter · adım 1
- ✅ Haritada olayın çizimi şimdiden var: yalnızca Stalingrad’ı söyleyen modelin yerine uygulama iki tarafı öne çıkardı, savaş çizgisini ve olay işaretini koydu, yılı olayınkinden aldı (1942) — union-of-soviet-socialist-republics+nazi-germany · 1942
- ✅ Durdur gerçek çağrıyı da iptal eder (çalışma zamanı iptal sinyalini görür); yanıt “durduruldu”, planın altyazısı ekranda kalır, yazılmış metin olmadığından “Devamını oku” yok
- ✅ “Yeniden dene” gerçek çağrıyı bir kez daha yapar: aynı istek, hız “quick”, konuşma geçmişi yok (durdurulan yanıt konuşmadan çıktı) — user,user
- ✅ Metin gelince “Devamını oku” görünür; altyazı kutusu aynı boyda kalır (yeri baştan ayrılmıştı) ve kamera yerinden oynamaz — kutu 119 → 119 px
- ✅ “Devamını oku” metni açar: tek adım (numarasız), başlık “Stalingrad”, iki paragraf, olay adı bağlantı, harita bu adımda — {"view":"read","steps":1,"numbered":0,"title":"Stalingrad","paragraphs":2,"refs":["stalingrad-1942"],"active":"true"}
- ✅ İzle’ye dönünce yanıt hâlâ tek adım: altyazı ve “Devamını oku” yerinde, adım denetimi yok
- ✅ Yalnızca düz metin yazan model de çalışır (araç çağırmadı, başlık da yazmadı): altyazı metnin ilk cümle(ler)inden yapılır, en çok 220 karakter, metnin tamamı değil; adım denetimi yok — altyazı 75 / metin 546 karakter
- ✅ …“Devamını oku” altyazının altında görünür (metin altyazıdan uzun); haritada gösterilecek bir çizim yok
- ✅ “Devamını oku” metnin tamamını açar: tek (numarasız) adım, üç paragraf; haritada gösterilecek bir şey olmadığından “Haritada göster” yok — 3 paragraf
- ✅ Düz metin yanıt sonraki çağrıda olduğu gibi gider (başlıksız; haritada gösterilen bir şey olmadığından “Haritada gösterdiklerim” notu yok); sıra: yönergeler, soru, yanıt, istek — 4
- ✅ Tek adımlı yanıt sonraki çağrıda adımsız anılır: “[Haritada gösterdiklerim: …]” (“1. adım:” öneki yok), ardından tam metin; sıra: yönergeler, soru, yanıt, soru, yanıt, istek — [Haritada gösterdiklerim: olay: Stalingrad Muharebesi; sınır yılı 1942]
## 1. Stalingrad
Ağustos 1942'de Volga kıyısına ulaşan Alman 6. Ordusu, kentte aylarca s
- ✅ Araç desteği yoksa (limits) araçsız ve cache:false ile istenir; altyazının altında “yalnızca metin” notu görünür
- ✅ Araçsız çağrıda uygulama notları yalnızca metin biçimini anlatır (“## n. Başlık”, tek şey için tek adım); araç adı, devlet ve olay listeleri, anlatım iskeleti gönderilmez
- ✅ Araçsız yanıtta altyazıları uygulama metinden çıkarır: iki adım (“1 / 2”), 1. adımın altyazısı adımın ilk cümleleri (en çok 220 karakter) — 176 karakter
- ✅ Aynı not okuyucuda da var
- ✅ Gerçek not_granted: izin verilmedi uyarısı, kutu kapalı, bir istek
- ✅ Anlatım isteğinde sayfa, veriden çıkardığı iskeleti gönderiyor: Nazi Almanyası’nın taraf olduğu, veri setinde olan 3–6 dönüm noktası, numaralı ve tarih sırasıyla — 6 adım
- ✅ “İzinleri aç” yalnızca düğmeyle, platformun izin panelini açar (permissions.manage)
- ✅ Gerçek rate_limited: hata gösterilir, e.text altyazı olarak korunur, kilit yok, otomatik yeniden deneme yok
- ✅ limits() en çok 3 araç diyorsa en önemli üçü gider: step, show_event, highlight
- ✅ “Yeniden dene” yalnızca okur basınca ve bir kez soruyor (çalışma zamanına toplam iki çağrı)
- ✅ Araçlı çağrı “tools_unavailable” ile reddedilirse aynı soru bir kez araçsız (cache:false) yeniden sorulur; yanıt gelir, “yalnızca metin” notu görünür

## H. Telefon: harita tüm sahne; kart üstte küçük bir sayfa; altyazı ve soru kutusu altta; metin her zaman tam ekran

- ✅ Telefon: harita genişliğin tamamı ve dikeyde üst çubuk ile zaman çizelgesi arasındaki her yer; yatay taşma yok — 390×724 / 390×844
- ✅ Telefon: bilgi kartı haritanın üstünde küçük bir sayfa (genişlik ekrandan 16 px dar, yükseklik haritanın yarısından az); soru kutusu zaman çizelgesinin hemen üstünde — kart 374×333 px
- ✅ Telefon: yakınlaştırma düğmeleri ve sayaç soru kutusunun üstünde (altında kalmıyor), haritanın içinde — düğmeler 662 px’de, soru kutusu 674 px’de başlar
- ✅ Telefon: altyazı soru kutusunun hemen üstünde, ikisi de ekranın içinde; denetimler altyazı kutusundan taşmıyor; yatay taşma yok — altyazı 370×97 px
- ✅ Telefon: yer kartı kenara çekildi (küçük sekme); renk anahtarı anlatım sürerken gizli; altyazının denetimleri tek satırda ve düğmeleri en az 30 px — sekme 143×36 px
- ✅ Telefon: yakınlaştırma düğmeleri ve sayaç altyazı ile soru kutusunun sütununun üstünde, sekmeyle çakışmıyor — düğmeler 555 px’de biter, altyazı 567 px’de başlar
- ✅ Telefon: kamera 1. adımı (Almanya ve Polonya, Polonya’ya saldırı) altyazının ve soru kutusunun altında kalmayacak biçimde gösterdi — görünüm dışı 0, altyazının altında 0, örtülü 0
- ✅ Telefon: “Metni oku” metni tam ekran açar (yan panel yok, boyut düğmesi yok); harita başlığın altında küçük bir pencere; 3. adım korunur — pencere 177×126 px
- ✅ Telefon: küçük harita 3. adımı gösteriyor (Birleşik Krallık ve Nazi Almanyası, Britanya Muharebesi: işaret ve savaş çizgisinin uçları pencerede; pencere en geniş görünümde olduğundan devlet kutularının en az %40’ı görünür); metin pencerenin altından başlıyor, soru kutusu ekranda — görünüm dışı 0 · kutuların görünen payı %56 · metin 227 px’de, pencere 219 px’de biter
- ✅ Telefon: “Haritayı büyüt” İzle’ye döner, adım 3 kalır
- ✅ Telefon: Harita takibi sorusu haritanın içinde kalır, yakınlaştırma düğmelerini, sayacı, altyazıyı ve sekmeyi örtmez, haritanın %22’sinden azını kaplar — %8.0
- ✅ Telefon, tek adımlı yanıt: altyazı ve altında “Devamını oku” görünür, adım denetimlerinden hiçbiri yok (önceki, sonraki, sayaç, oynat, hız, metni oku); kapat düğmesi var ve en az 30 px — altyazı 64 px yüksek, düğmeler 36 px
- ✅ Telefon, tek adımlı yanıt: altyazı kutusu soru kutusunun hemen üstünde, ikisi de ekranın içinde; yakınlaştırma düğmeleri ve sayaç altyazının üstünde, sekmeyle çakışmıyor; yatay taşma yok — altyazı 370×139 px
- ✅ Telefon, tek adımlı yanıt: Stalingrad sahnesi (Sovyetler Birliği’nin tamamı telefon genişliğine sığmaz): olay işareti görünür alanda, altyazının, soru kutusunun ve denetimlerin altında hiçbir şey kalmıyor — görünüm dışı 2/9, kutuların görünen payı %47
- ✅ Telefon, tek adımlı yanıt: “Devamını oku” metni tam ekran açar (küçük harita başlığın altında, metin onun altından başlıyor); tek adım (numarasız) etkin — pencere 177×126 px
- ✅ Telefon, tek adımlı yanıt: “Haritayı büyüt” İzle’ye döner; yanıt hâlâ tek adım (altyazı ve “Devamını oku” yerinde)
- ✅ Telefon, hata: hata kutusu altyazının yerinde, ekranın içinde ve soru kutusunun üstünde; “Yeniden dene” en az 30 px yüksekliğinde; yakınlaştırma düğmeleri yığının üstünde; yatay taşma yok — kutu 348×93 px, düğme 49 px yüksek
- ✅ Telefon, not_granted: kalıcı uyarı soru kutusunun üstünde ve ekranın içinde, kutu kapalı; “İzinleri aç” en az 30 px yüksekliğinde; hata kutusuyla çakışmıyor, yakınlaştırma düğmeleri yığının üstünde; yatay taşma yok — uyarı 370×74 px, düğme 30 px yüksek

## I. Genel

- ✅ Hiçbir sayfada konsol ya da sayfa hatası yok

## Ekran görüntüleri

- `ai-p1-renkler-dunya.png`, `ai-p2-renkler-avrupa.png`: devlet renkleri (gri ve mavi yok, komşular ayrışıyor)
- `ai-0-yeni-duzen.png`: harita neredeyse tam ekran; üstte ince çubuk, altta ince zaman çizelgesi, hemen üstünde soru kutusu, sağda küçük bilgi kartı
- `ai-s1-sinir-penceresi.png`: çok daha eski bir aralığa (1900–1906, yıl 1903) geçildikten sonra: sınırlar yüklendi, başlıkta “yükleniyor…” yok
- `ai-0-yer-karti.png`: bir yer seçilince küçük kart
- `ai-1a-anlatim-adim1.png`, `ai-1b-anlatim-adim2.png`, `ai-1d-anlatim-adim3.png`, `ai-1e-anlatim-adim4.png`, `ai-1c-anlatim-adim6.png`, `ai-1g-anlatim-adim8.png`: İzle (Almanya, 8 adım); her adım yalnızca kendi çizimini gösterir, altyazı sabit yerde, kamera adımı izler (4. adımda Barbarossa, 6.da Stalingrad ve El Alamein, 8.de Berlin 1945)
- `ai-1f-tek-anlatici.png`: yanıt ekrandayken haritada yalnızca anılan ve tıklanan olayların işaretçileri
- `ai-j2-yer-secili-olaylar-cekildi.png`: bir yer seçilince dünya olayları haritadan çekilir (not nedenini söyler, çizelge o yerin olaylarıyla dolu)
- `ai-v1-ilerleme-cubugu.png`: zaman cetveli ilerleme çubuğu (adımlar tarihlerinde, görülenler dolu)
- `ai-t1-cizelge-aralik.png`, `ai-t2-cizelge-dar-aralik.png`: yer çizelgesi yalnızca seçili aralığı gösterir; `ai-t3-adim-noktalari-kalabalik.png`: aynı yıla düşen üç adımın noktaları birbirine binmeden açılır
- `ai-r1-altyazida-olay-adi.png`, `ai-r2-metinde-olay-adi.png`, `ai-r3-tam-ekranda-olay-adi.png`: altyazıdaki ve metindeki olay adları tıklanabilir; çizelgedeki tıklamayla aynı sonuç
- `ai-r4-tek-adimli-altyazida-olay-adi.png`, `ai-r5-tek-adimli-metinde-olay-adi.png`: tek adımlı yanıtta da altyazıdaki ve metindeki olay adı bağlantı (Stalingrad)
- `ai-f1-metnin-sonu-tam-ekran.png`: tam ekran okumada metnin son satırı soru kutusunun üstünde
- `ai-w1-izle-adim1.png`, `ai-w2-oku-yan-panel.png`, `ai-w3-oku-tam-ekran.png`: aynı adım (1) üç görünümde: İzle, Oku yan panel, Oku tam ekran (köşede küçük harita)
- `ai-w4-oku-sirasinda-soru.png`: okurken sorulan soru, arkadaki haritayı günceller
- `ai-2-kisa-yanit.png`, `ai-2b-stalingrad-yaniti.png`: tek adımlı yanıt (adım denetimi yok, tek sahne, altyazı ve “Devamını oku”); Çelik Pakt ittifakı, Stalingrad
- `ai-2c-duz-metin.png`: modelin düz metin yazdığı yanıt; altyazı metnin ilk cümleleri, “Devamını oku” tamamını açar
- `ai-9-harita-takibi-sorusu.png`, `ai-9b-harita-takibi-ayari.png`, `ai-9c-harita-takibi-kapali.png`, `ai-9d-harita-takibi-telefon.png`: büyük bir gezintiden sonra küçük soru; ayarın yeri; kapalıyken çip; telefonda soru
- `ai-3a-olay-karti.png`, `ai-3b-bunu-sor.png`: yanıt ekrandayken olay kartı; “Bunu sohbette sor”
- `ai-4-baglam-degisti.png`: seçili yer değişince metinde “Bağlam değişti”
- `ai-6c-mobil-tek-adim.png`, `ai-6d-mobil-tek-adim-oku.png`: telefonda tek adımlı yanıt (altyazı ve “Devamını oku”) ve tam ekran metin
- `ai-6e-mobil-hata.png`: telefonda hata kutusu ve izin notu (ekranın içinde, düğmeler ≥ 30 px)
- `ai-8b-gercek-sample-duz-metin.png`: gerçek `sample` bağdaştırıcısında düz metin yazan modelin yanıtı (altyazı ve “Devamını oku”)
- `ai-5-hata.png`, `ai-6-mobil.png`, `ai-6b-mobil-oku.png`, `ai-7-ayarlar.png`, `ai-8-gercek-sample.png`
