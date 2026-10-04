import { File, Paths } from 'expo-file-system';
import { convertFormDataAsync } from 'expo/src/winter/fetch/convertFormData';

import { createVerificationService } from '@/services/verification-service';
import { createVerificationStore } from '@/verification/verification-store';

// Use Expo's real serializer; accepting FormData in a fetch mock misses the
// SDK 57 failure with React Native's proprietary URI descriptors.
const { installFormDataPatch } = jest.requireActual('expo/src/winter/FormData');
const NativeFormData = jest.requireActual('react-native/Libraries/Network/FormData').default;
const pendingBody = {
  status: 'PENDING', id: 7, shop_name: 'Synthetic shop', bank_name: 'Synthetic bank',
  bank_account_name: 'Synthetic name', bank_account_last4: '0000', can_submit: false,
};
const input = {
  shopName: 'Synthetic shop', bankName: 'Synthetic bank', bankAccountName: 'Synthetic name',
  bankAccountNumber: '0000000000',
  idCard: { uri: 'file:///missing-synthetic-card.png', name: 'card.png', type: 'image/png' },
};

describe('seller verification multipart with Expo SDK 57', () => {
  const originalFormData = globalThis.FormData;

  beforeEach(() => {
    globalThis.FormData = installFormDataPatch(NativeFormData);
    // Expo's filesystem mock stores bytes but has no OS MIME resolver.
    jest.spyOn(File.prototype, 'type', 'get').mockImplementation(function (this: File) {
      if (this.uri.endsWith('.webp')) return 'image/webp';
      return this.uri.endsWith('.png') ? 'image/png' : 'image/jpeg';
    });
  });

  afterEach(() => {
    globalThis.FormData = originalFormData;
    jest.restoreAllMocks();
  });

  test.each(['jpg', 'png', 'webp'])('submits a native %s card with all fields and reads PENDING', async extension => {
    const file = new File(Paths.cache, `verification-regression.${extension}`);
    file.create({ overwrite: true });
    file.write(new Uint8Array([65, 66, 67, 68]));
    try {
      const fetcher = jest.fn(async (_url: string, init: RequestInit) => {
        const result = await convertFormDataAsync(init.body as FormData);
        const multipart = new TextDecoder().decode(result.body);
        expect(multipart).toContain('name="id_card_image"');
        expect(multipart).toContain(`filename="${file.name}"`);
        expect(multipart).toContain(`content-type: ${file.type}`);
        expect(multipart).toContain('ABCD');
        for (const field of ['shop_name', 'bank_name', 'bank_account_name', 'bank_account_number']) {
          expect(multipart).toContain(`name="${field}"`);
        }
        expect((init.body as FormData).get('bank_account_number')).toBe(input.bankAccountNumber);
        expect(init.method).toBe('POST');
        // fetch generates the multipart boundary; no Content-Type override.
        expect(init.headers).toEqual({ Authorization: 'Bearer synthetic-token' });
        return { ok: true, json: async () => pendingBody } as Response;
      });
      const service = createVerificationService({ baseUrl: 'https://example.test', fetch: fetcher });
      await expect(service.submit('synthetic-token', {
        ...input, idCard: { uri: file.uri, name: file.name, type: file.type },
      })).resolves.toMatchObject({ status: 'PENDING', canSubmit: false, bankAccountLast4: '0000' });
      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(fetcher.mock.calls[0][0]).toBe('https://example.test/verifications');
    } finally {
      file.delete();
    }
  });

  test('preserves the browser file path and filename', async () => {
    const file = new Blob([new Uint8Array([65, 66, 67, 68])], { type: 'image/png' });
    const fetcher = jest.fn(async (_url: string, init: RequestInit) => {
      const result = await convertFormDataAsync(init.body as FormData);
      const multipart = new TextDecoder().decode(result.body);
      expect(multipart).toContain('filename="card.png"');
      expect(multipart).toContain('content-type: image/png');
      expect(multipart).toContain('ABCD');
      return { ok: true, json: async () => pendingBody } as Response;
    });
    const service = createVerificationService({ baseUrl: 'https://example.test', fetch: fetcher });
    await expect(service.submit('synthetic-token', {
      ...input, idCard: { ...input.idCard, uri: 'blob:synthetic-card', file },
    })).resolves.toMatchObject({ status: 'PENDING' });
  });

  test('maps a missing native file to the card field and allows retry after reselection', async () => {
    const fetcher = jest.fn(async (_url: string, init: RequestInit) => {
      await convertFormDataAsync(init.body as FormData);
      return { ok: true, json: async () => pendingBody } as Response;
    });
    const service = createVerificationService({ baseUrl: 'https://example.test', fetch: fetcher });
    const store = createVerificationStore({
      service, getAccessToken: async () => 'synthetic-token', refreshAccessToken: async () => null,
    });
    store.setOwner('synthetic-buyer');
    await store.submit(input);
    expect(store.getSnapshot()).toMatchObject({
      submitting: false, submitError: 'validation-error', record: null,
      fieldErrors: { idCard: 'อ่านรูปบัตรไม่สำเร็จ กรุณาเลือกรูปใหม่' },
    });
    expect(fetcher).not.toHaveBeenCalled();

    const file = new File(Paths.cache, 'reselected-verification.png');
    file.create({ overwrite: true });
    file.write(new Uint8Array([1, 2, 3]));
    try {
      await store.submit({ ...input, idCard: { uri: file.uri, name: file.name, type: file.type } });
      expect(store.getSnapshot()).toMatchObject({
        submitting: false, submitError: null, fieldErrors: {}, record: { status: 'PENDING' },
      });
      expect(fetcher).toHaveBeenCalledTimes(1);
    } finally {
      file.delete();
    }
  });

  test('does not send a submission that was already cancelled', async () => {
    const fetcher = jest.fn();
    const service = createVerificationService({ baseUrl: 'https://example.test', fetch: fetcher });
    const controller = new AbortController();
    controller.abort();
    await expect(service.submit('synthetic-token', input, controller.signal))
      .rejects.toMatchObject({ name: 'AbortError' });
    expect(fetcher).not.toHaveBeenCalled();
  });

  test('does not send if the account changes while resolving its token', async () => {
    let resolveToken!: (value: string) => void;
    const token = new Promise<string>(resolve => { resolveToken = resolve; });
    const fetcher = jest.fn();
    const service = createVerificationService({ baseUrl: 'https://example.test', fetch: fetcher });
    const store = createVerificationStore({
      service, getAccessToken: () => token, refreshAccessToken: async () => null,
    });
    store.setOwner('synthetic-buyer');
    const submission = store.submit(input);
    store.setOwner('another-buyer');
    resolveToken('synthetic-token');
    await submission;
    expect(fetcher).not.toHaveBeenCalled();
    expect(store.getSnapshot()).toMatchObject({ owner: 'another-buyer', record: null, submitting: false });
  });
});
