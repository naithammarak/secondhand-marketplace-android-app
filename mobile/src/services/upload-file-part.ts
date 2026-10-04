/**
 * SDK 57's global expo/fetch serializes bytes, not legacy RN `{ uri, name, type }`
 * descriptors ("Unsupported FormDataPart implementation"). Web pickers give a
 * browser File; native pickers give only a local URI, read via expo-file-system.
 */

export class LocalUploadFileError extends Error {
  constructor() {
    super('Selected file is missing or unreadable');
    this.name = 'LocalUploadFileError';
  }
}

/** Native only: open a picked local URI as an expo-file-system File (a Blob). */
export function readLocalUploadFile(uri: string): Blob {
  try {
    // Lazy so web/Node callers never load the native module.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { File }: typeof import('expo-file-system') = require('expo-file-system');
    const file = new File(uri);
    if (!file.exists) throw new Error('missing');
    return file;
  } catch {
    throw new LocalUploadFileError();
  }
}

/** Web File as-is; otherwise the native file at `uri`. Throws LocalUploadFileError. */
export function uploadFilePart(input: { file?: unknown; uri?: string }): Blob {
  if (input.file) return input.file as Blob;
  if (!input.uri) throw new LocalUploadFileError();
  return readLocalUploadFile(input.uri);
}
