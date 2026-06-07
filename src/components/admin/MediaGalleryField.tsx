'use client';

import { ArrowLeft, ArrowRight, Image as ImageIcon, Plus, Star, X } from 'lucide-react';
import { useState } from 'react';
import MediaManager from '@/components/admin/MediaManager';

interface MediaGalleryFieldProps {
    value: string[];
    onChange: (images: string[]) => void;
    label: string;
    mediaTitle?: string;
    helperText?: string;
    emptyText?: string;
    defaultFolder?: string;
}

function normalizeImages(images: string[]): string[] {
    return Array.from(new Set(images.map((url) => url.trim()).filter(Boolean)));
}

export default function MediaGalleryField({
    value,
    onChange,
    label,
    mediaTitle,
    helperText = 'Ảnh đầu tiên là ảnh chính. Có thể chọn lại ảnh chính, xóa khỏi item hoặc đổi thứ tự.',
    emptyText = 'Chưa có ảnh',
    defaultFolder,
}: MediaGalleryFieldProps) {
    const [mediaOpen, setMediaOpen] = useState(false);
    const images = normalizeImages(value);

    const updateImages = (nextImages: string[]) => {
        onChange(normalizeImages(nextImages));
    };

    const addImages = (urls: string[]) => {
        updateImages([...images, ...urls]);
    };

    const removeImage = (index: number) => {
        updateImages(images.filter((_, itemIndex) => itemIndex !== index));
    };

    const setPrimary = (index: number) => {
        if (index <= 0) return;
        const next = [...images];
        const [selected] = next.splice(index, 1);
        updateImages([selected, ...next]);
    };

    const moveImage = (index: number, direction: -1 | 1) => {
        const targetIndex = index + direction;
        if (targetIndex < 0 || targetIndex >= images.length) return;
        const next = [...images];
        [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
        updateImages(next);
    };

    return (
        <div className="space-y-2">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <label className="block text-sm font-medium text-gray-700">{label}</label>
                    <p className="text-xs text-gray-500 mt-0.5">{helperText}</p>
                </div>
                <button
                    type="button"
                    onClick={() => setMediaOpen(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-orange-300 bg-orange-50 text-orange-700 text-sm font-medium hover:bg-orange-100 transition-colors shrink-0"
                >
                    <Plus size={16} />
                    Thêm ảnh
                </button>
            </div>

            {images.length === 0 ? (
                <button
                    type="button"
                    onClick={() => setMediaOpen(true)}
                    className="w-full border-2 border-dashed border-gray-200 rounded-xl p-6 text-center text-gray-400 hover:border-orange-300 hover:bg-orange-50/30 transition-colors"
                >
                    <ImageIcon size={34} className="mx-auto mb-2" />
                    <span className="text-sm">{emptyText}</span>
                </button>
            ) : (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {images.map((url, index) => (
                        <div key={`${url}-${index}`} className="relative aspect-square rounded-lg border border-gray-200 overflow-hidden bg-gray-100 group">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={url} alt={`${label} ${index + 1}`} className="w-full h-full object-cover" />
                            <div className="absolute left-1 top-1 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                                {index === 0 ? 'Ảnh chính' : `Ảnh ${index + 1}`}
                            </div>
                            <div className="absolute inset-0 bg-black/45 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1.5">
                                {index > 0 && (
                                    <button
                                        type="button"
                                        onClick={() => setPrimary(index)}
                                        className="p-1.5 bg-white text-amber-600 rounded-full hover:bg-amber-50"
                                        title="Đặt làm ảnh chính"
                                    >
                                        <Star size={14} />
                                    </button>
                                )}
                                <button
                                    type="button"
                                    onClick={() => moveImage(index, -1)}
                                    disabled={index === 0}
                                    className="p-1.5 bg-white text-gray-700 rounded-full hover:bg-gray-100 disabled:opacity-40"
                                    title="Đưa ảnh lên trước"
                                >
                                    <ArrowLeft size={14} />
                                </button>
                                <button
                                    type="button"
                                    onClick={() => moveImage(index, 1)}
                                    disabled={index === images.length - 1}
                                    className="p-1.5 bg-white text-gray-700 rounded-full hover:bg-gray-100 disabled:opacity-40"
                                    title="Đưa ảnh xuống sau"
                                >
                                    <ArrowRight size={14} />
                                </button>
                                <button
                                    type="button"
                                    onClick={() => removeImage(index)}
                                    className="p-1.5 bg-red-500 text-white rounded-full hover:bg-red-600"
                                    title="Xóa ảnh khỏi item"
                                >
                                    <X size={14} />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <MediaManager
                isOpen={mediaOpen}
                onClose={() => setMediaOpen(false)}
                multiple
                onSelectMultiple={addImages}
                title={mediaTitle || label}
                defaultFolder={defaultFolder}
            />
        </div>
    );
}
