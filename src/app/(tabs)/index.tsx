import { useUser } from "@clerk/clerk-expo";
import { Image } from "expo-image";
import React from "react";
import { StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { BottomTabInset, MaxContentWidth, Spacing } from "@/constants/theme";

export default function HomeScreen() {
  const { user } = useUser();

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedView style={styles.heroSection}>
          <Image
            source={require("@/assets/images/logo-glow.png")}
            style={styles.logo}
            contentFit="contain"
          />
          <ThemedText type="title" style={styles.title}>
            Unicorn Recipes
          </ThemedText>
        </ThemedView>

        <ThemedText type="subtitle" style={styles.welcomeText}>
          Welcome{user?.firstName ? `, ${user.firstName}` : ""}!
        </ThemedText>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "center",
  },
  safeArea: {
    flex: 1,
    paddingHorizontal: Spacing.four,
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.four,
    paddingBottom: BottomTabInset + Spacing.three,
    maxWidth: MaxContentWidth,
  },
  heroSection: {
    alignItems: "center",
    gap: Spacing.three,
  },
  logo: {
    width: 120,
    height: 120,
  },
  title: {
    textAlign: "center",
  },
  welcomeText: {
    textAlign: "center",
  },
});
