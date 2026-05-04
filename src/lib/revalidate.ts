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
    
    // Trigger cross-domain revalidation to ensure Firebase edge caching
    // is purged for all associated domains
    const domains = [
      'https://fixphone.vn',
      'https://qlch-vanlanh.web.app'
    ];

    // Await the requests to ensure they complete in serverless environments
    // where background tasks are killed when the main request finishes.
    await Promise.allSettled(
      domains.map(domain => 
        fetch(`${domain}/api/revalidate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ paths, tags })
        })
      )
    ).catch(e => console.error('Error during cross-domain revalidation trigger:', e));

    console.log(`Revalidation successful for paths: ${paths?.join(', ')}, tags: ${tags?.join(', ')}`);
    return true;
  } catch (error) {
    console.error('Failed to trigger revalidation via Server Action:', error);
    return false;
  }
}
