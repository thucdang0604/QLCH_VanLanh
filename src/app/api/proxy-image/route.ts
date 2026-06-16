import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
    const url = request.nextUrl.searchParams.get('url');
    if (!url) return new NextResponse('Missing URL', { status: 400 });

    try {
        const response = await fetch(url);
        if (!response.ok) return new NextResponse('Fetch failed', { status: response.status });

        const buffer = await response.arrayBuffer();
        const headers = new Headers();
        headers.set('Content-Type', response.headers.get('Content-Type') || 'image/png');
        headers.set('Cache-Control', 'public, max-age=86400'); // Cache 1 day

        return new NextResponse(buffer, {
            status: 200,
            headers,
        });
    } catch (error) {
        return new NextResponse('Error proxying image', { status: 500 });
    }
}
