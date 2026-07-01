import assert from 'node:assert/strict';
import test from 'node:test';

import {
    buildContactMethods,
    buildContactSearchKeywords,
    buildContactlessDocumentBaseId,
    hasDebtSafeContact,
    hasProfileContact,
    normalizeContactValue,
} from './contactIdentity';

test('normalizes phone and social contact values without Firestore reads', () => {
    assert.equal(normalizeContactValue('phone', '+84 912 345 678'), '0912345678');
    assert.equal(normalizeContactValue('facebook', 'https://www.facebook.com/Nguyen.A/'), 'facebook.com/nguyen.a');
    assert.equal(normalizeContactValue('zalo', '  Chi Lan Zalo  '), 'chi lan zalo');
});

test('builds contact methods with a primary non-phone contact', () => {
    const methods = buildContactMethods({
        name: 'Chi Lan',
        zalo: 'Chi Lan Zalo',
        note: 'Khach quen chi nhan Zalo',
        primaryType: 'zalo',
        source: 'manual',
    });

    assert.equal(methods.length, 2);
    assert.equal(methods[0].type, 'zalo');
    assert.equal(methods[0].isPrimary, true);
    assert.equal(hasProfileContact(methods), true);
    assert.equal(hasDebtSafeContact(methods), true);
});

test('does not treat note-only profiles as debt-safe contact', () => {
    const methods = buildContactMethods({ name: 'Khach quen', note: 'Hay ghe cua hang' });

    assert.equal(hasProfileContact(methods), true);
    assert.equal(hasDebtSafeContact(methods), false);
});

test('builds bounded search keywords and stable document base ids', () => {
    const input = { name: 'Chi Lan iPhone', zalo: 'Chi Lan Zalo' };
    const keywords = buildContactSearchKeywords(input);

    assert.equal(keywords.includes('chi lan iphone'), true);
    assert.equal(keywords.includes('chi lan zalo'), true);
    assert.equal(keywords.length <= 80, true);
    assert.equal(buildContactlessDocumentBaseId('KH', input), 'KH-chi-lan-zalo');
});
