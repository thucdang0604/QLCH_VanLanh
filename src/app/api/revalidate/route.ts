import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag, revalidatePath } from 'next/cache';

export async function POST(request: NextRequest) {
    try {
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

export async function GET(request: NextRequest) {
    const tag = request.nextUrl.searchParams.get('tag');

    if (!tag) {
        return NextResponse.json({ message: 'Missing tag parameter' }, { status: 400 });
    }

    revalidateTag(tag);
    
    return NextResponse.json({ revalidated: true, now: Date.now(), tag }, { status: 200 });
}
