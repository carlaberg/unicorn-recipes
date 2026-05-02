export type Recipe = {
  id: string;
  title: string;
  image: number;
  ingredients: string[];
  instructions: string;
};

export type User = {
  id: string;
  name: string;
  email: string;
  isLoggedIn: boolean;
};

export const mockUser: User = {
  id: '1',
  name: 'Alice',
  email: 'alice@example.com',
  isLoggedIn: true,
};

export const mockRecipes: Recipe[] = [
  {
    id: '1',
    title: 'Rainbow Unicorn Cake',
    image: require('@/assets/images/logo-glow.png'),
    ingredients: [
      '2 cups all-purpose flour',
      '1½ cups sugar',
      '½ cup unsalted butter, softened',
      '3 large eggs',
      '1 cup whole milk',
      '1 tsp vanilla extract',
      '2 tsp baking powder',
      'Rainbow food coloring (red, orange, yellow, green, blue, purple)',
      'Unicorn sprinkles for topping',
    ],
    instructions:
      'Preheat oven to 350°F (175°C). Grease two 9-inch round cake pans. Beat butter and sugar until light and fluffy. Add eggs one at a time, mixing well after each. Stir in vanilla. Alternate adding flour mixture and milk, beginning and ending with flour. Divide batter into six bowls and tint each with a different food color. Spoon batter into pans in layers. Bake for 30–35 minutes until a toothpick comes out clean. Cool completely before frosting. Top generously with unicorn sprinkles.',
  },
  {
    id: '2',
    title: 'Glitter Rainbow Smoothie',
    image: require('@/assets/images/icon.png'),
    ingredients: [
      '1 cup frozen strawberries',
      '1 ripe banana',
      '½ cup frozen blueberries',
      '1 cup almond milk',
      '1 tbsp honey',
      'Edible gold glitter for topping',
    ],
    instructions:
      'Add strawberries, banana, and almond milk to a blender. Blend until smooth. Pour half into a glass. Add blueberries to the remaining blender mixture and blend again. Layer the purple smoothie on top of the pink base. Drizzle honey over the top and finish with a pinch of edible glitter. Serve immediately with a reusable straw.',
  },
  {
    id: '3',
    title: 'Magical Unicorn Pancakes',
    image: require('@/assets/images/react-logo.png'),
    ingredients: [
      '1½ cups all-purpose flour',
      '2 tsp baking powder',
      '1 tbsp sugar',
      '1 cup whole milk',
      '1 large egg',
      '2 tbsp melted butter',
      'Pastel food coloring (pink, blue, purple)',
      'Whipped cream, sprinkles, and edible stars for topping',
    ],
    instructions:
      'Whisk together flour, baking powder, and sugar in a large bowl. In a separate bowl, whisk milk, egg, and melted butter. Pour wet ingredients into dry and mix until just combined — lumps are okay. Divide batter into three portions and tint each a different pastel color. Heat a non-stick griddle over medium heat. Cook each color separately, pouring ¼ cup per pancake. Flip when bubbles form. Stack pancakes, alternating colors. Top with whipped cream, sprinkles, and edible stars.',
  },
];
