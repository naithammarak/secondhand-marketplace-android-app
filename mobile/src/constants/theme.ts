import '@/global.css';
import { Platform } from 'react-native';

// One semantic palette for navigation, forms, content, and overlays.
export const Colors = {
  light: {
    text: '#0f172a', textSecondary: '#475569', background: '#f8fafc',
    surface: '#ffffff', backgroundElement: '#f1f5f9', backgroundSelected: '#ecfdf5',
    border: '#e2e8f0', primary: '#047857', onPrimary: '#ffffff', accent: '#047857',
    brand: '#059669', elevated: '#ffffff', input: '#ffffff', inputBorder: '#64748b',
    focus: '#047857', upgrade: '#ecfdf5', upgradeBorder: '#a7f3d0', upgradeText: '#064e3b',
    success: '#047857', successSoft: '#ecfdf5', warning: '#92400e', warningSoft: '#fffbeb',
    danger: '#b91c1c', dangerSoft: '#fef2f2', info: '#155e75', infoSoft: '#ecfeff',
    skeleton: '#cbd5e1', onDanger: '#ffffff',
  },
  dark: {
    text: '#f8fafc', textSecondary: '#94a3b8', background: '#0c0e14',
    surface: '#161b26', backgroundElement: '#0f131c', backgroundSelected: '#063d32',
    border: '#1e293b', primary: '#10b981', onPrimary: '#022c22', accent: '#34d399',
    brand: '#10b981', elevated: '#1e2433', input: '#1e293b', inputBorder: '#64748b',
    focus: '#10b981', upgrade: '#063d32', upgradeBorder: '#0f766e', upgradeText: '#d1fae5',
    success: '#34d399', successSoft: '#063d32', warning: '#fbbf24', warningSoft: '#38280b',
    danger: '#fca5a5', dangerSoft: '#421c23', info: '#67e8f9', infoSoft: '#15313d',
    skeleton: '#1e293b', onDanger: '#450a0a',
  },
} as const;
export type ThemeColor = keyof typeof Colors.light;
export type MarketplaceTheme = { [K in ThemeColor]: string };
export const Fonts = {
  sans: 'Prompt-Regular', bodyMedium: 'Prompt-Medium', display: 'Prompt-SemiBold',
  displayBold: 'Prompt-Bold', extraBold: 'Prompt-ExtraBold', wordmark: 'PlusJakartaSans',
  serif: 'serif', rounded: 'Prompt-Medium', mono: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
};
export const Spacing = { half: 2, one: 4, two: 8, three: 16, four: 24, five: 32, six: 64 } as const;
export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
