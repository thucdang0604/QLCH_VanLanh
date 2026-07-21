import { revalidatePath, revalidateTag } from 'next/cache';
import { FieldValue } from 'firebase-admin/firestore';
import { ApiError, getApiErrorMessage, getApiErrorStatus, withApi } from '@/lib/api/handler';
import { requireAdmin } from '@/lib/apiAuth';
import { getAdminDb } from '@/lib/firebaseAdmin';
import {
    splitConfigPatch,
    type SystemConfigDocument,
} from '@/lib/systemConfig';
import {
    getLegacyReviewPin,
    hashReviewPin,
    isValidReviewPin,
    normalizePublicGeofence,
    PRIVATE_REVIEW_CONFIG_ID,
} from '@/lib/reviewVerification';

const MAX_LAYOUT_DOCUMENT_BYTES = 800 * 1024;

type ConfigUpdateBody = {
    patch?: Record<string, unknown>;
    expectedRevisions?: Partial<Record<SystemConfigDocument, number>>;
    reviewPin?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function cleanUndefined(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(cleanUndefined);
    if (isRecord(value)) {
        return Object.fromEntries(
            Object.entries(value)
                .filter(([, item]) => item !== undefined)
                .map(([key, item]) => [key, cleanUndefined(item)]),
        );
    }
    return value;
}

function readRevision(data: FirebaseFirestore.DocumentData | undefined): number {
    return typeof data?.configRevision === 'number' && Number.isSafeInteger(data.configRevision)
        ? data.configRevision
        : 0;
}

function isLegacyPublicGeofence(data: FirebaseFirestore.DocumentData | undefined): boolean {
    return Boolean(data?.geofence && isRecord(data.geofence) && Object.hasOwn(data.geofence, 'pin'));
}

export const POST = withApi({
    name: 'admin/config',
    onError: (error, context) => context.json(
        { success: false, error: getApiErrorMessage(error) },
        { status: getApiErrorStatus(error) },
    ),
}, async (request, context) => {
    const actor = await requireAdmin(request);
    const body = await context.readJson<ConfigUpdateBody>(request);
    if (!isRecord(body.patch) || Object.keys(body.patch).length === 0) {
        throw new ApiError('Configuration patch is required.', 400, 'invalid_config_patch');
    }

    const patch = cleanUndefined(body.patch) as Record<string, unknown>;
    if (Object.hasOwn(patch, 'taxonomy')) {
        throw new ApiError('Taxonomy must be changed through the protected taxonomy API.', 400, 'taxonomy_protected');
    }

    let updatesByDoc: Record<SystemConfigDocument, Record<string, unknown>>;
    try {
        updatesByDoc = splitConfigPatch(patch);
    } catch (error) {
        throw new ApiError(
            error instanceof Error ? error.message : 'Unsupported configuration field.',
            400,
            'unsupported_config_field',
        );
    }

    if (Object.hasOwn(patch, 'geofence')) {
        if (!isRecord(patch.geofence)) {
            throw new ApiError('Geofence configuration is invalid.', 400, 'invalid_geofence');
        }
        updatesByDoc.main_settings.geofence = normalizePublicGeofence(patch.geofence);
    }

    const reviewPin = typeof body.reviewPin === 'string' && body.reviewPin.trim()
        ? body.reviewPin.trim()
        : undefined;
    if (reviewPin && !isValidReviewPin(reviewPin)) {
        throw new ApiError('PIN phải gồm từ 4 đến 8 chữ số.', 400, 'invalid_review_pin');
    }

    const targetDocs = (Object.entries(updatesByDoc) as Array<[SystemConfigDocument, Record<string, unknown>]>)
        .filter(([, update]) => Object.keys(update).length > 0)
        .map(([name]) => name);
    const needsReviewMigration = Object.hasOwn(patch, 'geofence');
    const db = getAdminDb();
    const refsByDoc = Object.fromEntries(
        targetDocs.map((name) => [name, db.collection('system_config').doc(name)]),
    ) as Record<SystemConfigDocument, FirebaseFirestore.DocumentReference>;
    const layoutRef = db.collection('system_config').doc('layout_settings');
    const privateReviewRef = db.collection('private_config').doc(PRIVATE_REVIEW_CONFIG_ID);

    const revisions = await db.runTransaction(async (transaction) => {
        const extraRefs = needsReviewMigration
            ? [layoutRef, privateReviewRef]
            : [];
        const uniqueRefs = Array.from(new Map([
            ...Object.values(refsByDoc),
            ...extraRefs,
        ].map((ref) => [ref.path, ref])).values());
        const snapshots = await Promise.all(uniqueRefs.map((ref) => transaction.get(ref)));
        const snapshotByPath = new Map(snapshots.map((snapshot) => [snapshot.ref.path, snapshot]));

        for (const docName of targetDocs) {
            const snapshot = snapshotByPath.get(refsByDoc[docName].path);
            const actualRevision = readRevision(snapshot?.data());
            const expectedRevision = body.expectedRevisions?.[docName];
            if (expectedRevision !== undefined && expectedRevision !== actualRevision) {
                throw new ApiError(
                    'Cấu hình đã được một quản trị viên khác thay đổi. Hãy tải lại trước khi lưu.',
                    409,
                    'config_conflict',
                );
            }
        }

        const layoutSnapshot = snapshotByPath.get(layoutRef.path);
        const privateSnapshot = snapshotByPath.get(privateReviewRef.path);
        const legacyPin = getLegacyReviewPin(layoutSnapshot?.data()?.geofence);
        const currentPinHash = privateSnapshot?.data()?.pinHash;
        const pinHash = reviewPin
            ? await hashReviewPin(reviewPin)
            : typeof currentPinHash === 'string'
                ? currentPinHash
                : legacyPin
                    ? await hashReviewPin(legacyPin)
                    : undefined;

        const requestedPolicy = updatesByDoc.main_settings.geofence;
        if (requestedPolicy && isRecord(requestedPolicy) && requestedPolicy.enabled === true && !pinHash) {
            throw new ApiError('Cần nhập PIN 4–8 chữ số trước khi bật xác minh đánh giá.', 400, 'review_pin_required');
        }

        const nextRevisions: Partial<Record<SystemConfigDocument, number>> = {};
        for (const docName of targetDocs) {
            const ref = refsByDoc[docName];
            const snapshot = snapshotByPath.get(ref.path);
            const currentData = snapshot?.data() ?? {};
            const nextRevision = readRevision(currentData) + 1;
            const update = updatesByDoc[docName];

            if (docName === 'layout_settings') {
                const nextLayout = { ...currentData, ...update, configRevision: nextRevision };
                if (Buffer.byteLength(JSON.stringify(nextLayout)) > MAX_LAYOUT_DOCUMENT_BYTES) {
                    throw new ApiError('Thư viện layout đã gần vượt giới hạn Firestore. Hãy xoá bớt cấu hình cũ trước khi lưu.', 413, 'layout_document_too_large');
                }
            }

            transaction.set(ref, {
                ...update,
                configRevision: nextRevision,
                updatedAt: FieldValue.serverTimestamp(),
                updatedBy: actor.uid,
            }, { merge: true });
            nextRevisions[docName] = nextRevision;
        }

        if (needsReviewMigration) {
            if (pinHash && pinHash !== currentPinHash) {
                transaction.set(privateReviewRef, {
                    pinHash,
                    updatedAt: FieldValue.serverTimestamp(),
                    updatedBy: actor.uid,
                }, { merge: true });
            }

            if (isLegacyPublicGeofence(layoutSnapshot?.data())) {
                const layoutWasTargeted = targetDocs.includes('layout_settings');
                const existingLayoutRevision = readRevision(layoutSnapshot?.data());
                const layoutRevision = layoutWasTargeted
                    ? nextRevisions.layout_settings
                    : existingLayoutRevision + 1;
                transaction.set(layoutRef, {
                    ...(layoutWasTargeted ? {} : { configRevision: layoutRevision }),
                    geofence: FieldValue.delete(),
                    updatedAt: FieldValue.serverTimestamp(),
                    updatedBy: actor.uid,
                }, { merge: true });
                if (!layoutWasTargeted) nextRevisions.layout_settings = layoutRevision;
            }
        }

        return nextRevisions;
    });

    // Invalidate on the server after a committed transaction; the browser never
    // has to fire-and-forget a second request for cache coherence.
    revalidateTag('config');
    revalidateTag('layout');
    revalidateTag('review-verification');
    revalidatePath('/', 'layout');

    return context.json({ success: true, revisions });
});
