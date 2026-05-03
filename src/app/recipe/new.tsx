import { router } from 'expo-router';
import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export default function NewRecipeScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  const [title, setTitle] = useState('');
  const [image, setImage] = useState('');
  const [ingredients, setIngredients] = useState('');
  const [instructions, setInstructions] = useState('');

  return (
    <ThemedView style={styles.screen}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
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

            <ThemedText type="subtitle">New Recipe</ThemedText>

            <ThemedView style={styles.field}>
              <ThemedText type="smallBold" themeColor="textSecondary">
                Title
              </ThemedText>
              <TextInput
                style={[
                  styles.input,
                  { backgroundColor: theme.backgroundElement, color: theme.text },
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
                  { backgroundColor: theme.backgroundElement, color: theme.text },
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
                Ingredients (one per line)
              </ThemedText>
              <TextInput
                style={[
                  styles.input,
                  styles.multilineInput,
                  { backgroundColor: theme.backgroundElement, color: theme.text },
                ]}
                placeholder="1 cup flour&#10;2 eggs&#10;..."
                placeholderTextColor={theme.textSecondary}
                value={ingredients}
                onChangeText={setIngredients}
                multiline
                numberOfLines={5}
              />
            </ThemedView>

            <ThemedView style={styles.field}>
              <ThemedText type="smallBold" themeColor="textSecondary">
                Instructions
              </ThemedText>
              <TextInput
                style={[
                  styles.input,
                  styles.multilineInput,
                  { backgroundColor: theme.backgroundElement, color: theme.text },
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
              style={[styles.submitButton, { backgroundColor: theme.backgroundElement }]}
              onPress={() => router.back()}>
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
    textAlignVertical: 'top',
  },
  submitButton: {
    alignItems: 'center',
    paddingVertical: Spacing.three,
    borderRadius: Spacing.three,
    marginTop: Spacing.two,
  },
});
