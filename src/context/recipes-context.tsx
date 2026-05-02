import React, { createContext, useContext, useState } from 'react';

import { mockRecipes, Recipe } from '@/data/mock';

type RecipesContextType = {
  recipes: Recipe[];
  addRecipe: (recipe: Omit<Recipe, 'id'>) => void;
};

const RecipesContext = createContext<RecipesContextType>({
  recipes: mockRecipes,
  addRecipe: () => {},
});

export function RecipesProvider({ children }: { children: React.ReactNode }) {
  const [recipes, setRecipes] = useState<Recipe[]>(mockRecipes);

  function addRecipe(recipe: Omit<Recipe, 'id'>) {
    const newRecipe: Recipe = {
      ...recipe,
      id: String(Date.now()),
    };
    setRecipes((prev) => [...prev, newRecipe]);
  }

  return (
    <RecipesContext.Provider value={{ recipes, addRecipe }}>
      {children}
    </RecipesContext.Provider>
  );
}

export function useRecipes() {
  return useContext(RecipesContext);
}
