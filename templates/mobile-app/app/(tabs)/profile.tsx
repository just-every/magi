import React from 'react';
import { StyleSheet, View, Text, ScrollView, TouchableOpacity, Image } from 'react-native';
import { Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/hooks/useAuth';
import { colors, spacing, typography, borderRadius, shadows } from '@/styles/theme';

export default function ProfileScreen() {
  const { user, logout } = useAuth();

  // Placeholder user data
  const userData = {
    ...user,
    name: user?.name || 'Demo User',
    email: user?.email || 'user@example.com',
    bio: 'Software developer passionate about mobile applications and user experience.',
    location: 'San Francisco, CA',
    joinedDate: 'January 2025',
    avatar: null, // In a real app, this would be a URL or require() to an image
  };

  const handleLogout = async () => {
    try {
      await logout();
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: 'Profile' }} />

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Profile Header */}
        <View style={styles.header}>
          <View style={styles.avatarContainer}>
            {userData.avatar ? (
              <Image source={{ uri: userData.avatar }} style={styles.avatar} />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <Text style={styles.avatarText}>
                  {userData.name.charAt(0).toUpperCase()}
                </Text>
              </View>
            )}
          </View>
          <Text style={styles.name}>{userData.name}</Text>
          <Text style={styles.email}>{userData.email}</Text>
        </View>

        {/* Bio Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>About</Text>
          <View style={styles.card}>
            <Text style={styles.bioText}>{userData.bio}</Text>
          </View>
        </View>

        {/* Location and Joined Date */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Details</Text>
          <View style={styles.card}>
            <View style={styles.detailRow}>
              <Ionicons name="location-outline" size={20} color={colors.gray600} />
              <Text style={styles.detailText}>{userData.location}</Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.detailRow}>
              <Ionicons name="calendar-outline" size={20} color={colors.gray600} />
              <Text style={styles.detailText}>Joined {userData.joinedDate}</Text>
            </View>
          </View>
        </View>

        {/* Logout Button */}
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Ionicons name="log-out-outline" size={20} color={colors.danger} />
          <Text style={styles.logoutText}>Log Out</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.gray100,
  },
  scrollContent: {
    padding: spacing.md,
  },
  header: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  avatarContainer: {
    marginBottom: spacing.md,
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
  },
  avatarPlaceholder: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: typography.fontSize.xxxl,
    color: colors.white,
    fontWeight: typography.fontWeight.bold,
  },
  name: {
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
    marginBottom: spacing.xs,
  },
  email: {
    fontSize: typography.fontSize.md,
    color: colors.gray600,
  },
  section: {
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.medium,
    color: colors.gray700,
    marginBottom: spacing.sm,
    marginLeft: spacing.xs,
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    ...shadows.sm,
  },
  bioText: {
    fontSize: typography.fontSize.md,
    color: colors.gray800,
    lineHeight: typography.lineHeight.normal * typography.fontSize.md,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  detailText: {
    fontSize: typography.fontSize.md,
    color: colors.gray800,
    marginLeft: spacing.sm,
  },
  divider: {
    height: 1,
    backgroundColor: colors.gray200,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginVertical: spacing.lg,
    ...shadows.sm,
  },
  logoutText: {
    color: colors.danger,
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.medium,
    marginLeft: spacing.sm,
  },
});
