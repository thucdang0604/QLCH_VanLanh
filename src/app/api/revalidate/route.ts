import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag, revalidatePath } from 'next/cache';

export async function POST(request: NextRequest) {
    try {
        const secret = request.headers.get('x-revalidate-secret') || request.nextUrl.searchParams.get('secret');
        const expectedSecret = process.env.REVALIDATE_SECRET;
        if (!expectedSecret) {
            console.error('CRITICAL: REVALIDATE_SECRET is not configured');
            return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
        }
        if (secret !== expectedSecret) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { tag, tags, path, paths } = body;

        const tagsToRevalidate = tags || (tag ? [tag] : []);
        const pathsToRevalidate = paths || (path ? [path] : []);

        if (tagsToRevalidate.length === 0 && pathsToRevalidate.length === 0) {
            return NextResponse.json({ message: 'Missing tags or paths parameter' }, { status: 400 });
        }

        tagsToRevalidate.forEach((t: string) => revalidateTag(t));
        pathsToRevalidate.forEach((p: string) => {
            if (p === 'layout') {
                revalidatePath('/', 'layout');
            } else {
                revalidatePath(p);
            }
        });
        
        return NextResponse.json({ revalidated: true, now: Date.now(), tags: tagsToRevalidate, paths: pathsToRevalidate }, { status: 200 });
    } catch (error) {
        console.error('Revalidation error:', error);
        return NextResponse.json({ message: 'Error revalidating', error: (error as Error).message }, { status: 500 });
    }
}

export async function GET() {
    return NextResponse.json({ error: 'Method Not Allowed' }, { status: 405 });
}
