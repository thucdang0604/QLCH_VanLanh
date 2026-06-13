type RepairActor = {
    role?: string;
    permissions?: string[];
};

export function isRepairManager(actor: RepairActor | null | undefined): boolean {
    return actor?.role === 'admin' || (
        actor?.role === 'staff'
        && actor.permissions?.includes('manage_repairs') === true
        && actor.permissions.includes('manage_orders')
    );
}

export function isTechnicianUser(data: Record<string, unknown> | undefined): boolean {
    return data?.role === 'staff'
        && Array.isArray(data.permissions)
        && data.permissions.includes('manage_repairs');
}
