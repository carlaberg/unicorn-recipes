import { Image } from 'expo-image';
import React from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { mockUser } from '@/data/mock-data';
import { useTheme } from '@/hooks/use-theme';

export default function HomeScreen() {
  const theme = useTheme();
  const { isLoggedIn } = useAuth();

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedView style={styles.heroSection}>
          <Image
            source={require('@/assets/images/logo-glow.png')}
            style={styles.logo}
            contentFit="contain"
          />
          <ThemedText type="title" style={styles.title}>
            Unicorn Recipes
          </ThemedText>
        </ThemedView>

        {mockUser.isLoggedIn ? (
          <ThemedText type="subtitle" style={styles.welcomeText}>
            Welcome, {mockUser.name}!
          </ThemedText>
        ) : (
          <ThemedView style={styles.authButtons}>
            <Pressable
              style={[styles.button, { backgroundColor: theme.backgroundElement }]}
              onPress={() => {}}>
              <ThemedText type="small">Sign In</ThemedText>
            </Pressable>
            <Pressable
              style={[styles.button, { backgroundColor: theme.backgroundElement }]}
              onPress={() => {}}>
              <ThemedText type="small">Sign Up</ThemedText>
            </Pressable>
          </ThemedView>
        )}
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
    paddingHorizontal: Spacing.four,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.four,
    paddingBottom: BottomTabInset + Spacing.three,
    maxWidth: MaxContentWidth,
  },
  heroSection: {
    alignItems: 'center',
    gap: Spacing.three,
  },
  logo: {
    width: 120,
    height: 120,
  },
  title: {
    textAlign: 'center',
  },
  welcomeText: {
    textAlign: 'center',
  },
  authButtons: {
    flexDirection: 'row',
    gap: Spacing.three,
  },
  button: {
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.four,
  },
});
