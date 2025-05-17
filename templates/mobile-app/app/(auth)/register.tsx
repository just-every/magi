import { useState } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, Alert, ScrollView } from 'react-native';
import { Stack, Link, router } from 'expo-router';
import { Formik, FormikProps } from 'formik';
import * as Yup from 'yup';
import { useAuth } from '@/hooks/useAuth';
import Button from '@/components/ui/Button';
import TextInput from '@/components/ui/TextInput';
import { colors, spacing, typography } from '@/styles/theme';

// Form values interface for proper typing
interface RegisterFormValues {
  name: string;
  email: string;
  password: string;
  confirmPassword: string;
}

const RegisterSchema = Yup.object().shape({
  name: Yup.string().required('Name is required'),
  email: Yup.string().email('Invalid email').required('Email is required'),
  password: Yup.string()
    .min(8, 'Password must be at least 8 characters')
    .required('Password is required'),
  confirmPassword: Yup.string()
    .oneOf([Yup.ref('password')], 'Passwords must match')
    .required('Please confirm your password'),
});

export default function Register() {
  const { register } = useAuth();
  const [isLoading, setIsLoading] = useState(false);

  const handleRegister = async (values: RegisterFormValues) => {
    try {
      setIsLoading(true);
      await register(values.name, values.email, values.password);
      Alert.alert(
        'Registration Successful',
        'Your account has been created successfully!',
        [{ text: 'OK', onPress: () => router.replace('/(tabs)/home') }]
      );
    } catch (error) {
      Alert.alert('Registration Failed', 'There was an error creating your account. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.scrollContainer}>
      <View style={styles.container}>
        <Stack.Screen options={{ title: 'Create Account' }} />

        <Text style={styles.title}>Join Us</Text>
        <Text style={styles.subtitle}>Create a new account</Text>

        <Formik
          initialValues={{ name: '', email: '', password: '', confirmPassword: '' }}
          validationSchema={RegisterSchema}
          onSubmit={handleRegister}
        >
          {({ handleChange, handleBlur, handleSubmit, values, errors, touched }: FormikProps<RegisterFormValues>) => (
            <View style={styles.form}>
              <TextInput
                label="Full Name"
                placeholder="Enter your name"
                value={values.name}
                onChangeText={handleChange('name')}
                onBlur={handleBlur('name')}
                autoCapitalize="words"
                error={touched.name && errors.name}
                icon="person-outline"
              />

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

              <TextInput
                label="Password"
                placeholder="Create a password"
                value={values.password}
                onChangeText={handleChange('password')}
                onBlur={handleBlur('password')}
                secureTextEntry
                error={touched.password && errors.password}
                icon="lock-closed-outline"
              />

              <TextInput
                label="Confirm Password"
                placeholder="Confirm your password"
                value={values.confirmPassword}
                onChangeText={handleChange('confirmPassword')}
                onBlur={handleBlur('confirmPassword')}
                secureTextEntry
                error={touched.confirmPassword && errors.confirmPassword}
                icon="checkmark-outline"
              />

              <Button
                title="Create Account"
                onPress={handleSubmit}
                loading={isLoading}
                style={styles.button}
              />
            </View>
          )}
        </Formik>

        <View style={styles.footer}>
          <Text style={styles.footerText}>Already have an account?</Text>
          <Link href="/(auth)/login" asChild>
            <TouchableOpacity>
              <Text style={styles.link}>Sign In</Text>
            </TouchableOpacity>
          </Link>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollContainer: {
    flexGrow: 1,
  },
  container: {
    flex: 1,
    padding: spacing.lg,
    backgroundColor: colors.white,
  },
  title: {
    fontSize: typography.fontSize.xxxl,
    fontWeight: typography.fontWeight.bold,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  subtitle: {
    fontSize: typography.fontSize.md,
    color: colors.textMuted,
    marginBottom: spacing.xl,
  },
  form: {
    gap: spacing.md,
  },
  button: {
    marginTop: spacing.md,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: spacing.xl,
    marginBottom: spacing.xl,
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
