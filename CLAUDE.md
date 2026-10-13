# Aynı Zamanda: çalışma notları

Bu dosya her oturumun başında okunur ve oturumlar arasında kalıcı çalışma kurallarını tutar. Proje belgesi `README.md`'dedir
(doğrulama için "Doğrulama" bölümü).

## Doğrulama: her turda varsayılan

Bir değişiklik grubunu bitirirken şunlar koşulur, fazlası değil:

1. **`npm run smoke`**: tsc + birim testleri + veri doğrulama + derleme + iki e2e takımının hızlı kipi (`--smoke`). Hedef: e2e
   kısmı en çok ~3 dk.
2. **Değişikliği kapsayan gruplar**: base e2e için bölüm numaraları (`E2E_ONLY=7,9 node scripts/verify-e2e.mjs`; 0–6 tek blok),
   AI e2e için grup harfleri (`E2E_ONLY=A3,K node scripts/verify-ai-e2e.mjs`). Hangi grubun neyi kapsadığı betiklerin başındaki
   açıklamada yazar. Uygulama kodu değiştiyse önce `npm run build`.
3. **Tam takım (`npm run full`) yalnızca kullanıcı isterse.** Kendiliğinden, "emin olmak için" koşturulmaz.
4. **Ekran görüntüsü yok.** Her yayından sonra görsel incelemeyi kullanıcı kendisi yapar. Betikler ekran görüntülerini ve rapor
   dosyalarını yalnızca `E2E_SHOTS=1` ile yazar; görsel olarak belirsiz bir şey olursa yalnızca o gösterilir.
5. Yayın (artifact) ve PR yalnızca istenince.

## Testleri koştururken

- **"Hareketi azalt" varsayılandır:** sayfalar `reducedMotion: 'reduce'` ile açılır, kamera anında gider. Animasyonun kendisini
  sınayan kontroller animasyonlu açılır (base e2e: `open(hash, undefined, { reducedMotion: 'no-preference' })`, AI e2e:
  `open(hash, { animated: true })`). Hepsini animasyonlu koşmak için `E2E_MOTION=full`.
- **Aynı anda tek tarayıcı koşusu.** Makine 4 çekirdek ve yazılım GL kullanıyor; paralel koşular yükü ~14'e çıkarıp zamanlama
  hatası üretir. Koşuları `flock /tmp/claude-0/e2e.lock …` ile sıraya koy, arka planda koştur ve bir döngüyle bekle (ön planda
  `sleep` engelli).
- Bir e2e koşarken `dist`'i yeniden derleme. Süreçleri PID ile öldür (`pkill -f` yok).
- Hızlı kip çekirdek akıştır: base e2e'de ana blok 0–3, AI e2e'de `guard.smoke(…)` ile işaretli senaryolar. Yeni bir senaryoyu
  ancak çekirdek akışa aitse ve hızlı kip ~3 dk'yı aşmayacaksa işaretle; gerisi tam takımda kalır.
- Bir kontrol kameranın tam durumuna bağlı çıkıp kiplerden birinde sınırda geçiyorsa kontrolü sağlamlaştır (kamera/zamanlamaya
  bağlı alanları karşılaştırmadan çıkar, koşulu bekle). Uygulama davranışı yanlış görünüyorsa gerekçesiz değiştirme: bulguyu
  raporla.

## Genel

- Kullanıcıya yanıtlar Türkçe ve kısa.
- Dönem değişimi (örn. 1800–2000 → başka) ayrı bir teslimat olarak ele alınır. E2E takımları döneme bağlıdır (nokta, yıl, olay
  kimlikleri betiklerde sabit); ortak bir senaryo modülü bilerek yapılmadı, yakın bir dönem değişimi planlanmıyor. Değişim gelirse
  o zaman yapılır.
