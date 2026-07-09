import { NextRequest, NextResponse } from 'next/server';
import { chatWithGemini } from '@/lib/gemini';
import { toSafeRtdbKey } from '@/lib/chatChannels';
import { getAdminAuth, getAdminDb, isAdminAvailable } from '@/lib/firebaseAdmin';
import { isRateLimited } from '@/lib/rateLimit';

const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 60_000;

type RAGProduct = {
    name?: string;
    price?: number;
    stock?: number;
    [key: string]: unknown;
};

// ── BUG-CHAT-002: In-memory cache for RAG products (15 min TTL).
// Prevents N×250 Firestore reads per minute from concurrent chat messages.
let ragCache: { data: RAGProduct[]; expiry: number } | null = null;
const RAG_CACHE_TTL_MS = 15 * 60 * 1000;

async function assertRoomWriteAllowed(request: NextRequest, roomId: unknown): Promise<string> {
    if (typeof roomId !== 'string' || !roomId.trim()) {
        throw new Response(JSON.stringify({ error: 'Missing roomId' }), { status: 400 });
    }

    const safeRoomId = toSafeRtdbKey(roomId);
    if (safeRoomId !== roomId || safeRoomId.length === 0) {
        throw new Response(JSON.stringify({ error: 'Invalid roomId' }), { status: 400 });
    }

    const authHeader = request.headers.get('authorization') || request.headers.get('Authorization');
    const match = authHeader?.match(/^Bearer\s+(.+)$/i);
    if (!match) {
        throw new Response(JSON.stringify({ error: 'Missing Authorization bearer token' }), { status: 401 });
    }

    let decoded: Awaited<ReturnType<ReturnType<typeof getAdminAuth>['verifyIdToken']>>;
    try {
        decoded = await getAdminAuth().verifyIdToken(match[1]);
    } catch {
        throw new Response(JSON.stringify({ error: 'Invalid Authorization bearer token' }), { status: 401 });
    }
    if (decoded.uid !== safeRoomId) {
        throw new Response(JSON.stringify({ error: 'Forbidden room' }), { status: 403 });
    }

    return safeRoomId;
}

async function getRAGProducts(): Promise<RAGProduct[]> {
    if (ragCache && Date.now() < ragCache.expiry) {
        return ragCache.data;
    }
    const snapshot = await getAdminDb()
        .collection('products')
        .where('status', '==', 'active')
        .select('name', 'price', 'stock')
        .limit(200)
        .get();
    const products = snapshot.docs.map(doc => doc.data() as RAGProduct);
    ragCache = { data: products, expiry: Date.now() + RAG_CACHE_TTL_MS };
    return products;
}

export async function POST(request: NextRequest) {
    const correlationId = request.headers.get('x-request-id') || crypto.randomUUID();
    try {
        const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
            || request.headers.get('x-real-ip')
            || 'unknown';

        if (await isRateLimited(ip, 'public_ai', RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS)) {
            return NextResponse.json(
                { error: 'Bạn đang gửi tin nhắn quá nhanh. Vui lòng thử lại sau.' },
                { status: 429 }
            );
        }

        const body = await request.json();
        const { prompt, context, history, roomId, pushToRtdb } = body;

        if (!prompt) {
            return NextResponse.json({ error: 'Missing prompt' }, { status: 400 });
        }
        if (typeof prompt !== 'string' || prompt.length > 800) {
            return NextResponse.json({ error: 'Prompt too long' }, { status: 413 });
        }
        if (history && Array.isArray(history) && history.length > 30) {
            return NextResponse.json({ error: 'History too long' }, { status: 413 });
        }

        let verifiedRoomId: string | null = null;
        if (pushToRtdb) {
            try {
                verifiedRoomId = await assertRoomWriteAllowed(request, roomId);
            } catch (authError) {
                if (authError instanceof Response) return authError;
                throw authError;
            }
        }

        let dbContext = '';
        try {
            const pLower = prompt.toLowerCase();
            const keywords = pLower.split(' ').filter((word: string) => word.length > 2);

            if (isAdminAvailable() && (pLower.includes('giá') || pLower.includes('bao nhiêu') || pLower.includes('thay') || pLower.includes('sửa') || pLower.includes('mua') || pLower.includes('bán') || pLower.includes('có') || pLower.includes('không') || keywords.length > 0)) {
                const allProducts = await getRAGProducts();

                if (allProducts.length > 0) {
                    const scoredProducts = allProducts.map((product) => {
                        let score = 0;
                        const productNameLower = (product.name || '').toLowerCase();

                        keywords.forEach((keyword: string) => {
                            if (productNameLower.includes(keyword)) {
                                score += 1;
                                if (['16', '15', '14', '13', '12', '11', 'pro', 'max', 'ultra', 'plus'].includes(keyword)) {
                                    score += 2;
                                }
                            }
                        });
                        return { ...product, score };
                    });

                    const matchedProducts = scoredProducts
                        .filter((product) => product.score > 0)
                        .sort((a, b) => b.score - a.score)
                        .slice(0, 10);
                    const finalProducts = matchedProducts.length > 0
                        ? matchedProducts
                        : allProducts.slice(0, 5);

                    dbContext = '\n\n[DỮ LIỆU TỪ HỆ THỐNG]: Dưới đây là tham khảo một số giá sản phẩm/dịch vụ MỚI NHẤT hiện có trong cửa hàng (không đầy đủ):\n';
                    finalProducts.forEach((product) => {
                        dbContext += `- ${product.name}: ${product.price?.toLocaleString('vi-VN')} VNĐ (Tình trạng: ${(product.stock ?? 0) > 0 ? 'Còn hàng' : 'Hết hàng'})\n`;
                    });
                    dbContext += '\n(Lưu ý AI: ƯU TIÊN SỬ DỤNG DỮ LIỆU NÀY KHI TRẢ LỜI KHÁCH HÀNG. Nếu khách hỏi sản phẩm không có trong danh sách này, hãy nói là "Hiện tại trên hệ thống tạm thời chưa hiển thị, anh/chị vui lòng để lại số điện thoại hoặc gọi Hotline 0932 242026 để em báo giá chính xác nhất nhé!")';
                }
            }
        } catch (dbErr) {
            console.error('Lỗi khi fetch data từ Firestore cho RAG:', dbErr);
        }

        const finalContext = (context || '') + dbContext;
        const result = await chatWithGemini(prompt, finalContext, history);

        if (pushToRtdb && verifiedRoomId) {
            try {
                const { getAdminRtdb } = await import('@/lib/firebaseAdmin');
                const rtdb = getAdminRtdb();
                const infoRef = rtdb.ref(`chats/${verifiedRoomId}/info`);
                const infoSnap = await infoRef.get();
                const infoData = infoSnap.val() || {};

                if (infoData.botActive !== false) {
                    const messagesRef = rtdb.ref(`chats/${verifiedRoomId}/messages`);
                    await messagesRef.push({
                        text: result.content,
                        senderId: 'bot',
                        senderType: 'admin',
                        timestamp: Date.now(),
                        channel: 'web',
                        source: 'web',
                        sourceLabel: 'Website',
                    });

                    await infoRef.update({
                        lastMessage: `[AI] ${result.content.substring(0, 50)}`,
                        lastMessageTime: Date.now(),
                        hasUnreadUser: true,
                    });
                }
            } catch (rtdbErr) {
                console.error('Failed to push AI response to RTDB via Admin SDK:', rtdbErr);
            }
        }

        return NextResponse.json({
            success: result.ok,
            content: result.content,
            providerStatus: result.providerStatus,
            retryable: result.retryable,
            correlationId,
        }, { status: result.ok ? 200 : 503 });
    } catch (error) {
        console.error(`AI API error [${correlationId}]:`, error);
        return NextResponse.json(
            { error: 'AI generation failed', correlationId },
            { status: 500 }
        );
    }
}
