import { useState } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, Alert } from 'react-native';
import { Stack, Link, router } from 'expo-router';
import { Formik, FormikProps } from 'formik';
import * as Yup from 'yup';
import Button from '@/components/ui/Button';
import TextInput from '@/components/ui/TextInput';
import { colors, spacing, typography } from '@/styles/theme';

// Form values interface for proper typing
interface ForgotPasswordFormValues {
  email: string;
}

const ForgotPasswordSchema = Yup.object().shape({
  email: Yup.string().email('Invalid email').required('Email is required'),
});

export default function ForgotPassword() {
  const [isLoading, setIsLoading] = useState(false);

  const handleForgotPassword = async (values: ForgotPasswordFormValues) => {
    try {
      setIsLoading(true);
      // In a real app, this would call an API endpoint to trigger password reset
      // For demo purposes, we'll just simulate a delay
      await new Promise(resolve => setTimeout(resolve, 1000));

      Alert.alert(
        'Reset Link Sent',
        `Instructions to reset your password have been sent to ${values.email}`,
        [{ text: 'Back to Login', onPress: () => router.replace('/(auth)/login') }]
      );
    } catch (error) {
      Alert.alert('Error', 'Failed to send password reset instructions. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: 'Reset Password' }} />

      <Text style={styles.title}>Forgot Password?</Text>
      <Text style={styles.subtitle}>
        Enter your email address and we'll send you instructions to reset your password.
      </Text>

      <Formik
        initialValues={{ email: '' }}
        validationSchema={ForgotPasswordSchema}
        onSubmit={handleForgotPassword}
      >
        {({ handleChange, handleBlur, handleSubmit, values, errors, touched }: FormikProps<ForgotPasswordFormValues>) => (
          <View style={styles.form}>
            <TextInput
              label="Email"
              placeholder="Enter your email"
              value={values.email}
              onChangeText={handleChange('email')}
              onBlur={handleBlur('email')}
              keyboardType="email-address"
              autoCapitalize="none"
              error={touched.email && errors.email}
              icon="mail-outline"
            />

            <Button
              title="Send Reset Instructions"
              onPress={handleSubmit}
              loading={isLoading}
              style={styles.button}
            />
          </View>
        )}
      </Formik>

      <View style={styles.footer}>
        <Text style={styles.footerText}>Remembered your password?</Text>
        <Link href="/(auth)/login" asChild>
          <TouchableOpacity>
            <Text style={styles.link}>Back to Login</Text>
          </TouchableOpacity>
        </Link>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: spacing.lg,
    backgroundColor: colors.white,
  },
  title: {
    fontSize: typography.fontSize.xxxl,
    fontWeight: typography.fontWeight.bold,
    marginTop: spacing.xxl,
    marginBottom: spacing.sm,
  },
  subtitle: {
    fontSize: typography.fontSize.md,
    color: colors.textMuted,
    marginBottom: spacing.xl,
    lineHeight: typography.lineHeight.normal * typography.fontSize.md,
  },
  form: {
    gap: spacing.lg,
  },
  button: {
    marginTop: spacing.md,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: spacing.xl,
  },
  footerText: {
    color: colors.textMuted,
  },
  link: {
    color: colors.primary,
    fontWeight: typography.fontWeight.medium,
    marginLeft: spacing.xs,
  },
});
