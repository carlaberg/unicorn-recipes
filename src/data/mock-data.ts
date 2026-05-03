export type User = {
  id: string;
  name: string;
  isLoggedIn: boolean;
};

export type Recipe = {
  id: string;
  title: string;
  image: string;
  ingredients: string[];
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
      '2 cups all-purpose flour',
      '2 tbsp sugar',
      '1 tsp baking powder',
      '1/2 tsp baking soda',
      '1/2 tsp salt',
      '2 cups buttermilk',
      '2 eggs',
      '3 tbsp melted butter',
      'Food coloring (pink, blue, purple)',
      'Whipped cream and rainbow sprinkles to serve',
    ],
    instructions:
      'Mix dry ingredients in a large bowl. Whisk together buttermilk, eggs and butter in a separate bowl. Combine wet and dry ingredients until just mixed. Divide batter into three portions and colour each with food colouring. Heat a non-stick pan over medium heat. Pour small rounds of each colour side by side and cook until bubbles form. Flip and cook one more minute. Stack and top with whipped cream and sprinkles.',
  },
  {
    id: '2',
    title: 'Rainbow Smoothie Bowl',
    image: 'https://picsum.photos/seed/smoothie/600/400',
    ingredients: [
      '2 frozen bananas',
      '1 cup frozen mixed berries',
      '1/2 cup coconut milk',
      'Fresh fruit for topping (kiwi, mango, strawberries)',
      'Granola',
      'Chia seeds',
      'Honey to drizzle',
    ],
    instructions:
      'Blend frozen bananas, berries and coconut milk until thick and smooth. Pour into a bowl. Arrange sliced fruit in rainbow rows on top. Sprinkle granola and chia seeds. Drizzle with honey and serve immediately.',
  },
  {
    id: '3',
    title: 'Glitter Lemonade',
    image: 'https://picsum.photos/seed/lemonade/600/400',
    ingredients: [
      '4 lemons, juiced',
      '4 cups cold water',
      '1/2 cup sugar',
      '1/2 cup butterfly pea flower tea (cooled)',
      'Ice cubes',
      'Fresh mint for garnish',
    ],
    instructions:
      'Make simple syrup by dissolving sugar in 1/2 cup hot water. Allow to cool. Mix lemon juice, simple syrup and cold water in a pitcher. Fill glasses with ice and pour lemonade. Slowly pour butterfly pea tea over the back of a spoon to create a colour-changing effect. Garnish with mint.',
  },
];
