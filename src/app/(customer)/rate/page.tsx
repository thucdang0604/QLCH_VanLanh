'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
    Star, Camera, X, Loader2, CheckCircle2, HeartHandshake
} from 'lucide-react';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { uploadMedia } from '@/lib/storage';

export default function RatePage() {
    const seoTitle = 'Đánh giá dịch vụ | Văn Lành Service';
    const seoDescription = 'Gửi đánh giá dịch vụ tại Văn Lành Service (quét QR). Bạn có thể chọn số sao, viết nhận xét và đính kèm hình ảnh.';
    const canonicalUrl = 'https://qlch-vanlanh.web.app/rate';
    const router = useRouter();

    // Form states
    const [name, setName] = useState('');
    const [phone, setPhone] = useState('');
    const [rating, setRating] = useState(5);
    const [hoverRating, setHoverRating] = useState(0);
    const [content, setContent] = useState('');
    const [images, setImages] = useState<File[]>([]);
    const [imageUrls, setImageUrls] = useState<string[]>([]);

    const [submitting, setSubmitting] = useState(false);
    const [success, setSuccess] = useState(false);

    const fileInputRef = useRef<HTMLInputElement>(null);

    const formatPhonePrivate = (p: string) => {
        if (!p || p.length < 4) return p;
        return p.substring(0, 3) + '****' + p.substring(p.length - 3);
    };

    const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            const filesArray = Array.from(e.target.files);

            // Check size (max 5MB)
            const validFiles = filesArray.filter(f => f.size <= 5 * 1024 * 1024);
            if (validFiles.length < filesArray.length) {
                alert('Một số ảnh vượt quá dung lượng 5MB và đã bị loại bỏ.');
            }

            setImages(prev => [...prev, ...validFiles].slice(0, 5)); // Max 5

            // Previews
            validFiles.forEach(file => {
                const reader = new FileReader();
                reader.onload = (e) => {
                    if (e.target?.result) {
                        setImageUrls(prev => [...prev, e.target!.result as string].slice(0, 5));
                    }
                };
                reader.readAsDataURL(file);
            });
        }
    };

    const removeImage = (index: number) => {
        setImages(prev => prev.filter((_, i) => i !== index));
        setImageUrls(prev => prev.filter((_, i) => i !== index));
    };

    const handleSubmitReview = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim() || !phone.trim() || phone.length < 8) {
            alert('Vui lòng nhập đầy đủ Tên và Số điện thoại hợp lệ.');
            return;
        }

        if (!content.trim() && images.length === 0 && rating < 5) {
            alert('Vui lòng chia sẻ thêm nội dung đánh giá để chúng tôi phục vụ tốt hơn.');
            return;
        }

        setSubmitting(true);
        try {
            // Upload images first
            const uploadedUrls: string[] = [];
            for (const file of images) {
                const url = await uploadMedia(file, 'reviews');
                uploadedUrls.push(url);
            }

            // Save review to Firestore (general review, no referenceId)
            await addDoc(collection(db, 'reviews'), {
                referenceId: '', // General review
                type: 'general',
                customerName: name.trim(),
                phone: formatPhonePrivate(phone.trim()),
                rating,
                content: content.trim(),
                images: uploadedUrls,
                status: 'pending', // Cần admin duyệt
                createdAt: serverTimestamp()
            });

            setSuccess(true);
        } catch (error) {
            console.error('Error submitting review:', error);
            alert('Có lỗi xảy ra khi gửi đánh giá. Vui lòng thử lại.');
        } finally {
            setSubmitting(false);
        }
    };

    if (success) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center py-10 px-4">
                {/* SEO (noindex for rating form) */}
                <title>{seoTitle}</title>
                <meta name="description" content={seoDescription} />
                <meta name="robots" content="noindex,follow" />
                <link rel="canonical" href={canonicalUrl} />
                <div className="w-full max-w-sm bg-white rounded-3xl shadow-xl overflow-hidden p-8 text-center animate-in fade-in zoom-in duration-300">
                    <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6 text-green-600 shadow-inner">
                        <CheckCircle2 size={40} />
                    </div>
                    <h3 className="text-2xl font-bold text-gray-900 mb-3">Đánh giá thành công!</h3>
                    <p className="text-gray-600 text-sm mb-8 leading-relaxed">Cảm ơn bạn đã đóng góp ý kiến. Chúc bạn một ngày tốt lành!</p>
                    <button
                        onClick={() => router.push('/')}
                        className="w-full h-12 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-xl font-bold flex items-center justify-center text-sm transition-colors"
                    >
                        Quay lại trang chủ
                    </button>
                    <button
                        onClick={() => {
                            setSuccess(false);
                            setName('');
                            setPhone('');
                            setContent('');
                            setImages([]);
                            setImageUrls([]);
                            setRating(5);
                        }}
                        className="mt-4 text-orange-600 font-semibold text-sm hover:underline"
                    >
                        Gửi thêm đánh giá
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center py-10 px-4">
            {/* SEO (noindex for rating form) */}
            <title>{seoTitle}</title>
            <meta name="description" content={seoDescription} />
            <meta name="robots" content="noindex,follow" />
            <link rel="canonical" href={canonicalUrl} />
            <meta property="og:type" content="website" />
            <meta property="og:title" content={seoTitle} />
            <meta property="og:description" content={seoDescription} />
            <meta property="og:url" content={canonicalUrl} />
            <div className="w-full max-w-sm bg-white rounded-3xl shadow-xl overflow-hidden animate-in fade-in slide-in-from-bottom-8 duration-500 border border-gray-100">
                <div className="p-6 space-y-6">

                    {/* Header Section */}
                    <div className="text-center space-y-2">
                        <div className="w-16 h-16 bg-gradient-to-br from-orange-400 to-red-500 rounded-2xl flex items-center justify-center mx-auto shadow-lg shadow-orange-500/30">
                            <HeartHandshake className="text-white" size={32} />
                        </div>
                        <h1 className="text-2xl font-bold text-gray-900 mt-4">Đánh giá Dịch vụ</h1>
                        <p className="text-gray-500 text-sm">Văn Lành Service luôn lắng nghe ý kiến để phục vụ bạn tốt hơn.</p>
                    </div>

                    <form onSubmit={handleSubmitReview} className="space-y-6">
                        {/* Info Inputs */}
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Tên của bạn <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="text"
                                    placeholder="Nhập tên..."
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    className="w-full h-12 px-4 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition-all font-medium"
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Số điện thoại <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="tel"
                                    placeholder="Nhập số điện thoại..."
                                    value={phone}
                                    onChange={(e) => setPhone(e.target.value)}
                                    className="w-full h-12 px-4 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition-all font-medium"
                                    required
                                />
                            </div>
                        </div>

                        {/* Rating Stars */}
                        <div className="flex flex-col items-center gap-3 pt-2">
                            <p className="text-sm font-medium text-gray-700">Chất lượng dịch vụ thế nào?</p>
                            <div className="flex items-center gap-2">
                                {[1, 2, 3, 4, 5].map((star) => (
                                    <button
                                        key={star}
                                        type="button"
                                        className="focus:outline-none transition-transform hover:scale-110 active:scale-95"
                                        onClick={() => setRating(star)}
                                        onMouseEnter={() => setHoverRating(star)}
                                        onMouseLeave={() => setHoverRating(0)}
                                    >
                                        <Star
                                            size={44}
                                            strokeWidth={1.5}
                                            className={`transition-colors ${star <= (hoverRating || rating)
                                                ? 'fill-orange-400 text-orange-400 drop-shadow-sm'
                                                : 'fill-gray-100 text-gray-200'
                                                }`}
                                        />
                                    </button>
                                ))}
                            </div>
                            <span className="text-xs font-semibold text-orange-600 bg-orange-50 px-4 py-1.5 rounded-full animate-in fade-in transition-all">
                                {rating === 5 ? 'Tuyệt vời' : rating === 4 ? 'Rất tốt' : rating === 3 ? 'Bình thường' : rating === 2 ? 'Kém' : 'Rất tệ'}
                            </span>
                        </div>

                        {/* Content */}
                        <div>
                            <textarea
                                className="w-full p-4 border border-gray-200 rounded-xl focus:ring-1 focus:ring-orange-500 focus:border-orange-500 bg-gray-50 hover:bg-white focus:bg-white transition-colors text-sm"
                                placeholder="Xin mời chia sẻ một số cảm nhận về dịch vụ... (không bắt buộc)"
                                rows={4}
                                value={content}
                                onChange={(e) => setContent(e.target.value)}
                            ></textarea>
                        </div>

                        {/* Image Upload */}
                        <div>
                            <div className="flex flex-wrap gap-2">
                                {imageUrls.map((url, idx) => (
                                    <div key={idx} className="relative w-20 h-20 rounded-xl border border-gray-200 overflow-hidden group">
                                        <img src={url} alt={`preview-${idx}`} className="w-full h-full object-cover" />
                                        <button
                                            type="button"
                                            onClick={() => removeImage(idx)}
                                            className="absolute top-1 right-1 bg-black/50 text-white rounded-full w-5 h-5 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                                        >
                                            <X size={12} />
                                        </button>
                                    </div>
                                ))}
                                {images.length < 5 && (
                                    <button
                                        type="button"
                                        onClick={() => fileInputRef.current?.click()}
                                        className="w-20 h-20 rounded-xl border-2 border-dashed border-gray-300 flex flex-col items-center justify-center text-gray-500 hover:border-orange-500 hover:text-orange-500 hover:bg-orange-50 transition-colors"
                                    >
                                        <Camera size={24} />
                                        <span className="text-[10px] font-medium mt-1">Thêm ảnh</span>
                                    </button>
                                )}
                            </div>
                            <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                multiple
                                ref={fileInputRef}
                                onChange={handleImageChange}
                            />
                        </div>

                        {/* Submit */}
                        <div className="pt-2">
                            <button
                                type="submit"
                                disabled={submitting}
                                className="w-full h-12 bg-gradient-to-r from-orange-500 to-red-500 text-white rounded-xl font-bold flex items-center justify-center text-base hover:shadow-lg hover:shadow-orange-500/30 disabled:opacity-70 transition-all active:scale-95"
                            >
                                {submitting ? (
                                    <>
                                        <Loader2 size={20} className="animate-spin mr-2" />
                                        Đang gửi đánh giá...
                                    </>
                                ) : (
                                    'Gửi đánh giá'
                                )}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
}
