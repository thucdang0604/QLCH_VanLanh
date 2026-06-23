import type { Dispatch, SetStateAction } from 'react';
import MediaManager from '@/components/admin/MediaManager';

interface RepairMediaManagersProps {
    showPreMediaManager: boolean;
    setShowPreMediaManager: (value: boolean) => void;
    showPostMediaManager: boolean;
    setShowPostMediaManager: (value: boolean) => void;
    setPreMediaFiles: Dispatch<SetStateAction<string[]>>;
    setPostMediaFiles: Dispatch<SetStateAction<string[]>>;
}

export function RepairMediaManagers({
    showPreMediaManager,
    setShowPreMediaManager,
    showPostMediaManager,
    setShowPostMediaManager,
    setPreMediaFiles,
    setPostMediaFiles,
}: RepairMediaManagersProps) {
    return (
        <>
            <MediaManager
                isOpen={showPreMediaManager}
                onClose={() => setShowPreMediaManager(false)}
                title="Chọn Ảnh/Video lúc nhận máy"
                multiple={true}
                onSelectMultiple={(urls) => {
                    setPreMediaFiles(prev => [...prev, ...urls]);
                }}
            />
            <MediaManager
                isOpen={showPostMediaManager}
                onClose={() => setShowPostMediaManager(false)}
                title="Chọn Ảnh/Video sau sửa chữa"
                multiple={true}
                onSelectMultiple={(urls) => {
                    setPostMediaFiles(prev => [...prev, ...urls]);
                }}
            />
        </>
    );
}
