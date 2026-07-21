import { NextRequest } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { revalidateTag } from 'next/cache';
import { requireAdmin } from '@/lib/apiAuth';
import { getApiErrorMessage, getApiErrorStatus, withApi } from '@/lib/api/handler';
import { getAdminDb } from '@/lib/firebaseAdmin';
import { TaxonomyMutationError, type TaxonomyMutationRequest, mutateTaxonomy } from '@/lib/taxonomyMutation';

export const POST = withApi({
    name: 'admin/taxonomy',
    onError: (error, context) => {
        const status = error instanceof TaxonomyMutationError ? error.status : getApiErrorStatus(error);
        return context.json({ success: false, error: getApiErrorMessage(error) }, { status });
    },
}, async (request: NextRequest, context) => {
        await requireAdmin(request);
        const body = await context.readJson<TaxonomyMutationRequest>(request);
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

        revalidateTag('config');
        revalidateTag('layout');

        return context.json({ success: true, nodeId: result.nodeId });
});
