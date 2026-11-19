import { supabase } from '../lib/supabase';
import * as FileSystem from 'expo-file-system/legacy';
import { decode } from 'base64-arraybuffer';

const BUCKET = 'note_images';

/** Convert a stored object path or an older Supabase URL into its Storage object path. */
export const getNoteImageObjectPath = (reference: string): string => {
  if (!reference) return reference;
  const marker = `/storage/v1/object/`;
  const bucketMarker = `/${BUCKET}/`;
  const markerIndex = reference.indexOf(marker);
  if (markerIndex >= 0) {
    const afterObject = reference.slice(markerIndex + marker.length);
    const bucketIndex = afterObject.indexOf(bucketMarker.slice(1));
    if (bucketIndex >= 0) {
      const encodedPath = afterObject.slice(bucketIndex + BUCKET.length + 1).split('?')[0];
      try { return decodeURIComponent(encodedPath); } catch { return encodedPath; }
    }
  }
  return reference;
};

/** Upload into an owner-only private folder or a group-scoped folder. Returns a path, not a public URL. */
export const uploadNoteImage = async (
  localUri: string,
  userId: string,
  groupId?: string | null,
): Promise<string | null> => {
  try {
    const fileName = `${Date.now()}_${Math.random().toString(36).substring(2, 10)}.jpg`;
    const objectPath = groupId
      ? `groups/${groupId}/${userId}/${fileName}`
      : `private/${userId}/${fileName}`;

    const base64 = await FileSystem.readAsStringAsync(localUri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    const { error } = await supabase.storage.from(BUCKET).upload(objectPath, decode(base64), {
      contentType: 'image/jpeg',
      upsert: false,
    });
    if (error) throw error;
    return objectPath;
  } catch (error) {
    console.error('Image upload failed:', error);
    return null;
  }
};

/** Resolve an object path (or legacy public URL) to a short-lived signed URL for display. */
export const getNoteImageSignedUrl = async (
  reference: string,
  expiresInSeconds = 60 * 60,
): Promise<string | null> => {
  try {
    const objectPath = getNoteImageObjectPath(reference);
    if (!objectPath) return null;
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(objectPath, expiresInSeconds);
    if (error) throw error;
    return data?.signedUrl || null;
  } catch (error) {
    console.warn('Could not create signed image URL:', error);
    return null;
  }
};

export const getNoteImageSignedUrls = async (references: string[] | null | undefined): Promise<string[]> => {
  if (!Array.isArray(references) || references.length === 0) return [];
  const results = await Promise.all(references.map((reference) => getNoteImageSignedUrl(reference)));
  return results.filter((url): url is string => Boolean(url));
};
