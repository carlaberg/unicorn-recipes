import {
  Tabs,
  TabList,
  TabTrigger,
  TabSlot,
  TabTriggerSlotProps,
  TabListProps,
} from 'expo-router/ui';
import { SymbolView } from 'expo-symbols';
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type NativeTabButtonProps = TabTriggerSlotProps & {
  icon: { ios: string; android: string; web: string };
  label: string;
};

function TabButton({ isFocused, icon, label, ...props }: NativeTabButtonProps) {
  const theme = useTheme();
  return (
    <Pressable {...props} style={styles.tabButton}>
      <SymbolView
        name={icon}
        size={22}
        tintColor={isFocused ? theme.text : theme.textSecondary}
      />
      <ThemedText
        type="small"
        themeColor={isFocused ? 'text' : 'textSecondary'}
        style={styles.tabLabel}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

function BottomTabBar(props: TabListProps) {
  const insets = useSafeAreaInsets();
  return (
    <ThemedView
      type="backgroundElement"
      style={[styles.tabBar, { paddingBottom: insets.bottom || Spacing.two }]}
      {...props}
    />
  );
}

export default function AppTabs() {
  return (
    <Tabs>
      <TabSlot style={{ flex: 1 }} />
      <TabList asChild>
        <BottomTabBar>
          <TabTrigger name="home" href="/" asChild>
            <TabButton
              icon={{ ios: 'house', android: 'home', web: 'home' }}
              label="Home"
            />
          </TabTrigger>
          <TabTrigger name="recipes" href="/recipes" asChild>
            <TabButton
              icon={{ ios: 'fork.knife', android: 'restaurant', web: 'restaurant' }}
              label="Recipes"
            />
          </TabTrigger>
          <TabTrigger name="account" href="/account" asChild>
            <TabButton
              icon={{ ios: 'person', android: 'person', web: 'person' }}
              label="Account"
            />
          </TabTrigger>
        </BottomTabBar>
      </TabList>
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(128,128,128,0.2)',
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
    paddingTop: Spacing.two,
    paddingBottom: Spacing.one,
    gap: Spacing.half,
  },
  tabLabel: {
    fontSize: 10,
    lineHeight: 14,
  },
});
