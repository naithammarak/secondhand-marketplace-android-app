import { View, StyleSheet, type ViewStyle } from 'react-native';
import Svg, { Circle, Ellipse, Line, Path, Rect } from 'react-native-svg';

export type GeometricMascotShape = 'drop' | 'capsule' | 'squircle' | 'triangle' | 'circle';

export interface MascotPalette {
  shape: GeometricMascotShape;
  color: string;
  eyeColor: string;
  name: string;
}

export const MASCOT_PALETTES: MascotPalette[] = [
  { shape: 'drop', color: '#10b981', eyeColor: '#022c22', name: 'น้องวนดี (เขียว)' },
  { shape: 'capsule', color: '#34d399', eyeColor: '#064e3b', name: 'น้องแคปซูล (มินต์)' },
  { shape: 'squircle', color: '#a855f7', eyeColor: '#3b0764', name: 'น้องกล่อง (ม่วง)' },
  { shape: 'triangle', color: '#f59e0b', eyeColor: '#451a03', name: 'น้องพีก (ส้ม)' },
  { shape: 'circle', color: '#64748b', eyeColor: '#0f172a', name: 'น้องโมจิ (เทา)' },
  { shape: 'capsule', color: '#06b6d4', eyeColor: '#083344', name: 'น้องแคปซูล (ฟ้า)' },
  { shape: 'squircle', color: '#ec4899', eyeColor: '#500724', name: 'น้องกล่อง (ชมพู)' },
  { shape: 'triangle', color: '#10b981', eyeColor: '#022c22', name: 'น้องพีก (เขียว)' },
  { shape: 'circle', color: '#f59e0b', eyeColor: '#451a03', name: 'น้องโมจิ (ส้ม)' },
  { shape: 'drop', color: '#3b82f6', eyeColor: '#172554', name: 'น้องวนดี (น้ำเงิน)' },
];

export function getMascotBySeed(seed: number | string): MascotPalette {
  const num = typeof seed === 'number'
    ? Math.abs(Math.floor(seed))
    : Math.abs(String(seed).split('').reduce((acc, c) => acc + c.charCodeAt(0), 0));
  return MASCOT_PALETTES[num % MASCOT_PALETTES.length];
}

export function getRandomMascot(): MascotPalette {
  return MASCOT_PALETTES[Math.floor(Math.random() * MASCOT_PALETTES.length)];
}

export interface GeometricMascotProps {
  size?: number;
  shape?: GeometricMascotShape;
  color?: string;
  eyeColor?: string;
  seed?: number | string;
  inspector?: boolean;
  style?: ViewStyle;
}

export function GeometricMascot({
  size = 40,
  shape,
  color,
  eyeColor,
  seed,
  inspector = false,
  style,
}: GeometricMascotProps) {
  const defaultPalette = seed !== undefined ? getMascotBySeed(seed) : MASCOT_PALETTES[0];
  const finalShape = shape ?? defaultPalette.shape;
  const finalColor = color ?? defaultPalette.color;
  const finalEyeColor = eyeColor ?? defaultPalette.eyeColor;

  return (
    <View
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[{ width: size, height: size }, style]}
    >
      <Svg width={size} height={size} viewBox="0 0 48 48">
        {finalShape === 'drop' && (
          <>
            <Path
              d="M24 7 C24 7 10 23 10 32 A14 14 0 0 0 38 32 C38 23 24 7 24 7 Z"
              fill={finalColor}
            />
            <Ellipse cx={20} cy={28} rx={2} ry={3.2} fill={finalEyeColor} />
            <Ellipse cx={28} cy={28} rx={2} ry={3.2} fill={finalEyeColor} />
          </>
        )}

        {finalShape === 'capsule' && (
          <>
            <Rect x={6} y={14} width={36} height={20} rx={10} fill={finalColor} />
            <Ellipse cx={19} cy={24} rx={2} ry={3} fill={finalEyeColor} />
            <Ellipse cx={29} cy={24} rx={2} ry={3} fill={finalEyeColor} />
          </>
        )}

        {finalShape === 'squircle' && (
          <>
            <Rect x={8} y={10} width={32} height={28} rx={8} fill={finalColor} />
            <Ellipse cx={19} cy={24} rx={2} ry={3.2} fill={finalEyeColor} />
            <Ellipse cx={29} cy={24} rx={2} ry={3.2} fill={finalEyeColor} />
          </>
        )}

        {finalShape === 'triangle' && (
          <>
            <Path
              d="M24 10 C26 7 30 7 32 10 L42 27 C44 31 41 35 36 35 L12 35 C7 35 4 31 6 27 Z"
              fill={finalColor}
            />
            <Ellipse cx={20} cy={25} rx={2} ry={3} fill={finalEyeColor} />
            <Ellipse cx={28} cy={25} rx={2} ry={3} fill={finalEyeColor} />
          </>
        )}

        {finalShape === 'circle' && (
          <>
            <Circle cx={24} cy={24} r={15} fill={finalColor} />
            <Ellipse cx={19} cy={23} rx={2} ry={3} fill={finalEyeColor} />
            <Ellipse cx={29} cy={23} rx={2} ry={3} fill={finalEyeColor} />
          </>
        )}

        {inspector && (
          <>
            <Circle cx={33} cy={28} r={4.5} fill="none" stroke="#ffffff" strokeWidth={2} />
            <Line
              x1={36}
              y1={31}
              x2={41}
              y2={36}
              stroke="#ffffff"
              strokeWidth={2}
              strokeLinecap="round"
            />
          </>
        )}
      </Svg>
    </View>
  );
}
