import { NextRequest, NextResponse } from 'next/server';
import { chatWithGemini } from '@/lib/gemini';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, limit } from 'firebase/firestore';

export async function POST(request: NextRequest) {
    try {
        const { prompt, context, history } = await request.json();

        if (!prompt) {
            return NextResponse.json({ error: 'Missing prompt' }, { status: 400 });
        }

        // --- BẮT ĐẦU: RAG - Tìm kiếm database ---
        let dbContext = '';
        try {
            // Nhận diện từ khóa để query DB. 
            const pLower = prompt.toLowerCase();
            const keywords = pLower.split(' ').filter((word: string) => word.length > 2); // Bỏ qua các từ quá ngắn

            if (pLower.includes('giá') || pLower.includes('bao nhiêu') || pLower.includes('thay') || pLower.includes('sửa') || pLower.includes('mua') || pLower.includes('bán') || pLower.includes('có') || pLower.includes('không') || keywords.length > 0) {
                const productsRef = collection(db, 'products');
                // Vì Firestore không hỗ trợ full-text search tốt, ta lấy danh sách sản phẩm active
                // và filter bằng Javascript dựa trên keywords trong tên sản phẩm
                const q = query(productsRef, where('status', '==', 'active'));
                const snapshot = await getDocs(q);

                if (!snapshot.empty) {
                    const allProducts: any[] = [];
                    snapshot.forEach(doc => {
                        allProducts.push(doc.data());
                    });

                    // Tính điểm phù hợp của từng sản phẩm dựa trên số lượng keyword xuất hiện trong tên
                    const scoredProducts = allProducts.map(product => {
                        let score = 0;
                        const productNameLower = (product.name || '').toLowerCase();

                        // Ưu tiên các keyword chính trị giá cao (ví dụ: iphone, samsung, 15, 16, pro, max)
                        keywords.forEach((kw: string) => {
                            if (productNameLower.includes(kw)) {
                                score += 1;
                                // Tăng điểm mạnh nếu khớp các dòng máy cụ thể
                                if (['16', '15', '14', '13', '12', '11', 'pro', 'max', 'ultra', 'plus'].includes(kw)) {
                                    score += 2;
                                }
                            }
                        });
                        return { ...product, score };
                    });

                    // Lọc ra các sản phẩm có điểm > 0 và lấy top 10
                    const matchedProducts = scoredProducts
                        .filter(p => p.score > 0)
                        .sort((a, b) => b.score - a.score)
                        .slice(0, 10);

                    // Nếu không có sản phẩm nào khớp keyword, lấy ngẫu nhiên 5 sản phẩm nổi bật
                    const finalProducts = matchedProducts.length > 0 ? matchedProducts : allProducts.slice(0, 5);

                    dbContext = '\\n\\n[DỮ LIỆU TỪ HỆ THỐNG]: Dưới đây là tham khảo một số giá sản phẩm/dịch vụ MỚI NHẤT hiện có trong cửa hàng (không đầy đủ):\\n';
                    finalProducts.forEach(data => {
                        dbContext += `- ${data.name}: ${data.price?.toLocaleString('vi-VN')} VNĐ (Tình trạng: ${data.stock > 0 ? 'Còn hàng' : 'Hết hàng'})\\n`;
                    });
                    // Note cho AI
                    dbContext += '\\n(Lưu ý AI: ƯU TIÊN SỬ DỤNG DỮ LIỆU NÀY KHI TRẢ LỜI KHÁCH HÀNG. Nếu khách hỏi sản phẩm không có trong danh sách này, hãy nói là "Hiện tại trên hệ thống tạm thời chưa hiển thị, anh/chị vui lòng để lại số điện thoại hoặc gọi Hotline 0932 242026 để em báo giá chính xác nhất nhé!")';
                }
            }
        } catch (dbErr) {
            console.error('Lỗi khi fetch data từ Firestore cho RAG:', dbErr);
        }

        // Gộp context từ frontend truyền lên và context từ Database
        const finalContext = (context || '') + dbContext;
        // --- KẾT THÚC: RAG ---

        const result = await chatWithGemini(prompt, finalContext, history);

        return NextResponse.json({
            success: true,
            content: result
        });
    } catch (error) {
        console.error('AI API error:', error);
        return NextResponse.json(
            { error: 'AI generation failed' },
            { status: 500 }
        );
    }
}
