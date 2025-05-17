import React from 'react';
import { StyleSheet, View, ActivityIndicator, Text } from 'react-native';
import { Redirect } from 'expo-router';
import { useAuth } from '@/hooks/useAuth';
import { colors, spacing, typography } from '@/styles/theme';

export default function Index() {
  const { isAuthenticated, isLoading } = useAuth();

  // Redirect based on authentication status
  if (!isLoading) {
    if (isAuthenticated) {
      return <Redirect href="/(tabs)/home" />;
    } else {
      return <Redirect href="/(auth)/login" />;
    }
  }

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color={colors.primary} />
      <Text style={styles.text}>Loading...</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
  },
  text: {
    marginTop: spacing.md,
    fontSize: typography.fontSize.md,
    color: colors.gray700,
  },
});
