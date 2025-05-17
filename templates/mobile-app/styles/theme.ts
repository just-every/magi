/**
 * Application theme configuration
 * Contains shared styles, colors, and spacing values
 */

/**
 * Color palette for the application
 * Use semantic naming for colors to allow easy theming
 */
export const colors = {
  // Primary colors
  primary: '#007bff',
  primaryDark: '#0056b3',
  primaryLight: '#69a9ff',

  // Secondary colors
  secondary: '#6c757d',
  secondaryDark: '#494f54',
  secondaryLight: '#a1a8ae',

  // Semantic colors
  success: '#28a745',
  danger: '#dc3545',
  warning: '#ffc107',
  info: '#17a2b8',

  // Grayscale
  white: '#ffffff',
  light: '#f8f9fa',
  gray100: '#f8f9fa',
  gray200: '#e9ecef',
  gray300: '#dee2e6',
  gray400: '#ced4da',
  gray500: '#adb5bd',
  gray600: '#6c757d',
  gray700: '#495057',
  gray800: '#343a40',
  gray900: '#212529',
  black: '#000000',

  // Text colors
  text: '#212529',
  textMuted: '#6c757d',
  textLight: '#f8f9fa',

  // Background colors
  background: '#ffffff',
  backgroundDark: '#f8f9fa',
};

/**
 * Spacing values for consistent layout
 * Use these values for padding, margin, and positioning
 */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

/**
 * Typography settings for the application
 */
export const typography = {
  fontFamily: {
    base: 'System', // Default system font
    heading: 'System-Bold', // For headings
    monospace: 'Courier', // For code
  },
  fontSize: {
    xs: 12,
    sm: 14,
    md: 16,
    lg: 18,
    xl: 20,
    xxl: 24,
    xxxl: 32,
  },
  lineHeight: {
    tight: 1.25,
    normal: 1.5,
    loose: 1.75,
  },
  fontWeight: {
    normal: '400',
    medium: '500',
    bold: '700',
  },
};

/**
 * Border radius values for consistent UI elements
 */
export const borderRadius = {
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  pill: 9999,
  circular: '50%',
};

/**
 * Shadow styles for depth and elevation
 */
export const shadows = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.18,
    shadowRadius: 1.0,
    elevation: 1,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.20,
    shadowRadius: 3.0,
    elevation: 3,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.22,
    shadowRadius: 5.0,
    elevation: 6,
  },
};

/**
 * Z-index values for controlling element stacking
 */
export const zIndex = {
  negative: -1,
  zero: 0,
  low: 10,
  medium: 100,
  high: 1000,
  modal: 2000,
  toast: 3000,
};
