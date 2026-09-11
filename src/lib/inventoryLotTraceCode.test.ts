import assert from 'node:assert/strict';
import test from 'node:test';
import { buildInventoryLotTraceCode, parseInventoryLotTraceCode } from './inventoryLotTraceCode';

test('builds and parses a compact inventory-lot QR payload without changing the document id', () => {
    const payload = buildInventoryLotTraceCode('LOT-260910-0042');
    assert.equal(payload, 'VL1:LOT-260910-0042');
    assert.equal(parseInventoryLotTraceCode(payload), 'LOT-260910-0042');
    assert.equal(parseInventoryLotTraceCode('vl1:lot-260910-0042'), 'lot-260910-0042');
});

test('rejects product codes, malformed trace payloads, and invalid document ids', () => {
    assert.equal(parseInventoryLotTraceCode('SP-IPHONE-15'), null);
    assert.equal(parseInventoryLotTraceCode('VL1:'), null);
    assert.equal(parseInventoryLotTraceCode('VL1:LOT/260910'), null);
    assert.throws(() => buildInventoryLotTraceCode('LOT/260910'), /không hợp lệ/);
});
