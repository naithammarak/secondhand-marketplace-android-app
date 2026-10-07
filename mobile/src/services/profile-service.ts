import { createPrivateApi } from './profile-review-api.ts';
import type { AccountRole } from './me-service';

export const POLICY_VERSION = 'submission-2026-10-01';
export type Profile = {
  id: number; full_name: string; email: string; role: AccountRole;
  status: 'ACTIVE' | 'SUSPENDED' | 'CLOSED';
  privacy_policy_version: string | null; privacy_acknowledged_at: string | null;
};

export function createProfileService(options: Parameters<typeof createPrivateApi>[0]) {
  const request = createPrivateApi(options);
  return {
    get: (token: string, signal?: AbortSignal) => request<Profile>('/profile', token, {}, signal),
    save: (token: string, fullName: string, signal?: AbortSignal) => request<Profile>('/profile', token,
      { method: 'PATCH', body: JSON.stringify({ full_name: fullName }) }, signal),
    acknowledge: (token: string, signal?: AbortSignal) => request<Profile>('/profile/policy-acknowledgement', token,
      { method: 'POST', body: JSON.stringify({ policy_version: POLICY_VERSION }) }, signal),
  };
}
