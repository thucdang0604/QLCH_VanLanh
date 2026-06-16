import { getAdminDb } from '../src/lib/firebaseAdmin';
import * as fs from 'fs';
import * as path from 'path';

async function main() {
    const db = getAdminDb();
    const docSnap = await db.collection('system_config').doc('repairs').get();
    
    if (!docSnap.exists) {
        console.error("Document system_config/repairs not found");
        process.exit(1);
    }
    
    const data = docSnap.data();
    const outPath = path.join(__dirname, '..', 'roadmap', 'repair_workflow_settings.json');
    
    fs.writeFileSync(outPath, JSON.stringify(data, null, 2), 'utf-8');
    console.log(`Successfully exported repair workflow settings to: ${outPath}`);
}

main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
});
