# 🚀 Yayın Kontrol Listesi: The Sky Princess

Oyunu Google Play'de yayınlamadan önce sırayla yapılacaklar.
Claude'a **"yayınlıyorum"** demeniz yeterli; bu listeyi birlikte adım adım tamamlarız.

---

## 1. Şirket ve hesaplar
- [ ] Şirket kuruluşu tamamlandı
- [ ] **D-U-N-S numarası** alındı (ücretsiz, birkaç gün–birkaç hafta sürebilir). Google, kurumsal geliştirici hesabı için ister
- [ ] **Google Play Console** kurumsal hesabı açıldı (tek seferlik 25 $)
  - Kurumsal hesaplarda "12 test kullanıcısı / 14 gün kapalı test" zorunluluğu **yoktur**
- [ ] **AdMob** hesabı şirket adına açıldı ve ödeme bilgileri (banka, vergi) girildi
- [ ] Play Console'da **ödeme profili** (uygulama içi satış geliri için) oluşturuldu

## 2. Koddaki taslak değerler (Claude değiştirir)
- [ ] **Paket adı:** `com.gokyuzuprensesi.oyun` yerine şirkete ait bir ad (ör. `com.sirketadi.skyprincess`)
  - Yayından sonra **asla** değiştirilemez
  - Değişecek yerler: `capacitor.config.json`, `android/app/build.gradle`, davet bağlantısı (`www/js/main.js` → `PLAY_URL`)
- [ ] **AdMob kimlikleri:** test kimlikleri yerine gerçekleri
  - Uygulama kimliği → GitHub **Variables** → `ADMOB_APP_ID`
  - Geçiş ve ödüllü reklam birimi → `www/js/ads.js`, `TESTING: false`
- [ ] AdMob'da **GDPR onay mesajı** (Privacy & messaging) oluşturuldu

## 3. İmza anahtarı (Claude hazırlar, siz GitHub'a eklersiniz)
- [ ] Yükleme anahtarı oluşturuldu
- [ ] GitHub → Settings → Secrets → `KEYSTORE_BASE64` ve `KEYSTORE_PASSWORD` eklendi
- [ ] Anahtar ve şifre güvenli bir yerde yedeklendi (iCloud Anahtar Zinciri vb.)
- [ ] GitHub Actions'ta imzalı `.aab` başarıyla üretildi (Releases bölümünde)

## 4. Uygulama içi ürünler (Play Console → Para kazanma → Ürünler)
Kimlikler **birebir** aynı olmalı:

| Ürün kimliği | Ne verir | Önerilen fiyat |
|---|---|---|
| `coins_500` | 500 altın | 0,99 $ |
| `coins_1200` | 1.200 altın | 1,99 $ |
| `coins_3000` | 3.000 altın | 4,99 $ |
| `coins_6500` | 6.500 altın | 9,99 $ |
| `no_ads` | Zorunlu reklamları kaldırır | 2,99 $ |

- [ ] Beş ürün oluşturuldu ve etkinleştirildi
- [ ] Kendi Google hesabınız **Lisans testi** listesine eklendi (ücretsiz test satın alması için)

## 5. Mağaza sayfası
- [ ] Uygulama adı, kısa ve uzun açıklama (İngilizce + Türkçe, İspanyolca, Portekizce)
- [ ] Görseller: `store/` klasöründe hazır (ikon 512, öne çıkan görsel 1024×500, 4 ekran görüntüsü)
- [ ] **Gizlilik politikası** sayfası (AdMob, satın alma ve bildirimler nedeniyle zorunlu). Claude hazırlayıp GitHub Pages'te yayınlayabilir
- [ ] İçerik derecelendirmesi anketi ("simüle kumar": Hayır)
- [ ] Hedef kitle: 13+ (çocuklara yönelik değil)
- [ ] **Veri güvenliği** formu: reklam kimliği, satın alma geçmişi, cihaz kimlikleri
- [ ] Reklam içeriyor: Evet · Uygulama içi satın alma: Evet
- [ ] Prenses görselinin ChatGPT ile üretildiğine dair ekran görüntüsü saklandı

## 6. Test ve yayın
- [ ] **Dahili test** kanalına `.aab` yüklendi ve bir Android telefonda denendi:
  - [ ] Reklamlar (geçiş + ödüllü) görünüyor
  - [ ] Test satın alması altın veriyor, reklamsız paket çalışıyor
  - [ ] Bildirim izni soruluyor, bildirimler geliyor
  - [ ] Ses, müzik ve prensesin konuşması çalışıyor
- [ ] Üretim (herkese açık) sürümü incelemeye gönderildi

## 7. Yayından sonra (isteğe bağlı)
- [ ] Davet edene de ödül için Firebase sunucusu
- [ ] Satın almalar için sunucu tarafı doğrulama
- [ ] İspanyolca ve Portekizce prenses seslendirmesi
- [ ] TikTok / Reels tanıtım videoları
