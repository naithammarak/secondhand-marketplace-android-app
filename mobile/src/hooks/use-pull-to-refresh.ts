import { useCallback, useEffect, useRef } from 'react';
import { type NativeScrollEvent, type NativeSyntheticEvent, Platform } from 'react-native';

export function usePullToRefresh({
  refreshing,
  onRefresh,
}: {
  refreshing: boolean;
  onRefresh: () => void;
}) {
  const isRefreshingRef = useRef(refreshing);

  useEffect(() => {
    isRefreshingRef.current = refreshing;
  }, [refreshing]);

  const scrollYRef = useRef(0);
  const dragStartYRef = useRef<number | null>(null);
  const wheelAccumulatorRef = useRef(0);
  const wheelTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const y = event.nativeEvent.contentOffset.y;
      scrollYRef.current = y;
      if (y < -35 && !isRefreshingRef.current) {
        onRefresh();
      }
    },
    [onRefresh],
  );

  const handleWheel = useCallback(
    (e: any) => {
      if (Platform.OS !== 'web') return;
      const deltaY = typeof e.deltaY === 'number' ? e.deltaY : 0;
      if (scrollYRef.current <= 5 && deltaY < 0) {
        wheelAccumulatorRef.current += Math.abs(deltaY);
        if (wheelTimerRef.current) clearTimeout(wheelTimerRef.current);
        wheelTimerRef.current = setTimeout(() => {
          wheelAccumulatorRef.current = 0;
        }, 400);

        if (wheelAccumulatorRef.current > 60 && !isRefreshingRef.current) {
          wheelAccumulatorRef.current = 0;
          onRefresh();
        }
      }
    },
    [onRefresh],
  );

  const handlePointerDown = useCallback((e: any) => {
    if (Platform.OS !== 'web') return;
    if (scrollYRef.current <= 5) {
      dragStartYRef.current = typeof e.clientY === 'number' ? e.clientY : typeof e.pageY === 'number' ? e.pageY : null;
    }
  }, []);

  const handlePointerUp = useCallback(
    (e: any) => {
      if (Platform.OS !== 'web') return;
      if (dragStartYRef.current !== null) {
        const currentY = typeof e.clientY === 'number' ? e.clientY : typeof e.pageY === 'number' ? e.pageY : dragStartYRef.current;
        const distance = currentY - dragStartYRef.current;
        dragStartYRef.current = null;
        if (distance > 50 && scrollYRef.current <= 5 && !isRefreshingRef.current) {
          onRefresh();
        }
      }
    },
    [onRefresh],
  );

  return {
    handleScroll,
    handleWheel,
    handlePointerDown,
    handlePointerUp,
  };
}
