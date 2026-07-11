import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { requireAdmin } from '@/lib/apiAuth';
import { getAdminDb } from '@/lib/firebaseAdmin';
import { TaxonomyMutationError, type TaxonomyMutationRequest, mutateTaxonomy } from '@/lib/taxonomyMutation';

function errorResponse(error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    const status = error instanceof TaxonomyMutationError
        ? error.status
        : message.includes('Forbidden') ? 403
            : message.includes('Missing Authorization') ? 401
                : 500;
    return NextResponse.json({ success: false, error: message }, { status });
}

export async function POST(request: NextRequest) {
    try {
        await requireAdmin(request);
        const body = await request.json() as TaxonomyMutationRequest;
        const db = getAdminDb();
        const taxonomyRef = db.collection('system_config').doc('taxonomy_settings');

        const result = await db.runTransaction(async (tx) => {
            const current = await tx.get(taxonomyRef);
            if (!current.exists) {
                throw new TaxonomyMutationError('Taxonomy configuration is missing. Restore the previous taxonomy document before editing.', 409);
            }

            const mutation = mutateTaxonomy(current.data()?.taxonomy, body);
            tx.update(taxonomyRef, {
                taxonomy: mutation.taxonomy,
                updatedAt: FieldValue.serverTimestamp(),
            });
            return mutation;
        });

        return NextResponse.json({ success: true, nodeId: result.nodeId });
    } catch (error) {
        return errorResponse(error);
    }
}
