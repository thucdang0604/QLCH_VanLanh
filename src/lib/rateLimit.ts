import { getAdminDb } from './firebaseAdmin';

/**
 * Serverless-compatible distributed rate limiter using Firestore.
 * Verifies if the request count from `ip` on `route` has exceeded `limit` within the timeframe `windowMs`.
 * Returns true if the IP is rate limited (exceeded limit), false otherwise.
 */
export async function isRateLimited(
    ip: string,
    route: string,
    limit: number,
    windowMs: number
): Promise<boolean> {
    if (ip === 'unknown') {
        // If IP is not resolved, fail-safe: do not block
        return false;
    }

    try {
        const db = getAdminDb();
        // Document ID safe to contain alphanumeric and underscores
        const docId = `${ip.replace(/[^a-zA-Z0-9]/g, '_')}_${route.replace(/[^a-zA-Z0-9]/g, '_')}`;
        const docRef = db.collection('rate_limits').doc(docId);

        const now = Date.now();
        let isLimited = false;

        await db.runTransaction(async (transaction) => {
            const snap = await transaction.get(docRef);
            let count = 1;
            let resetAt = now + windowMs;

            if (snap.exists) {
                const data = snap.data()!;
                const dataResetAt = Number(data.resetAt) || 0;
                const dataCount = Number(data.count) || 0;

                if (now < dataResetAt) {
                    count = dataCount + 1;
                    resetAt = dataResetAt;
                    if (count > limit) {
                        isLimited = true;
                    }
                }
            }

            // Update with new count/reset time
            transaction.set(docRef, {
                ip,
                route,
                count,
                resetAt,
                updatedAt: now
            });
        });

        return isLimited;
    } catch (error) {
        console.error('Rate limiting error, falling back to false (open):', error);
        // Fail-open to avoid locking out users in case of Firestore issues
        return false;
    }
}
