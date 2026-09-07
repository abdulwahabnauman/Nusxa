/**
 * Archive prescription source images.
 *
 * Working scan files (`nusxa_scan_*`) are cleaned up aggressively to keep
 * the scan screen light, which would orphan every saved prescription's
 * `source_image_uri`. Archiving copies the pages a user actually saved into
 * a durable `prescriptions/` folder so improved pipelines can re-process
 * old prescriptions later. Retention is capped at MAX_RETAINED_IMAGES,
 * oldest first.
 */
import * as FileSystem from 'expo-file-system/legacy';
import { MAX_RETAINED_IMAGES } from '../constants/config';

const ARCHIVE_DIR_NAME = 'prescriptions';
const ARCHIVE_PREFIX = 'nusxa_rx_';

/**
 * Copy source pages into the durable archive and return their new URIs in
 * the same order (skipping any that no longer exist). Best-effort: a copy
 * failure never blocks saving the prescription itself.
 */
export async function archivePrescriptionImages(uris: string[]): Promise<string[]> {
  if (uris.length === 0) return [];
  const base = FileSystem.documentDirectory;
  if (!base) return [];

  const dir = `${base}${ARCHIVE_DIR_NAME}/`;
  try {
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  } catch {
    // Directory already exists — fine
  }

  const archived: string[] = [];
  const stamp = Date.now();
  for (let i = 0; i < uris.length; i++) {
    try {
      const info = await FileSystem.getInfoAsync(uris[i]!);
      if (!info.exists) continue;
      const dest = `${dir}${ARCHIVE_PREFIX}${stamp}_${i + 1}.jpg`;
      await FileSystem.copyAsync({ from: uris[i]!, to: dest });
      archived.push(dest);
    } catch (error) {
      console.warn('Failed to archive prescription image:', error);
    }
  }

  // Trim the archive to the retention window (oldest files first — the
  // timestamp prefix makes lexicographic order chronological).
  try {
    const files = (await FileSystem.readDirectoryAsync(dir))
      .filter((f) => f.startsWith(ARCHIVE_PREFIX))
      .sort();
    for (const old of files.slice(0, Math.max(0, files.length - MAX_RETAINED_IMAGES))) {
      try {
        await FileSystem.deleteAsync(dir + old, { idempotent: true });
      } catch {
        // Ignore cleanup failures
      }
    }
  } catch {
    // Trimming is cosmetic — never fail the save over it
  }

  return archived;
}

/** Remove the whole archive ("Delete all data" path). Best-effort: the
 * folder only exists once something has been archived. */
export async function clearArchivedImages(): Promise<void> {
  const base = FileSystem.documentDirectory;
  if (!base) return;
  const dir = `${base}${ARCHIVE_DIR_NAME}/`;
  try {
    const files = await FileSystem.readDirectoryAsync(dir);
    for (const file of files) {
      await FileSystem.deleteAsync(dir + file, { idempotent: true });
    }
    await FileSystem.deleteAsync(dir, { idempotent: true });
  } catch {
    // Nothing archived yet — nothing to clear
  }
}
