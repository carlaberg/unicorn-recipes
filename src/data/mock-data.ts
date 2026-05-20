export type User = {
  id: string;
  name: string;
  isLoggedIn: boolean;
};

export const ingredientUnits = [
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

export type IngredientUnit = (typeof ingredientUnits)[number];

const ingredientUnitAliases: Record<
  string,
  { unit: IngredientUnit; multiplier?: number }
> = {
  g: { unit: "g" },
  gram: { unit: "g" },
  kg: { unit: "kg" },
  kilo: { unit: "kg" },
  kilogram: { unit: "kg" },
  ml: { unit: "ml" },
  cl: { unit: "cl" },
  dl: { unit: "dl" },
  l: { unit: "l" },
  liter: { unit: "l" },
  litre: { unit: "l" },
  msk: { unit: "msk" },
  matsked: { unit: "msk" },
  tbsp: { unit: "msk" },
  tsk: { unit: "tsk" },
  tesked: { unit: "tsk" },
  tsp: { unit: "tsk" },
  krm: { unit: "krm" },
  kryddmått: { unit: "krm" },
  st: { unit: "st" },
  stycken: { unit: "st" },
  piece: { unit: "st" },
  pieces: { unit: "st" },
  pcs: { unit: "st" },
  nypa: { unit: "nypa" },
  pinch: { unit: "nypa" },
  pinches: { unit: "nypa" },
  cup: { unit: "dl", multiplier: 2.4 },
  cups: { unit: "dl", multiplier: 2.4 },
};

export function normalizeIngredientUnit(rawUnit: string) {
  const normalized = ingredientUnitAliases[rawUnit.trim().toLowerCase()];
  if (!normalized) {
    return null;
  }

  return {
    unit: normalized.unit,
    multiplier: normalized.multiplier ?? 1,
  };
}

export type Ingredient = {
  name: string;
  amount: number;
  unit: IngredientUnit;
};

export type Recipe = {
  id: string;
  title: string;
  image: string;
  video?: string;
  ingredients: Ingredient[];
  instructions: string;
};

// Shapes returned by the API
export type ApiIngredient = {
  amount: number;
  unit: string;
  ingredient: { name: string };
};

export type ApiRecipe = {
  id: number;
  name: string;
  image: string;
  video?: string | null;
  instructions: string;
  ingredients: ApiIngredient[];
};

export type ApiShoppingListItem = {
  ingredientName: string;
  unit: string;
  totalAmount: number;
  recipeCount: number;
  entryCount: number;
};

export type ApiShoppingListConflict = {
  ingredientName: string;
  units: string[];
};

export type ApiShoppingListResponse = {
  startDate: string;
  endDate: string;
  items: ApiShoppingListItem[];
  conflicts: ApiShoppingListConflict[];
};

export const mockUser: User = {
  id: "1",
  name: "Alex Johnson",
  isLoggedIn: true,
};

export const mockRecipes: Recipe[] = [
  {
    id: "1",
    title: "Unicorn Pancakes",
    image: "https://picsum.photos/seed/pancakes/600/400",
    video:
      "https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4",
    ingredients: [
      { name: "all-purpose flour", amount: 5, unit: "dl" },
      { name: "sugar", amount: 2, unit: "msk" },
      { name: "baking powder", amount: 1, unit: "tsk" },
      { name: "baking soda", amount: 0.5, unit: "tsk" },
      { name: "salt", amount: 0.5, unit: "tsk" },
      { name: "buttermilk", amount: 5, unit: "dl" },
      { name: "eggs", amount: 2, unit: "st" },
      { name: "melted butter", amount: 3, unit: "msk" },
      { name: "food coloring", amount: 3, unit: "st" },
      { name: "whipped cream and rainbow sprinkles", amount: 2.5, unit: "dl" },
    ],
    instructions:
      "Mix dry ingredients in a large bowl. Whisk together buttermilk, eggs and butter in a separate bowl. Combine wet and dry ingredients until just mixed. Divide batter into three portions and colour each with food colouring. Heat a non-stick pan over medium heat. Pour small rounds of each colour side by side and cook until bubbles form. Flip and cook one more minute. Stack and top with whipped cream and sprinkles.",
  },
  {
    id: "2",
    title: "Rainbow Smoothie Bowl",
    image: "https://picsum.photos/seed/smoothie/600/400",
    video:
      "https://storage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
    ingredients: [
      { name: "frozen bananas", amount: 2, unit: "st" },
      { name: "frozen mixed berries", amount: 2.5, unit: "dl" },
      { name: "coconut milk", amount: 1.2, unit: "dl" },
      { name: "fresh fruit for topping", amount: 2.5, unit: "dl" },
      { name: "granola", amount: 1.2, unit: "dl" },
      { name: "chia seeds", amount: 1, unit: "msk" },
      { name: "honey", amount: 1, unit: "msk" },
    ],
    instructions:
      "Blend frozen bananas, berries and coconut milk until thick and smooth. Pour into a bowl. Arrange sliced fruit in rainbow rows on top. Sprinkle granola and chia seeds. Drizzle with honey and serve immediately.",
  },
  {
    id: "3",
    title: "Glitter Lemonade",
    image: "https://picsum.photos/seed/lemonade/600/400",
    ingredients: [
      { name: "lemons, juiced", amount: 4, unit: "st" },
      { name: "cold water", amount: 1, unit: "l" },
      { name: "sugar", amount: 1.2, unit: "dl" },
      { name: "butterfly pea flower tea (cooled)", amount: 1.2, unit: "dl" },
      { name: "ice cubes", amount: 8, unit: "st" },
      { name: "fresh mint for garnish", amount: 4, unit: "st" },
    ],
    instructions:
      "Make simple syrup by dissolving sugar in 1/2 cup hot water. Allow to cool. Mix lemon juice, simple syrup and cold water in a pitcher. Fill glasses with ice and pour lemonade. Slowly pour butterfly pea tea over the back of a spoon to create a colour-changing effect. Garnish with mint.",
  },
];
