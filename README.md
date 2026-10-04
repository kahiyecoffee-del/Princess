# The Sky Princess (Gökyüzü Prensesi) ✨

Oyunun arayüzü İngilizcedir; bu belge Türkçedir.

Gerçek para, bahis veya şans çarkı içermeyen, sakinleştirici ve reklam gelirli bir 3'lü eşleştirme (match-3) oyunu. Android / Google Play için Capacitor ile paketlenir.

## Özellikler

| Özellik | Ayrıntı |
|---|---|
| Oyun | 8×8 tahta, 4–6 renk, kayma/dokunma ile takas, zincirleme düşüşler (cascade) |
| Özel taşlar | 4'lü → satır/sütun ışını, L/T → yıldız bombası (3×3), 5'li → gökkuşağı küresi (bir rengin tamamı) |
| Seviyeler | 200 seviye: puan, taş toplama ve kristal buz kırma hedefleri. Her 10 seviyenin son ikisi "zor seviye" |
| Zorluk | Seviye arttıkça daha az hamle, daha çok renk, daha yüksek hedef, tahtada boşluklar, çift katlı buz |
| Can | En fazla **5 can**, her can **30 dakikada** yenilenir. Seviye kaybedilince veya yarıda bırakılınca 1 can gider |
| Reklamlar | **Her 5 seviyede bir** otomatik geçiş reklamı; hamle bitince **reklam izle → +3 hamle** (deneme başına en fazla 2 kez); can bitince reklam izle → +1 can |
| Prenses | Nefes alan, göz kırpan, cilveli hareketler yapan ve İngilizce konuşan karakter; dokununca kıkırdar |
| Ses | Özgün menü ve oyun müzikleri, çan tınılı efektler; ayarlardan ayrı ayrı kapatılabilir |
| Sağlıklı oyun | 30 dakikalık kesintisiz oyunda mola hatırlatması. Şans çarkı, ganimet kutusu, gerçek para yok |

## Proje yapısı

```
www/                  Oyunun kendisi (Capacitor'ın webDir'i)
  index.html          Ekranlar, prenses SVG karakteri
  css/style.css
  js/board.js         Tahta mantığı: eşleşme, özel taşlar, yerçekimi, karıştırma
  js/engine.js        Seviye durumu: puan, hamle, hedefler
  js/levels.js        Seviye üretici ve zorluk eğrisi
  js/render.js        Canvas çizimi, animasyonlar, parçacık efektleri, dokunma girişi
  js/lives.js         Can sistemi (5 can / 30 dk)
  js/ads.js           AdMob entegrasyonu (+ tarayıcı için sahte reklam)
  js/princess.js      Prensesin animasyonları
  js/voice.js         Prensesin sesi ve müzik
  js/main.js          Oyun akışı, menüler, modallar
test/                 Birim testleri (node --test)
tools/simulate.mjs    Zorluk dengesini ölçen yapay oyuncu
```

## Tarayıcıda deneme

```bash
npm start            # http://localhost:8080
npm test             # birim testleri
npm run simulate     # seviyelerin yapay oyuncuya göre kazanma oranları
```

Tarayıcıda reklamlar yerine 3 saniyelik sahte bir "REKLAM ALANI" ekranı çıkar.

## 📱 Telefondan yayınlama (bilgisayar gerekmez)

Uygulama dosyası (.aab) GitHub'ın sunucularında otomatik derlenir. Her şey iPhone'daki Safari'den yapılabilir.

### 1. İmza anahtarını GitHub Secrets'a ekle (bir kez)
Google Play her dosyanın aynı "yükleme anahtarı" ile imzalanmasını ister. Bu anahtar **asla depoya konmaz**;
yalnızca GitHub'ın gizli kasasında (Secrets) durur.

1. Safari'de depo sayfası → **Settings** (görünmüyorsa "aA" → *Masaüstü Web Sitesi İste*)
2. **Secrets and variables → Actions → New repository secret** ile iki gizli değer ekle:
   - `KEYSTORE_BASE64`: anahtar dosyasının base64 metni
   - `KEYSTORE_PASSWORD`: anahtarın şifresi
3. Anahtar dosyasını ve şifreyi iCloud'da güvenli bir yerde de sakla. Kaybedersen Play Console destek
   ekibinden yükleme anahtarını sıfırlatman gerekir.

### 2. Uygulamayı derle
**Actions → Android derlemesi → Run workflow**. 5-10 dakika sürer. Bittiğinde depo sayfasındaki **Releases**
bölümünde `gokyuzu-prensesi-N.aab` dosyası çıkar; dokunup **Dosyalar**'a indir.
Kodda her değişiklikte derleme kendiliğinden de çalışır ve sürüm numarası otomatik artar.

### 3. Google Play Console
1. `play.google.com/console` → geliştirici hesabı aç (tek seferlik 25 $, kimlik doğrulama istenir).
2. **Uygulama oluştur** → ad: Gökyüzü Prensesi, tür: Oyun, ücretsiz.
3. **Mağaza girişi**: `store/` klasöründeki ikon (512), öne çıkan görsel (1024×500) ve 4 ekran görüntüsünü yükle.
4. **Test → Kapalı test** → yeni sürüm → indirdiğin `.aab` dosyasını yükle.
5. ⚠️ **Yeni kişisel hesaplar** için Google kuralı: üretime (herkese açık) geçmeden önce **en az 12 kişinin
   14 gün boyunca kapalı testte** olması gerekir. Test edenlerin **Android telefonu** olmalı.
   Kurumsal (şirket) hesaplarda bu kural yok.

### 4. AdMob (gerçek reklam geliri)
1. `admob.google.com` → uygulama ekle (Android) → bir **Geçiş** ve bir **Ödüllü** reklam birimi oluştur.
2. Uygulama kimliğini (`~` içeren) **Settings → Secrets and variables → Actions → Variables** sekmesine
   `ADMOB_APP_ID` adıyla ekle.
3. Reklam birimi kimliklerini `www/js/ads.js` dosyasına yaz ve `TESTING: false` yap.

### Görselleri yeniden üretmek
`node tools/make-assets.mjs` (ikon, açılış ekranı, mağaza görselleri) ve `npm start` açıkken
`node tools/store-screenshots.mjs` (ekran görüntüleri). İkisi de `playwright` paketini ister.

## Web sürümü

`master`'a her gönderimde oyun otomatik olarak https://kahiyecoffee-del.github.io/Princess/ adresinde güncellenir
(`.github/workflows/pages.yml`).

## Bilgisayarla Android'e paketleme

Gerekenler: Node 18+, Android Studio (JDK 17 ile birlikte gelir).

```bash
npm install
npx cap sync android
```

AdMob uygulama kimliği `AndroidManifest.xml`'e derleme sırasında `ADMOB_APP_ID` ortam değişkeninden yazılır
(verilmezse Google'ın test kimliği kullanılır).

`npx cap open android` ile Android Studio'yu açıp önce emülatörde/telefonda çalıştırın.
Yayın için: **Build → Generate Signed Bundle / APK → Android App Bundle (.aab)**. Anahtar dosyanızı (`.jks`) güvenli
bir yerde saklayın; kaybederseniz uygulamayı güncelleyemezsiniz.

## Yayına çıkmadan önce yapılacaklar

1. **AdMob hesabı** açın (admob.google.com), uygulamayı ekleyin, bir *Geçiş (Interstitial)* ve bir *Ödüllü (Rewarded)* reklam birimi oluşturun.
2. `www/js/ads.js` içindeki `INTERSTITIAL_ID` ve `REWARDED_ID` değerlerini kendi kimliklerinizle değiştirin, `TESTING: false` yapın.
3. Uygulama kimliğini (`~` içeren) `ADMOB_APP_ID` olarak verin (GitHub Variables veya ortam değişkeni).
4. `capacitor.config.json` içindeki `appId` (`com.gokyuzuprensesi.oyun`) değerini size ait bir paket adıyla değiştirin; yayından sonra değiştirilemez.
5. AdMob'da **GDPR onay mesajını** (Privacy & messaging) oluşturun; kod, AB kullanıcılarına formu otomatik gösterir.
6. **Gizlilik politikası** sayfası hazırlayın (AdMob kullanıldığı için Play Console zorunlu tutar).

> ⚠️ Kendi reklamlarınıza asla tıklamayın. Geliştirirken test kimliklerini kullanın; aksi halde AdMob hesabı kapatılabilir.

### Google Play Console formları

- **Reklam içeriyor mu?** → Evet.
- **İçerik derecelendirmesi**: "Simüle kumar" sorusuna **Hayır** (oyunda bahis, şans çarkı, slot mekaniği yok).
- **Hedef kitle**: 13 yaş ve üzeri seçin. Çocuklara yönelik (Families) seçilirse çok daha sıkı reklam kuralları uygulanır.
- **Veri güvenliği**: AdMob reklam kimliği ve cihaz bilgisi topladığı için "Cihaz veya diğer kimlikler" beyan edilmeli.
- **Sağlık iddiaları**: Uygulamada bağımlılık desteği bölümü olmadığı için mağaza açıklamasında bağımlılık
  tedavisi veya desteği iddiasında bulunmayın.
- **Telif / marka**: Başka oyunların adını, karakterlerini veya görsellerini (ör. "Starlight Princess") kullanmayın. Bu
  projedeki tüm görseller kodla çizilmiş özgün tasarımlardır.

## Ayarlanabilir değerler

| Değer | Dosya | Varsayılan |
|---|---|---|
| Maksimum can / yenilenme süresi | `js/lives.js` → `MAX_LIVES`, `REGEN_MS` | 5 / 30 dk |
| Kaç seviyede bir geçiş reklamı | `js/ads.js` → `INTERSTITIAL_EVERY_N_LEVELS` | 5 |
| Reklamla kazanılan hamle / hak sayısı | `js/main.js` → `CONTINUE_MOVES`, `MAX_CONTINUES` | 3 / 2 |
| Mola hatırlatması | `js/main.js` → `BREAK_REMINDER_SECONDS` | 30 dk |
| Zorluk eğrisi | `js/levels.js` → `difficulty`, hamle formülleri | — |
| Oyun adı | `index.html`, `capacitor.config.json` | Gökyüzü Prensesi |

Zorluğu değiştirdikten sonra `npm run simulate` ile kazanma oranlarını kontrol edin.

## Görsel ve ses lisansları

| Varlık | Kaynak | Lisans |
|---|---|---|
| Prenses görseli (`www/img/prenses*.jpg`, `arkaplan.jpg`) | ChatGPT (OpenAI) ile üretildi (oyun sahibi) | OpenAI kullanım şartları: çıktı kullanıcıya ait, ticari kullanım serbest |
| Prensesin sesi (`www/audio/*.mp3`) | [Kokoro-82M](https://github.com/hexgrad/kokoro) TTS, "af_heart" sesi | Apache 2.0 (ticari kullanım serbest) |
| Arka plan müziği (`www/audio/music-*.mp3`) | `tools/compose_music.py` ile kodla bestelendi | Projeye ait |
| Göz kırpma kareleri (`prenses-blink/wink.jpg`) | `tools/make_frames.py` ile portreden üretildi | Projeye ait |
| Yazı tipleri (Cinzel, Nunito) | Google Fonts | SIL Open Font License |
| Mücevher ikonları, efektler | Kodla çizildi (`www/js/render.js`) | Projeye ait |

Yeni ses satırı eklemek için: `pip install kokoro-onnx soundfile`, model dosyalarını
[kokoro-onnx sürümlerinden](https://github.com/thewh1teagle/kokoro-onnx/releases) indirip `voice="af_heart"` ile üretin,
`ffmpeg` ile mp3'e çevirip `www/audio/` klasörüne koyun ve `www/js/voice.js` içindeki listeye ekleyin.
