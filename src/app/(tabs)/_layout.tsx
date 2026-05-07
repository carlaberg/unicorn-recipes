import { useAuth } from "@clerk/clerk-expo";
import { Redirect } from "expo-router";

import AppTabs from "@/components/app-tabs";

export default function TabLayout() {
  const { isLoaded, isSignedIn } = useAuth();

  if (!isLoaded) {
    return null;
  }

  if (!isSignedIn) {
    return <Redirect href="/auth" />;
  }

  return <AppTabs />;
}
