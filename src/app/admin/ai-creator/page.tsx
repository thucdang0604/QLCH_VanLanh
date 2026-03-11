'use client';

import { useState } from 'react';
import {
    Sparkles,
    Wand2,
    FileText,
    Copy,
    Check,
    RefreshCw,
    Megaphone,
    ShoppingBag,
    Newspaper,
    Loader2
} from 'lucide-react';

const contentTypes = [
    { id: 'product', name: 'Mô tả sản phẩm', icon: ShoppingBag, placeholder: 'Nhập tên sản phẩm: iPhone 15 Pro Max' },
    { id: 'promo', name: 'Bài khuyến mãi', icon: Megaphone, placeholder: 'VD: Flash Sale giảm 30% tất cả sản phẩm' },
    { id: 'article', name: 'Bài viết/Review', icon: Newspaper, placeholder: 'VD: Review đánh giá chi tiết Samsung Galaxy S24' },
    { id: 'seo', name: 'SEO Meta', icon: FileText, placeholder: 'Nhập tên trang hoặc sản phẩm' },
];

export default function AICreatorPage() {
    const [contentType, setContentType] = useState(contentTypes[0]);
    const [prompt, setPrompt] = useState('');
    const [result, setResult] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [copied, setCopied] = useState(false);

    const generateContent = async () => {
        if (!prompt.trim()) return;

        setIsLoading(true);
        setResult('');

        // Simulate AI generation (replace with actual Gemini API call)
        setTimeout(() => {
            let generatedContent = '';

            switch (contentType.id) {
                case 'product':
                    generatedContent = `# ${prompt}

## Mô tả sản phẩm

**${prompt}** - Siêu phẩm công nghệ đỉnh cao!

### Điểm nổi bật:
- 🚀 Hiệu năng vượt trội với chip thế hệ mới
- 📸 Camera chuyên nghiệp, chụp đẹp mọi khoảnh khắc
- 🔋 Pin khủng, dùng cả ngày không lo hết
- 💎 Thiết kế cao cấp, sang trọng

### Thông số kỹ thuật:
- Màn hình: 6.7 inch Super Retina XDR
- Chip: A17 Pro 6 nhân
- RAM: 8GB
- Bộ nhớ: 256GB / 512GB / 1TB
- Camera: 48MP + 12MP + 12MP

### Khuyến mãi đặc biệt:
- ✅ Giảm ngay 5.000.000đ
- ✅ Trả góp 0% lãi suất
- ✅ Bảo hành 24 tháng chính hãng
- ✅ Freeship toàn quốc

👉 **Đặt hàng ngay!** Hotline: 1800 2097`;
                    break;
                case 'promo':
                    generatedContent = `🔥🔥🔥 **${prompt.toUpperCase()}** 🔥🔥🔥

⏰ Thời gian: Chỉ trong 24H!

🎁 **DEAL HOT HỌN BAO GIỜ:**

📱 iPhone 15 Pro Max - Giảm 5.000.000đ
💻 MacBook Air M3 - Giảm 3.000.000đ
🎧 AirPods Pro 2 - Giảm 1.500.000đ
⌚ Apple Watch Ultra - Giảm 2.000.000đ

✨ **ƯU ĐÃI THÊM:**
- Trả góp 0% lãi suất
- Freeship toàn quốc
- Tặng kèm phụ kiện trị giá 500K

⚡ Số lượng có hạn - Nhanh tay kẻo lỡ!

📞 Hotline: 1800 2097
🌐 Website: vanlanh.vn
📍 Địa chỉ: 123 Nguyễn Văn Linh, Đà Nẵng

#FlashSale #GiamGiaSoc #VanLanh #iPhone15`;
                    break;
                case 'article':
                    generatedContent = `# ${prompt}

## Giới thiệu

Hôm nay, Văn Lành xin gửi đến các bạn bài đánh giá chi tiết về sản phẩm đang được quan tâm nhất hiện nay...

## Thiết kế & Hoàn thiện

Sản phẩm được thiết kế với phong cách hiện đại, tối giản nhưng không kém phần sang trọng. Khung viền được làm từ chất liệu cao cấp, mang lại cảm giác cầm nắm chắc chắn và đẳng cấp.

## Hiệu năng

Với chip xử lý thế hệ mới, sản phẩm mang đến hiệu năng vượt trội:
- Điểm Antutu: 1.500.000+
- Xử lý đa nhiệm mượt mà
- Gaming không giật lag

## Camera

Hệ thống camera được nâng cấp toàn diện:
- Camera chính 48MP với sensor lớn
- Quay video 4K 60fps
- Chống rung quang học OIS

## Pin & Sạc

Pin 4500mAh cho thời gian sử dụng cả ngày. Hỗ trợ sạc nhanh 45W.

## Kết luận

⭐⭐⭐⭐⭐ **Đánh giá: 9/10**

Đây là một sản phẩm hoàn hảo cho những ai đang tìm kiếm một thiết bị cao cấp với đầy đủ tính năng.

👉 **Mua ngay tại Văn Lành với giá ưu đãi nhất!**`;
                    break;
                case 'seo':
                    generatedContent = `## SEO Meta Tags cho: ${prompt}

### Title (60 ký tự):
"${prompt} Chính Hãng | Giá Tốt Nhất - Văn Lành"

### Meta Description (155 ký tự):
"Mua ${prompt} chính hãng tại Văn Lành với giá ưu đãi, bảo hành 24 tháng, trả góp 0%, freeship toàn quốc. Hotline: 1800 2097"

### Keywords:
${prompt.toLowerCase()}, mua ${prompt.toLowerCase()}, ${prompt.toLowerCase()} giá rẻ, ${prompt.toLowerCase()} chính hãng, ${prompt.toLowerCase()} trả góp

### Open Graph:
- og:title: "${prompt} | Văn Lành - Điện Thoại & Laptop"
- og:description: "Mua ${prompt} chính hãng..."
- og:type: product

### Schema Markup:
\`\`\`json
{
  "@type": "Product",
  "name": "${prompt}",
  "brand": "Apple",
  "offers": {
    "@type": "Offer",
    "priceCurrency": "VND"
  }
}
\`\`\``;
                    break;
            }

            setResult(generatedContent);
            setIsLoading(false);
        }, 2000);
    };

    const copyToClipboard = () => {
        navigator.clipboard.writeText(result);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="space-y-6">
            {/* Page Header */}
            <div>
                <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                    <Sparkles className="text-orange-500" />
                    AI Content Creator
                </h1>
                <p className="text-gray-500">Tạo nội dung tự động với Google Gemini AI</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Input Panel */}
                <div className="bg-white rounded-xl p-6 shadow-sm space-y-6">
                    {/* Content Type Selection */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-3">Loại nội dung</label>
                        <div className="grid grid-cols-2 gap-3">
                            {contentTypes.map((type) => (
                                <button
                                    key={type.id}
                                    onClick={() => setContentType(type)}
                                    className={`flex items-center gap-3 p-4 border-2 rounded-xl transition-colors ${contentType.id === type.id
                                            ? 'border-orange-500 bg-orange-50 text-orange-600'
                                            : 'border-gray-200 hover:border-orange-300'
                                        }`}
                                >
                                    <type.icon size={24} />
                                    <span className="font-medium">{type.name}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Prompt Input */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Nhập yêu cầu</label>
                        <textarea
                            value={prompt}
                            onChange={(e) => setPrompt(e.target.value)}
                            placeholder={contentType.placeholder}
                            rows={4}
                            className="w-full px-4 py-3 border rounded-xl focus:border-orange-500 focus:outline-none resize-none"
                        />
                    </div>

                    {/* Generate Button */}
                    <button
                        onClick={generateContent}
                        disabled={isLoading || !prompt.trim()}
                        className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-orange-500 to-red-500 text-white py-4 rounded-xl font-bold hover:opacity-90 transition-opacity disabled:opacity-50"
                    >
                        {isLoading ? (
                            <>
                                <Loader2 size={20} className="animate-spin" />
                                Đang tạo nội dung...
                            </>
                        ) : (
                            <>
                                <Wand2 size={20} />
                                Tạo nội dung với AI
                            </>
                        )}
                    </button>
                </div>

                {/* Output Panel */}
                <div className="bg-white rounded-xl p-6 shadow-sm">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="font-semibold text-gray-900">Kết quả</h3>
                        {result && (
                            <div className="flex gap-2">
                                <button
                                    onClick={generateContent}
                                    className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                                    title="Tạo lại"
                                >
                                    <RefreshCw size={18} />
                                </button>
                                <button
                                    onClick={copyToClipboard}
                                    className="flex items-center gap-1 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors text-sm"
                                >
                                    {copied ? <Check size={16} className="text-green-600" /> : <Copy size={16} />}
                                    {copied ? 'Đã copy' : 'Copy'}
                                </button>
                            </div>
                        )}
                    </div>

                    <div className="min-h-[400px] max-h-[500px] overflow-y-auto border rounded-xl p-4 bg-gray-50">
                        {isLoading ? (
                            <div className="flex flex-col items-center justify-center h-full text-gray-500">
                                <Loader2 size={40} className="animate-spin mb-4" />
                                <p>Đang tạo nội dung...</p>
                            </div>
                        ) : result ? (
                            <pre className="whitespace-pre-wrap font-sans text-sm text-gray-800">{result}</pre>
                        ) : (
                            <div className="flex flex-col items-center justify-center h-full text-gray-400">
                                <Sparkles size={40} className="mb-4" />
                                <p>Kết quả sẽ hiển thị ở đây</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
