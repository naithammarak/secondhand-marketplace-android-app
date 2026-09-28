import { act, renderHook, waitFor } from '@testing-library/react-native';
import { AccessibilityInfo, AppState, type AppStateStatus } from 'react-native';
import { useMotionAllowed } from '@/components/wondee/motion';
import { Colors } from '@/constants/theme';
afterEach(() => jest.restoreAllMocks());
test('motion responds to reduced motion, background, blur, and cleans up listeners', async () => {
  let motion!: (value: boolean) => void; let app!: (value: AppStateStatus) => void;
  const removeMotion = jest.fn(); const removeApp = jest.fn();
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
  jest.spyOn(AccessibilityInfo, 'addEventListener').mockImplementation(((_name: string, callback: (value: boolean) => void) => { motion = callback; return { remove: removeMotion }; }) as any);
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_name, callback) => { app = callback; return { remove: removeApp }; });
  const hook = renderHook<boolean, { enabled: boolean }>(({ enabled }) => useMotionAllowed(enabled), { initialProps: { enabled: true } });
  await act(async () => { app('active'); });
  await waitFor(() => expect(hook.result.current).toBe(true));
  act(() => motion(true)); expect(hook.result.current).toBe(false);
  act(() => { motion(false); app('background'); }); expect(hook.result.current).toBe(false);
  act(() => app('active')); expect(hook.result.current).toBe(true);
  hook.rerender({ enabled: false }); expect(hook.result.current).toBe(false);
  hook.unmount(); expect(removeMotion).toHaveBeenCalledTimes(1); expect(removeApp).toHaveBeenCalledTimes(1);
});
function luminance(hex: string) {
  const channels = [1,3,5].map(start => parseInt(hex.slice(start,start+2),16)/255).map(x => x <= .04045 ? x/12.92 : ((x+.055)/1.055)**2.4);
  return channels[0]*.2126+channels[1]*.7152+channels[2]*.0722;
}
function contrast(a: string, b: string) { const x=luminance(a),y=luminance(b); return (Math.max(x,y)+.05)/(Math.min(x,y)+.05); }
test.each(['light','dark'] as const)('%s semantic text pairs meet 4.5:1 and input/focus boundaries 3:1', scheme => {
  const t=Colors[scheme];
  const pairs = [[t.text,t.background],[t.text,t.surface],[t.textSecondary,t.surface],[t.textSecondary,t.input],[t.onPrimary,t.primary],[t.onDanger,t.danger],[t.upgradeText,t.upgrade],[t.accent,t.surface],[t.danger,t.surface],[t.warning,t.surface],[t.info,t.surface]];
  for(const [foreground,background] of pairs) expect(contrast(foreground,background)).toBeGreaterThanOrEqual(4.5);
  for(const border of [t.focus,t.inputBorder]) expect(contrast(border,t.input)).toBeGreaterThanOrEqual(3);
});
