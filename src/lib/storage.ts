import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { storage } from './firebase';

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
