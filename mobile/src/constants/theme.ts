import '@/global.css';
import { Platform } from 'react-native';

// Shared tokens from the marketplace design.
export const Colors = {
  light: {
    text: '#141827', textSecondary: '#5c6478', background: '#eef1f6',
    surface: '#ffffff', backgroundElement: '#f7f9fc', backgroundSelected: '#e3eaf9',
    border: '#dce1eb', primary: '#24407e', onPrimary: '#ffffff', accent: '#136c66',
    success: '#2f7d5a', successSoft: '#e2f2ea', warning: '#a4711a', warningSoft: '#fbeed6',
    danger: '#bf3030', dangerSoft: '#fae3e3',
  },
  dark: {
    text: '#eaeef7', textSecondary: '#a2abc0', background: '#0f1219',
    surface: '#171b25', backgroundElement: '#1e2331', backgroundSelected: '#1e2941',
    border: '#2b3243', primary: '#4b6fc4', onPrimary: '#ffffff', accent: '#4fb3a8',
    success: '#5cbb8c', successSoft: '#182a22', warning: '#d8a44a', warningSoft: '#2c2417',
    danger: '#e07373', dangerSoft: '#2d1c1c',
  },
} as const;
export type ThemeColor = keyof typeof Colors.light;
export type MarketplaceTheme = { [K in ThemeColor]: string };
export const Fonts = {
  sans: 'NotoSansThai-Regular', bodyMedium: 'NotoSansThai-Medium',
  display: 'Kanit-Medium', displayBold: 'Kanit-SemiBold',
  serif: 'serif', rounded: 'Kanit-Medium',
  mono: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
};
export const Spacing = { half: 2, one: 4, two: 8, three: 16, four: 24, five: 32, six: 64 } as const;
export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
