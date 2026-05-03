import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import React from 'react';
import { Pressable, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { mockRecipes } from '@/data/mock-data';
import { useTheme } from '@/hooks/use-theme';

function formatIngredient(amount: number, unit: string, name: string) {
  return `${amount} ${unit} ${name}`;
}

export default function RecipeDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const recipe = mockRecipes.find((r) => r.id === id);
  const insets = useSafeAreaInsets();
  const theme = useTheme();

  if (!recipe) {
    return (
      <ThemedView style={styles.center}>
        <ThemedText>Recipe not found.</ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.screen}>
      <ScrollView
        style={{ backgroundColor: theme.background }}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + Spacing.six },
        ]}>
        <ThemedView style={styles.inner}>
          <Pressable
            style={[styles.backButton, { backgroundColor: theme.backgroundElement }]}
            onPress={() => router.back()}>
            <ThemedText type="small">← Back</ThemedText>
          </Pressable>

          <ThemedText type="subtitle">{recipe.title}</ThemedText>

          <Image
            source={{ uri: recipe.image }}
            style={styles.image}
            contentFit="cover"
          />

          <ThemedText type="smallBold" themeColor="textSecondary" style={styles.sectionLabel}>
            Ingredients
          </ThemedText>
          {recipe.ingredients.map((ingredient, index) => (
            <ThemedView key={index} style={styles.ingredientRow}>
              <ThemedText type="small">
                • {formatIngredient(ingredient.amount, ingredient.unit, ingredient.name)}
              </ThemedText>
            </ThemedView>
          ))}

          <ThemedText type="smallBold" themeColor="textSecondary" style={styles.sectionLabel}>
            Instructions
          </ThemedText>
          <ThemedText type="default">{recipe.instructions}</ThemedText>
        </ThemedView>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    flexDirection: 'row',
    justifyContent: 'center',
  },
  inner: {
    flex: 1,
    maxWidth: MaxContentWidth,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.six,
    gap: Spacing.three,
  },
  backButton: {
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.three,
    marginBottom: Spacing.two,
  },
  image: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: Spacing.three,
  },
  sectionLabel: {
    marginTop: Spacing.two,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  ingredientRow: {
    paddingLeft: Spacing.one,
  },
});
