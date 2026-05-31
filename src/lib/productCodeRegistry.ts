'use client';

import {
    collection,
    doc,
    getDocs,
    query,
    runTransaction,
    serverTimestamp,
    where,
    type DocumentData,
    type QueryDocumentSnapshot,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { normalizeProductCode } from '@/lib/productCodes';

const REGISTRY_COLLECTION = 'product_code_registry';
const ALIAS_FIELDS = ['sku', 'barcode', 'productCode'] as const;

function normalizeCodes(codes: string[]): string[] {
    return Array.from(new Set(codes.map(normalizeProductCode).filter(Boolean)));
}
function getStoredCodes(data: DocumentData): string[] {
    return normalizeCodes([
        data.sku,
        data.barcode,
        data.productCode,
        ...(Array.isArray(data.qrCodes) ? data.qrCodes : []),
    ]);
}

async function findLegacyOwner(code: string, excludedProductId?: string): Promise<QueryDocumentSnapshot | null> {
    const products = collection(db, 'products');
    const snapshots = await Promise.all([
        ...ALIAS_FIELDS.map((field) => getDocs(query(products, where(field, '==', code)))),
        getDocs(query(products, where('qrCodes', 'array-contains', code))),
    ]);

    for (const snapshot of snapshots) {
        const owner = snapshot.docs.find((item) => item.id !== excludedProductId);
        if (owner) return owner;
    }
    return null;
}

export async function assertProductCodesAvailable(codes: string[], excludedProductId?: string): Promise<string[]> {
    const normalizedCodes = normalizeCodes(codes);
    if (normalizedCodes.length === 0) {
        throw new Error('San pham phai co it nhat mot ma QR hop le.');
    }

    for (const code of normalizedCodes) {
        const owner = await findLegacyOwner(code, excludedProductId);
        if (owner) {
            throw new Error(`Ma QR ${code} da duoc gan cho san pham "${owner.data().name || owner.id}".`);
        }
    }
    return normalizedCodes;
}

export async function createProductWithCodes(
    productId: string,
    data: Record<string, unknown>,
    codes: string[],
): Promise<string> {
    const normalizedCodes = await assertProductCodesAvailable(codes);
    const productRef = doc(db, 'products', productId);
    const registryRefs = normalizedCodes.map((code) => doc(db, REGISTRY_COLLECTION, code));

    await runTransaction(db, async (transaction) => {
        const [productSnapshot, ...registrySnapshots] = await Promise.all([
            transaction.get(productRef),
            ...registryRefs.map((ref) => transaction.get(ref)),
        ]);
        if (productSnapshot.exists()) {
            throw new Error(`ID san pham ${productId} da ton tai.`);
        }
        registrySnapshots.forEach((snapshot, index) => {
            if (snapshot.exists()) {
                throw new Error(`Ma QR ${normalizedCodes[index]} da duoc gan cho san pham khac.`);
            }
        });
        registryRefs.forEach((ref, index) => {
            transaction.set(ref, {
                productId,
                code: normalizedCodes[index],
                updatedAt: serverTimestamp(),
            });
        });
        transaction.set(productRef, {
            ...data,
            qrCodes: normalizedCodes,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
        });
    });
    return productId;
}

export async function updateProductWithCodes(
    productId: string,
    codes: string[],
    data: Record<string, unknown>,
): Promise<void> {
    const normalizedCodes = await assertProductCodesAvailable(codes, productId);
    const productRef = doc(db, 'products', productId);

    await runTransaction(db, async (transaction) => {
        const productSnapshot = await transaction.get(productRef);
        if (!productSnapshot.exists()) {
            throw new Error('San pham khong ton tai.');
        }

        const oldCodes = getStoredCodes(productSnapshot.data());
        const allCodes = Array.from(new Set([...oldCodes, ...normalizedCodes]));
        const registryRefs = allCodes.map((code) => doc(db, REGISTRY_COLLECTION, code));
        const registrySnapshots = await Promise.all(registryRefs.map((ref) => transaction.get(ref)));

        normalizedCodes.forEach((code) => {
            const index = allCodes.indexOf(code);
            const snapshot = registrySnapshots[index];
            if (snapshot.exists() && snapshot.data().productId !== productId) {
                throw new Error(`Ma QR ${code} da duoc gan cho san pham khac.`);
            }
        });

        oldCodes.filter((code) => !normalizedCodes.includes(code)).forEach((code) => {
            const index = allCodes.indexOf(code);
            const snapshot = registrySnapshots[index];
            if (snapshot.exists() && snapshot.data().productId === productId) {
                transaction.delete(registryRefs[index]);
            }
        });

        normalizedCodes.forEach((code) => {
            transaction.set(doc(db, REGISTRY_COLLECTION, code), {
                productId,
                code,
                updatedAt: serverTimestamp(),
            });
        });
        transaction.update(productRef, {
            ...data,
            qrCodes: normalizedCodes,
            updatedAt: serverTimestamp(),
        });
    });
}
