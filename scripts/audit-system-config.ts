import { getAdminDb, isAdminAvailable } from '@/lib/firebaseAdmin';
import { SYSTEM_CONFIG_DOCUMENTS } from '@/lib/systemConfig';

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function approximateSize(value: unknown): number {
    return Buffer.byteLength(JSON.stringify(value ?? {}));
}

function arrayLength(value: unknown): number {
    return Array.isArray(value) ? value.length : 0;
}

function workflowStatusIds(value: unknown): Set<string> {
    if (!Array.isArray(value)) return new Set();
    return new Set(value.flatMap((item) => (
        isRecord(item) && typeof item.id === 'string' && item.id.trim()
            ? [item.id.trim()]
            : []
    )));
}

type RepairTicketWorkflowAudit = {
    scanned: boolean;
    scannedTickets?: number;
    missingStatusCount?: number;
    unknownStatusCount?: number;
    legacyOnlyStatusCount?: number;
    samples?: Array<{ id: string; ticketType: 'repair' | 'warranty'; status: string | null; reason: string }>;
    safeToRemoveLegacyStatuses?: boolean;
};

async function auditRepairTicketWorkflow(
    repairData: UnknownRecord,
    shouldScanTickets: boolean,
): Promise<RepairTicketWorkflowAudit> {
    if (!shouldScanTickets) return { scanned: false };

    const repairStatusIds = workflowStatusIds(repairData.repairStatuses);
    const warrantyStatusIds = workflowStatusIds(repairData.warrantyStatuses);
    const legacyStatusIds = workflowStatusIds(repairData.statuses);
    const tickets = await getAdminDb().collection('repairs').select('status', 'ticketType').get();
    const samples: NonNullable<RepairTicketWorkflowAudit['samples']> = [];
    let missingStatusCount = 0;
    let unknownStatusCount = 0;
    let legacyOnlyStatusCount = 0;

    for (const ticket of tickets.docs) {
        const data = ticket.data();
        const ticketType = data.ticketType === 'warranty' ? 'warranty' : 'repair';
        const status = typeof data.status === 'string' && data.status.trim() ? data.status.trim() : null;
        const configuredIds = ticketType === 'warranty' ? warrantyStatusIds : repairStatusIds;
        let reason: string | null = null;

        if (!status) {
            missingStatusCount++;
            reason = 'missing_status';
        } else if (!configuredIds.has(status)) {
            unknownStatusCount++;
            if (ticketType === 'repair' && legacyStatusIds.has(status)) {
                legacyOnlyStatusCount++;
                reason = 'legacy_only_status';
            } else {
                reason = 'status_not_in_active_workflow';
            }
        }

        if (reason && samples.length < 20) {
            samples.push({ id: ticket.id, ticketType, status, reason });
        }
    }

    return {
        scanned: true,
        scannedTickets: tickets.size,
        missingStatusCount,
        unknownStatusCount,
        legacyOnlyStatusCount,
        samples,
        safeToRemoveLegacyStatuses: repairStatusIds.size > 0
            && missingStatusCount === 0
            && unknownStatusCount === 0,
    };
}

async function main() {
    if (!isAdminAvailable()) {
        throw new Error('Firebase Admin credentials are required for this read-only audit.');
    }

    const db = getAdminDb();
    const configRefs = SYSTEM_CONFIG_DOCUMENTS.map((documentName) => db.collection('system_config').doc(documentName));
    const [main, layout, navigation, taxonomy, repairs, deprecatedSiteConfig, privateReview] = await db.getAll(
        ...configRefs,
        db.collection('system_config').doc('repairs'),
        db.collection('system_config').doc('site_config'),
        db.collection('private_config').doc('review_verification'),
    );

    const mainData = main.data() ?? {};
    const layoutData = layout.data() ?? {};
    const navigationData = navigation.data() ?? {};
    const taxonomyData = taxonomy.data() ?? {};
    const repairData = repairs.data() ?? {};
    const legacyGeofence = layoutData.geofence;
    const canonicalGeofence = mainData.geofence;
    const taxonomyTree = isRecord(taxonomyData.taxonomy) ? taxonomyData.taxonomy : {};
    const layoutProfiles = layoutData.layoutProfiles;
    const repairTicketWorkflow = await auditRepairTicketWorkflow(
        repairData,
        process.argv.includes('--scan-repair-tickets'),
    );

    const configDocumentSnapshots = [
        { name: 'main_settings', snapshot: main },
        { name: 'layout_settings', snapshot: layout },
        { name: 'navigation_settings', snapshot: navigation },
        { name: 'taxonomy_settings', snapshot: taxonomy },
    ];

    const report = {
        generatedAt: new Date().toISOString(),
        mode: 'read-only',
        documents: Object.fromEntries(configDocumentSnapshots.map(({ name, snapshot }) => [name, {
            exists: snapshot.exists,
            approximateBytes: approximateSize(snapshot.data()),
            configRevision: typeof snapshot.data()?.configRevision === 'number'
                ? snapshot.data()?.configRevision
                : 0,
        }])),
        geofence: {
            canonicalPolicyInMain: isRecord(canonicalGeofence),
            legacyPolicyInLayout: isRecord(legacyGeofence),
            publicLegacyPinPresent: isRecord(legacyGeofence) && typeof legacyGeofence.pin === 'string',
            privatePinHashPresent: typeof privateReview.data()?.pinHash === 'string',
        },
        bounty: {
            canonicalFieldsInMain: ['bountyMissions', 'bountyRewardType', 'bountyRewardValue']
                .filter((field) => mainData[field] !== undefined),
            deprecatedSiteConfigExists: deprecatedSiteConfig.exists,
        },
        navigation: {
            headerNavItems: arrayLength(navigationData.headerNav),
            sidebarMenuItems: arrayLength(navigationData.sidebarMenu),
            footerServiceItems: arrayLength(navigationData.footerServices),
        },
        taxonomy: {
            retailRoots: arrayLength(taxonomyTree.retail),
            serviceRoots: arrayLength(taxonomyTree.service),
            componentRoots: arrayLength(taxonomyTree.component),
        },
        layout: {
            profileCount: arrayLength(layoutProfiles),
            activeProfileId: typeof layoutData.activeLayoutProfileId === 'string'
                ? layoutData.activeLayoutProfileId
                : null,
        },
        repairWorkflow: {
            repairStatusesCount: arrayLength(repairData.repairStatuses),
            legacyStatusesCount: arrayLength(repairData.statuses),
            warrantyStatusesCount: arrayLength(repairData.warrantyStatuses),
            ticketAudit: repairTicketWorkflow,
        },
    };

    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
});
