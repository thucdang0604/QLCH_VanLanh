/**
 * Public, versioned payload carried by a QR label for one product allocation
 * within an inventory lot. The value deliberately identifies the inventory_lots
 * document rather than concatenating a catalog code with a human lot code.
 */
export const INVENTORY_LOT_TRACE_PREFIX = 'VL1:';

const INVENTORY_LOT_ID_PATTERN = /^[A-Za-z0-9_-]{1,180}$/;

export function buildInventoryLotTraceCode(inventoryLotId: string): string {
    const lotId = String(inventoryLotId || '').trim();
    if (!INVENTORY_LOT_ID_PATTERN.test(lotId)) {
        throw new Error('Mã định danh lô không hợp lệ để in QR.');
    }
    return `${INVENTORY_LOT_TRACE_PREFIX}${lotId}`;
}

/** Returns the inventory_lots document id only for the supported QR format. */
export function parseInventoryLotTraceCode(rawValue: unknown): string | null {
    const value = String(rawValue || '').trim();
    if (!value.toUpperCase().startsWith(INVENTORY_LOT_TRACE_PREFIX)) return null;

    const lotId = value.slice(INVENTORY_LOT_TRACE_PREFIX.length).trim();
    return INVENTORY_LOT_ID_PATTERN.test(lotId) ? lotId : null;
}
