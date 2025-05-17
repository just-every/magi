import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput as RNTextInput,
  TextInputProps as RNTextInputProps,
  TouchableOpacity,
  NativeSyntheticEvent,
  TextInputFocusEventData,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, typography, borderRadius } from '@/styles/theme';

// Type for Ionicons name (ideally would use the actual type from @expo/vector-icons)
type IoniconsName = string;

interface TextInputProps extends RNTextInputProps {
  label?: string;
  error?: string;
  touched?: boolean;
  icon?: IoniconsName;
}

const TextInput: React.FC<TextInputProps> = ({
  label,
  error,
  icon,
  secureTextEntry,
  ...props
}) => {
  const [isFocused, setIsFocused] = useState(false);
  const [isSecureTextVisible, setIsSecureTextVisible] = useState(!secureTextEntry);

  const handleFocus = () => setIsFocused(true);
  const handleBlur = () => {
    setIsFocused(false);
    if (props.onBlur) {
      // Use proper type for the event, or null if just triggering the callback
      props.onBlur(null as unknown as NativeSyntheticEvent<TextInputFocusEventData>);
    }
  };

  const toggleSecureTextEntry = () => {
    setIsSecureTextVisible(!isSecureTextVisible);
  };

  return (
    <View style={styles.container}>
      {label && <Text style={styles.label}>{label}</Text>}
      <View
        style={[
          styles.inputContainer,
          isFocused && styles.focusedInput,
          error && styles.errorInput,
        ]}
      >
        {icon && (
          <Ionicons
            name={icon}
            size={20}
            color={isFocused ? colors.primary : colors.gray500}
            style={styles.icon}
          />
        )}
        <RNTextInput
          style={styles.input}
          placeholderTextColor={colors.gray500}
          onFocus={handleFocus}
          onBlur={handleBlur}
          secureTextEntry={secureTextEntry && !isSecureTextVisible}
          {...props}
        />
        {secureTextEntry && (
          <TouchableOpacity onPress={toggleSecureTextEntry} style={styles.secureTextButton}>
            <Ionicons
              name={isSecureTextVisible ? 'eye-off' : 'eye'}
              size={20}
              color={colors.gray500}
            />
          </TouchableOpacity>
        )}
      </View>
      {error && <Text style={styles.errorText}>{error}</Text>}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing.sm,
  },
  label: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    marginBottom: spacing.xs,
    color: colors.gray800,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.gray300,
    borderRadius: borderRadius.md,
    backgroundColor: colors.gray100,
    paddingHorizontal: spacing.sm,
  },
  focusedInput: {
    borderColor: colors.primary,
    backgroundColor: colors.white,
  },
  errorInput: {
    borderColor: colors.danger,
  },
  input: {
    flex: 1,
    paddingVertical: spacing.sm,
    fontSize: typography.fontSize.md,
    color: colors.gray800,
  },
  icon: {
    marginRight: spacing.sm,
  },
  secureTextButton: {
    padding: spacing.xs,
  },
  errorText: {
    color: colors.danger,
    fontSize: typography.fontSize.xs,
    marginTop: spacing.xs,
  },
});

export default TextInput;
