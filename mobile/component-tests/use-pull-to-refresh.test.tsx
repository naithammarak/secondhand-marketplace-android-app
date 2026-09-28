import { renderHook, act } from '@testing-library/react-native';
import { usePullToRefresh } from '@/hooks/use-pull-to-refresh';
import { Platform } from 'react-native';

describe('usePullToRefresh', () => {
  test('triggers onRefresh on negative scroll offset (overscroll)', () => {
    const onRefresh = jest.fn();
    const { result } = renderHook(() =>
      usePullToRefresh({ refreshing: false, onRefresh }),
    );

    act(() => {
      result.current.handleScroll({
        nativeEvent: { contentOffset: { y: -45, x: 0 } },
      } as any);
    });

    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  test('does not trigger onRefresh on regular downward scroll offset', () => {
    const onRefresh = jest.fn();
    const { result } = renderHook(() =>
      usePullToRefresh({ refreshing: false, onRefresh }),
    );

    act(() => {
      result.current.handleScroll({
        nativeEvent: { contentOffset: { y: 100, x: 0 } },
      } as any);
    });

    expect(onRefresh).not.toHaveBeenCalled();
  });

  test('triggers onRefresh on web mouse wheel up when at top', () => {
    const origPlatform = Platform.OS;
    (Platform as any).OS = 'web';
    try {
      const onRefresh = jest.fn();
      const { result } = renderHook(() =>
        usePullToRefresh({ refreshing: false, onRefresh }),
      );

      act(() => {
        result.current.handleScroll({
          nativeEvent: { contentOffset: { y: 0, x: 0 } },
        } as any);
        result.current.handleWheel({ deltaY: -70 });
      });

      expect(onRefresh).toHaveBeenCalledTimes(1);
    } finally {
      (Platform as any).OS = origPlatform;
    }
  });

  test('triggers onRefresh on web pointer drag downwards when at top', () => {
    const origPlatform = Platform.OS;
    (Platform as any).OS = 'web';
    try {
      const onRefresh = jest.fn();
      const { result } = renderHook(() =>
        usePullToRefresh({ refreshing: false, onRefresh }),
      );

      act(() => {
        result.current.handleScroll({
          nativeEvent: { contentOffset: { y: 0, x: 0 } },
        } as any);
        result.current.handlePointerDown({ clientY: 100 });
        result.current.handlePointerUp({ clientY: 170 });
      });

      expect(onRefresh).toHaveBeenCalledTimes(1);
    } finally {
      (Platform as any).OS = origPlatform;
    }
  });

  test('does not trigger onRefresh when already refreshing', () => {
    const onRefresh = jest.fn();
    const { result } = renderHook(() =>
      usePullToRefresh({ refreshing: true, onRefresh }),
    );

    act(() => {
      result.current.handleScroll({
        nativeEvent: { contentOffset: { y: -50, x: 0 } },
      } as any);
    });

    expect(onRefresh).not.toHaveBeenCalled();
  });
});
