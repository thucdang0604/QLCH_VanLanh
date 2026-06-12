import { GoogleGenerativeAI } from '@google/generative-ai';
import type { Content } from '@google/generative-ai';
import { getBusinessIdentity } from './businessIdentity';

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GEMINI_API_KEY || '');

export const geminiModel = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
const businessIdentity = getBusinessIdentity();

// ===== System prompt — business AI consultant =====
const SYSTEM_PROMPT = `Bạn là AI tư vấn viên của ${businessIdentity.siteName} — Trung tâm sửa chữa điện thoại, laptop & thiết bị công nghệ.

## Thông tin doanh nghiệp:
- Tên đầy đủ: ${businessIdentity.siteName}
- MST: 0317074184
- Website: ${businessIdentity.siteUrl}

## Địa chỉ & Liên hệ:
- Trụ sở chính: ${businessIdentity.address}
- Hotline chính: ${businessIdentity.formattedPhone}
- Hotline bán hàng: ${businessIdentity.formattedPhone}
- Hotline bảo hành, kỹ thuật: ${businessIdentity.formattedPhone}
- Hotline hỗ trợ phần mềm: ${businessIdentity.formattedPhone}
- Giờ làm việc: 7h30 – 21h00 (Thứ 2 – Chủ Nhật, không nghỉ trưa)

## Cam kết dịch vụ:
- Linh kiện chính hãng 100%
- Bảo hành rõ ràng, minh bạch
- Sửa chữa nhanh chóng, lấy liền
- Báo giá minh bạch trước khi sửa
- Kỹ thuật viên nhiều năm kinh nghiệm

## Dịch vụ chính:
- Sửa chữa iPhone (thay màn hình, pin, camera, loa, mic, cổng sạc, kính lưng...)
- Sửa chữa Samsung Galaxy (thay màn OLED, pin, ép kính...)
- Sửa chữa OPPO, Xiaomi, Vivo, Realme, Huawei, OnePlus
- Sửa chữa Laptop (MacBook, Dell, HP, Lenovo, Asus)
- Sửa chữa Tablet, iPad
- Nâng cấp SSD, RAM laptop
- Cài đặt phần mềm, cứu dữ liệu
- Bán điện thoại mới và cũ (iPhone, Samsung, Xiaomi, OPPO...)
- Phụ kiện (ốp lưng, cáp sạc, tai nghe, pin dự phòng...)
- Đồng hồ thông minh
- Hỗ trợ mua hàng trả góp

## Quy tắc trả lời:
1. Tư vấn nhẹ nhàng, thân thiện, chuyên nghiệp
2. Nếu biết giá, hãy báo giá ước lượng
3. Luôn khuyến khích khách hàng gọi Hotline ${businessIdentity.formattedPhone} hoặc đến trực tiếp cửa hàng để được tư vấn chính xác nhất
4. Trả lời bằng tiếng Việt, ngắn gọn, dễ hiểu
5. Nếu không chắc về giá cụ thể, hãy nói "Giá có thể thay đổi tùy tình trạng máy, anh/chị vui lòng liên hệ Hotline ${businessIdentity.formattedPhone} để được báo giá chính xác nhất"
6. Không bịa đặt thông tin kỹ thuật không chắc chắn`;

// Chat function for customer support
export async function chatWithGemini(message: string, context?: string, history?: Content[]) {
    // Tinh chỉnh behavior của AI
    const enhancedPrompt = context
        ? `${SYSTEM_PROMPT}\n\n[HƯỚNG DẪN BỔ SUNG YÊU CẦU CHO TIN NHẮN NÀY]: ${context}`
        : `${SYSTEM_PROMPT}`;

    try {
        // Validate and sanitize chat history for Gemini strict rules
        // Rule 1: Must start with 'user'
        // Rule 2: Must alternate user -> model -> user -> model
        const formattedHistory: Content[] = [];
        if (history && Array.isArray(history)) {
            // First, strip out the last message if it's the exact same as the current prompt
            // (Frontend sometimes appends it before sending)
            const rawHistory = [...history];
            if (rawHistory.length > 0 &&
                rawHistory[rawHistory.length - 1].role === 'user' &&
                rawHistory[rawHistory.length - 1].parts[0].text === message) {
                rawHistory.pop();
            }

            let expectedRole = 'user';

            for (const msg of rawHistory) {
                if (msg.role === expectedRole) {
                    formattedHistory.push({
                        role: msg.role,
                        parts: msg.parts?.length ? msg.parts : [{ text: '' }] // Ensure parts structure
                    });
                    expectedRole = expectedRole === 'user' ? 'model' : 'user';
                }
            }

            // If history ends up expecting a 'model' (meaning it currently ends with 'user'),
            // we must pop it because we are about to pass a new 'user' message via sendMessage()
            if (expectedRole === 'model' && formattedHistory.length > 0) {
                formattedHistory.pop();
            }
        }

        // Khởi tạo model cụ thể cho cuộc hội thoại này cùng system prompt
        const dynamicModel = genAI.getGenerativeModel({
            model: 'gemini-2.5-flash',
            systemInstruction: enhancedPrompt,
        });

        // Mở một session chat mới có "bộ nhớ"
        const chat = dynamicModel.startChat({
            history: formattedHistory,
            generationConfig: {
                temperature: 0.7, // Tăng độ sáng tạo, mềm mại, nhiệt tình
                topK: 40,
                topP: 0.95,
                maxOutputTokens: 1024,
            }
        });

        // Gửi tin nhắn mới nhất
        const result = await chat.sendMessage(message);
        const response = await result.response;
        return response.text();
    } catch (error) {
        console.error('Gemini API Error:', error);
        return `Xin lỗi, tôi không thể xử lý yêu cầu này. Vui lòng gọi Hotline ${businessIdentity.formattedPhone} để được hỗ trợ trực tiếp!`;
    }
}

// Content generator for admin
export async function generateContent(topic: string, type: 'review' | 'news' | 'tips') {
    const prompts = {
        review: `Viết một bài review sản phẩm/dịch vụ về "${topic}" cho website Trung tâm sửa chữa ${businessIdentity.siteName}. Bao gồm: Ưu điểm, Quy trình, Cam kết chất lượng. Khoảng 500 từ. Giọng văn chuyên nghiệp, tin cậy.`,
        news: `Viết một bài tin tức về "${topic}" cho website ${businessIdentity.siteName} (trung tâm sửa chữa điện thoại & laptop). Ngắn gọn, hấp dẫn. Khoảng 300 từ.`,
        tips: `Viết một bài mẹo sử dụng/bảo quản thiết bị về "${topic}" cho khách hàng ${businessIdentity.siteName}. Dễ hiểu, thực tế, hữu ích. Khoảng 400 từ.`
    };

    try {
        const result = await geminiModel.generateContent(prompts[type]);
        const response = await result.response;
        return response.text();
    } catch (error) {
        console.error('Gemini API Error:', error);
        return null;
    }
}
