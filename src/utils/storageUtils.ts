import { ref, getDownloadURL, uploadBytes, listAll } from 'firebase/storage';
import { storage, isFirebaseConfigured } from '../firebase/config';

// In-memory cache of resolved URLs so we don't repeatedly query Firebase Storage
const resolvedUrlCache = new Map<string, string>();

/**
 * Resolves an image path or URL from Firestore into a displayable URL.
 * Supports:
 * - Direct HTTP/HTTPS URLs or Data URLs
 * - gs:// bucket URIs
 * - Relative Firebase Storage paths (e.g. "captains/uid/profile.jpg")
 * - Fallback folder discovery in Firebase Storage (e.g. checking "captains/{id}")
 */
export async function resolveStorageImageUrl(
  rawUrlOrPath?: string | null,
  fallbackFolders?: string[]
): Promise<string | null> {
  if (rawUrlOrPath && typeof rawUrlOrPath === 'string') {
    const trimmed = rawUrlOrPath.trim();
    if (!trimmed) return null;

    if (
      trimmed.startsWith('http://') ||
      trimmed.startsWith('https://') ||
      trimmed.startsWith('data:image/') ||
      trimmed.startsWith('blob:')
    ) {
      return trimmed;
    }

    if (resolvedUrlCache.has(trimmed)) {
      return resolvedUrlCache.get(trimmed) || null;
    }

    if (isFirebaseConfigured && storage) {
      try {
        const storageRef = ref(storage, trimmed);
        const downloadUrl = await getDownloadURL(storageRef);
        resolvedUrlCache.set(trimmed, downloadUrl);
        return downloadUrl;
      } catch {
        // Continue to fallback folders if direct path failed
      }
    }
  }

  // If no direct URL or resolving failed, optionally check Firebase Storage fallback folders/paths
  if (isFirebaseConfigured && storage && fallbackFolders && fallbackFolders.length > 0) {
    for (const folderOrFile of fallbackFolders) {
      if (!folderOrFile) continue;
      if (resolvedUrlCache.has(folderOrFile)) {
        return resolvedUrlCache.get(folderOrFile) || null;
      }

      try {
        // First try as direct file reference
        if (folderOrFile.includes('.')) {
          const fileRef = ref(storage, folderOrFile);
          const url = await getDownloadURL(fileRef);
          resolvedUrlCache.set(folderOrFile, url);
          return url;
        } else {
          // Try listing files inside the folder (e.g. captains/{captainId})
          const folderRef = ref(storage, folderOrFile);
          const listResult = await listAll(folderRef);
          if (listResult.items.length > 0) {
            const url = await getDownloadURL(listResult.items[0]);
            resolvedUrlCache.set(folderOrFile, url);
            return url;
          }
        }
      } catch {
        // Ignore and try next candidate
      }
    }
  }

  return null;
}

/**
 * Uploads an image file to Firebase Storage and returns its download URL.
 * Falls back to a compressed Base64 data URL if Storage rules/network block direct upload.
 */
export async function uploadImageToFirebaseStorage(
  file: File,
  storagePath: string
): Promise<string> {
  if (isFirebaseConfigured && storage) {
    try {
      const fileRef = ref(storage, storagePath);
      await uploadBytes(fileRef, file);
      const downloadUrl = await getDownloadURL(fileRef);
      resolvedUrlCache.set(storagePath, downloadUrl);
      return downloadUrl;
    } catch (err) {
      console.warn('Firebase Storage upload fallback to data URL:', err);
    }
  }

  // Fallback: read as Data URL
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = (error) => reject(error);
    reader.readAsDataURL(file);
  });
}
