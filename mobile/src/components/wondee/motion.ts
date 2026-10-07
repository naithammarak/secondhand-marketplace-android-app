import { useEffect, useState } from 'react';
import { AccessibilityInfo, AppState } from 'react-native';

/** Fail static until the user's preference is known; stop in background. */
export function useMotionAllowed(enabled = true) {
  const [reduced, setReduced] = useState(true);
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  useEffect(() => {
    let alive = true;
    void AccessibilityInfo.isReduceMotionEnabled().then(value => { if (alive) setReduced(value); }).catch(() => undefined);
    const motion = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    const app = AppState.addEventListener('change', state => setForeground(state === 'active'));
    return () => { alive = false; motion.remove(); app.remove(); };
  }, []);
  return enabled && !reduced && foreground;
}
