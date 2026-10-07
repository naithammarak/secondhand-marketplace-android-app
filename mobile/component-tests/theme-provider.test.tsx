import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Button, Text } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { WondeeThemeProvider, useThemePreference, THEME_STORAGE_KEY } from '@/theme/theme-provider';
let mockSystem = 'light';
jest.mock('react-native/Libraries/Utilities/useColorScheme', () => ({ __esModule: true, default: () => mockSystem }));
function Probe() {
  const theme = useThemePreference();
  return <><Text>{`${theme.preference}/${theme.scheme}/${theme.ready}`}</Text><Button title="light" onPress={() => theme.setPreference('light')} /><Button title="system" onPress={() => theme.setPreference('system')} /></>;
}
const App = () => <WondeeThemeProvider><Probe /></WondeeThemeProvider>;
beforeEach(async () => { await AsyncStorage.clear(); mockSystem = 'light'; });
afterEach(() => jest.restoreAllMocks());
test('defaults to dark, saves a preference and restores it on relaunch', async () => {
  const view = render(<App />);
  await screen.findByText('dark/dark/true');
  fireEvent.press(screen.getByText('light'));
  await waitFor(() => expect(AsyncStorage.setItem).toHaveBeenCalledWith(THEME_STORAGE_KEY, 'light'));
  view.unmount();
  render(<App />);
  await screen.findByText('light/light/true');
});
test('system follows OS changes without rewriting a saved explicit theme', async () => {
  const view = render(<App />); await screen.findByText('dark/dark/true');
  fireEvent.press(screen.getByText('system'));
  expect(screen.getByText('system/light/true')).toBeTruthy();
  mockSystem = 'dark'; view.rerender(<App />);
  expect(screen.getByText('system/dark/true')).toBeTruthy();
});
test('a delayed initial read cannot overwrite a user choice', async () => {
  let release!: (value: string) => void;
  jest.spyOn(AsyncStorage, 'getItem').mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
  render(<App />); fireEvent.press(screen.getByText('light'));
  await act(async () => { release('dark'); });
  expect(screen.getByText('light/light/true')).toBeTruthy();
});
test.each(['invalid', 'failure'])('%s storage falls back without blocking startup', async kind => {
  if (kind === 'failure') jest.spyOn(AsyncStorage, 'getItem').mockRejectedValueOnce(new Error('storage unavailable'));
  else await AsyncStorage.setItem(THEME_STORAGE_KEY, 'unknown');
  render(<App />); await screen.findByText('dark/dark/true');
});
