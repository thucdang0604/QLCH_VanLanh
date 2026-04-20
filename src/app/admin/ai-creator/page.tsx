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

        try {
            const response = await fetch('/api/admin/ai', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'generate-content',
                    payload: {
                        contentType: contentType.id,
                        prompt: prompt,
                    }
                }),
            });

            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.error || 'Request failed');
            }

            if (!response.body) throw new Error('No response body');

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let accumulatedContent = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const textChunk = decoder.decode(value, { stream: true });
                accumulatedContent += textChunk;
                setResult(accumulatedContent);
            }
        } catch (error: any) {
            console.error('Generation error:', error);
            setResult(`Đã xảy ra lỗi: ${error.message}`);
        } finally {
            setIsLoading(false);
        }
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
