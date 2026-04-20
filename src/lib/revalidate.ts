'use server';

import { revalidatePath, revalidateTag } from 'next/cache';

/**
 * Server Action to trigger On-Demand Revalidation (ISR).
 * Called after Admin saves/updates documents.
 */
export async function triggerRevalidate(paths?: string[], tags?: string[]) {
  try {
    if (paths && paths.length > 0) {
      for (const p of paths) {
        if (p === 'layout') {
          // 'layout' path triggers a full layout revalidation from the root
          revalidatePath('/', 'layout');
        } else {
          revalidatePath(p);
        }
      }
    }
    if (tags && tags.length > 0) {
        for (const t of tags) {
            revalidateTag(t);
        }
    }
    
    console.log(`Revalidation successful for paths: ${paths?.join(', ')}, tags: ${tags?.join(', ')}`);
    return true;
  } catch (error) {
    console.error('Failed to trigger revalidation via Server Action:', error);
    return false;
  }
}
