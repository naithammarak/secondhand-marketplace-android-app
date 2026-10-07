// Offline reproduction against the installed Expo multipart serializer.
// No .env, credentials, HTTP request, native filesystem, or database access.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const require = createRequire(new URL('../../../mobile/package.json', import.meta.url));
const ts = require('typescript');

// Preserve the diagnosed implementation after the working-tree fix is applied.
const diagnosedHead = 'd41720ae831afa5461fd839492aa83a9e046815f';
async function loadDiagnosedService(relativePath) {
  const serviceUrl = new URL(`../../../${relativePath}`, import.meta.url);
  const { stdout: diagnosedSource } = await promisify(execFile)('git', [
    'show', `${diagnosedHead}:${relativePath}`,
  ], { cwd: new URL('../../../', import.meta.url) });
  const serviceSource = diagnosedSource.replace(/from '(\.[^']+)'/g, (_match, relative) =>
    `from '${new URL(relative, serviceUrl).href}'`,
  );
  const compiledService = ts.transpileModule(serviceSource, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return import('data:text/javascript;base64,' + Buffer.from(compiledService).toString('base64'));
}
const [{ createImageUploadService }, { createVerificationService }] = await Promise.all([
  loadDiagnosedService('mobile/src/services/image-upload-service.ts'),
  loadDiagnosedService('mobile/src/services/verification-service.ts'),
]);

async function loadPureExpoModule(relativePath, helper = '') {
  const file = require.resolve(`expo/src/${relativePath}`);
  const source = (await readFile(file, 'utf8')).replace(/^import .*;\r?\n/gm, '');
  const output = ts.transpileModule(helper + source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return import('data:text/javascript;base64,' + Buffer.from(output).toString('base64'));
}

const { installFormDataPatch } = await loadPureExpoModule('winter/FormData.ts');
const { convertFormDataAsync } = await loadPureExpoModule(
  'winter/fetch/convertFormData.ts',
  'async function blobToArrayBufferAsync(blob) { return blob.arrayBuffer(); }\n',
);

// Only the RN storage container is emulated. append()/entries() and the
// multipart conversion below are the actual installed Expo implementations.
class RNFormDataContainer {
  constructor() { this._parts = []; }
}

const originalFormData = globalThis.FormData;
globalThis.FormData = installFormDataPatch(RNFormDataContainer);
try {
  const legacy = new FormData();
  legacy.append('file', {
    uri: 'file:///diagnostic.jpg', name: 'diagnostic.jpg', type: 'image/jpeg',
  });
  await assert.rejects(convertFormDataAsync(legacy), /Unsupported FormDataPart implementation/);
  console.log('PASS: legacy URI descriptor fails in installed Expo multipart serializer.');

  let httpRequests = 0;
  const service = createImageUploadService({
    baseUrl: 'https://diagnostic.invalid',
    fetch: async (_url, init) => {
      await convertFormDataAsync(init.body);
      httpRequests += 1;
      throw new Error('No HTTP request is permitted in this reproduction.');
    },
  });
  await assert.rejects(
    service.uploadImage({ uri: 'file:///diagnostic.jpg', name: 'diagnostic.jpg', type: 'image/jpeg' }, 'synthetic-test-token'),
    error => error.kind === 'network-error' && error.message === 'เครือข่ายขัดข้อง กรุณาลองใหม่',
  );
  assert.equal(httpRequests, 0);
  console.log('PASS: diagnosed app service reports the same Thai network error before HTTP transport.');

  const verification = createVerificationService({
    baseUrl: 'https://diagnostic.invalid',
    fetch: async (_url, init) => {
      await convertFormDataAsync(init.body);
      httpRequests += 1;
      throw new Error('No HTTP request is permitted in this reproduction.');
    },
  });
  await assert.rejects(verification.submit('synthetic-test-token', {
    shopName: 'Synthetic shop', bankName: 'Synthetic bank', bankAccountName: 'Synthetic name',
    bankAccountNumber: '0000000000',
    idCard: { uri: 'file:///synthetic-card.png', name: 'synthetic-card.png', type: 'image/png' },
  }), error => error.kind === 'network-error');
  assert.equal(httpRequests, 0);
  console.log('PASS: diagnosed seller verification has the same URI serialization defect before HTTP transport.');

  const modern = new FormData();
  // Model File.bytes(); native file reading itself remains a device QA gate.
  const bytes = new Uint8Array([255, 216, 255, 217]);
  modern.append('file', { name: 'diagnostic.jpg', type: 'image/jpeg', bytes: async () => bytes });
  const result = await convertFormDataAsync(modern, 'diagnostic-boundary');
  const serialized = new TextDecoder().decode(result.body);
  assert.match(serialized, /filename="diagnostic.jpg"/);
  assert.match(serialized, /content-type: image\/jpeg/);
  assert.notEqual(Buffer.from(result.body).indexOf(Buffer.from(bytes)), -1);
  console.log('PASS: byte-backed file serializes filename, MIME type and binary bytes.');
  console.log('LIMIT: no real Android file, authenticated API upload, or team Storage was exercised.');
} finally {
  globalThis.FormData = originalFormData;
}
