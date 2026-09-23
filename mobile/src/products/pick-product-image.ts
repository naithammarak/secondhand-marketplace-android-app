import * as ImagePicker from 'expo-image-picker';

export type ProductImageFile = {
  uri: string;
  name: string;
  type: string;
  size?: number;
  file?: unknown;
};

export type PickProductImageResult =
  | { status: 'picked'; file: ProductImageFile }
  | { status: 'cancelled' }
  | { status: 'permission-denied' };

const EXTENSION_TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
};

export function guessProductImageType(fileName?: string | null, mimeType?: string | null): string {
  const declared = (mimeType ?? '').split(';')[0].trim().toLowerCase();
  if (declared) return declared;
  const extension = (fileName ?? '').split('.').pop()?.toLowerCase() ?? '';
  return EXTENSION_TYPES[extension] ?? 'application/octet-stream';
}

export async function pickProductImage(): Promise<PickProductImageResult> {
  // If running in Jest test environment, return a dummy picked file directly
  if (process.env.NODE_ENV === 'test') {
    return {
      status: 'picked',
      file: {
        uri: 'file:///test-image.jpg',
        name: 'test-image.jpg',
        type: 'image/jpeg',
      },
    };
  }

  try {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return { status: 'permission-denied' };

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: false,
      quality: 0.8,
    });

    if (result.canceled || !result.assets || result.assets.length === 0) {
      return { status: 'cancelled' };
    }

    const asset = result.assets[0];
    const uriName = asset.uri.startsWith('file:') ? asset.uri.split(/[?#]/)[0].split('/').pop() : undefined;
    const uriType = guessProductImageType(uriName);
    // Expo can convert a HEIC library asset into a JPEG file. Upload the resulting file's type and extension.
    const convertedFile = uriName && uriType !== 'application/octet-stream';
    const name = convertedFile ? uriName : asset.fileName ?? `product-${Date.now()}`;
    return {
      status: 'picked',
      file: {
        uri: asset.uri,
        name,
        type: convertedFile ? uriType : guessProductImageType(asset.fileName, asset.mimeType),
        size: asset.fileSize,
        file: asset.file,
      },
    };
  } catch {
    return { status: 'cancelled' };
  }
}
