import { Image } from "expo-image";
import { router } from "expo-router";
import React from "react";
import { FlatList, Pressable, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { BottomTabInset, MaxContentWidth, Spacing } from "@/constants/theme";
import { mockRecipes, Recipe } from "@/data/mock-data";
import { useTheme } from "@/hooks/use-theme";

function RecipeCard({ recipe }: { recipe: Recipe }) {
  const theme = useTheme();
  return (
    <Pressable
      style={styles.cardPressable}
      onPress={() => router.push(`/recipe/${recipe.id}`)}
    >
      <ThemedView type="backgroundElement" style={styles.card}>
        <Image
          source={{ uri: recipe.image }}
          style={styles.cardImage}
          contentFit="cover"
        />
        <ThemedText type="small" style={styles.cardTitle}>
          {recipe.title}
        </ThemedText>
      </ThemedView>
    </Pressable>
  );
}

export default function RecipesScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <ThemedView style={styles.container}>
      <FlatList
        data={mockRecipes}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <RecipeCard recipe={item} />}
        style={styles.list}
        contentContainerStyle={[
          styles.listContent,
          {
            paddingTop: insets.top + Spacing.four,
            paddingBottom: insets.bottom + BottomTabInset + Spacing.three,
          },
        ]}
        ListHeaderComponent={
          <ThemedView style={styles.header}>
            <ThemedText type="subtitle">My Recipes</ThemedText>
            <Pressable
              style={[
                styles.addButton,
                { backgroundColor: theme.backgroundElement },
              ]}
              onPress={() => router.push("/recipe/new")}
            >
              <ThemedText type="small">+ Add Recipe</ThemedText>
            </Pressable>
          </ThemedView>
        }
        ItemSeparatorComponent={() => <ThemedView style={styles.separator} />}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "center",
  },
  list: {
    flex: 1,
    width: "100%",
    maxWidth: MaxContentWidth,
  },
  listContent: {
    paddingHorizontal: Spacing.four,
  },
  cardPressable: {
    width: "100%",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.four,
  },
  addButton: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.three,
  },
  card: {
    borderRadius: Spacing.three,
    overflow: "hidden",
  },
  cardImage: {
    width: "100%",
    aspectRatio: 16 / 9,
  },
  cardTitle: {
    padding: Spacing.three,
    fontWeight: "600",
  },
  separator: {
    height: Spacing.three,
  },
});
