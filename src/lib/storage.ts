import { collection, getDocs, orderBy, query, deleteDoc, doc, limit as firestoreLimit, startAfter, type QueryDocumentSnapshot, type DocumentData } from 'firebase/firestore';
import { db, getStorageInstance } from './firebase';

const MAX_VIDEO_SIZE_MB = 50;
const MAX_VIDEO_SIZE_BYTES = MAX_VIDEO_SIZE_MB * 1024 * 1024;

/**
 * Upload a media file (image or video) to Firebase Storage
 * @param file - File object from input
 * @param path - Storage path (e.g., 'products', 'services', 'banners')
 * @returns Download URL of uploaded file
 */
export async function uploadMedia(file: File, path: string = 'products'): Promise<string> {
    // Validate video size
    if (file.type.includes('video') && file.size > MAX_VIDEO_SIZE_BYTES) {
        throw new Error(`Video vượt quá ${MAX_VIDEO_SIZE_MB}MB. Vui lòng chọn file nhỏ hơn.`);
    }

    try {
        const storage = await getStorageInstance();
        const { ref, uploadBytes, getDownloadURL } = await import('firebase/storage');

        const timestamp = Date.now();
        const cleanName = file.name.replace(/[^a-zA-Z0-9.]/g, '_');
        const fileName = `${timestamp}_${cleanName}`;
        const folder = file.type.includes('video') ? 'videos' : 'images';
        const storageRef = ref(storage, `${folder}/${path}/${fileName}`);

        const snapshot = await uploadBytes(storageRef, file, {
            contentType: file.type,
        });

        const downloadURL = await getDownloadURL(snapshot.ref);
        return downloadURL;
    } catch (error) {
        console.error('Error uploading media:', error);
        throw error;
    }
}

/**
 * Upload image to Firebase Storage (backward compatible)
 * @param file - File object from input
 * @param path - Storage path (e.g., 'products', 'services', 'banners')
 * @returns Download URL of uploaded image
 */
export async function uploadImage(file: File, path: string = 'products'): Promise<string> {
    try {
        const storage = await getStorageInstance();
        const { ref, uploadBytes, getDownloadURL } = await import('firebase/storage');

        const timestamp = Date.now();
        const cleanName = file.name.replace(/[^a-zA-Z0-9.]/g, '_');
        const fileName = `${timestamp}_${cleanName}`;
        const storageRef = ref(storage, `images/${path}/${fileName}`);

        const snapshot = await uploadBytes(storageRef, file, {
            contentType: file.type,
        });

        const downloadURL = await getDownloadURL(snapshot.ref);
        return downloadURL;
    } catch (error) {
        console.error('Error uploading image:', error);
        throw new Error('Failed to upload image');
    }
}

/**
 * Upload multiple images
 * @param files - Array of File objects
 * @param path - Storage path
 * @returns Array of download URLs
 */
export async function uploadMultipleImages(files: File[], path: string = 'products'): Promise<string[]> {
    try {
        const uploadPromises = files.map((file) => uploadImage(file, path));
        const urls = await Promise.all(uploadPromises);
        return urls;
    } catch (error) {
        console.error('Error uploading multiple images:', error);
        throw new Error('Failed to upload images');
    }
}

/**
 * Delete media file from Firebase Storage
 * @param fileUrl - Full URL of the file to delete
 */
export async function deleteImage(fileUrl: string): Promise<void> {
    try {
        const storage = await getStorageInstance();
        const { ref, deleteObject } = await import('firebase/storage');

        const decodedUrl = decodeURIComponent(fileUrl);
        // Match both images/ and videos/ paths
        const pathMatch = decodedUrl.match(/(images|videos)%2F(.+?)\?/) || decodedUrl.match(/(images|videos)\/(.+?)\?/);
        if (pathMatch) {
            const filePath = `${pathMatch[1]}/${pathMatch[2].replace(/%2F/g, '/')}`;
            const fileRef = ref(storage, filePath);
            await deleteObject(fileRef);
        }
    } catch (error) {
        console.error('Error deleting file:', error);
        // Don't throw - file might not exist
    }
}

/**
 * Liệt kê ảnh trong một thư mục Storage
 * @param path - thư mục con trong `images/` (vd: 'products', 'services')
 */
export async function listImagesInFolder(path: string): Promise<{ name: string; url: string }[]> {
    try {
        const storage = await getStorageInstance();
        const { ref, listAll, getDownloadURL } = await import('firebase/storage');

        const folderRef = ref(storage, `images/${path}`);
        const res = await listAll(folderRef);
        const items = await Promise.all(
            res.items.map(async (itemRef) => {
                const url = await getDownloadURL(itemRef);
                return {
                    name: itemRef.name,
                    url,
                };
            })
        );
        // Sắp xếp mới nhất lên đầu (dựa trên tên có timestamp)
        return items.sort((a, b) => (a.name < b.name ? 1 : -1));
    } catch (error) {
        console.error('Error listing images:', error);
        return [];
    }
}



/**
 * Quét và xoá các media entries trong Firestore mà file gốc đã bị xoá trên Storage.
 * Trả về số lượng entries đã dọn dẹp.
 */
export async function cleanBrokenMedia(
    onProgress?: (checked: number, total: number, broken: number) => void
): Promise<{ cleaned: number; total: number }> {
    const storage = await getStorageInstance();
    const { ref, getMetadata } = await import('firebase/storage');

    const BATCH_SIZE = 50;
    let cleaned = 0;
    let checked = 0;
    let lastDoc: QueryDocumentSnapshot<DocumentData> | undefined;
    let hasMore = true;

    while (hasMore) {
        let q = query(
            collection(db, 'media_library'),
            orderBy('createdAt', 'desc'),
            firestoreLimit(BATCH_SIZE)
        );
        if (lastDoc) {
            q = query(
                collection(db, 'media_library'),
                orderBy('createdAt', 'desc'),
                startAfter(lastDoc),
                firestoreLimit(BATCH_SIZE)
            );
        }

        const snap = await getDocs(q);
        if (snap.docs.length < BATCH_SIZE) hasMore = false;
        if (snap.docs.length === 0) break;

        lastDoc = snap.docs[snap.docs.length - 1];

        for (const docSnap of snap.docs) {
            const data = docSnap.data();
            checked++;
            try {
                // Kiểm tra file còn tồn tại trên Storage không
                const storageRef = ref(storage, data.path);
                await getMetadata(storageRef);
                // File còn tồn tại → OK
            } catch {
                // File đã bị xoá trên Storage → Xoá entry Firestore
                try {
                    await deleteDoc(doc(db, 'media_library', docSnap.id));
                    cleaned++;
                } catch (delErr) {
                    console.error('Error deleting broken entry:', delErr);
                }
            }
            onProgress?.(checked, 0, cleaned);
        }
    }

    return { cleaned, total: checked };
}
