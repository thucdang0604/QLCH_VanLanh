import { NextRequest } from 'next/server';
import { getAdminDb } from '@/lib/firebaseAdmin';
import { requirePermission } from '@/lib/apiAuth';
import { getApiErrorMessage, getApiErrorStatus, withApi } from '@/lib/api/handler';

export const GET = withApi({
    name: 'debug/users',
    onError: (error, context) => context.error(getApiErrorMessage(error), getApiErrorStatus(error)),
}, async (request: NextRequest, context) => {
        await requirePermission(request, 'manage_staff');
        const snapshot = await getAdminDb().collection('users').get();
        const users = snapshot.docs.map(userDoc => ({ id: userDoc.id, ...userDoc.data() }));
        return context.json(users);
});
