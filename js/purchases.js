// Real-money purchases through Google Play Billing (@capgo/native-purchases, Billing Library 9).
// The product IDs below must be created in Play Console → Monetize → In-app products,
// with exactly the same IDs. Prices come from Play (in the player's own currency).
// In the browser there is no Play Billing, so purchases run in a clearly marked test mode.
import { Capacitor, registerPlugin } from '../vendor/capacitor-core.js';

const native = Capacitor.isNativePlatform();
const Purchases = native ? registerPlugin('NativePurchases') : null;

export const COIN_PACKS = [
  { id: 'coins_500', coins: 500, fallback: '$0.99' },
  { id: 'coins_1200', coins: 1200, fallback: '$1.99', tag: '+20%' },
  { id: 'coins_3000', coins: 3000, fallback: '$4.99', tag: 'Best value' },
  { id: 'coins_6500', coins: 6500, fallback: '$9.99', tag: '+60%' },
];
export const NO_ADS = { id: 'no_ads', fallback: '$2.99' };

const prices = {};
export const isTestStore = !native;

export async function initStore() {
  if (!Purchases) return;
  try {
    const { isBillingSupported } = await Purchases.isBillingSupported();
    if (!isBillingSupported) return;
    const { products } = await Purchases.getProducts({
      productIdentifiers: [...COIN_PACKS.map((p) => p.id), NO_ADS.id],
      productType: 'inapp',
    });
    for (const p of products) prices[p.identifier] = p.priceString;
  } catch { /* store unavailable: fallback prices are shown */ }
}

export function priceOf(item) { return prices[item.id] || item.fallback; }

// Returns true only when Google Play reports a completed purchase.
// Coins are consumable (can be bought again); "no_ads" is a one-time purchase.
export async function buy(id, { consumable }, testConfirm) {
  if (!Purchases) return testConfirm ? testConfirm() : false;
  try {
    const tx = await Purchases.purchaseProduct({ productIdentifier: id, productType: 'inapp', quantity: 1, isConsumable: consumable });
    return !!tx && (tx.purchaseState === undefined || String(tx.purchaseState) === '1');
  } catch {
    return false; // cancelled or failed
  }
}

// Restores the one-time "no ads" purchase (new phone, reinstall).
export async function ownsNoAds() {
  if (!Purchases) return false;
  try {
    const { purchases } = await Purchases.getPurchases({ productType: 'inapp' });
    return purchases.some((p) => p.productIdentifier === NO_ADS.id && String(p.purchaseState) === '1');
  } catch { return false; }
}

export async function restore() {
  if (!Purchases) return false;
  try { await Purchases.restorePurchases(); } catch { /* ignore */ }
  return ownsNoAds();
}
