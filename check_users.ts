import { getAdminDb } from './src/lib/firebaseAdmin';

async function main() {
    const snapshot = await getAdminDb().collection('users').get();
    snapshot.forEach((userDoc) => {
        console.log(userDoc.id, '=>', userDoc.data());
    });
}

main().catch(console.error);
