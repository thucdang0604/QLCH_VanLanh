import { getApps, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { onSchedule } from 'firebase-functions/v2/scheduler';

if (getApps().length === 0) initializeApp();

const ARTICLE_BATCH_LIMIT = 25;

/**
 * The only recurring article task. It is intentionally capped to one small
 * batch every ten minutes: predictable cost, no public-request writes, and no
 * invocation of the 1GiB Next.js Hosting backend.
 */
export const publishScheduledArticles = onSchedule({
  schedule: 'every 10 minutes',
  timeZone: 'Asia/Ho_Chi_Minh',
  region: 'asia-southeast1',
  memory: '256MiB',
  timeoutSeconds: 30,
  maxInstances: 1,
}, async () => {
  const db = getFirestore();
  const now = new Date();
  const dueArticles = await db.collection('articles')
    .where('status', '==', 'scheduled')
    .where('scheduledAt', '<=', now)
    .orderBy('scheduledAt', 'asc')
    .limit(ARTICLE_BATCH_LIMIT)
    .get();

  if (dueArticles.empty) {
    logger.debug('No scheduled articles are due.');
    return;
  }

  const batch = db.batch();
  for (const article of dueArticles.docs) {
    batch.update(article.ref, {
      status: 'published',
      publishedAt: article.data().scheduledAt || now,
      scheduledAt: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  }
  await batch.commit();
  logger.info('Published scheduled articles.', { count: dueArticles.size });
});
