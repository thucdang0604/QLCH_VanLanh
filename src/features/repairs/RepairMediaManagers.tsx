import MediaManager from '@/components/admin/MediaManager';

interface RepairMediaManagersProps {
    showPreMediaManager: boolean;
    setShowPreMediaManager: (value: boolean) => void;
    showPostMediaManager: boolean;
    setShowPostMediaManager: (value: boolean) => void;
    onPreMediaSelected: (urls: string[]) => void;
    onPostMediaSelected: (urls: string[]) => void;
    uploadContext: string | null;
    onPreMediaUploaded: (urls: string[], uploadContext: string | null | undefined) => void;
    onPostMediaUploaded: (urls: string[], uploadContext: string | null | undefined) => void;
}

export function RepairMediaManagers({
    showPreMediaManager,
    setShowPreMediaManager,
    showPostMediaManager,
    setShowPostMediaManager,
    onPreMediaSelected,
    onPostMediaSelected,
    uploadContext,
    onPreMediaUploaded,
    onPostMediaUploaded,
}: RepairMediaManagersProps) {
    return (
        <>
            <MediaManager
                isOpen={showPreMediaManager}
                onClose={() => setShowPreMediaManager(false)}
                title="Chọn Ảnh/Video lúc nhận máy"
                multiple={true}
                defaultFolder="repairs"
                uploadContext={uploadContext}
                onUploadComplete={onPreMediaUploaded}
                onSelectMultiple={onPreMediaSelected}
            />
            <MediaManager
                isOpen={showPostMediaManager}
                onClose={() => setShowPostMediaManager(false)}
                title="Chọn Ảnh/Video sau sửa chữa"
                multiple={true}
                defaultFolder="repairs"
                uploadContext={uploadContext}
                onUploadComplete={onPostMediaUploaded}
                onSelectMultiple={onPostMediaSelected}
            />
        </>
    );
}
