import { NextResponse } from 'next/server';

export async function GET() {
    try {
        const response = await fetch('https://api.vietqr.io/v2/banks');
        const text = await response.text();
        const data = JSON.parse(text);
        return NextResponse.json(data);
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Không thể tải danh sách ngân hàng.';
        return NextResponse.json(
            { code: '99', desc: 'Lỗi máy chủ', error: message },
            { status: 500 }
        );
    }
}
