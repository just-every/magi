import React, { useState } from 'react';
import { StyleSheet, View, Text, Switch, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, typography, borderRadius, shadows } from '@/styles/theme';

// Setting item component
interface SettingItemProps {
  icon: string;
  iconColor?: string;
  title: string;
  description?: string;
  type?: 'toggle' | 'navigate' | 'button';
  value?: boolean;
  onValueChange?: (value: boolean) => void;
  onPress?: () => void;
}

const SettingItem: React.FC<SettingItemProps> = ({
  icon,
  iconColor = colors.gray600,
  title,
  description,
  type = 'navigate',
  value,
  onValueChange,
  onPress,
}) => {
  return (
    <TouchableOpacity
      style={styles.settingItem}
      onPress={onPress}
      disabled={type === 'toggle'}
    >
      <View style={[styles.iconContainer, { backgroundColor: `${iconColor}20` }]}>
        <Ionicons name={icon} size={22} color={iconColor} />
      </View>
      <View style={styles.settingContent}>
        <Text style={styles.settingTitle}>{title}</Text>
        {description && <Text style={styles.settingDescription}>{description}</Text>}
      </View>
      {type === 'toggle' && (
        <Switch
          value={value}
          onValueChange={onValueChange}
          trackColor={{ false: colors.gray300, true: `${colors.primary}80` }}
          thumbColor={value ? colors.primary : colors.white}
          ios_backgroundColor={colors.gray300}
        />
      )}
      {type === 'navigate' && (
        <Ionicons name="chevron-forward" size={20} color={colors.gray400} />
      )}
    </TouchableOpacity>
  );
};

export default function SettingsScreen() {
  // State for toggles
  const [notifications, setNotifications] = useState(true);
  const [darkMode, setDarkMode] = useState(false);
  const [locationServices, setLocationServices] = useState(true);

  // Example handlers
  const handleClearCache = () => {
    Alert.alert(
      'Clear Cache',
      'Are you sure you want to clear the application cache?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: () => Alert.alert('Cache Cleared', 'Application cache has been cleared.')
        },
      ]
    );
  };

  const handleAbout = () => {
    Alert.alert(
      'About This App',
      'React Native Mobile App Template\nVersion 1.0.0\n\nA template for building cross-platform mobile applications with React Native, TypeScript, and modern best practices.',
      [{ text: 'OK' }]
    );
  };

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: 'Settings' }} />

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.sectionTitle}>App Preferences</Text>
        <View style={styles.settingsGroup}>
          <SettingItem
            icon="notifications-outline"
            iconColor={colors.primary}
            title="Notifications"
            description="Receive push notifications"
            type="toggle"
            value={notifications}
            onValueChange={setNotifications}
          />
          <View style={styles.divider} />
          <SettingItem
            icon="moon-outline"
            iconColor={colors.secondary}
            title="Dark Mode"
            description="Enable dark theme"
            type="toggle"
            value={darkMode}
            onValueChange={setDarkMode}
          />
          <View style={styles.divider} />
          <SettingItem
            icon="location-outline"
            iconColor={colors.info}
            title="Location Services"
            description="Allow app to access your location"
            type="toggle"
            value={locationServices}
            onValueChange={setLocationServices}
          />
        </View>

        <Text style={styles.sectionTitle}>Account</Text>
        <View style={styles.settingsGroup}>
          <SettingItem
            icon="person-outline"
            iconColor={colors.primary}
            title="Edit Profile"
            description="Update your profile information"
            onPress={() => {}}
          />
          <View style={styles.divider} />
          <SettingItem
            icon="lock-closed-outline"
            iconColor={colors.warning}
            title="Privacy & Security"
            description="Manage your privacy settings"
            onPress={() => {}}
          />
          <View style={styles.divider} />
          <SettingItem
            icon="key-outline"
            iconColor={colors.danger}
            title="Change Password"
            description="Update your password"
            onPress={() => {}}
          />
        </View>

        <Text style={styles.sectionTitle}>Support</Text>
        <View style={styles.settingsGroup}>
          <SettingItem
            icon="help-circle-outline"
            iconColor={colors.info}
            title="Help Center"
            description="Get help and support"
            onPress={() => {}}
          />
          <View style={styles.divider} />
          <SettingItem
            icon="chatbox-ellipses-outline"
            iconColor={colors.success}
            title="Send Feedback"
            description="Report issues or suggest features"
            onPress={() => {}}
          />
          <View style={styles.divider} />
          <SettingItem
            icon="information-circle-outline"
            iconColor={colors.primary}
            title="About"
            description="App information and legal details"
            onPress={handleAbout}
          />
        </View>

        <Text style={styles.sectionTitle}>Advanced</Text>
        <View style={styles.settingsGroup}>
          <SettingItem
            icon="trash-outline"
            iconColor={colors.danger}
            title="Clear Cache"
            description="Free up storage space"
            type="button"
            onPress={handleClearCache}
          />
        </View>

        {/* Footer with app version */}
        <Text style={styles.versionText}>Version 1.0.0</Text>
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
  sectionTitle: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.medium,
    color: colors.gray700,
    marginBottom: spacing.sm,
    marginLeft: spacing.xs,
    marginTop: spacing.md,
  },
  settingsGroup: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.md,
    ...shadows.sm,
    marginBottom: spacing.md,
    overflow: 'hidden',
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  settingContent: {
    flex: 1,
  },
  settingTitle: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.medium,
    color: colors.gray800,
  },
  settingDescription: {
    fontSize: typography.fontSize.sm,
    color: colors.gray600,
    marginTop: spacing.xs / 2,
  },
  divider: {
    height: 1,
    backgroundColor: colors.gray200,
    marginLeft: spacing.xl + spacing.md,
  },
  versionText: {
    textAlign: 'center',
    fontSize: typography.fontSize.sm,
    color: colors.gray500,
    marginTop: spacing.xl,
    marginBottom: spacing.xl,
  },
});
