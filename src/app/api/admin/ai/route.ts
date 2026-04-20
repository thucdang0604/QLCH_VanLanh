import { NextRequest, NextResponse } from 'next/server';
import { generateContentStream, generateContent } from '@/lib/ollama';
import { requireAdmin } from '@/lib/apiAuth';

// ── Rate Limiting (in-memory, per IP, 5 req/min) ──
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 60_000;

function checkRateLimit(ip: string): boolean {
    const now = Date.now();
    const entry = rateLimitMap.get(ip);

    if (!entry || now > entry.resetAt) {
        rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
        return true;
    }

    if (entry.count >= RATE_LIMIT_MAX) {
        return false;
    }

    entry.count++;
    return true;
}

// Cleanup memory every 5 minutes
setInterval(() => {
    const now = Date.now();
    for (const [ip, entry] of rateLimitMap) {
        if (now > entry.resetAt) rateLimitMap.delete(ip);
    }
}, 5 * 60_000);

export async function POST(request: NextRequest) {
    try {
        // ── Auth: chỉ admin mới được dùng ──
        try {
            await requireAdmin(request);
        } catch {
            return NextResponse.json({ error: 'Unauthorized: admin only' }, { status: 401 });
        }

        // ── Rate limit check ──
        const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
            || request.headers.get('x-real-ip')
            || 'unknown';

        if (!checkRateLimit(ip)) {
            return NextResponse.json(
                { error: 'Quá nhiều yêu cầu. Vui lòng thử lại sau.' },
                { status: 429 }
            );
        }

        const { action, payload } = await request.json();

        if (!action || !payload) {
            return NextResponse.json({ error: 'Missing action or payload' }, { status: 400 });
        }

        if (action === 'check-connection') {
            const { apiKey } = payload;
            try {
                // Check Ollama connection first
                const ollamaUrl = process.env.OLLAMA_HOST || 'http://localhost:11434';
                const ollamaRes = await fetch(`${ollamaUrl}/api/tags`, { signal: AbortSignal.timeout(5000) });
                if (!ollamaRes.ok) {
                    return NextResponse.json({ ok: false, error: 'Ollama is not running. Please start Ollama locally.' });
                }

                // If apiKey provided, check Gemini Nano Banana
                if (apiKey && apiKey.trim() !== '') {
                    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey.trim()}`;
                    const geminiRes = await fetch(geminiUrl, { signal: AbortSignal.timeout(5000) });
                    if (!geminiRes.ok) {
                        return NextResponse.json({ ok: false, error: 'Google Gemini API Key không hợp lệ.' });
                    }
                }
                
                return NextResponse.json({ ok: true });
            } catch (err) {
                return NextResponse.json({ ok: false, error: 'Không thể kết nối đến AI API: ' + (err as Error).message });
            }
        }

        // Handle image generation (non-streaming, Pollinations.ai — FREE models or Gemini)
        if (action === 'generate-image') {
            const { prompt, width: rawWidth = 1024, height: rawHeight = 768, model: rawModel = 'gptimage', articleTitle = '' } = payload;
            if (!prompt) {
                return NextResponse.json({ error: 'Missing image prompt' }, { status: 400 });
            }

            // Ensure dimensions are multiples of 8 for AI model compatibility
            const width = Math.floor(rawWidth / 8) * 8;
            const height = Math.floor(rawHeight / 8) * 8;

            // Step 1: Craft optimized English image prompt via Ollama (with article context)
            let englishPrompt = prompt;
            try {
                const ollamaUrl = process.env.OLLAMA_HOST || 'http://localhost:11434';
                const ollamaModel = process.env.OLLAMA_MODEL || 'gemma4:e4b';
                const contextPart = articleTitle ? `\nArticle context: "${articleTitle}"` : '';
                const translateRes = await fetch(`${ollamaUrl}/api/generate`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        model: ollamaModel,
                        prompt: `Create a brief, high-quality English image generation prompt from this Vietnamese description. Focus on visual elements, photorealistic style, and clarity.${contextPart}\n\nVietnamese: "${prompt}"\n\nOutput ONLY the English prompt (max 60 words).`,
                        system: 'You are an AI image prompt engineer. Convert Vietnamese descriptions into vivid, professional English prompts. Output ONLY the prompt text.',
                        stream: false,
                    }),
                });
                if (translateRes.ok) {
                    const data = await translateRes.json();
                    if (data.response) {
                        englishPrompt = data.response.trim().replace(/^["']|["']$/g, '');
                        console.log('AI Prompt optimized:', englishPrompt);
                    }
                }
            } catch (e) {
                console.log('Ollama translation failed/skipped:', (e as Error).message);
            }

            const apiKey = payload.apiKey || '';
            if (apiKey && apiKey.trim() !== '') {
                try {
                    console.log('Using Google Gemini API (NanoBanana) for image generation');
                    const body = {
                        contents: [
                            {
                                role: "user",
                                parts: [{ text: englishPrompt }]
                            }
                        ],
                        generationConfig: {
                            responseModalities: ["IMAGE"]
                        }
                    };
                    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image-preview:generateContent?key=${apiKey.trim()}`;
                    const geminiRes = await fetch(geminiUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(body),
                        signal: AbortSignal.timeout(60000)
                    });
                    
                    if (!geminiRes.ok) {
                        const errText = await geminiRes.text();
                        console.error('Gemini error:', errText);
                        throw new Error(`Gemini API Error: ${errText}`);
                    }
                    
                    const data = await geminiRes.json();
                    let base64Img = '';
                    
                    // Format for generateContent (gemini-3.1-flash-image-preview)
                    if (data.candidates && data.candidates[0]?.content?.parts[0]?.inlineData?.data) {
                        base64Img = data.candidates[0].content.parts[0].inlineData.data;
                    } 
                    // Fallback format for Imagen models
                    else if (data.predictions && data.predictions.length > 0 && data.predictions[0].bytesBase64) {
                        base64Img = data.predictions[0].bytesBase64;
                    } 
                    else {
                        console.error("Unrecognized Gemini Response:", JSON.stringify(data));
                        throw new Error('No image returned from Gemini');
                    }
                    
                    const buffer = Buffer.from(base64Img, 'base64');
                    return new Response(buffer, {
                        headers: {
                            'Content-Type': 'image/jpeg',
                            'Cache-Control': 'no-cache',
                        }
                    });
                } catch (geminiError) {
                    console.error('Gemini Fetch Error:', geminiError);
                    return NextResponse.json({ error: 'Lỗi khi gọi Google Nano Banana API (Sai key hoặc vi phạm chính sách nội dung)' }, { status: 500 });
                }
            }
            
            // Map model names to Pollinations valid strings
            // Pollinations current valid models: 'flux', 'flux-realism', 'flux-civitai', 'flux-anime', 'flux-3d', 'any-dark'
            let pollinationsModel = 'flux'; // Default
            if (rawModel === 'gptimage') pollinationsModel = 'flux-realism';
            if (rawModel === 'flux') pollinationsModel = 'flux';
            if (rawModel === 'zimage') pollinationsModel = 'flux-realism';

            // Step 2: Generate image via Pollinations.ai (stable endpoint)
            const imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(englishPrompt)}?model=${pollinationsModel}&width=${width}&height=${height}&nologo=true&seed=${Date.now()}`;
            
            console.log('Fetching image from Pollinations:', imageUrl);
            
            let attempts = 0;
            const maxAttempts = 2;

            while (attempts < maxAttempts) {
                attempts++;
                try {
                    const imgRes = await fetch(imageUrl, { signal: AbortSignal.timeout(45000) }); // 45s timeout per attempt
                    
                    if (!imgRes.ok) {
                        const errorText = await imgRes.text();
                        console.error(`Pollinations error (${imgRes.status}), attempt ${attempts}:`, errorText);
                        if (attempts === maxAttempts) {
                            return NextResponse.json({ error: `Pollinations service error: ${imgRes.status}` }, { status: imgRes.status });
                        }
                        await new Promise(r => setTimeout(r, 2000)); // wait 2s before retry
                        continue;
                    }
                    
                    const buffer = await imgRes.arrayBuffer();
                    return new Response(buffer, {
                        headers: {
                            'Content-Type': 'image/jpeg',
                            'Cache-Control': 'no-cache',
                        }
                    });
                } catch (fetchError) {
                    console.error(`Fetch error for image, attempt ${attempts}:`, fetchError);
                    if (attempts === maxAttempts) {
                        return NextResponse.json({ error: 'Timeout or network error connecting to Pollinations' }, { status: 504 });
                    }
                    await new Promise(r => setTimeout(r, 2000));
                }
            }
        }

        let stream: ReadableStream;

        if (action === 'generate-content') {
            const { contentType, prompt } = payload;
            
            const baseRules = `\n\nLUẬT VIẾT BẮT BUỘC:\n- KHÔNG nhồi tính từ sáo rỗng (tuyệt vời, ấn tượng, đỉnh cao, hoàn hảo). Mỗi nhận xét phải kèm số liệu hoặc so sánh cụ thể.\n- Viết bằng HTML sạch (<h2>, <h3>, <p>, <strong>, <ul>, <li>). KHÔNG dùng Markdown.\n- Mỗi đoạn văn tối đa 3 câu. Ưu tiên câu ngắn, rõ ràng.\n- Phải nêu cả ưu điểm VÀ nhược điểm/hạn chế (nếu có). Không viết kiểu quảng cáo 1 chiều.`;

            let systemPrompt = 'Bạn là chuyên gia sáng tạo nội dung công nghệ tiếng Việt, am hiểu SEO và EEAT.';
            if (contentType === 'product') {
                systemPrompt += ` Viết mô tả sản phẩm thuyết phục nhưng KHÁCH QUAN:\n- Mở đầu: 1 câu hook nêu USP (Unique Selling Point) nổi bật nhất + con số cụ thể.\n- Thân: Phân tích từng tính năng chính kèm THÔNG SỐ KỸ THUẬT và SO SÁNH với đối thủ cùng tầm giá (nêu tên cụ thể).\n- Giải thích ý nghĩa thực tế: Thông số đó giúp người dùng được gì trong cuộc sống hàng ngày?\n- Kết: CTA rõ ràng với lý do nên mua NGAY (ưu đãi, số lượng giới hạn, v.v.).${baseRules}`;
            } else if (contentType === 'promo') {
                systemPrompt += ` Tạo nội dung khuyến mãi chuyên nghiệp:\n- Tiêu đề: Nêu rõ % giảm giá / giá trị ưu đãi bằng CON SỐ CỤ THỂ.\n- Nội dung: Nêu rõ giá gốc → giá sale → tiết kiệm được bao nhiêu (VNĐ).\n- Tạo urgency bằng DỮ LIỆU ("Chỉ còn 15 máy", "Ưu đãi kết thúc 23:59 ngày DD/MM"), KHÔNG viết chung chung "nhanh tay kẻo hết".\n- Kèm 2-3 sản phẩm nổi bật nhất với thông số ngắn gọn.\n- CTA cuối: Hành động cụ thể (gọi số, inbox, đến cửa hàng).${baseRules}`;
            } else if (contentType === 'article') {
                systemPrompt += ` Viết bài review/phân tích chuẩn SEO flagship:\n- Mở bài: Hook mạnh + nêu focus keyword trong 100 từ đầu. Đặt 1 liên kết nội bộ tới bài liên quan.\n- Thân bài: Chia thành 4-6 mục (<h2>) rõ ràng (Thiết kế, Màn hình, Hiệu năng, Camera, Pin, Kết luận). Mỗi mục có số liệu benchmark/so sánh.\n- Dùng thuật ngữ chuyên sâu LSI: computational photography, PWM dimming, thermal throttling, pixel binning, v.v.\n- Chèn ít nhất 3 [CHÈN HÌNH ẢNH: ...], 1 [CHÈN VIDEO: ...], 4 [GỢI Ý LIÊN KẾT: ...] rải đều.\n- Nêu rõ NHƯỢC ĐIỂM (ít nhất 2) — bài không có nhược điểm = bài quảng cáo.\n- Kết bài: Tổng kết + CTA + keyword lặp lại tự nhiên.\n- Độ dài tối thiểu: 1200 từ.${baseRules}`;
            } else if (contentType === 'seo') {
                systemPrompt += ` Cung cấp bộ Meta Tags tối ưu chuẩn SEO cho CTR cao:\n\n[TITLE]: Focus keyword ở ĐẦU, 50-60 ký tự. Dùng power words (Đánh giá, So sánh, Chi tiết, Mới nhất, Giá tốt). KHÔNG dùng tính từ sáo rỗng.\n  VD tốt: "iPhone 16 Pro Max — Đánh Giá Camera 48MP Sau 30 Ngày Sử Dụng"\n  VD xấu: "iPhone 16 Pro Max — Siêu Phẩm Tuyệt Vời Nhất 2025"\n\n[DESC]: 120-155 ký tự. Chứa keyword + 1 số liệu cụ thể + CTA ngắn.\n  VD: "Đánh giá iPhone 16 Pro Max: Camera 48MP zoom quang 5x, pin 4685mAh dùng 2 ngày. Xem chi tiết benchmark và giá tốt nhất tại Văn Lành."\n\n[TAGS]: 5-7 tags, tag đầu = focus keyword. Các tag sau = LSI keywords biến thể.\n\nTrả về ĐÚNG format trên, KHÔNG thêm nhận xét.`;
            }

            stream = await generateContentStream(`Yêu cầu tạo nội dung: ${prompt}`, systemPrompt);
        } else if (action === 'seo-check') {
            const { title, content, tags, excerpt } = payload;
            const systemPrompt = `Bạn là Chuyên gia Kiểm Duyệt SEO Google cực kỳ khó tính và khắt khe. Nhiệm vụ của bạn là chấm điểm và báo cáo lỗi bài viết một cách tàn nhẫn, khách quan đúng với thực tế thuật toán Google cập nhật mới nhất (EEAT, Helpful Content). KHÔNG khen ngợi dư thừa.
LẤY TỪ KHÓA ĐẦU TIÊN TRONG 'TAGS' LÀM TỪ KHÓA CHÍNH (FOCUS KEYWORD).

═══════════════════════════════════════
TIÊU CHÍ PHÂN TÍCH (10 mục, mỗi mục 10đ):
═══════════════════════════════════════

1. **[10đ] EEAT & Helpful Content — Chiều sâu chuyên môn**:
   - Bài viết có DATA/SỐ LIỆU/BENCHMARK cụ thể không? Hay chỉ khen chung chung?
   - Có so sánh với đối thủ cụ thể (nêu tên, nêu số) không?
   - Có nhận định cá nhân dựa trên trải nghiệm thực tế không?
   - Có nêu NHƯỢC ĐIỂM không? (Bài không có nhược điểm = quảng cáo = -5đ)
   - Nếu nội dung chỉ mang tính "tổng hợp thông tin" mà không có phân tích → Tối đa 4/10đ.

2. **[10đ] Fluff Writing — Phát hiện tính từ sáo rỗng**:
   - ĐẾM SỐ LẦN xuất hiện các từ: "tuyệt vời", "ấn tượng", "đỉnh cao", "tác phẩm nghệ thuật", "rực rỡ", "hoàn hảo", "xuất sắc", "đáng kinh ngạc", "vượt trội", "mãn nhãn", "cách mạng", "đột phá".
   - 0 lần = 10đ. 1-3 lần = 7đ. 4-6 lần = 4đ. >6 lần = 0đ (Content Generated).
   - Liệt kê CỤ THỂ từ nào xuất hiện bao nhiêu lần.

3. **[10đ] Title & Meta Desc**:
   - Focus Keyword nằm ở đầu Title? Title 50-60 ký tự?
   - Desc 120-155 ký tự? Có chứa keyword + số liệu + CTA không?
   - Title có power words (Đánh giá, So sánh, Chi tiết, Mới nhất) không?

4. **[10đ] Keyword Placement & Density**:
   - Focus Keyword trong 100 từ đầu tiên? (+3đ)
   - Focus Keyword trong đoạn kết luận? (+3đ)
   - Mật độ 0.8%-1.5% = 4đ. <0.8% = 2đ. >2% = 0đ (Keyword Stuffing).
   - Tính CHÍNH XÁC mật độ: (Số lần keyword / Tổng từ) × 100%.

5. **[10đ] Semantic SEO & LSI Keywords**:
   - Có dùng thuật ngữ chuyên sâu liên quan không? (computational photography, pixel binning, thermal throttling, PWM dimming, v.v.)
   - Có mở rộng ngữ nghĩa khi nói về tính năng không? Hay chỉ nêu tên tính năng rồi khen?
   - ĐỀ XUẤT 10 LSI keywords cụ thể mà bài nên bổ sung.

6. **[10đ] Cấu trúc & Readability**:
   - H2/H3 phân cấp rõ ràng, có rải keyword thứ cấp? (+4đ)
   - Đoạn văn ≤3 câu? Câu ≤25 từ? (+3đ)
   - Bài >1200 từ? (+3đ). 800-1200 = 2đ. <800 = 0đ.

7. **[10đ] Đa phương tiện**:
   - Ít nhất 3 ảnh [CHÈN HÌNH ẢNH: ...] với prompt chi tiết? (+4đ)
   - Ít nhất 1 video [CHÈN VIDEO: ...]? (+3đ)
   - Prompt ảnh có chi tiết (góc máy, ánh sáng, bối cảnh) hay chung chung? (+3đ)

8. **[10đ] Liên kết nội bộ — Phân bổ & Topical Authority**:
   - Tổng số liên kết [GỢI Ý LIÊN KẾT: ...]: Cần ≥4 (+3đ)
   - Phân bổ đều (đầu/giữa/cuối bài)? Hay gom hết cuối bài? (+4đ)
   - Anchor text có mô tả rõ nội dung đích không? (+3đ)
   - GOM CUỐI = chỉ được 3/10đ. Thiếu hoàn toàn = 0đ.

9. **[10đ] CTA & Conversion**:
   - Có CTA ở cuối bài? (+5đ)
   - CTA có cụ thể (giá, địa chỉ, hành động) hay chung chung? (+5đ)

10. **[10đ] Tính độc đáo & Giá trị gia tăng**:
    - Bài có thông tin mà đối thủ CHƯA CÓ không? (+5đ)
    - Có bảng so sánh, infographic data, tips riêng không? (+5đ)

═══════════════════════════════════════
ĐỊNH DẠNG BÁO CÁO (TIẾNG VIỆT):
═══════════════════════════════════════

**📊 BẢNG ĐIỂM CHI TIẾT:**
| Tiêu chí | Điểm | Ghi chú |
|---|---|---|
| 1. EEAT & Chiều sâu | ?/10 | ... |
| 2. Fluff Writing | ?/10 | ... |
| ... | ... | ... |
| **TỔNG** | **?/100** | |

**🚨 LỖI NGHIÊM TRỌNG (Critical Errors)**:
Liệt kê các lỗi khiến bài khó lên TOP, kèm VÍ DỤ CỤ THỂ trích từ bài viết.

**✅ TIÊU CHÍ ĐẠT**: (Chỉ nêu ý chính).

**💡 ACTION PLAN — 5 BƯỚC SỬA ĐỂ LÊN 90+**:
Cung cấp 5 hành động cụ thể, mỗi bước kèm VÍ DỤ viết lại câu/đoạn cụ thể từ bài.

**📊 KHÁM BỆNH KEYWORD**:
- Focus Keyword: "..." — Số lần: X — Mật độ: X%
- Vị trí: Đầu bài [✓/✗] | Kết luận [✓/✗] | H2/H3 [✓/✗]
- Danh sách Fluff Words phát hiện: [từ1: Xlần, từ2: Xlần, ...]
- 10 LSI Keywords đề xuất bổ sung: [...]`;

            const prompt = `--- BÀI VIẾT ĐANG KHÁM ---
Tiêu đề: ${title || '(Chưa có)'}
Mô tả (Desc): ${excerpt || '(Chưa có)'}
Tags: ${tags || '(Chưa có)'}

Nội dung:
${content || '(Chưa đầy đủ)'}
-------------------------------
Hãy khám bệnh SEO bài này cực kỳ gắt gao. Chấm từng tiêu chí 10 mục × 10 điểm. ĐẾM chính xác số fluff words, keyword density. Trích dẫn CỤ THỂ các đoạn văn lỗi.`;

            stream = await generateContentStream(prompt, systemPrompt);
        } else if (action === 'seo-suggest') {
            const { title, content, tags } = payload;
            const focusKeyword = tags ? tags.split(',')[0].trim() : '';
            const systemPrompt = `Bạn là chuyên gia SEO chuyên tối ưu CTR (Click-Through Rate) cho kết quả tìm kiếm Google.
${focusKeyword ? `TỪ KHÓA CHÍNH CẦN TỐI ƯU: "${focusKeyword}". Bắt buộc phải chứa từ khóa này ở ĐẦU tiêu đề và trong meta description.` : ''}

QUY TẮC VIẾT META:
- TITLE: Focus keyword ở 3 từ đầu tiên. 50-60 ký tự. Dùng power words (Đánh giá, So sánh, Chi tiết, Trải nghiệm, Giá tốt, Mới nhất). KHÔNG tính từ sáo rỗng (tuyệt vời, đỉnh cao, ấn tượng). Thêm năm hoặc số liệu nổi bật nếu có.
- DESC: 120-155 ký tự. Chứa keyword + 1 CON SỐ cụ thể (giá, thông số nổi bật) + CTA ngắn ("Xem chi tiết", "So sánh ngay"). Phải tạo CURIOSITY GAP khiến người đọc muốn click.
- TAGS: 7-10 tags. Tag đầu = focus keyword. Các tag sau = LSI keywords mở rộng ngữ nghĩa (biến thể, đồng nghĩa, long-tail). Bao gồm cả thuật ngữ kỹ thuật chuyên sâu.

Trả về bằng tiếng Việt, dưới định dạng CHÍNH XÁC, KHÔNG thêm bất kỳ nhận xét nào:
[TITLE]
<1 tiêu đề duy nhất>
[/TITLE]
[DESC]
<1 meta description duy nhất>
[/DESC]
[TAGS]
<7-10 tags phân cách bằng dấu phẩy>
[/TAGS]`;
            
            const prompt = `Tiêu đề hiện tại: ${title}\nTags hiện tại: ${tags || '(Chưa có)'}\n\nNội dung bài viết (phân tích nội dung để trích xuất số liệu, USP cho meta):\n${content}`;
            stream = await generateContentStream(prompt, systemPrompt);
        } else if (action === 'content-suggest') {
            const { title, content, tags, excerpt } = payload;
            const focusKeyword = tags ? tags.split(',')[0].trim() : '';
            const allKeywords = tags || '';
            const systemPrompt = `Bạn là một Chuyên gia Viết Bài Chuẩn SEO Cấp Cao (Senior SEO Content Writer) chuyên về lĩnh vực công nghệ & điện thoại. Bạn am hiểu E-E-A-T và Helpful Content Update thuật toán mới nhất của Google.
Nhiệm vụ: Viết bài hoặc mở rộng bài viết từ khóa được cấp một cách tự nhiên, chuyên sâu, mang tính chuyên gia THẬT SỰ.

═══════════════════════════════════════
🚫 LUẬT CẤM TUYỆT ĐỐI (Vi phạm = bài rác):
═══════════════════════════════════════
1. CẤM NHỒI NHÉT TÍNH TỪ (Fluff Writing): KHÔNG được dùng các từ sáo rỗng như "tuyệt vời", "ấn tượng", "đỉnh cao", "tác phẩm nghệ thuật", "rực rỡ", "hoàn hảo", "xuất sắc", "đáng kinh ngạc". Mỗi nhận xét PHẢI kèm BẰNG CHỨNG hoặc SỐ LIỆU cụ thể.
   - SAI: "Màn hình rực rỡ với độ phân giải ấn tượng"
   - ĐÚNG: "Màn hình LTPO AMOLED 6.7 inch, độ phân giải 1290x2796 pixel (460 ppi), độ sáng tối đa 2000 nits — sáng hơn 25% so với Galaxy S24 Ultra (1750 nits)"
2. CẤM VIẾT CHUNG CHUNG: Mỗi tính năng đề cập PHẢI giải thích TẠI SAO nó tốt hơn đối thủ hoặc thế hệ trước, với số liệu/benchmark cụ thể.
3. CẤM LIỆT KÊ THÔNG SỐ KHÔ: Phải PHÂN TÍCH ý nghĩa thực tế của thông số đó đối với người dùng.

${focusKeyword ? `═══════════════════════════════════════
⚠️ FOCUS KEYWORD: "${focusKeyword}"
TUÂN THỦ CÁC LUẬT SEO BẮT BUỘC:
═══════════════════════════════════════
1. Keyword "${focusKeyword}" PHẢI có mặt trong 100 từ đầu tiên một cách tự nhiên!
2. Rải keyword chính vào ít nhất 2 thẻ <h2>, <h3>. Phân cấp rõ rệt.
3. Mật độ keyword chính: 0.8% - 1.5%. KHÔNG nhồi nhét (> 2% = phạt).
4. Keyword PHẢI xuất hiện ở đoạn kết luận cuối bài.
5. Nội dung chuyên sâu, giải quyết tận gốc Search Intent. Độ dài > 1200 từ.
` : `═══════════════════════════════════════
YÊU CẦU BẮT BUỘC:
═══════════════════════════════════════
1. Bài viết phải sâu sắc, cung cấp giá trị chuyên gia thực tế. Độ dài > 1200 từ.
`}
═══════════════════════════════════════
🧠 SEMANTIC SEO & LSI (CỰC KỲ QUAN TRỌNG):
═══════════════════════════════════════
Bạn PHẢI mở rộng ngữ nghĩa cho mỗi chủ đề đề cập. Không chỉ nói tên tính năng mà phải dùng các thuật ngữ chuyên sâu liên quan:
- Camera → thuật toán xử lý ảnh (HDR multi-frame, computational photography, pixel binning, semantic segmentation, AI scene detection, Night Mode long-exposure stacking)
- Hiệu năng → benchmark cụ thể (AnTuTu, Geekbench single/multi-core, GPU stress test, thermal throttling %)
- Màn hình → công nghệ panel (LTPO 4.0, PWM dimming frequency, color gamut DCI-P3 coverage %, Delta E < 1)
- Pin → watt sạc, thời gian sạc 0-100%, SOT (Screen-on Time) thực tế, công nghệ pin (silicon-carbon anode)
- Thiết kế → vật liệu cụ thể (Titanium Grade 5, Ceramic Shield, Gorilla Glass Victus 2), trọng lượng gram, IP rating
Dựa vào bộ tags: ${allKeywords} để tạo thêm các LSI keywords tự nhiên xuyên suốt bài.

═══════════════════════════════════════
🔗 LIÊN KẾT NỘI BỘ (Topical Authority):
═══════════════════════════════════════
Bạn PHẢI chèn liên kết rải ĐỀU KHẮP BÀI, KHÔNG gom cuối bài:
- Đầu bài (trong 200 từ đầu): 1 liên kết tới bài viết liên quan (review thế hệ cũ, so sánh đối thủ)
- Giữa bài: 2-3 liên kết ngữ cảnh (contextual links) trong các đoạn phân tích tính năng
- Cuối bài: 1-2 liên kết CTA
Cú pháp: [GỢI Ý LIÊN KẾT: Anchor text mô tả rõ nội dung đích — VD: "So sánh chi tiết camera iPhone 16 Pro Max vs Galaxy S25 Ultra"]
Tổng tối thiểu: 4-5 liên kết nội bộ phân bổ đều.

═══════════════════════════════════════
📐 QUY TRÌNH FORMAT & MULTIMEDIA:
═══════════════════════════════════════
- Viết bằng HTML SẠCH: <h2>, <h3>, <p>, <strong>, <em>, <ul>, <li>. Tuyệt đối không dùng Markdown, Markdown là rác.
- 📸 QUY TẮC CHÈN ẢNH BẰNG PROMPT AI: Bạn PHẢI chèn ít nhất 3 vị trí ảnh dàn trải đều trong bài. Quan trọng: Nội dung bên trong ngoặc sẽ được dùng TRỰC TIẾP LÀM PROMPT CHO AI GENERATOR. Vậy nên mô tả phải là CẢNH VẬT CÔNG NGHỆ, NHÂN VẬT THỰC TẾ, GÓC NHÌN CHUYÊN NGHIỆP, CỤ THỂ (không chung chung).
  -> Cú pháp: [CHÈN HÌNH ẢNH: mô tả cực kỳ chi tiết vật thể, bối cảnh, ánh sáng, góc máy ảo thực tế (không có chữ trong ảnh)].
  -> SAI: [CHÈN HÌNH ẢNH: điện thoại đẹp]
  -> ĐÚNG: [CHÈN HÌNH ẢNH: Close-up shot of a smartphone rear camera module with 4 lenses, titanium frame, on a dark marble surface, soft studio lighting from left, shallow depth of field, 85mm lens perspective]
- 🎬 QUY TẮC CHÈN VIDEO: [CHÈN VIDEO: Tên video hoặc chủ đề review chi tiết cần có]. Ít nhất 1 video.
- Kết bài luôn có CTA (Call To Action) mạnh mẽ chốt sale kèm liên kết.

═══════════════════════════════════════
✍️ PHONG CÁCH VIẾT (E-E-A-T):
═══════════════════════════════════════
- Viết như một reviewer chuyên nghiệp đã CẦM MÁY THỰC TẾ, không phải tổng hợp thông tin từ internet.
- Đưa ra NHẬN ĐỊNH CÁ NHÂN dựa trên trải nghiệm (VD: "Sau 2 tuần sử dụng, tôi nhận thấy...", "Điểm khiến tôi thất vọng nhất là...")
- So sánh TRỰC TIẾP với đối thủ cùng phân khúc (nêu tên cụ thể, số liệu cụ thể)
- Nêu cả NHƯỢC ĐIỂM — bài review không có nhược điểm = bài quảng cáo = Google đánh rớt
- Mỗi section kết thúc bằng 1 câu tổng kết ngắn gọn mang tính đánh giá.`;
            
            const prompt = `Từ khóa chính: ${focusKeyword || title}\nBộ từ khóa (Tags): ${allKeywords}\nTiêu đề đã chốt: ${title}\nMô tả (Meta Desc): ${excerpt}\n\nDữ liệu tham khảo / Dàn ý thô:\n${content || '(Tự nghiên cứu và viết full bài hoàn chỉnh)'}\n\nYêu cầu: Viết bài viết HTML chuẩn SEO 90+ điểm. Mỗi nhận xét phải có số liệu/benchmark kèm theo. Phải nêu cả ưu và nhược điểm. Phải có ít nhất 4 liên kết nội bộ rải đều. Phải dùng thuật ngữ chuyên sâu (LSI) cho mỗi tính năng đề cập.`;
            stream = await generateContentStream(prompt, systemPrompt);
        } else if (action === 'auto-refine') {
            // ═══════════════════════════════════════════════════════════
            // AUTO-REFINE LOOP: Check → Fix → Re-check until score >= target
            // ═══════════════════════════════════════════════════════════
            const { title, content, tags, excerpt, targetScore = 85, maxRounds = 3 } = payload;
            const focusKeyword = tags ? tags.split(',')[0].trim() : '';
            const allKeywords = tags || '';

            // Internal SEO Check prompt (simplified, structured output for parsing)
            const checkSystemPrompt = `Bạn là Chuyên gia Kiểm Duyệt SEO Google cực kỳ khó tính. Chấm điểm bài viết theo 10 tiêu chí (mỗi tiêu chí 10đ, tổng 100đ).
FOCUS KEYWORD: "${focusKeyword || title}"

TIÊU CHÍ: 1.EEAT/Chiều sâu 2.Fluff Writing 3.Title&Meta 4.Keyword Density 5.LSI/Semantic 6.Cấu trúc 7.Đa phương tiện 8.Liên kết nội bộ 9.CTA 10.Độc đáo

Trả về ĐÚNG format sau, KHÔNG thêm gì khác:
SCORE: [số]/100
ISSUES:
1. [Mô tả lỗi cụ thể — trích dẫn đoạn văn lỗi nếu có]
2. [Lỗi tiếp theo]
...
FIX_INSTRUCTIONS:
1. [Hướng dẫn sửa cụ thể cho lỗi 1 — kèm VÍ DỤ viết lại]
2. [Hướng dẫn sửa cụ thể cho lỗi 2 — kèm VÍ DỤ viết lại]
...`;

            // Refine system prompt
            const refineSystemPrompt = `Bạn là Chuyên gia Viết Bài Chuẩn SEO Cấp Cao. Nhiệm vụ: VIẾT LẠI TOÀN BỘ bài viết để sửa TẤT CẢ các lỗi SEO được liệt kê.

LUẬT BẮT BUỘC:
- GIỮ NGUYÊN cấu trúc HTML (<h2>, <h3>, <p>, etc.) và các placeholder ([CHÈN HÌNH ẢNH: ...], [CHÈN VIDEO: ...], [GỢI Ý LIÊN KẾT: ...]).
- CẤM dùng tính từ sáo rỗng: tuyệt vời, ấn tượng, đỉnh cao, rực rỡ, hoàn hảo, xuất sắc, đáng kinh ngạc, vượt trội, mãn nhãn.
- Mỗi nhận xét PHẢI kèm số liệu/benchmark cụ thể.
- Phải nêu cả NHƯỢC ĐIỂM.
- Keyword "${focusKeyword}" phải có trong 100 từ đầu VÀ đoạn kết luận. Mật độ 0.8-1.5%.
- Dùng thuật ngữ LSI chuyên sâu xuyên suốt. Tags tham khảo: ${allKeywords}
- Liên kết nội bộ [GỢI Ý LIÊN KẾT: ...] phải rải ĐỀU (đầu/giữa/cuối), tối thiểu 4 liên kết.
- Viết bằng HTML sạch. KHÔNG Markdown. Tối thiểu 1200 từ.
- Output CHỈ LÀ bài viết HTML đã sửa, KHÔNG kèm giải thích.`;

            const encoder = new TextEncoder();
            const customStream = new ReadableStream({
                async start(controller) {
                    let currentContent = content;
                    let currentScore = 0;
                    let round = 0;

                    const sendLog = (msg: string) => {
                        controller.enqueue(encoder.encode(JSON.stringify({ type: 'log', message: msg }) + '\n'));
                    };

                    try {
                        while (round < maxRounds) {
                            round++;
                            sendLog(`🔍 Vòng ${round}/${maxRounds}: Đang chấm điểm SEO...`);

                            // Step 1: Run SEO Check internally
                            const checkPrompt = `--- BÀI VIẾT ---\nTiêu đề: ${title}\nMô tả: ${excerpt}\nTags: ${tags}\n\nNội dung:\n${currentContent}\n---\nChấm điểm cực gắt.`;
                            const checkResult = await generateContent(checkPrompt, checkSystemPrompt);

                            // Step 2: Parse score
                            const scoreMatch = checkResult.match(/SCORE:\s*(\d+)/i);
                            currentScore = scoreMatch ? parseInt(scoreMatch[1], 10) : 0;
                            sendLog(`📊 Vòng ${round}: Điểm SEO = ${currentScore}/100`);

                            // Step 3: Check if target reached
                            if (currentScore >= targetScore) {
                                sendLog(`✅ Đạt mục tiêu ${targetScore}đ! Điểm hiện tại: ${currentScore}/100`);
                                break;
                            }

                            // Step 4: Extract issues for fixing
                            const issuesSection = checkResult.match(/ISSUES:[\s\S]*?(?=FIX_INSTRUCTIONS:|$)/i)?.[0] || '';
                            const fixSection = checkResult.match(/FIX_INSTRUCTIONS:[\s\S]*/i)?.[0] || '';
                            
                            sendLog(`🔧 Vòng ${round}: Phát hiện lỗi, đang tự động sửa bài...`);

                            // Step 5: Run Refine
                            const refinePrompt = `BÀI VIẾT HIỆN TẠI:\n${currentContent}\n\n--- BÁO CÁO LỖI SEO (Điểm: ${currentScore}/100) ---\n${issuesSection}\n${fixSection}\n\n--- YÊU CẦU ---\nViết lại TOÀN BỘ bài viết HTML, sửa TẤT CẢ lỗi trên. Giữ nguyên các placeholder [CHÈN HÌNH ẢNH: ...], [CHÈN VIDEO: ...], [GỢI Ý LIÊN KẾT: ...]. Output CHỈ LÀ HTML.`;
                            currentContent = await generateContent(refinePrompt, refineSystemPrompt);

                            sendLog(`✍️ Vòng ${round}: Đã viết lại bài. Chuyển sang kiểm tra lại...`);
                        }

                        // Final check if we exited the loop without reaching target
                        if (currentScore < targetScore && round >= maxRounds) {
                            sendLog(`⚠️ Đã chạy ${maxRounds} vòng, điểm cao nhất: ${currentScore}/100. Trả về phiên bản tốt nhất.`);
                        }

                        // Send final result
                        controller.enqueue(encoder.encode(JSON.stringify({
                            type: 'result',
                            content: currentContent,
                            finalScore: currentScore,
                            rounds: round
                        }) + '\n'));

                    } catch (err) {
                        sendLog(`❌ Lỗi: ${(err as Error).message}`);
                        // Still return whatever content we have
                        controller.enqueue(encoder.encode(JSON.stringify({
                            type: 'result',
                            content: currentContent,
                            finalScore: currentScore,
                            rounds: round,
                            error: (err as Error).message
                        }) + '\n'));
                    } finally {
                        controller.close();
                    }
                }
            });

            return new Response(customStream, {
                headers: {
                    'Content-Type': 'text/plain; charset=utf-8',
                    'Transfer-Encoding': 'chunked',
                },
            });
        } else {
            return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
        }

        // Return a streamed response
        return new Response(stream, {
            headers: {
                'Content-Type': 'text/plain; charset=utf-8',
                'Transfer-Encoding': 'chunked',
            },
        });

    } catch (error) {
        console.error('Admin AI API error:', error);
        return NextResponse.json(
            { error: 'Giao tiếp với AI thất bại. Hãy kiểm tra xem Ollama đã được bật (ollama serve) chưa.' },
            { status: 500 }
        );
    }
}
