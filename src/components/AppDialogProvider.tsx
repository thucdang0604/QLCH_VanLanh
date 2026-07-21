'use client';

import { useCallback, useEffect, useState } from 'react';
import Modal from '@/components/admin/Modal';
import { type AppDialogRequest, registerAppDialogHandler } from '@/lib/appDialog';

type ActiveDialog = {
    request: AppDialogRequest;
    resolve: (value: boolean | string | null | undefined) => void;
};

export default function AppDialogProvider({ children }: { children: React.ReactNode }) {
    const [activeDialog, setActiveDialog] = useState<ActiveDialog | null>(null);
    const [inputValue, setInputValue] = useState('');

    const openDialog = useCallback((request: AppDialogRequest) => {
        return new Promise<boolean | string | null | undefined>((resolve) => {
            setInputValue(request.kind === 'prompt' ? request.initialValue || '' : '');
            setActiveDialog({ request, resolve });
        });
    }, []);

    useEffect(() => registerAppDialogHandler(openDialog), [openDialog]);

    const closeDialog = (result: boolean | string | null | undefined) => {
        if (!activeDialog) return;
        activeDialog.resolve(result);
        setActiveDialog(null);
    };

    const request = activeDialog?.request;
    const isPrompt = request?.kind === 'prompt';
    const isAlert = request?.kind === 'alert';
    const title = request?.title || (isAlert ? 'Thông báo' : isPrompt ? 'Nhập thông tin' : 'Xác nhận thao tác');
    const confirmText = request?.confirmText || (isAlert ? 'Đã hiểu' : isPrompt ? 'Xác nhận' : 'Xác nhận');
    const cancelText = request?.cancelText || 'Hủy';

    return (
        <>
            {children}
            <Modal isOpen={Boolean(request)} onClose={() => closeDialog(isPrompt ? null : false)} title={title} size="sm" priority="high">
                <div className="p-6 space-y-5">
                    <p className="whitespace-pre-line text-sm leading-relaxed text-gray-700">{request?.message}</p>
                    {isPrompt && (
                        <textarea
                            autoFocus
                            value={inputValue}
                            onChange={(event) => setInputValue(event.target.value)}
                            placeholder={request?.placeholder}
                            rows={3}
                            className="w-full resize-y rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20"
                        />
                    )}
                    <div className="flex justify-end gap-3">
                        {!isAlert && (
                            <button
                                type="button"
                                onClick={() => closeDialog(isPrompt ? null : false)}
                                className="rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200"
                            >
                                {cancelText}
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={() => closeDialog(isPrompt ? inputValue : true)}
                            className={`rounded-lg px-4 py-2 text-sm font-semibold text-white ${request?.destructive ? 'bg-red-600 hover:bg-red-700' : 'bg-orange-500 hover:bg-orange-600'}`}
                        >
                            {confirmText}
                        </button>
                    </div>
                </div>
            </Modal>
        </>
    );
}
