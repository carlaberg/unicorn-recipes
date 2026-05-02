import { SymbolView } from 'expo-symbols';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useRecipes } from '@/context/recipes-context';

export default function NewRecipeScreen() {
  const router = useRouter();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { addRecipe } = useRecipes();

  const [title, setTitle] = useState('');
  const [ingredients, setIngredients] = useState('');
  const [instructions, setInstructions] = useState('');

  function handleSubmit() {
    if (!title.trim()) {
      return;
    }
    addRecipe({
      title: title.trim(),
      image: require('@/assets/images/logo-glow.png'),
      ingredients: ingredients
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean),
      instructions: instructions.trim(),
    });
    router.back();
  }

  return (
    <ThemedView style={styles.container}>
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + BottomTabInset + Spacing.four },
        ]}
        keyboardShouldPersistTaps="handled"
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

        <ThemedView style={[styles.maxWidth, styles.form]}>
          <ThemedText type="subtitle">New Recipe</ThemedText>

          <ThemedView style={styles.field}>
            <ThemedText type="smallBold" style={styles.label}>
              Title
            </ThemedText>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="Recipe title"
              placeholderTextColor={theme.textSecondary}
              style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]}
            />
          </ThemedView>

          <ThemedView style={styles.field}>
            <ThemedText type="smallBold" style={styles.label}>
              Ingredients
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={styles.hint}>
              One ingredient per line
            </ThemedText>
            <TextInput
              value={ingredients}
              onChangeText={setIngredients}
              placeholder={'1 cup flour\n2 eggs\n...'}
              placeholderTextColor={theme.textSecondary}
              multiline
              numberOfLines={6}
              style={[
                styles.input,
                styles.textArea,
                { color: theme.text, backgroundColor: theme.backgroundElement },
              ]}
            />
          </ThemedView>

          <ThemedView style={styles.field}>
            <ThemedText type="smallBold" style={styles.label}>
              Instructions
            </ThemedText>
            <TextInput
              value={instructions}
              onChangeText={setInstructions}
              placeholder="Describe the steps..."
              placeholderTextColor={theme.textSecondary}
              multiline
              numberOfLines={8}
              style={[
                styles.input,
                styles.textArea,
                { color: theme.text, backgroundColor: theme.backgroundElement },
              ]}
            />
          </ThemedView>

          <Pressable
            onPress={handleSubmit}
            style={({ pressed }) => [styles.submitButton, pressed && styles.pressed]}>
            <ThemedView type="backgroundElement" style={styles.submitButtonInner}>
              <ThemedText type="small">Save Recipe</ThemedText>
            </ThemedView>
          </Pressable>
        </ThemedView>
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
  form: {
    gap: Spacing.four,
    paddingTop: Spacing.two,
  },
  field: {
    gap: Spacing.one,
  },
  label: {
    marginBottom: Spacing.one,
  },
  hint: {
    marginBottom: Spacing.one,
  },
  input: {
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: 14,
    lineHeight: 20,
  },
  textArea: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
  submitButton: {
    alignSelf: 'stretch',
  },
  submitButtonInner: {
    paddingVertical: Spacing.two,
    borderRadius: Spacing.three,
    alignItems: 'center',
  },
});
