import React from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';

export default function AccountScreen() {
  const { isLoggedIn, userName, userEmail, signIn, signOut } = useAuth();

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedText type="subtitle">Account</ThemedText>

        {isLoggedIn && (
          <ThemedView type="backgroundElement" style={styles.card}>
            <ThemedView style={styles.row}>
              <ThemedText type="smallBold">Name</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {userName}
              </ThemedText>
            </ThemedView>

            <ThemedView style={[styles.row, styles.rowBorder]}>
              <ThemedText type="smallBold">Email</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {userEmail}
              </ThemedText>
            </ThemedView>
          </ThemedView>
        )}

        <ThemedView type="backgroundElement" style={[styles.card, styles.authCard]}>
          {isLoggedIn ? (
            <ThemedView>
              <ThemedText type="small" themeColor="textSecondary" style={styles.authText}>
                You are signed in as{' '}
                <ThemedText type="smallBold">{userName}</ThemedText>
              </ThemedText>
              <Pressable
                onPress={signOut}
                style={({ pressed }) => pressed && styles.pressed}>
                <ThemedText type="small" style={styles.authLink}>
                  Sign Out
                </ThemedText>
              </Pressable>
            </ThemedView>
          ) : (
            <ThemedView style={styles.authButtons}>
              <Pressable
                onPress={signIn}
                style={({ pressed }) => pressed && styles.pressed}>
                <ThemedText type="small" style={styles.authLink}>
                  Sign In
                </ThemedText>
              </Pressable>
              <Pressable
                onPress={signIn}
                style={({ pressed }) => pressed && styles.pressed}>
                <ThemedText type="small" style={styles.authLink}>
                  Sign Up
                </ThemedText>
              </Pressable>
            </ThemedView>
          )}
        </ThemedView>
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
    paddingTop: Spacing.four,
    paddingBottom: BottomTabInset + Spacing.three,
    gap: Spacing.four,
  },
  card: {
    borderRadius: Spacing.three,
    paddingHorizontal: Spacing.three,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.three,
  },
  rowBorder: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(128,128,128,0.2)',
  },
  authCard: {
    paddingVertical: Spacing.three,
  },
  authText: {
    marginBottom: Spacing.two,
  },
  authLink: {
    color: '#3c87f7',
  },
  authButtons: {
    flexDirection: 'row',
    gap: Spacing.three,
  },
  pressed: {
    opacity: 0.7,
  },
});
