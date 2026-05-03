import React, { useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { mockUser } from '@/data/mock-data';
import { useTheme } from '@/hooks/use-theme';

export default function AccountScreen() {
  const theme = useTheme();
  const [isLoggedIn, setIsLoggedIn] = useState(mockUser.isLoggedIn);

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedText type="subtitle" style={styles.heading}>
          Account
        </ThemedText>

        {isLoggedIn ? (
          <>
            <ThemedView type="backgroundElement" style={styles.profileCard}>
              <ThemedText type="smallBold" themeColor="textSecondary">
                Name
              </ThemedText>
              <ThemedText type="default">{mockUser.name}</ThemedText>
            </ThemedView>

            <Pressable
              style={[styles.button, { backgroundColor: theme.backgroundElement }]}
              onPress={() => setIsLoggedIn(false)}>
              <ThemedText type="small">Log Out</ThemedText>
            </Pressable>
          </>
        ) : (
          <>
            <ThemedText themeColor="textSecondary">You are not logged in.</ThemedText>

            <Pressable
              style={[styles.button, { backgroundColor: theme.backgroundElement }]}
              onPress={() => setIsLoggedIn(true)}>
              <ThemedText type="small">Log In</ThemedText>
            </Pressable>
          </>
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
    gap: Spacing.four,
    paddingTop: Spacing.six,
    paddingBottom: BottomTabInset + Spacing.three,
    maxWidth: MaxContentWidth,
  },
  heading: {
    marginBottom: Spacing.two,
  },
  profileCard: {
    borderRadius: Spacing.three,
    padding: Spacing.three,
    gap: Spacing.one,
  },
  button: {
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.four,
  },
});
