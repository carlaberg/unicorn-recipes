export type User = {
  id: string;
  name: string;
  isLoggedIn: boolean;
};

export const ingredientUnits = [
  'cups',
  'tbsp',
  'tsp',
  'g',
  'kg',
  'ml',
  'l',
  'pieces',
  'pinches',
] as const;

export type IngredientUnit = (typeof ingredientUnits)[number];

export type Ingredient = {
  name: string;
  amount: number;
  unit: IngredientUnit;
};

export type Recipe = {
  id: string;
  title: string;
  image: string;
  ingredients: Ingredient[];
  instructions: string;
};

export const mockUser: User = {
  id: '1',
  name: 'Alex Johnson',
  isLoggedIn: true,
};

export const mockRecipes: Recipe[] = [
  {
    id: '1',
    title: 'Unicorn Pancakes',
    image: 'https://picsum.photos/seed/pancakes/600/400',
    ingredients: [
      { name: 'all-purpose flour', amount: 2, unit: 'cups' },
      { name: 'sugar', amount: 2, unit: 'tbsp' },
      { name: 'baking powder', amount: 1, unit: 'tsp' },
      { name: 'baking soda', amount: 0.5, unit: 'tsp' },
      { name: 'salt', amount: 0.5, unit: 'tsp' },
      { name: 'buttermilk', amount: 2, unit: 'cups' },
      { name: 'eggs', amount: 2, unit: 'pieces' },
      { name: 'melted butter', amount: 3, unit: 'tbsp' },
      { name: 'food coloring', amount: 3, unit: 'pieces' },
      { name: 'whipped cream and rainbow sprinkles', amount: 1, unit: 'cups' },
    ],
    instructions:
      'Mix dry ingredients in a large bowl. Whisk together buttermilk, eggs and butter in a separate bowl. Combine wet and dry ingredients until just mixed. Divide batter into three portions and colour each with food colouring. Heat a non-stick pan over medium heat. Pour small rounds of each colour side by side and cook until bubbles form. Flip and cook one more minute. Stack and top with whipped cream and sprinkles.',
  },
  {
    id: '2',
    title: 'Rainbow Smoothie Bowl',
    image: 'https://picsum.photos/seed/smoothie/600/400',
    ingredients: [
      { name: 'frozen bananas', amount: 2, unit: 'pieces' },
      { name: 'frozen mixed berries', amount: 1, unit: 'cups' },
      { name: 'coconut milk', amount: 0.5, unit: 'cups' },
      { name: 'fresh fruit for topping', amount: 1, unit: 'cups' },
      { name: 'granola', amount: 0.5, unit: 'cups' },
      { name: 'chia seeds', amount: 1, unit: 'tbsp' },
      { name: 'honey', amount: 1, unit: 'tbsp' },
    ],
    instructions:
      'Blend frozen bananas, berries and coconut milk until thick and smooth. Pour into a bowl. Arrange sliced fruit in rainbow rows on top. Sprinkle granola and chia seeds. Drizzle with honey and serve immediately.',
  },
  {
    id: '3',
    title: 'Glitter Lemonade',
    image: 'https://picsum.photos/seed/lemonade/600/400',
    ingredients: [
      { name: 'lemons, juiced', amount: 4, unit: 'pieces' },
      { name: 'cold water', amount: 4, unit: 'cups' },
      { name: 'sugar', amount: 0.5, unit: 'cups' },
      { name: 'butterfly pea flower tea (cooled)', amount: 0.5, unit: 'cups' },
      { name: 'ice cubes', amount: 8, unit: 'pieces' },
      { name: 'fresh mint for garnish', amount: 4, unit: 'pieces' },
    ],
    instructions:
      'Make simple syrup by dissolving sugar in 1/2 cup hot water. Allow to cool. Mix lemon juice, simple syrup and cold water in a pitcher. Fill glasses with ice and pour lemonade. Slowly pour butterfly pea tea over the back of a spoon to create a colour-changing effect. Garnish with mint.',
  },
];
