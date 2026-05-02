import React from 'react';
import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { mockUser } from '@/data/mock';

export default function AccountScreen() {
  const user = mockUser;

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedText type="subtitle">Account</ThemedText>

        <ThemedView type="backgroundElement" style={styles.card}>
          <ThemedView style={styles.row}>
            <ThemedText type="smallBold">Name</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {user.name}
            </ThemedText>
          </ThemedView>

          <ThemedView style={[styles.row, styles.rowBorder]}>
            <ThemedText type="smallBold">Email</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {user.email}
            </ThemedText>
          </ThemedView>
        </ThemedView>

        <ThemedView type="backgroundElement" style={[styles.card, styles.authCard]}>
          {user.isLoggedIn ? (
            <ThemedView>
              <ThemedText type="small" themeColor="textSecondary" style={styles.authText}>
                You are signed in as{' '}
                <ThemedText type="smallBold">{user.name}</ThemedText>
              </ThemedText>
              <ThemedText type="small" style={styles.authLink}>
                Sign Out
              </ThemedText>
            </ThemedView>
          ) : (
            <ThemedView style={styles.authButtons}>
              <ThemedText type="small" style={styles.authLink}>
                Sign In
              </ThemedText>
              <ThemedText type="small" style={styles.authLink}>
                Sign Up
              </ThemedText>
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
});
