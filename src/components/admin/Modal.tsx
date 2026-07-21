'use client';

import { useEffect, useCallback, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { appConfirm } from '@/lib/appDialog';

/**
 * Modal — Component dùng chung cho toàn bộ popup trong Admin.
 * 
 * Features:
 * - Esc key đóng modal
 * - Click backdrop đóng modal (tuỳ chọn)
 * - Responsive: mobile bottom-sheet, desktop center
 * - z-index configurable (tránh conflict khi modal lồng nhau)
 * - Body scroll lock khi modal mở
 * - CSS animation fade-in
 * - print:hidden mặc định
 * 
 * @example
 * <Modal isOpen={showModal} onClose={() => setShowModal(false)} title="Thêm sản phẩm">
 *   <form>...</form>
 * </Modal>
 * 
 * @example — modal lồng nhau (z-index cao hơn)
 * <Modal isOpen={showSub} onClose={...} priority="high">
 *   <MediaManager ... />
 * </Modal>
 */

type ModalSize = 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl' | 'full';
type ModalPriority = 'normal' | 'high'; // normal = z-50, high = z-[60]

interface ModalProps {
    isOpen: boolean;
    onClose: () => void;
    children: ReactNode;
    /** Tiêu đề modal — nếu truyền sẽ render header + nút X */
    title?: string;
    /** Kích thước max-width: sm(400) md(500) lg(600) xl(700) 2xl(800) 3xl(896) 4xl(1024) full(100%) */
    size?: ModalSize;
    /** z-index priority: normal(z-50) hoặc high(z-[60]) cho modal lồng nhau */
    priority?: ModalPriority;
    /** Cho phép click backdrop để đóng (default: true) */
    closeOnBackdrop?: boolean;
    /** Ẩn khi in (default: true) */
    printHidden?: boolean;
    /** Thêm backdrop-blur */
    blur?: boolean;
    /** Custom className cho content wrapper */
    className?: string;
    /** Responsive bottom-sheet trên mobile (default: true) */
    mobileSheet?: boolean;
    /** Form có thay đổi chưa lưu, hiện confirm khi đóng */
    isDirty?: boolean;
}

const SIZE_MAP: Record<ModalSize, string> = {
    sm: 'md:max-w-sm',
    md: 'md:max-w-md',
    lg: 'md:max-w-lg',
    xl: 'md:max-w-xl',
    '2xl': 'md:max-w-2xl',
    '3xl': 'md:max-w-3xl',
    '4xl': 'md:max-w-4xl',
    full: 'md:max-w-[95vw]',
};

export default function Modal({
    isOpen,
    onClose,
    children,
    title,
    size = '2xl',
    priority = 'normal',
    closeOnBackdrop = false,
    printHidden = true,
    blur = false,
    className = '',
    mobileSheet = true,
    isDirty = false,
}: ModalProps) {
    const handleClose = useCallback(async () => {
        if (isDirty) {
            if (await appConfirm('Bạn có thay đổi chưa lưu, bạn có chắc chắn muốn đóng?', {
                title: 'Bỏ thay đổi chưa lưu',
                confirmText: 'Đóng',
                destructive: true,
            })) {
                onClose();
            }
        } else {
            onClose();
        }
    }, [isDirty, onClose]);

    // Esc key handler
    const handleKeyDown = useCallback((e: KeyboardEvent) => {
        if (e.key === 'Escape') void handleClose();
    }, [handleClose]);

    const backdropMouseDown = useRef(false);

    useEffect(() => {
        if (!isOpen) return;
        document.addEventListener('keydown', handleKeyDown);
        // Lock body scroll
        const prev = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.removeEventListener('keydown', handleKeyDown);
            document.body.style.overflow = prev;
        };
    }, [isOpen, handleKeyDown]);

    if (!isOpen) return null;

    const zClass = priority === 'high' ? 'z-[60]' : 'z-50';
    const blurClass = blur ? 'backdrop-blur-sm' : '';
    const printClass = printHidden ? 'print:hidden' : '';
    const mobileAlign = mobileSheet ? 'items-end md:items-center' : 'items-center';

    return (
        <div
            className={`fixed inset-0 bg-black/50 flex ${mobileAlign} justify-center ${zClass} p-0 md:p-4 ${blurClass} ${printClass} animate-[fadeIn_0.2s_ease-out]`}
            onMouseDown={(e) => {
                if (e.target === e.currentTarget) {
                    backdropMouseDown.current = true;
                } else {
                    backdropMouseDown.current = false;
                }
            }}
            onClick={(e) => {
                if (closeOnBackdrop && e.target === e.currentTarget && backdropMouseDown.current) {
                    void handleClose();
                }
                backdropMouseDown.current = false;
            }}
            role="dialog"
            aria-modal="true"
            aria-label={title}
        >
            <div
                className={`bg-white w-full ${mobileSheet ? 'rounded-t-2xl md:rounded-2xl mt-auto md:mt-0 md:animate-[fadeIn_0.15s_ease-out] animate-[slideUp_0.3s_ease-out]' : 'rounded-2xl animate-[fadeIn_0.15s_ease-out]'} ${SIZE_MAP[size]} max-h-[90vh] md:max-h-[85vh] flex flex-col overflow-hidden ${className}`}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header — chỉ render nếu có title */}
                {title && (
                    <div className="flex items-center justify-between px-6 py-4 border-b shrink-0 sticky top-0 bg-white z-10">
                        <h2 className="text-lg font-bold text-gray-900 truncate pr-4">{title}</h2>
                        <button
                            onClick={() => { void handleClose(); }}
                            className="p-2 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-600 transition-colors shrink-0"
                            aria-label="Đóng"
                        >
                            <X size={20} />
                        </button>
                    </div>
                )}

                {/* Content */}
                <div className="flex-1 overflow-y-auto">
                    {children}
                </div>
            </div>
        </div>
    );
}
