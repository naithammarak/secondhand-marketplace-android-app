import { Slot } from 'expo-router';
import { useFonts } from 'expo-font';
import { WondeeThemeProvider } from '../../src/theme/theme-provider';
import '../../src/global.css';
export default function Layout() {
  const [loaded, error] = useFonts({
    'Prompt-Regular': require('../../assets/fonts/Prompt-Regular.ttf'),
    'Prompt-Medium': require('../../assets/fonts/Prompt-Medium.ttf'),
    'Prompt-SemiBold': require('../../assets/fonts/Prompt-SemiBold.ttf'),
    'Prompt-Bold': require('../../assets/fonts/Prompt-Bold.ttf'),
    'Prompt-ExtraBold': require('../../assets/fonts/Prompt-ExtraBold.ttf'),
    PlusJakartaSans: require('../../assets/fonts/PlusJakartaSans.ttf'),
  });
  return loaded || error ? <WondeeThemeProvider><Slot /></WondeeThemeProvider> : null;
}
