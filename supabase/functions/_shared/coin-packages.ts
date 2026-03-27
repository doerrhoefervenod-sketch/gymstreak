export type CoinPackage = {
  id: string;
  coins: number;
  eur: string;
  amountCents: number;
  badge?: string;
  cls?: string;
  priceEnvVar: string;
};

export const COIN_PACKAGES: CoinPackage[] = [
  {
    id: "cp1",
    coins: 550,
    eur: "4.99",
    amountCents: 499,
    priceEnvVar: "STRIPE_PRICE_ID_COINS_550"
  },
  {
    id: "cp2",
    coins: 1200,
    eur: "9.99",
    badge: "Beliebt",
    cls: "pop-hot",
    amountCents: 999,
    priceEnvVar: "STRIPE_PRICE_ID_COINS_1200"
  },
  {
    id: "cp3",
    coins: 2600,
    eur: "19.99",
    amountCents: 1999,
    priceEnvVar: "STRIPE_PRICE_ID_COINS_2600"
  },
  {
    id: "cp4",
    coins: 7000,
    eur: "49.99",
    badge: "Mega Bundle",
    cls: "pop-val",
    amountCents: 4999,
    priceEnvVar: "STRIPE_PRICE_ID_COINS_7000"
  }
];

export function getCoinPackageById(packageId: string) {
  return COIN_PACKAGES.find((pkg) => pkg.id === packageId) ?? null;
}
