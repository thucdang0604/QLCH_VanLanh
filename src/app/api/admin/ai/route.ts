import { NextRequest, NextResponse } from 'next/server';
import { generateContentStream, generateContent, getLocalOllamaModels, AiCallOption } from '@/lib/aiAdapter';
import { requireAdminOrStaff } from '@/lib/apiAuth';
import { isRateLimited } from '@/lib/rateLimit';
import { getApiErrorMessage, getApiErrorStatus, withApi } from '@/lib/api/handler';

const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 60_000;

function isMostlyEnglish(text: string): boolean {
    const vietnameseDiacriticsRegex = /[àáảãạâầấẩẫậăằắẳẵặèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]/i;
    return !vietnameseDiacriticsRegex.test(text);
}

function isTextModelName(name: string): boolean {
    if (!name) return false;
    const lower = name.toLowerCase();
    if (lower.includes('image') || lower.includes('dall-e') || lower.includes('flux') || lower.includes('imagen') || lower.includes('sdxl') || lower.includes('midjourney')) {
        return false;
    }
    return lower.includes('gpt') || lower.includes('claude') || 
           lower.includes('deepseek') || lower.includes('llama') || lower.includes('gemma') || 
           lower.includes('qwen') || lower.includes('ag/') || lower.includes('mistral');
}

export const POST = withApi({
    name: 'admin/ai',
    onError: (error, context) => {
        const status = getApiErrorStatus(error);
        return context.json({
            error: status < 500
                ? getApiErrorMessage(error)
                : 'Giao tiếp với AI thất bại. Hãy kiểm tra cài đặt kết nối và API Key.',
        }, { status });
    },
}, async (request: NextRequest, context) => {
    // ── Auth: chỉ admin hoặc staff mới được dùng ──
    try {
        await requireAdminOrStaff(request);
    } catch {
        return NextResponse.json({ error: 'Unauthorized: admin or staff only' }, { status: 401 });
    }

    // ── Rate limit check ──
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
        || request.headers.get('x-real-ip')
        || 'unknown';

    if (await isRateLimited(ip, 'admin_ai', RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS)) {
        return NextResponse.json(
            { error: 'Quá nhiều yêu cầu. Vui lòng thử lại sau.' },
            { status: 429 }
        );
    }

    const { action, payload } = await context.readJson(request);

    if (!action || !payload) {
        return NextResponse.json({ error: 'Missing action or payload' }, { status: 400 });
    }

    const currentYear = new Date().getFullYear();
    const yearRule = `\n- THỜI GIAN HIỆN TẠI: Năm ${currentYear}. CẤM TUYỆT ĐỐI đề cập các năm cũ (như 2023, 2024, 2025) làm thời điểm hiện tại. Mọi thông tin tiêu đề, bài viết, đánh giá, sản phẩm, và meta description PHẢI CẬP NHẬT THEO NĂM ${currentYear}.`;

    // ── Action: Get Local Ollama Models ──
    if (action === 'get-local-models') {
        const models = await getLocalOllamaModels();
        return NextResponse.json({ ok: true, models });
    }

    // ── Action: Check Connection ──
    if (action === 'check-connection') {
        const { providerMode = 'ollama', apiKey = '', baseUrl = '' } = payload;
        try {
            if (providerMode === 'cloud9router') {
                const trimmedKey = apiKey.trim();
                if (!trimmedKey) {
                    return NextResponse.json({ ok: false, error: 'Vui lòng nhập API Key cho 9router / Cloud API.' });
                }
                const url = (baseUrl || 'https://api.9router.com/v1').replace(/\/+$/, '');
                const testRes = await fetch(`${url}/models`, {
                    headers: { 'Authorization': `Bearer ${trimmedKey}` },
                    signal: AbortSignal.timeout(5000),
                });
                if (!testRes.ok && testRes.status === 401) {
                    return NextResponse.json({ ok: false, error: 'API Key 9router / Cloud API không hợp lệ (401 Unauthorized).' });
                }
                return NextResponse.json({ ok: true });
            }

            // Default: Ollama local check
            const ollamaUrl = process.env.OLLAMA_HOST || 'http://localhost:11434';
            const ollamaRes = await fetch(`${ollamaUrl}/api/tags`, { signal: AbortSignal.timeout(5000) });
            if (!ollamaRes.ok) {
                return NextResponse.json({ ok: false, error: 'Ollama local chưa bật. Vui lòng mở Ollama trên máy.' });
            }

            return NextResponse.json({ ok: true });
        } catch (err) {
            return NextResponse.json({ ok: false, error: 'Không thể kết nối đến AI Engine: ' + (err as Error).message });
        }
    }

    // Shared call options extractor
    const callOptions: AiCallOption = {
        providerMode: payload.providerMode || 'ollama',
        apiKey: payload.apiKey || '',
        baseUrl: payload.baseUrl || '',
        model: payload.model || '',
    };

    // ── Action: Image Generation ──
    if (action === 'generate-image') {
        const { prompt, width: rawWidth = 1024, height: rawHeight = 768, articleTitle = '' } = payload;
        if (!prompt) {
            return NextResponse.json({ error: 'Missing image prompt' }, { status: 400 });
        }

        const width = Math.floor(rawWidth / 8) * 8;
        const height = Math.floor(rawHeight / 8) * 8;
        const apiKey = (payload.apiKey || '').trim();

        // Step 1: Prepare English image prompt
        let englishPrompt = prompt.trim();
        if (!isMostlyEnglish(prompt)) {
            try {
                const contextPart = articleTitle ? `\nArticle context: "${articleTitle}"` : '';
                const textModelForTranslation = payload.textModel || 'ag/gemini-3.6-flash-high';
                const translationCallOptions: AiCallOption = {
                    ...callOptions,
                    model: textModelForTranslation,
                };
                const translated = await generateContent(
                    `Create a brief, high-quality English image generation prompt from this Vietnamese description. Focus on visual elements, photorealistic style, and clarity.${contextPart}\n\nVietnamese: "${prompt}"\n\nOutput ONLY the English prompt (max 60 words).`,
                    'You are an AI image prompt engineer. Convert Vietnamese descriptions into vivid, professional English prompts. Output ONLY the prompt text.',
                    translationCallOptions
                );
                if (translated && translated.trim()) {
                    englishPrompt = translated.trim().replace(/^["']|["']$/g, '');
                }
            } catch (e) {
                console.warn('Image prompt translation failed/skipped:', (e as Error).message);
            }
        }

        // Provider Option A: 9router / OpenAI Compatible `/v1/images/generations`
        let last9routerError = '';
        if (callOptions.providerMode === 'cloud9router' && apiKey) {
            const rawImgModel = payload.modelName || payload.model || '';
            const targetImgModel = (rawImgModel && !isTextModelName(rawImgModel)) ? rawImgModel : 'ag/gemini-3.1-flash-image';
            const baseUrl = `${callOptions.baseUrl || 'https://api.9router.com/v1'}`.replace(/\/+$/, '');
            const url = `${baseUrl}/images/generations`;

            const payloadsToTry = [
                {
                    model: targetImgModel,
                    prompt: englishPrompt,
                    n: 1,
                    size: 'auto',
                    quality: 'auto',
                    background: 'auto',
                    image_detail: 'high',
                    output_format: 'png',
                },
                {
                    model: targetImgModel,
                    prompt: englishPrompt,
                    n: 1,
                    size: '1024x1024',
                }
            ];

            for (let attempt = 0; attempt < 3; attempt++) {
                if (attempt > 0) {
                    await new Promise(r => setTimeout(r, 2000 * attempt));
                }
                for (const bodyPayload of payloadsToTry) {
                    try {
                        const res = await fetch(url, {
                            method: 'POST',
                            headers: {
                                'Authorization': apiKey.startsWith('Bearer ') ? apiKey : `Bearer ${apiKey}`,
                                'Content-Type': 'application/json',
                            },
                            body: JSON.stringify(bodyPayload),
                            signal: AbortSignal.timeout(60000),
                        });

                        if (res.ok) {
                            const data = await res.json();
                            const item = data.data?.[0] || data.images?.[0] || data[0];
                            let rawB64 = item?.b64_json || item?.base64 || (typeof item === 'string' && item.length > 100 ? item : '');

                            if (rawB64) {
                                rawB64 = rawB64.replace(/^data:image\/\w+;base64,/, '');
                                const buffer = Buffer.from(rawB64, 'base64');
                                return new Response(buffer, {
                                    headers: { 'Content-Type': 'image/png', 'Cache-Control': 'no-cache' }
                                });
                            } else if (item?.url) {
                                const fetchRes = await fetch(item.url);
                                if (fetchRes.ok) {
                                    const buf = await fetchRes.arrayBuffer();
                                    return new Response(buf, {
                                        headers: { 'Content-Type': 'image/png', 'Cache-Control': 'no-cache' }
                                    });
                                }
                            }
                        } else {
                            const errText = await res.text();
                            last9routerError = `9router (${res.status}): ${errText}`;
                            console.warn(`9router /v1/images/generations API error (${res.status}):`, errText);
                            if (res.status === 429 || errText.includes('exhausted your capacity') || errText.includes('reset after')) {
                                await new Promise(r => setTimeout(r, 2000));
                                break;
                            }
                        }
                    } catch (e) {
                        last9routerError = `Không thể kết nối tới 9router Base URL (${baseUrl}): ${(e as Error).message}`;
                        console.warn('9router image generation fetch exception:', (e as Error).message);
                    }
                }
            }

        }

        // Provider Option B: Google Gemini Direct API Key
        if (apiKey && apiKey.trim() !== '') {
            try {
                const body = {
                    contents: [{ role: "user", parts: [{ text: englishPrompt }] }],
                    generationConfig: { responseModalities: ["IMAGE"] }
                };
                const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image-preview:generateContent?key=${apiKey.trim()}`;
                const geminiRes = await fetch(geminiUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body),
                    signal: AbortSignal.timeout(60000)
                });
                
                if (geminiRes.ok) {
                    const data = await geminiRes.json();
                    let base64Img = '';
                    if (data.candidates && data.candidates[0]?.content?.parts[0]?.inlineData?.data) {
                        base64Img = data.candidates[0].content.parts[0].inlineData.data;
                    } else if (data.predictions && data.predictions.length > 0 && data.predictions[0].bytesBase64) {
                        base64Img = data.predictions[0].bytesBase64;
                    }
                    if (base64Img) {
                        const buffer = Buffer.from(base64Img, 'base64');
                        return new Response(buffer, {
                            headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'no-cache' }
                        });
                    }
                }
            } catch (geminiError) {
                console.error('Gemini Fetch Error:', geminiError);
            }
        }
        
        // Provider Option C: Pollinations.ai Free Image Generator (Cascade Fallback)
        const pollinationsModels = ['flux', 'flux-realism', 'turbo'];
        for (const pModel of pollinationsModels) {
            const imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(englishPrompt)}?model=${pModel}&width=${width}&height=${height}&nologo=true&seed=${Date.now()}`;
            try {
                const imgRes = await fetch(imageUrl, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                        'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
                    },
                    signal: AbortSignal.timeout(25000),
                });
                if (imgRes.ok) {
                    const buffer = await imgRes.arrayBuffer();
                    return new Response(buffer, {
                        headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'no-cache' }
                    });
                }
            } catch (fetchError) {
                console.warn(`Pollinations ${pModel} fetch failed:`, (fetchError as Error).message);
            }
        }

        const finalErrorMessage = last9routerError
            ? `Lỗi từ 9router API: ${last9routerError}`
            : 'Không thể tạo ảnh từ các máy chủ AI. Vui lòng kiểm tra lại Base URL hoặc API Key.';

        return NextResponse.json({ error: finalErrorMessage }, { status: 502 });

    }

    let stream: ReadableStream;

    if (action === 'generate-content') {
        const { contentType, prompt } = payload;
        const baseRules = `${yearRule}\n\nLUẬT VIẾT BẮT BUỘC:\n- KHÔNG nhồi tính từ sáo rỗng (tuyệt vời, ấn tượng, đỉnh cao, hoàn hảo). Mỗi nhận xét phải kèm số liệu hoặc so sánh cụ thể.\n- Viết bằng HTML sạch (<h2>, <h3>, <p>, <strong>, <ul>, <li>). KHÔNG dùng Markdown.\n- Mỗi đoạn văn tối đa 3 câu. Ưu tiên câu ngắn, rõ ràng.\n- Phải nêu cả ưu điểm VÀ nhược điểm/hạn chế (nếu có). Không viết kiểu quảng cáo 1 chiều.`;

        let systemPrompt = `Bạn là chuyên gia sáng tạo nội dung công nghệ tiếng Việt năm ${currentYear}, am hiểu SEO và EEAT.`;
        if (contentType === 'product') {
            systemPrompt += ` Viết mô tả sản phẩm thuyết phục nhưng KHÁCH QUAN:\n- Mở đầu: 1 câu hook nêu USP nổi bật nhất + con số cụ thể.\n- Thân: Phân tích từng tính năng chính kèm THÔNG SỐ KỸ THUẬT và SO SÁNH với đối thủ cùng tầm giá.\n- Giải thích ý nghĩa thực tế đối với người dùng.\n- Kết: CTA rõ ràng.${baseRules}`;
        } else if (contentType === 'promo') {
            systemPrompt += ` Tạo nội dung khuyến mãi chuyên nghiệp:\n- Tiêu đề: Nêu rõ % giảm giá / giá trị ưu đãi bằng CON SỐ CỤ THỂ.\n- Mức giá gốc → giá sale → tiết kiệm được bao nhiêu.\n- Kèm CTA rõ ràng.${baseRules}`;
        } else if (contentType === 'article') {
            systemPrompt += ` Viết bài review/phân tích chuẩn SEO flagship năm ${currentYear}:\n- Mở bài: Hook mạnh + focus keyword trong 100 từ đầu.\n- Thân bài: Chia thành các mục <h2> rõ ràng có số liệu benchmark/so sánh.\n- Dùng thuật ngữ LSI chuyên sâu.\n- Chèn ít nhất 3 [IMAGE_PROMPT: mô tả vị trí và ngữ cảnh ảnh thực tế], 1 [CHÈN VIDEO: ...], 4 [GỢI Ý LIÊN KẾT: ...].\n- Nêu cả NHƯỢC ĐIỂM.\n- Độ dài tối thiểu 1200 từ.${baseRules}`;
        } else if (contentType === 'seo') {
            systemPrompt += ` Cung cấp bộ Meta Tags tối ưu chuẩn SEO năm ${currentYear}:\n[TITLE]: ...\n[DESC]: ...\n[TAGS]: ...`;
        }

        stream = await generateContentStream(`Yêu cầu tạo nội dung (Năm hiện tại ${currentYear}): ${prompt}`, systemPrompt, callOptions);
    } else if (action === 'seo-check') {
        const { title, content, tags, excerpt } = payload;
        const systemPrompt = `Bạn là Chuyên gia Kiểm Duyệt SEO Google cực kỳ khó tính và khắt khe. Nhiệm vụ của bạn là chấm điểm và báo cáo lỗi bài viết một cách tàn nhẫn, khách quan đúng với thực tế thuật toán Google cập nhật mới nhất năm ${currentYear} (EEAT, Helpful Content). KHÔNG khen ngợi dư thừa.${yearRule}
LẤY TỪ KHÓA ĐẦU TIÊN TRONG 'TAGS' LÀM TỪ KHÓA CHÍNH (FOCUS KEYWORD).

TIÊU CHÍ PHÂN TÍCH (10 mục, mỗi mục 10đ):
1. EEAT & Chiều sâu chuyên môn
2. Fluff Writing (tính từ sáo rỗng: tuyệt vời, đỉnh cao, hoàn hảo...)
3. Title & Meta Desc
4. Keyword Placement & Density (0.8%-1.5%)
5. Semantic SEO & LSI Keywords
6. Cấu trúc & Readability (>1200 từ)
7. Đa phương tiện ([CHÈN HÌNH ẢNH], [CHÈN VIDEO])
8. Liên kết nội bộ ([GỢI Ý LIÊN KẾT] ≥ 4)
9. CTA & Conversion
10. Tính độc đáo

ĐỊNH DẠNG BÁO CÁO (TIẾNG VIỆT):
**📊 BẢNG ĐIỂM CHI TIẾT:** (10 mục, tổng/100)
**🚨 LỖI NGHIÊM TRỌNG (Critical Errors)**
**✅ TIÊU CHÍ ĐẠT**
**💡 ACTION PLAN — 5 BƯỚC SỬA ĐỂ LÊN 90+**
**📊 KHÁM BỆNH KEYWORD**`;

        const prompt = `--- BÀI VIẾT ĐANG KHÁM (NĂM HIỆN TẠI ${currentYear}) ---
Tiêu đề: ${title || '(Chưa có)'}
Mô tả (Desc): ${excerpt || '(Chưa có)'}
Tags: ${tags || '(Chưa có)'}

Nội dung:
${content || '(Chưa đầy đủ)'}
-------------------------------
Hãy khám bệnh SEO bài này cực kỳ gắt gao. Chấm từng tiêu chí 10 mục × 10 điểm.`;

        stream = await generateContentStream(prompt, systemPrompt, callOptions);
    } else if (action === 'seo-suggest') {
        const { title, content, tags } = payload;
        const focusKeyword = tags ? tags.split(',')[0].trim() : '';
        const systemPrompt = `Bạn là chuyên gia SEO chuyên tối ưu CTR cho kết quả tìm kiếm Google năm ${currentYear}.${yearRule}
${focusKeyword ? `TỪ KHÓA CHÍNH CẦN TỐI ƯU: "${focusKeyword}".` : ''}

QUY TẮC VIẾT META:
- TITLE: Focus keyword ở 3 từ đầu tiên. 50-60 ký tự. KHÔNG tính từ sáo rỗng. Cập nhật theo mốc năm ${currentYear}.
- DESC: 120-155 ký tự. Chứa keyword + 1 CON SỐ cụ thể + CTA ngắn.
- TAGS: 7-10 tags phân cách bằng dấu phẩy.

Trả về bằng tiếng Việt, dưới định dạng CHÍNH XÁC:
[TITLE]
<1 tiêu đề duy nhất>
[/TITLE]
[DESC]
<1 meta description duy nhất>
[/DESC]
[TAGS]
<7-10 tags phân cách bằng dấu phẩy>
[/TAGS]`;
        
        const prompt = `Tiêu đề hiện tại: ${title}\nTags hiện tại: ${tags || '(Chưa có)'}\nNội dung:\n${content}`;
        stream = await generateContentStream(prompt, systemPrompt, callOptions);
    } else if (action === 'content-suggest') {
        const { title, content, tags, excerpt } = payload;
        const focusKeyword = tags ? tags.split(',')[0].trim() : '';
        const allKeywords = tags || '';
        const systemPrompt = `Bạn là Senior SEO Content Writer chuyên về công nghệ & điện thoại năm ${currentYear}, am hiểu E-E-A-T.${yearRule}

LUẬT BẮT BUỘC:
1. THỜI GIAN LÀ NĂM ${currentYear}. CẤM TUYỆT ĐỐI ghi 2024 hay 2025 làm năm hiện tại.
2. KHÔNG nhồi tính từ sáo rỗng (tuyệt vời, ấn tượng, đỉnh cao, hoàn hảo). Mỗi nhận xét PHẢI kèm số liệu hoặc so sánh cụ thể.
3. Nêu cả NHƯỢC ĐIỂM.
4. Keyword "${focusKeyword}" phải xuất hiện trong 100 từ đầu tiên và ở đoạn kết luận. Mật độ 0.8-1.5%.
5. Dùng thuật ngữ LSI chuyên sâu. Tags: ${allKeywords}
6. Chèn ít nhất 3 [IMAGE_PROMPT: mô tả bối cảnh ngắn gọn về hình ảnh], 1 [CHÈN VIDEO: ...], 4 [GỢI Ý LIÊN KẾT: ...].
7. Viết bằng HTML sạch (<h2>, <h3>, <p>, <strong>, <ul>, <li>). KHÔNG DÙNG MARKDOWN. Độ dài > 1200 từ.`;
        
        const prompt = `Từ khóa chính: ${focusKeyword || title}\nBộ từ khóa: ${allKeywords}\nTiêu đề: ${title}\nMô tả: ${excerpt}\nNội dung/Dàn ý:\n${content || '(Tự viết bài hoàn chỉnh)'}`;
        stream = await generateContentStream(prompt, systemPrompt, callOptions);
    } else if (action === 'auto-refine') {
        const { title, content, tags, excerpt, targetScore = 85, maxRounds = 3 } = payload;
        const focusKeyword = tags ? tags.split(',')[0].trim() : '';
        const allKeywords = tags || '';

        const checkSystemPrompt = `Bạn là Chuyên gia Kiểm Duyệt SEO Google năm ${currentYear}.${yearRule} Chấm điểm bài viết theo 10 tiêu chí (mỗi tiêu chí 10đ, tổng 100đ).
5. Đa phương tiện ([IMAGE_PROMPT], [CHÈN VIDEO])
FOCUS KEYWORD: "${focusKeyword || title}"

Trả về ĐÚNG format:
SCORE: [số]/100
ISSUES:
1. [Mô tả lỗi]
FIX_INSTRUCTIONS:
1. [Hướng dẫn sửa]`;

        const refineSystemPrompt = `Bạn là Chuyên gia Viết Bài Chuẩn SEO năm ${currentYear}.${yearRule} Nhiệm vụ: VIẾT LẠI TOÀN BỘ bài viết để sửa TẤT CẢ các lỗi SEO được liệt kê.
${allKeywords ? `LSI Keywords / Tags: ${allKeywords}` : ''}

LUẬT BẮT BUỘC:
- THỜI GIAN LÀ NĂM ${currentYear}. CẤM ghi năm cũ 2024/2025 làm năm hiện tại.
- GIỮ NGUYÊN cấu trúc HTML và các placeholder ([IMAGE_PROMPT: ...], [CHÈN VIDEO: ...], [GỢI Ý LIÊN KẾT: ...]).
- KHÔNG dùng tính từ sáo rỗng. Phải kèm số liệu cụ thể và nêu NHƯỢC ĐIỂM.
- Keyword "${focusKeyword}" trong 100 từ đầu VÀ kết luận.
- Output CHỈ LÀ bài viết HTML đã sửa.`;

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

                        const checkPrompt = `--- BÀI VIẾT (NĂM ${currentYear}) ---\nTiêu đề: ${title}\nMô tả: ${excerpt}\nTags: ${tags}\n\nNội dung:\n${currentContent}\n---\nChấm điểm.`;
                        const checkResult = await generateContent(checkPrompt, checkSystemPrompt, callOptions);

                        const scoreMatch = checkResult.match(/SCORE:\s*(\d+)/i);
                        currentScore = scoreMatch ? parseInt(scoreMatch[1], 10) : 0;
                        sendLog(`📊 Vòng ${round}: Điểm SEO = ${currentScore}/100`);

                        if (currentScore >= targetScore) {
                            sendLog(`✅ Đạt mục tiêu ${targetScore}đ! Điểm hiện tại: ${currentScore}/100`);
                            break;
                        }

                        const issuesSection = checkResult.match(/ISSUES:[\s\S]*?(?=FIX_INSTRUCTIONS:|$)/i)?.[0] || '';
                        const fixSection = checkResult.match(/FIX_INSTRUCTIONS:[\s\S]*/i)?.[0] || '';
                        
                        sendLog(`🔧 Vòng ${round}: Phát hiện lỗi, đang tự động sửa bài...`);

                        const refinePrompt = `BÀI VIẾT HIỆN TẠI (NĂM ${currentYear}):\n${currentContent}\n\n--- BÁO CÁO LỖI SEO (Điểm: ${currentScore}/100) ---\n${issuesSection}\n${fixSection}\n\n--- YÊU CẦU ---\nViết lại TOÀN BỘ bài viết HTML, sửa TẤT CẢ lỗi trên. Output CHỈ LÀ HTML.`;
                        currentContent = await generateContent(refinePrompt, refineSystemPrompt, callOptions);

                        sendLog(`✍️ Vòng ${round}: Đã viết lại bài. Chuyển sang kiểm tra lại...`);
                    }

                    if (currentScore < targetScore && round >= maxRounds) {
                        sendLog(`⚠️ Đã chạy ${maxRounds} vòng, điểm cao nhất: ${currentScore}/100.`);
                    }

                    controller.enqueue(encoder.encode(JSON.stringify({
                        type: 'result',
                        content: currentContent,
                        finalScore: currentScore,
                        rounds: round
                    }) + '\n'));

                } catch (err) {
                    sendLog(`❌ Lỗi: ${(err as Error).message}`);
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

    return new Response(stream, {
        headers: {
            'Content-Type': 'text/plain; charset=utf-8',
            'Transfer-Encoding': 'chunked',
        },
    });
});
