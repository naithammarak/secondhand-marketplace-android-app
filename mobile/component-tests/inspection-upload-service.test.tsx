import { File, Paths } from 'expo-file-system';
import { convertFormDataAsync } from 'expo/src/winter/fetch/convertFormData';

import { inspectionError } from '@/inspections/use-inspection-api';
import { createInspectionService, InspectionServiceError } from '@/services/inspection-service';

// Exercise Expo's real multipart conversion with its bundled native filesystem
// mock. A fetch mock alone misses unsupported URI parts in SDK 57.
const { installFormDataPatch } = jest.requireActual('expo/src/winter/FormData');
const NativeFormData = jest.requireActual('react-native/Libraries/Network/FormData').default;

const reply = (body: unknown) => ({ ok: true, status: 201, json: async () => body }) as Response;

describe('inspection evidence and courier proof upload with Expo SDK 57', () => {
  const originalFormData = globalThis.FormData;

  beforeEach(() => {
    globalThis.FormData = installFormDataPatch(NativeFormData);
    jest.spyOn(File.prototype, 'type', 'get').mockImplementation(function (this: File) {
      return this.uri.endsWith('.png') ? 'image/png' : 'image/jpeg';
    });
  });

  afterEach(() => {
    globalThis.FormData = originalFormData;
    jest.restoreAllMocks();
  });

  const cases = [
    ['upload', '/inspections/4/evidence', { evidence: { id: 3, mime_type: 'image/jpeg', size_bytes: 4 } }],
    ['uploadProof', '/courier/shipments/4/proofs', { proof: { id: 5, mime_type: 'image/jpeg', size_bytes: 4, url: '/shipment-delivery-proofs/5' } }],
  ] as const;

  test.each(cases)('%s serializes a native picked file (no browser File)', async (method, path, body) => {
    const file = new File(Paths.cache, `inspection-${method}.jpg`);
    file.create({ overwrite: true });
    file.write(new Uint8Array([65, 66, 67, 68]));
    const fetcher = jest.fn(async (_url: string, init: RequestInit) => {
      const result = await convertFormDataAsync(init.body as FormData);
      const multipart = new TextDecoder().decode(result.body);
      expect(multipart).toContain('name="file"');
      expect(multipart).toContain(`filename="${file.name}"`);
      expect(multipart).toContain('content-type: image/jpeg');
      expect(multipart).toContain('ABCD');
      expect(init.headers).toEqual({ Authorization: 'Bearer tok', 'Idempotency-Key': 'key-1' });
      return reply(body);
    });
    const service = createInspectionService({ baseUrl: 'https://api.test', fetch: fetcher });
    await expect(service[method]('tok', 4, { uri: file.uri, name: file.name, type: 'image/jpeg' }, 'key-1'))
      .resolves.toEqual(body);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][0]).toBe(`https://api.test${path}`);
    file.delete();
  });

  test.each(cases)('%s keeps the browser File path', async (method, _path, body) => {
    const browserFile = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' });
    const fetcher = jest.fn(async (_url: string, init: RequestInit) => {
      const multipart = await convertFormDataAsync(init.body as FormData);
      expect(new TextDecoder().decode(multipart.body)).toContain('content-type: image/png');
      return reply(body);
    });
    const service = createInspectionService({ baseUrl: 'https://api.test', fetch: fetcher });
    await expect(service[method]('tok', 4, { uri: 'blob:web', name: 'web.png', type: 'image/png', file: browserFile }, 'key-2'))
      .resolves.toEqual(body);
  });

  test.each(cases)('%s rejects a missing local file before any request', async method => {
    const fetcher = jest.fn();
    const service = createInspectionService({ baseUrl: 'https://api.test', fetch: fetcher });
    const outcome = service[method]('tok', 4, { uri: 'file:///missing-inspection.jpg', name: 'x.jpg', type: 'image/jpeg' }, 'key-3');
    await expect(outcome).rejects.toBeInstanceOf(InspectionServiceError);
    await expect(outcome).rejects.toMatchObject({ status: 422, code: 'local_file_unreadable' });
    expect(inspectionError(await outcome.catch(error => error))).toBe('อ่านรูปภาพไม่สำเร็จ กรุณาเลือกรูปใหม่');
    expect(fetcher).not.toHaveBeenCalled();
  });
});
