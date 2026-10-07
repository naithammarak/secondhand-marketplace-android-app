import { File, Paths } from 'expo-file-system';
import { convertFormDataAsync } from 'expo/src/winter/fetch/convertFormData';

import { createImageUploadService } from '@/services/image-upload-service';
import { getProductImageMeta } from '@/services/product-service';

// Exercise Expo's real multipart conversion with its bundled native filesystem
// mock. A fetch mock alone misses unsupported URI parts in SDK 57.
const { installFormDataPatch } = jest.requireActual('expo/src/winter/FormData');
const NativeFormData = jest.requireActual('react-native/Libraries/Network/FormData').default;

describe('product image upload with Expo SDK 57', () => {
  const originalFormData = globalThis.FormData;

  beforeEach(() => {
    globalThis.FormData = installFormDataPatch(NativeFormData);
    // The filesystem mock stores bytes but has no OS MIME resolver.
    jest.spyOn(File.prototype, 'type', 'get').mockImplementation(function (this: File) {
      return this.uri.endsWith('.png') ? 'image/png' : 'image/jpeg';
    });
  });

  afterEach(() => {
    globalThis.FormData = originalFormData;
    jest.restoreAllMocks();
  });

  test.each(['jpg', 'png'])('serializes a native %s file and registers the returned upload', async extension => {
    const file = new File(Paths.cache, `product-upload-regression.${extension}`);
    file.create({ overwrite: true });
    const bytes = new Uint8Array([65, 66, 67, 68]);
    file.write(bytes);
    expect(new File(file.uri).exists).toBe(true);
    const fetcher = jest.fn(async (_url: string, init: RequestInit) => {
      const result = await convertFormDataAsync(init.body as FormData);
      const multipart = new TextDecoder().decode(result.body);
      expect(multipart).toContain(`filename="${file.name}"`);
      expect(multipart).toContain(`content-type: image/${extension === 'jpg' ? 'jpeg' : 'png'}`);
      expect(multipart).toContain('ABCD');
      expect(init.headers).toEqual({ Authorization: 'Bearer synthetic-token' });
      return {
        ok: true,
        json: async () => ({ data: { upload_id: 77, image_url: 'https://example.test/signed-image' } }),
      } as Response;
    });
    const service = createImageUploadService({ baseUrl: 'https://example.test', fetch: fetcher });
    const uploaded = await service.uploadImage({ uri: file.uri, name: file.name, type: file.type }, 'synthetic-token');
    expect(uploaded.uploadId).toBe(77);
    expect(getProductImageMeta(uploaded.url)?.uploadId).toBe(77);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][0]).toBe('https://example.test/products/images/upload');
    file.delete();
  });

  test('preserves the browser File upload path', async () => {
    const browserFile = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' });
    const fetcher = jest.fn(async (_url: string, init: RequestInit) => {
      const multipart = await convertFormDataAsync(init.body as FormData);
      expect(new TextDecoder().decode(multipart.body)).toContain('content-type: image/png');
      return { ok: true, json: async () => ({ data: { upload_id: 78, image_url: 'https://example.test/web-image' } }) } as Response;
    });
    const service = createImageUploadService({ baseUrl: 'https://example.test', fetch: fetcher });
    await expect(service.uploadImage({ uri: 'blob:browser-image', file: browserFile }, 'synthetic-token'))
      .resolves.toMatchObject({ uploadId: 78 });
  });

  test('rejects a missing local file before sending a request', async () => {
    const fetcher = jest.fn();
    const service = createImageUploadService({ baseUrl: 'https://example.test', fetch: fetcher });
    await expect(service.uploadImage({ uri: 'file:///missing-product-upload.jpg' }, 'synthetic-token'))
      .rejects.toMatchObject({ kind: 'validation-error', message: 'อ่านรูปภาพไม่สำเร็จ กรุณาเลือกรูปใหม่' });
    expect(fetcher).not.toHaveBeenCalled();
  });

  test('does not send after cancellation while resolving the session token', async () => {
    const file = new File(Paths.cache, 'cancelled-product-upload.jpg');
    file.create({ overwrite: true });
    file.write(new Uint8Array([1]));
    let resolveToken!: (value: string) => void;
    const token = new Promise<string>(resolve => { resolveToken = resolve; });
    const fetcher = jest.fn();
    const controller = new AbortController();
    const service = createImageUploadService({
      baseUrl: 'https://example.test', fetch: fetcher, getAccessToken: () => token,
    });
    const upload = service.uploadImage({ uri: file.uri }, undefined, controller.signal);
    await Promise.resolve();
    controller.abort();
    resolveToken('synthetic-token');
    await expect(upload).rejects.toMatchObject({ name: 'AbortError' });
    await Promise.resolve();
    expect(fetcher).not.toHaveBeenCalled();
    file.delete();
  });
});
