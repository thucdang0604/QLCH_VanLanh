import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import * as fs from 'fs';
import * as path from 'path';

// Parse .env.local manually
const envPath = path.resolve('.env.local');
if (fs.existsSync(envPath)) {
    const envConfig = fs.readFileSync(envPath, 'utf8');
    envConfig.split('\n').forEach(line => {
        const match = line.match(/^([^=]+)=(.*)$/);
        if (match) {
            process.env[match[1]] = match[2];
        }
    });
}

// Initialize Firebase Admin
if (!getApps().length) {
    const serviceAccountPath = process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT_PATH;
    if (!serviceAccountPath) {
        console.error('Missing FIREBASE_ADMIN_SERVICE_ACCOUNT_PATH');
        process.exit(1);
    }
    const serviceAccount = JSON.parse(fs.readFileSync(path.resolve(serviceAccountPath), 'utf8'));
    initializeApp({
        credential: cert(serviceAccount)
    });
}

const db = getFirestore();

async function createTestVariants() {
    console.log('Creating test variants...');

    const seriesId = 'iphone-15-pro-max';

    // 1. Variant 1: Titan Natural
    const variant1 = {
        name: 'iPhone 15 Pro Max 256GB Titan Tự Nhiên',
        brand: 'Apple',
        category: 'Điện Thoại',
        categoryIds: ['dien-thoai', 'dien-thoai/apple', 'dien-thoai/apple/iphone-15-series'],
        price_original: 29000000,
        price_promo: 28500000,
        specs: {},
        images: ['https://firebasestorage.googleapis.com/v0/b/qlch-vanlanh-asia.appspot.com/o/products%2Fiphone-15-pro-max-natural.png?alt=media'],
        imageUrl: 'https://firebasestorage.googleapis.com/v0/b/qlch-vanlanh-asia.appspot.com/o/products%2Fiphone-15-pro-max-natural.png?alt=media',
        status: 'active',
        condition: 'new',
        stock: 5,
        seriesId: seriesId,
        color: 'Titan Tự Nhiên',
        storageCapacity: '256GB',
        conditionLabel: 'Mới Nguyên Seal',
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
    };

    // 2. Variant 2: Titan White
    const variant2 = {
        name: 'iPhone 15 Pro Max 256GB Titan Trắng',
        brand: 'Apple',
        category: 'Điện Thoại',
        categoryIds: ['dien-thoai', 'dien-thoai/apple', 'dien-thoai/apple/iphone-15-series'],
        price_original: 29000000,
        price_promo: 28500000,
        specs: {},
        images: ['https://firebasestorage.googleapis.com/v0/b/qlch-vanlanh-asia.appspot.com/o/products%2Fiphone-15-pro-max-white.png?alt=media'],
        imageUrl: 'https://firebasestorage.googleapis.com/v0/b/qlch-vanlanh-asia.appspot.com/o/products%2Fiphone-15-pro-max-white.png?alt=media',
        status: 'active',
        condition: 'new',
        stock: 3,
        seriesId: seriesId,
        color: 'Titan Trắng',
        storageCapacity: '256GB',
        conditionLabel: 'Mới Nguyên Seal',
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
    };

    try {
        const doc1Ref = db.collection('products').doc('iphone-15-pro-max-256gb-titan-tu-nhien-test');
        await doc1Ref.set(variant1);
        console.log('Created variant 1:', doc1Ref.id);

        const doc2Ref = db.collection('products').doc('iphone-15-pro-max-256gb-titan-trang-test');
        await doc2Ref.set(variant2);
        console.log('Created variant 2:', doc2Ref.id);

        console.log('Variants created successfully!');
    } catch (error) {
        console.error('Error creating variants:', error);
    }
}

createTestVariants();
