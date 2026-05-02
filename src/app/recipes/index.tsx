import { Image } from 'expo-image';
import { Link } from 'expo-router';
import React from 'react';
import { Pressable, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { mockRecipes } from '@/data/mock';

export default function RecipesScreen() {
  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}>
          <ThemedView style={styles.header}>
            <ThemedText type="subtitle">My Recipes</ThemedText>
            <Link href="/recipes/new" asChild>
              <Pressable style={({ pressed }) => pressed && styles.pressed}>
                <ThemedView type="backgroundElement" style={styles.addButton}>
                  <ThemedText type="small">+ Add Recipe</ThemedText>
                </ThemedView>
              </Pressable>
            </Link>
          </ThemedView>

          {mockRecipes.map((recipe) => (
            <Link key={recipe.id} href={`/recipes/${recipe.id}`} asChild>
              <Pressable style={({ pressed }) => pressed && styles.pressed}>
                <ThemedView type="backgroundElement" style={styles.recipeCard}>
                  <Image source={recipe.image} style={styles.recipeImage} contentFit="cover" />
                  <ThemedView type="backgroundElement" style={styles.recipeInfo}>
                    <ThemedText type="small">{recipe.title}</ThemedText>
                  </ThemedView>
                </ThemedView>
              </Pressable>
            </Link>
          ))}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
  },
  safeArea: {
    flex: 1,
    maxWidth: MaxContentWidth,
    paddingHorizontal: Spacing.three,
    paddingBottom: BottomTabInset + Spacing.three,
  },
  scrollContent: {
    gap: Spacing.three,
    paddingTop: Spacing.four,
    paddingBottom: Spacing.four,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  addButton: {
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.three,
  },
  recipeCard: {
    borderRadius: Spacing.three,
    overflow: 'hidden',
  },
  recipeImage: {
    width: '100%',
    aspectRatio: 16 / 9,
  },
  recipeInfo: {
    padding: Spacing.three,
  },
  pressed: {
    opacity: 0.7,
  },
});
