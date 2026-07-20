import { NextRequest } from 'next/server';
import { revalidateTag, revalidatePath } from 'next/cache';
import { COOKIE_NAME, verifyPayload } from '@/lib/sessionCookie';
import { getApiErrorMessage, getApiErrorStatus, withApi } from '@/lib/api/handler';

export const POST = withApi({
    name: 'revalidate',
    onError: (error, context) => context.json({ message: 'Error revalidating', error: getApiErrorMessage(error) }, { status: getApiErrorStatus(error) }),
}, async (request: NextRequest, context) => {
        const secret = request.headers.get('x-revalidate-secret') || request.nextUrl.searchParams.get('secret');
        const expectedSecret = process.env.REVALIDATE_SECRET;

        const isSecretAuthorized = Boolean(expectedSecret && secret === expectedSecret);
        let isAdminSessionAuthorized = false;

        if (!isSecretAuthorized) {
            const cookie = request.cookies.get(COOKIE_NAME)?.value;
            if (cookie) {
                const session = await verifyPayload(cookie);
                isAdminSessionAuthorized = session?.role === 'admin';
            }
        }

        if (!isSecretAuthorized && !isAdminSessionAuthorized) {
            return context.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await context.readJson(request);
        const { tag, tags, path, paths } = body;

        const tagsToRevalidate = tags || (tag ? [tag] : []);
        const pathsToRevalidate = paths || (path ? [path] : []);

        if (tagsToRevalidate.length === 0 && pathsToRevalidate.length === 0) {
            return context.json({ message: 'Missing tags or paths parameter' }, { status: 400 });
        }

        tagsToRevalidate.forEach((t: string) => revalidateTag(t));
        pathsToRevalidate.forEach((p: string) => {
            if (p === 'layout') {
                // Keep remote config invalidation scoped to the storefront.
                // Purging the root layout also refreshes the admin auth tree.
                revalidatePath('/(customer)', 'layout');
            } else {
                revalidatePath(p);
            }
        });
        
        return context.json({ revalidated: true, now: Date.now(), tags: tagsToRevalidate, paths: pathsToRevalidate }, { status: 200 });
});
