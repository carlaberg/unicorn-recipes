export const canonicalIngredientUnits = [
  "g",
  "kg",
  "ml",
  "cl",
  "dl",
  "l",
  "msk",
  "tsk",
  "krm",
  "st",
  "nypa",
] as const;

export type CanonicalIngredientUnit = (typeof canonicalIngredientUnits)[number];

type UnitNormalizationResult = {
  unit: CanonicalIngredientUnit;
  multiplier: number;
};

const unitAliases: Record<string, UnitNormalizationResult> = {
  g: { unit: "g", multiplier: 1 },
  gram: { unit: "g", multiplier: 1 },
  grams: { unit: "g", multiplier: 1 },
  kg: { unit: "kg", multiplier: 1 },
  kilo: { unit: "kg", multiplier: 1 },
  kilos: { unit: "kg", multiplier: 1 },
  kilogram: { unit: "kg", multiplier: 1 },
  kilograms: { unit: "kg", multiplier: 1 },
  ml: { unit: "ml", multiplier: 1 },
  cl: { unit: "cl", multiplier: 1 },
  dl: { unit: "dl", multiplier: 1 },
  l: { unit: "l", multiplier: 1 },
  liter: { unit: "l", multiplier: 1 },
  liters: { unit: "l", multiplier: 1 },
  litre: { unit: "l", multiplier: 1 },
  litres: { unit: "l", multiplier: 1 },
  msk: { unit: "msk", multiplier: 1 },
  matsked: { unit: "msk", multiplier: 1 },
  tbsp: { unit: "msk", multiplier: 1 },
  tsk: { unit: "tsk", multiplier: 1 },
  tesked: { unit: "tsk", multiplier: 1 },
  tsp: { unit: "tsk", multiplier: 1 },
  krm: { unit: "krm", multiplier: 1 },
  kryddmatt: { unit: "krm", multiplier: 1 },
  st: { unit: "st", multiplier: 1 },
  stycken: { unit: "st", multiplier: 1 },
  styck: { unit: "st", multiplier: 1 },
  piece: { unit: "st", multiplier: 1 },
  pieces: { unit: "st", multiplier: 1 },
  pcs: { unit: "st", multiplier: 1 },
  pc: { unit: "st", multiplier: 1 },
  nypa: { unit: "nypa", multiplier: 1 },
  pinch: { unit: "nypa", multiplier: 1 },
  pinches: { unit: "nypa", multiplier: 1 },
  cup: { unit: "dl", multiplier: 2.4 },
  cups: { unit: "dl", multiplier: 2.4 },
};

const maxAmountDecimals = 6;

export function normalizeIngredientName(rawName: string) {
  return rawName.trim().replace(/\s+/g, " ").toLowerCase();
}

export function normalizeIngredientUnit(rawUnit: string) {
  const normalized = unitAliases[rawUnit.trim().toLowerCase()];
  return normalized ?? null;
}

export function applyAmountMultiplier(amount: number, multiplier: number) {
  const multiplied = amount * multiplier;
  return Number(multiplied.toFixed(maxAmountDecimals));
}

export function getAllowedUnitList() {
  return canonicalIngredientUnits.join(", ");
}
