import { act, renderHook } from '@testing-library/react-native';
import { useInspectionApi, useInspectionMutation } from '@/inspections/use-inspection-api';
import { InspectionServiceError } from '@/services/inspection-service';

const mockGetSession = jest.fn();
const mockRefresh = jest.fn();
const mockClient = { auth: { getSession: mockGetSession, refreshSession: mockRefresh } };
let mockAuth: any;
jest.mock('@/auth/auth-provider', () => ({ useAuth: () => mockAuth }));
jest.mock('@/auth/supabase-client', () => ({ getSupabaseClient: () => mockClient }));
jest.mock('expo-crypto', () => ({ randomUUID: jest.fn(() => 'stable-mutation-key') }));
beforeEach(() => {
  jest.clearAllMocks();
  mockAuth = { session: { user: { id: 'owner-a' }, access_token: 'original' } };
  mockGetSession.mockResolvedValue({ data: { session: { user: { id: 'owner-a' }, access_token: 'current' } } });
  mockRefresh.mockResolvedValue({ data: { session: { user: { id: 'owner-a' }, access_token: 'refreshed' } } });
});
test('request refreshes an expired token once and never retries as another account', async () => {
  const { result } = renderHook(() => useInspectionApi());
  const request = jest.fn().mockRejectedValueOnce(new InspectionServiceError(401, 'unauthorized')).mockResolvedValue('ok');
  await expect(result.current.call(request)).resolves.toBe('ok');
  expect(request.mock.calls).toEqual([['current'], ['refreshed']]);
  mockRefresh.mockResolvedValue({ data: { session: { user: { id: 'owner-b' }, access_token: 'other' } } });
  request.mockReset().mockRejectedValue(new InspectionServiceError(401, 'unauthorized'));
  await expect(result.current.call(request)).rejects.toHaveProperty('status', 401);
  expect(request).toHaveBeenCalledTimes(1);
});
test('old account cannot start an inspection request after switching sessions', async () => {
  const { result } = renderHook(() => useInspectionApi());
  mockGetSession.mockResolvedValue({ data: { session: { user: { id: 'owner-b' }, access_token: 'other' } } });
  const request = jest.fn();
  await expect(result.current.call(request)).rejects.toHaveProperty('status', 401);
  expect(request).not.toHaveBeenCalled();
});
test('uncertain mutation retries reuse their key, and duplicate presses send once', async () => {
  const { result } = renderHook(() => useInspectionMutation());
  const operation = jest.fn().mockRejectedValueOnce(new InspectionServiceError(0, 'timeout')).mockResolvedValue('ok');
  await act(async () => { await result.current.mutate('ship:42:payload', operation); });
  await act(async () => { await result.current.mutate('ship:42:payload', operation); });
  expect(operation.mock.calls).toEqual([['stable-mutation-key'], ['stable-mutation-key']]);
  let finish!: () => void;
  const pending = jest.fn(() => new Promise<void>(resolve => { finish = resolve; }));
  let first!: Promise<boolean>;
  await act(async () => {
    first = result.current.mutate('delivery:42', pending);
    expect(await result.current.mutate('delivery:42', pending)).toBe(false);
  });
  expect(pending).toHaveBeenCalledTimes(1);
  await act(async () => { finish(); await first; });
});
test('unmounted account cannot trigger navigation after a mutation returns', async () => {
  const { result, unmount } = renderHook(() => useInspectionMutation());
  let finish!: () => void;
  let completion!: Promise<boolean>;
  act(() => { completion = result.current.mutate('result:42', () => new Promise<void>(resolve => { finish = resolve; })); });
  unmount();
  finish();
  expect(await completion).toBe(false);
});
