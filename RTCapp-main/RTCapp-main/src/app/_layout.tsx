


import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import { Stack } from 'expo-router';
import { useColorScheme } from 'react-native';
import { useEffect } from 'react';
import { getDatabase } from '@yourplatform/sdk';

export default function RootLayout() {
  const colorScheme = useColorScheme();

  useEffect(() => {
    getDatabase();
  }, []);

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="video" />
        <Stack.Screen name="room/group" />
        <Stack.Screen name="room/call" />
        <Stack.Screen name="room/live" />
        <Stack.Screen name="room/screen" />
      </Stack>
    </ThemeProvider>
  );
}