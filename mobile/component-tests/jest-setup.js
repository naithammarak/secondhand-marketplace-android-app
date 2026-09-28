jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

// Static animation boundary for React renderer tests; native motion is a separate
// device acceptance check. Reanimated 4.5's bundled mock initializes Worklets.
jest.mock('react-native-reanimated', () => ({
  __esModule: true,
  default: { View: require('react-native').View },
  useSharedValue: value => require('react').useRef({ value }).current,
  useAnimatedStyle: callback => callback(),
  cancelAnimation: jest.fn(),
  withTiming: value => value,
  withRepeat: value => value,
  withSequence: (...values) => values[values.length - 1],
  withDelay: (_delay, value) => value,
}));
