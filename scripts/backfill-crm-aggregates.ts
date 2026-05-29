import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

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

async function backfillParts() {
    const args = process.argv.slice(2);
    const isDryRun = args.includes('--dry-run');
    const isRepair = args.includes('--repair-prerequisites');

    if (!isDryRun && !isRepair) {
        console.log('Vui lòng chỉ định --dry-run hoặc --repair-prerequisites');
        process.exit(0);
    }

    console.log(`[${isDryRun ? 'DRY RUN' : 'REPAIR'}] Bắt đầu kiểm tra partLineId trong collection 'repairs'...`);

    const repairsSnap = await db.collection('repairs').get();
    let totalTickets = 0;
    let modifiedTickets = 0;
    let totalMissingParts = 0;

    const batch = db.batch();
    let batchCount = 0;

    for (const doc of repairsSnap.docs) {
        const data = doc.data();
        if (!data.parts || !Array.isArray(data.parts)) {
            continue;
        }

        totalTickets++;
        let isModified = false;
        const updatedParts = data.parts.map(part => {
            if (!part.partLineId) {
                part.partLineId = crypto.randomUUID();
                isModified = true;
                totalMissingParts++;
            }
            return part;
        });

        if (isModified) {
            modifiedTickets++;
            if (isRepair) {
                batch.update(doc.ref, { parts: updatedParts });
                batchCount++;

                // Commit batch if it reaches 500
                if (batchCount === 500) {
                    await batch.commit();
                    console.log('  Đã commit 500 bản ghi...');
                    batchCount = 0;
                }
            }
        }
    }

    if (isRepair && batchCount > 0) {
        await batch.commit();
        console.log(`  Đã commit ${batchCount} bản ghi cuối cùng...`);
    }

    console.log(`\n=== BÁO CÁO ===`);
    console.log(`Tổng số phiếu có parts: ${totalTickets}`);
    console.log(`Số phiếu cần cập nhật: ${modifiedTickets}`);
    console.log(`Số lượng linh kiện thiếu partLineId đã xử lý: ${totalMissingParts}`);
    if (isDryRun) {
        console.log(`[DRY RUN] Không có thay đổi nào được lưu vào cơ sở dữ liệu.`);
    } else {
        console.log(`[REPAIR] Đã cập nhật thành công!`);
    }
}

backfillParts().catch(console.error);
