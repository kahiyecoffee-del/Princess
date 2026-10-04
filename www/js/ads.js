import { Capacitor, registerPlugin } from '../vendor/capacitor-core.js';

// Reklam katmanı. Android'de AdMob (@capacitor-community/admob) kullanır;
// tarayıcıda test için sahte bir reklam ekranı gösterir.
//
// ÖNEMLİ: Aşağıdaki kimlikler Google'ın resmi TEST kimlikleridir.
// Yayına çıkmadan önce AdMob panelinde kendi reklam birimlerinizi oluşturup
// buraya yazın ve TESTING değerini false yapın. Kendi reklamlarınıza
// tıklamak AdMob hesabınızın kapatılmasına yol açar.

export const AD_CONFIG = {
  TESTING: true,
  INTERSTITIAL_ID: 'ca-app-pub-3940256099942544/1033173712',
  REWARDED_ID: 'ca-app-pub-3940256099942544/5224354917',
  INTERSTITIAL_EVERY_N_LEVELS: 5,
  // Interstitial after this much play time, shown at the next natural break (never mid-move).
  INTERSTITIAL_EVERY_SECONDS: 90,
};

// Capacitor 8'de yerel eklentiler registerPlugin ile kaydedilmeden JS'ten erişilemez.
const AdMobPlugin = registerPlugin('AdMob');
const AdMob = () => (Capacitor.isNativePlatform() ? AdMobPlugin : null);

let initialized = false;
let interstitialReady = false;
let rewardedReady = false;

export async function initAds() {
  const plugin = AdMob();
  if (!plugin || initialized) return;
  try {
    await plugin.initialize({ initializeForTesting: AD_CONFIG.TESTING });
    // AB/İngiltere kullanıcıları için GDPR onay formu (UMP)
    try {
      const info = await plugin.requestConsentInfo();
      if (info.isConsentFormAvailable && info.status === 'REQUIRED') await plugin.showConsentForm();
    } catch { /* the consent form may not be configured */ }
    initialized = true;
    preloadInterstitial();
    preloadRewarded();
  } catch (e) {
    console.warn('AdMob could not start', e);
  }
}

async function preloadInterstitial() {
  const plugin = AdMob();
  if (!plugin) return;
  try {
    await plugin.prepareInterstitial({ adId: AD_CONFIG.INTERSTITIAL_ID, isTesting: AD_CONFIG.TESTING });
    interstitialReady = true;
  } catch { interstitialReady = false; }
}

async function preloadRewarded() {
  const plugin = AdMob();
  if (!plugin) return;
  try {
    await plugin.prepareRewardVideoAd({ adId: AD_CONFIG.REWARDED_ID, isTesting: AD_CONFIG.TESTING });
    rewardedReady = true;
  } catch { rewardedReady = false; }
}

function waitForEvent(plugin, names, timeoutMs) {
  return new Promise((resolve) => {
    const handles = [];
    const done = (name, data) => {
      clearTimeout(timer);
      handles.forEach((h) => h.then?.((x) => x.remove()) ?? h.remove?.());
      resolve({ name, data });
    };
    const timer = setTimeout(() => done('timeout'), timeoutMs);
    for (const n of names) handles.push(plugin.addListener(n, (data) => done(n, data)));
  });
}

// Geçiş reklamı (her 5 seviyede bir). Reklam kapanınca çözülür.
export async function showInterstitial() {
  const plugin = AdMob();
  if (!plugin) return mockAd({ rewarded: false });
  if (!interstitialReady) await preloadInterstitial();
  if (!interstitialReady) return false;
  try {
    const closed = waitForEvent(plugin, ['interstitialAdDismissed', 'interstitialAdFailedToShow'], 120000);
    interstitialReady = false;
    await plugin.showInterstitial();
    await closed;
    return true;
  } catch {
    return false;
  } finally {
    preloadInterstitial();
  }
}

// Ödüllü reklam. Kullanıcı ödülü hak ettiyse true döner.
export async function showRewarded() {
  const plugin = AdMob();
  if (!plugin) return mockAd({ rewarded: true });
  if (!rewardedReady) await preloadRewarded();
  if (!rewardedReady) return false;
  let rewarded = false;
  const rewardHandle = plugin.addListener('onRewardedVideoAdReward', () => { rewarded = true; });
  try {
    const closed = waitForEvent(plugin, ['onRewardedVideoAdDismissed', 'onRewardedVideoAdFailedToShow'], 180000);
    rewardedReady = false;
    const item = await plugin.showRewardVideoAd();
    if (item && item.amount !== undefined) rewarded = true;
    await closed;
    return rewarded;
  } catch {
    return rewarded;
  } finally {
    (await rewardHandle)?.remove?.();
    preloadRewarded();
  }
}

export function rewardedAvailable() {
  return !AdMob() || rewardedReady;
}

// Tarayıcı testleri için sahte reklam.
function mockAd({ rewarded }) {
  return new Promise((resolve) => {
    const el = document.getElementById('mock-ad');
    const timerEl = el.querySelector('.mock-ad-timer');
    const closeBtn = el.querySelector('.mock-ad-close');
    el.querySelector('.mock-ad-kind').textContent = rewarded ? 'Rewarded ad (test)' : 'Interstitial ad (test)';
    el.hidden = false;
    let left = 3;
    timerEl.textContent = left;
    closeBtn.hidden = true;
    const iv = setInterval(() => {
      left--;
      timerEl.textContent = Math.max(0, left);
      if (left <= 0) { clearInterval(iv); closeBtn.hidden = false; }
    }, 1000);
    closeBtn.onclick = () => {
      el.hidden = true;
      resolve(true);
    };
  });
}
