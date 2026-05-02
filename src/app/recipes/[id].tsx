import { Image } from 'expo-image';
import { SymbolView } from 'expo-symbols';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import { Pressable, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useRecipes } from '@/context/recipes-context';

export default function RecipeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { recipes } = useRecipes();

  const recipe = recipes.find((r) => r.id === id);

  return (
    <ThemedView style={styles.container}>
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + BottomTabInset + Spacing.four },
        ]}
        showsVerticalScrollIndicator={false}>
        <ThemedView style={[styles.maxWidth, { paddingTop: insets.top + Spacing.two }]}>
          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}>
            <SymbolView
              name={{ ios: 'chevron.left', android: 'arrow_back', web: 'arrow_back' }}
              size={18}
              tintColor={theme.text}
            />
            <ThemedText type="small">Back</ThemedText>
          </Pressable>
        </ThemedView>

        {!recipe ? (
          <ThemedView style={[styles.maxWidth, styles.notFound]}>
            <ThemedText type="subtitle">Recipe not found</ThemedText>
          </ThemedView>
        ) : (
          <ThemedView style={styles.maxWidth}>
            <Image source={recipe.image} style={styles.heroImage} contentFit="cover" />

            <ThemedView style={styles.content}>
              <ThemedText type="subtitle">{recipe.title}</ThemedText>

              <ThemedView>
                <ThemedText type="smallBold" style={styles.sectionTitle}>
                  Ingredients
                </ThemedText>
                <ThemedView type="backgroundElement" style={styles.card}>
                  {recipe.ingredients.map((ingredient, index) => (
                    <ThemedView
                      key={index}
                      type="backgroundElement"
                      style={[
                        styles.ingredientRow,
                        index < recipe.ingredients.length - 1 && styles.ingredientBorder,
                      ]}>
                      <ThemedText
                        type="small"
                        themeColor="textSecondary"
                        style={styles.bulletPoint}>
                        •
                      </ThemedText>
                      <ThemedText type="small">{ingredient}</ThemedText>
                    </ThemedView>
                  ))}
                </ThemedView>
              </ThemedView>

              <ThemedView>
                <ThemedText type="smallBold" style={styles.sectionTitle}>
                  Instructions
                </ThemedText>
                <ThemedView type="backgroundElement" style={styles.card}>
                  <ThemedText type="small" style={styles.instructions}>
                    {recipe.instructions}
                  </ThemedText>
                </ThemedView>
              </ThemedView>
            </ThemedView>
          </ThemedView>
        )}
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
  },
  scrollContent: {
    width: '100%',
    alignItems: 'center',
  },
  maxWidth: {
    width: '100%',
    maxWidth: MaxContentWidth,
    paddingHorizontal: Spacing.three,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    alignSelf: 'flex-start',
    paddingVertical: Spacing.two,
  },
  pressed: {
    opacity: 0.7,
  },
  heroImage: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: Spacing.three,
    marginBottom: Spacing.three,
  },
  content: {
    gap: Spacing.four,
    paddingBottom: Spacing.four,
  },
  sectionTitle: {
    marginBottom: Spacing.two,
  },
  card: {
    borderRadius: Spacing.three,
    overflow: 'hidden',
  },
  ingredientRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  ingredientBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(128,128,128,0.2)',
  },
  bulletPoint: {
    lineHeight: 20,
  },
  instructions: {
    padding: Spacing.three,
    lineHeight: 22,
  },
  notFound: {
    alignItems: 'center',
    paddingTop: Spacing.six,
  },
});
