import { router } from "expo-router";
import React, { useState } from "react";
import {
    KeyboardAvoidingView,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    TextInput,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { MaxContentWidth, Spacing } from "@/constants/theme";
import { Ingredient, IngredientUnit, ingredientUnits } from "@/data/mock-data";
import { useTheme } from "@/hooks/use-theme";

export default function NewRecipeScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  const [title, setTitle] = useState("");
  const [image, setImage] = useState("");
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [ingredientName, setIngredientName] = useState("");
  const [ingredientAmount, setIngredientAmount] = useState("");
  const [ingredientUnit, setIngredientUnit] = useState<IngredientUnit>(
    ingredientUnits[0],
  );
  const [instructions, setInstructions] = useState("");

  const canAddIngredient =
    ingredientName.trim().length > 0 && ingredientAmount.trim().length > 0;

  function handleAddIngredient() {
    const parsedAmount = Number.parseFloat(ingredientAmount);

    if (!ingredientName.trim() || Number.isNaN(parsedAmount)) {
      return;
    }

    setIngredients((currentIngredients) => [
      ...currentIngredients,
      {
        name: ingredientName.trim(),
        amount: parsedAmount,
        unit: ingredientUnit,
      },
    ]);
    setIngredientName("");
    setIngredientAmount("");
    setIngredientUnit(ingredientUnits[0]);
  }

  function handleRemoveIngredient(indexToRemove: number) {
    setIngredients((currentIngredients) =>
      currentIngredients.filter((_, index) => index !== indexToRemove),
    );
  }

  return (
    <ThemedView style={styles.screen}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          style={{ backgroundColor: theme.background }}
          contentContainerStyle={[
            styles.content,
            { paddingBottom: insets.bottom + Spacing.six },
          ]}
        >
          <ThemedView style={styles.inner}>
            <Pressable
              style={[
                styles.backButton,
                { backgroundColor: theme.backgroundElement },
              ]}
              onPress={() => router.back()}
            >
              <ThemedText type="small">← Back</ThemedText>
            </Pressable>

            <ThemedText type="subtitle">New Recipe</ThemedText>

            <ThemedView style={styles.field}>
              <ThemedText type="smallBold" themeColor="textSecondary">
                Title
              </ThemedText>
              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: theme.backgroundElement,
                    color: theme.text,
                  },
                ]}
                placeholder="Recipe title"
                placeholderTextColor={theme.textSecondary}
                value={title}
                onChangeText={setTitle}
              />
            </ThemedView>

            <ThemedView style={styles.field}>
              <ThemedText type="smallBold" themeColor="textSecondary">
                Image URL
              </ThemedText>
              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: theme.backgroundElement,
                    color: theme.text,
                  },
                ]}
                placeholder="https://..."
                placeholderTextColor={theme.textSecondary}
                value={image}
                onChangeText={setImage}
                autoCapitalize="none"
                keyboardType="url"
              />
            </ThemedView>

            <ThemedView style={styles.field}>
              <ThemedText type="smallBold" themeColor="textSecondary">
                Add Ingredient
              </ThemedText>
              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: theme.backgroundElement,
                    color: theme.text,
                  },
                ]}
                placeholder="Ingredient name"
                placeholderTextColor={theme.textSecondary}
                value={ingredientName}
                onChangeText={setIngredientName}
              />
              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: theme.backgroundElement,
                    color: theme.text,
                  },
                ]}
                placeholder="Amount"
                placeholderTextColor={theme.textSecondary}
                value={ingredientAmount}
                onChangeText={setIngredientAmount}
                keyboardType="decimal-pad"
              />
              <ThemedView style={styles.unitList}>
                {ingredientUnits.map((unit) => {
                  const isSelected = unit === ingredientUnit;

                  return (
                    <Pressable
                      key={unit}
                      style={[
                        styles.unitChip,
                        {
                          backgroundColor: isSelected
                            ? theme.backgroundSelected
                            : theme.backgroundElement,
                        },
                      ]}
                      onPress={() => setIngredientUnit(unit)}
                    >
                      <ThemedText type="small">{unit}</ThemedText>
                    </Pressable>
                  );
                })}
              </ThemedView>
              <Pressable
                style={[
                  styles.addIngredientButton,
                  {
                    backgroundColor: canAddIngredient
                      ? theme.backgroundElement
                      : theme.backgroundSelected,
                  },
                ]}
                disabled={!canAddIngredient}
                onPress={handleAddIngredient}
              >
                <ThemedText type="smallBold">Add Ingredient</ThemedText>
              </Pressable>
            </ThemedView>

            <ThemedView style={styles.field}>
              <ThemedText type="smallBold" themeColor="textSecondary">
                Ingredients
              </ThemedText>
              <ThemedView style={styles.ingredientsList}>
                {ingredients.length === 0 ? (
                  <ThemedText themeColor="textSecondary">
                    No ingredients added yet.
                  </ThemedText>
                ) : (
                  ingredients.map((ingredient, index) => (
                    <ThemedView
                      key={`${ingredient.name}-${index}`}
                      style={styles.ingredientRow}
                    >
                      <ThemedText type="small" style={styles.ingredientText}>
                        • {ingredient.amount} {ingredient.unit}{" "}
                        {ingredient.name}
                      </ThemedText>
                      <Pressable
                        style={[
                          styles.removeButton,
                          { backgroundColor: theme.backgroundElement },
                        ]}
                        onPress={() => handleRemoveIngredient(index)}
                      >
                        <ThemedText type="smallBold">Remove</ThemedText>
                      </Pressable>
                    </ThemedView>
                  ))
                )}
              </ThemedView>
            </ThemedView>

            <ThemedView style={styles.field}>
              <ThemedText type="smallBold" themeColor="textSecondary">
                Instructions
              </ThemedText>
              <TextInput
                style={[
                  styles.input,
                  styles.multilineInput,
                  {
                    backgroundColor: theme.backgroundElement,
                    color: theme.text,
                  },
                ]}
                placeholder="Describe the steps..."
                placeholderTextColor={theme.textSecondary}
                value={instructions}
                onChangeText={setInstructions}
                multiline
                numberOfLines={6}
              />
            </ThemedView>

            <Pressable
              style={[
                styles.submitButton,
                { backgroundColor: theme.backgroundElement },
              ]}
              onPress={() => router.back()}
            >
              <ThemedText type="smallBold">Save Recipe</ThemedText>
            </Pressable>
          </ThemedView>
        </ScrollView>
      </KeyboardAvoidingView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  content: {
    flexDirection: "row",
    justifyContent: "center",
  },
  inner: {
    flex: 1,
    maxWidth: MaxContentWidth,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.six,
    gap: Spacing.three,
  },
  backButton: {
    alignSelf: "flex-start",
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.three,
    marginBottom: Spacing.two,
  },
  field: {
    gap: Spacing.one,
  },
  input: {
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: 16,
  },
  multilineInput: {
    minHeight: 100,
    textAlignVertical: "top",
  },
  unitList: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.one,
  },
  unitChip: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.three,
  },
  addIngredientButton: {
    alignItems: "center",
    paddingVertical: Spacing.three,
    borderRadius: Spacing.three,
  },
  ingredientsList: {
    gap: Spacing.one,
    paddingTop: Spacing.one,
  },
  ingredientRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
  },
  ingredientText: {
    flex: 1,
    paddingLeft: Spacing.one,
  },
  removeButton: {
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
    borderRadius: Spacing.two,
  },
  submitButton: {
    alignItems: "center",
    paddingVertical: Spacing.three,
    borderRadius: Spacing.three,
    marginTop: Spacing.two,
  },
});
