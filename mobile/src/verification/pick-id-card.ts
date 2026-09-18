import * as ImagePicker from 'expo-image-picker';

import type { IdCardFile } from '@/services/verification-service';

export type PickIdCardResult =
  | { status: 'picked'; file: IdCardFile }
  | { status: 'cancelled' }
  | { status: 'permission-denied' };

const EXTENSION_TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

export function guessImageType(fileName: string | null | undefined, mimeType?: string | null): string {
  const declared = (mimeType ?? '').split(';')[0].trim().toLowerCase();
  if (Object.values(EXTENSION_TYPES).includes(declared)) return declared;
  const extension = (fileName ?? '').split('.').pop()?.toLowerCase() ?? '';
  return EXTENSION_TYPES[extension] ?? declared ?? '';
}

export async function pickIdCardImage(): Promise<PickIdCardResult> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) return { status: 'permission-denied' };

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsMultipleSelection: false,
    quality: 0.8,
  });
  if (result.canceled || result.assets.length === 0) return { status: 'cancelled' };

  const asset = result.assets[0];
  const name = asset.fileName ?? `id-card-${Date.now()}.jpg`;
  return {
    status: 'picked',
    file: {
      uri: asset.uri,
      name,
      type: guessImageType(asset.fileName, asset.mimeType),
      size: asset.fileSize,
      file: asset.file,
    },
  };
}
