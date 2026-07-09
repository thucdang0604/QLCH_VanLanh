import { NextRequest, NextResponse } from 'next/server';

const ALLOWED_HOSTS = new Set(['img.vietqr.io', 'api.vietqr.io']);
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

export async function GET(request: NextRequest) {
    const url = request.nextUrl.searchParams.get('url');
    if (!url) return new NextResponse('Missing URL', { status: 400 });

    try {
        const parsedUrl = new URL(url);
        if (parsedUrl.protocol !== 'https:' || !ALLOWED_HOSTS.has(parsedUrl.hostname)) {
            return new NextResponse('URL not allowed', { status: 400 });
        }

        const response = await fetch(parsedUrl.toString(), {
            signal: AbortSignal.timeout(5000),
        });
        if (!response.ok) return new NextResponse('Fetch failed', { status: response.status });

        const contentType = response.headers.get('Content-Type') || '';
        if (!contentType.toLowerCase().startsWith('image/')) {
            return new NextResponse('Unsupported content type', { status: 415 });
        }

        const contentLength = Number(response.headers.get('Content-Length') || 0);
        if (contentLength > MAX_IMAGE_BYTES) {
            return new NextResponse('Image too large', { status: 413 });
        }

        const buffer = await response.arrayBuffer();
        if (buffer.byteLength > MAX_IMAGE_BYTES) {
            return new NextResponse('Image too large', { status: 413 });
        }

        const headers = new Headers();
        headers.set('Content-Type', contentType);
        headers.set('Cache-Control', 'public, max-age=86400'); // Cache 1 day

        return new NextResponse(buffer, {
            status: 200,
            headers,
        });
    } catch (error) {
        if (error instanceof TypeError) {
            return new NextResponse('Invalid URL', { status: 400 });
        }
        return new NextResponse('Error proxying image', { status: 500 });
    }
}
