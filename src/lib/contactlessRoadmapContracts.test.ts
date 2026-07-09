import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import {
    MODE_CONFIG,
    buildImportContactInput,
    resolveCustomerImportDocId,
    resolveSupplierImportDocId,
} from '../features/excel-import/importSupport';
import { buildContactMethods, hasDebtSafeContact } from './contactIdentity';
import { buildHandoffUrl, consumeChatWorkflowHandoff } from './chatWorkflowHandoff';

function repoFile(...segments: string[]): string {
    return path.join(process.cwd(), ...segments);
}

test('excel import modes keep phone optional for contactless customers and suppliers', () => {
    assert.deepEqual(MODE_CONFIG.customer.requiredHeaders, ['Tên KH']);
    assert.deepEqual(MODE_CONFIG.supplier.requiredHeaders, ['Tên NCC']);
    assert.equal(MODE_CONFIG.order.requiredHeaders.includes('SĐT'), false);
    assert.equal(MODE_CONFIG.repair.requiredHeaders.includes('SĐT'), false);

    assert.equal(resolveCustomerImportDocId({
        'Tên KH': 'Chi Lan',
        Zalo: 'Chi Lan Zalo',
    }, 'Chi Lan'), 'KH-chi-lan-zalo');

    assert.equal(resolveSupplierImportDocId({
        'Tên NCC': 'NCC Pisen',
        Facebook: 'facebook.com/pisen.vn',
    }, 'NCC Pisen'), 'NCC-facebookcompisenvn');
});

test('excel debt guard accepts social contacts and rejects profile note only', () => {
    const zaloInput = buildImportContactInput({ Zalo: 'Chi Lan Zalo' }, 'Chi Lan');
    assert.equal(hasDebtSafeContact(buildContactMethods(zaloInput)), true);

    const noteOnlyInput = buildImportContactInput({ 'Ghi chú': 'Khach quen hay ghe cua hang' }, 'Khach quen');
    assert.equal(noteOnlyInput.note, '');
    assert.deepEqual(buildContactMethods(noteOnlyInput), []);
    assert.equal(hasDebtSafeContact(buildContactMethods(noteOnlyInput)), false);

    const otherContactInput = buildImportContactInput({ 'Liên hệ khác': 'Khach quen hay ghe cua hang' }, 'Khach quen');
    assert.equal(hasDebtSafeContact(buildContactMethods(otherContactInput)), true);
});

test('chat handoff preserves customer id and primary social contact snapshot', () => {
    const url = buildHandoffUrl('/admin/pos', {
        roomId: 'zalo_page_user',
        customerId: 'KH-ZALO-CHI-LAN',
        customerName: 'Chi Lan',
        customerPhone: '',
        primaryContactType: 'zalo',
        primaryContactValue: 'Chi Lan Zalo',
    });
    const params = new URL(`https://local.test${url}`).searchParams;
    const handoff = consumeChatWorkflowHandoff(params);

    assert.equal(handoff?.customerId, 'KH-ZALO-CHI-LAN');
    assert.equal(handoff?.customerPhone, '');
    assert.equal(handoff?.primaryContactType, 'zalo');
    assert.equal(handoff?.primaryContactValue, 'Chi Lan Zalo');
});

test('firestore customer rules allow contactless ids without relaxing aggregate writes', () => {
    const rules = fs.readFileSync(repoFile('firestore.rules'), 'utf8');

    assert.match(rules, /match \/customers\/\{customerId\}/);
    assert.match(rules, /function customerDocMatchesId\(data, customerId\)/);
    assert.match(rules, /customerDocMatchesId\(request\.resource\.data, customerId\) \|\| customerDocMatchesId\(resource\.data, customerId\)/);
    assert.match(rules, /function customerPhoneUpdateAllowed\(\)/);
    assert.match(rules, /request\.resource\.data\.phone == resource\.data\.phone/);
    assert.doesNotMatch(rules, /request\.resource\.data\.phone == phone/);
    assert.match(rules, /affectedKeys\(\)\.hasAny\(\['totalSpent', 'totalOrders', 'totalRepairs', 'totalAppointments', 'missions'\]\)/);
});

test('public OTP, voucher and tracking flows remain phone based', () => {
    const requestOtp = fs.readFileSync(repoFile('src', 'app', 'api', 'bounty', 'request-otp', 'route.ts'), 'utf8');
    const checkout = fs.readFileSync(repoFile('src', 'app', 'api', 'checkout', 'route.ts'), 'utf8');
    const tracking = fs.readFileSync(repoFile('src', 'app', 'api', 'tracking', 'route.ts'), 'utf8');

    assert.match(requestOtp, /normalizeVietnamPhone\(phone\)/);
    assert.match(requestOtp, /readProgressiveRateLimit\(normalizedPhone\.local, 'phone'\)/);
    assert.match(checkout, /Personal voucher requires OTP phone verification before checkout/);
    assert.match(checkout, /voucherOwnerPhone\.local !== normalizedPhone/);
    assert.match(tracking, /where\('customer_info\.phone', '==', cleanPhone\)/);
});

test('POS debt and collect-debt paths use customer id before legacy phone fallback', () => {
    const posPage = fs.readFileSync(repoFile('src', 'app', 'admin', 'pos', 'page.tsx'), 'utf8');
    const posCheckout = fs.readFileSync(repoFile('src', 'app', 'api', 'pos', 'checkout', 'route.ts'), 'utf8');
    const collectDebt = fs.readFileSync(repoFile('src', 'app', 'api', 'admin', 'customers', 'collect-debt', 'route.ts'), 'utf8');

    assert.match(posPage, /customerId\.trim\(\) \|\| phoneClean \|\| customerZalo\.trim\(\) \|\| customerFacebook\.trim\(\) \|\| customerOtherContact\.trim\(\)/);
    assert.match(posPage, /customerId: customerId\.trim\(\)/);
    assert.match(posCheckout, /\.where\('customer_info\.customerId', '==', resolvedCustomerId\)/);
    assert.match(posCheckout, /hasDebtSafeContact\(incomingContactMethods\)/);
    assert.match(collectDebt, /\.where\('customer_info\.customerId', '==', customerId\)/);
    assert.match(collectDebt, /\.where\('customer_info\.phone', '==', phone\)/);
});

test('POS customer entry stays compact and missing cashier shift is actionable', () => {
    const posPage = fs.readFileSync(repoFile('src', 'app', 'admin', 'pos', 'page.tsx'), 'utf8');
    const posCartPanel = fs.readFileSync(repoFile('src', 'features', 'pos', 'PosCartPanel.tsx'), 'utf8');
    const posCheckout = fs.readFileSync(repoFile('src', 'app', 'api', 'pos', 'checkout', 'route.ts'), 'utf8');

    assert.match(posCartPanel, /const customerContactOptions/);
    assert.match(posCartPanel, /Liên hệ phụ/);
    assert.match(posCartPanel, /missingCashierShift/);
    assert.match(posCartPanel, /Mở ca thu ngân trước/);
    assert.match(posPage, /setPosTab\('cashier'\)/);
    assert.match(posPage, /Chưa mở ca thu ngân/);
    assert.match(posCheckout, /normalizedMessage\.includes\('mở ca thu ngân'\)/);
});

test('CRM customer edit can add phone to contactless records without changing document id', () => {
    const customersPage = fs.readFileSync(repoFile('src', 'app', 'admin', 'customers', 'page.tsx'), 'utf8');
    const customerModal = fs.readFileSync(repoFile('src', 'components', 'admin', 'customers', 'CustomerFormModal.tsx'), 'utf8');

    assert.match(customersPage, /id: customerId/);
    assert.match(customersPage, /customerId,/);
    assert.match(customersPage, /code: editingCustomer\.code \|\| customerId/);
    assert.match(customersPage, /const submittedPhone = normalizedPhone\?\.local \|\| data\.phone \|\| ''/);
    assert.match(customersPage, /legacyPhoneId: submittedPhone/);
    assert.match(customersPage, /syncCustomerFormContactMethods/);
    assert.doesNotMatch(customerModal, /disabled=\{isEditMode\}/);
    assert.match(customerModal, /disabled=\{isPhoneLocked\}/);
    assert.match(customerModal, /normalizeVietnamPhone\(form\.phone\)/);
    assert.match(customerModal, /SĐT đã lưu là định danh riêng/);
    assert.match(customerModal, /Hồ sơ chưa có SĐT, có thể bổ sung SĐT/);
});

test('CRM customer list exposes clickable Zalo and Facebook contact links', () => {
    const customersPage = fs.readFileSync(repoFile('src', 'app', 'admin', 'customers', 'page.tsx'), 'utf8');

    assert.match(customersPage, /function customerSocialLinks\(customer: Customer\)/);
    assert.match(customersPage, /normalizeSocialContactHref\(type, value\)/);
    assert.match(customersPage, /href=\{link\.href\}/);
    assert.match(customersPage, /target="_blank"/);
    assert.match(customersPage, /event\.stopPropagation\(\)/);
    assert.match(customersPage, /link\.label/);
});

test('repair intake, handover and print paths preserve contactless customer snapshots', () => {
    const repairPage = fs.readFileSync(repoFile('src', 'app', 'admin', 'repairs', 'page.tsx'), 'utf8');
    const handover = fs.readFileSync(repoFile('src', 'app', 'api', 'repairs', 'handover', 'route.ts'), 'utf8');
    const printTemplates = fs.readFileSync(repoFile('src', 'features', 'repairs', 'RepairPrintTemplates.tsx'), 'utf8');

    assert.match(repairPage, /const customerSnapshot = \{/);
    assert.match(repairPage, /id: resolvedCustomerId/);
    assert.match(repairPage, /contactMethods/);
    assert.match(handover, /function getTicketCustomerId\(ticket: RepairTicket\)/);
    assert.match(handover, /ticket\.customer\?\.id \|\| ticket\.customer\?\.customerId \|\| ticket\.customer\?\.phone/);
    assert.match(printTemplates, /ticket\.customer\.primaryContactValue/);
});

test('supplier UI and import receipt inline creation store supplier ids with contact snapshots', () => {
    const suppliersPage = fs.readFileSync(repoFile('src', 'app', 'admin', 'suppliers', 'page.tsx'), 'utf8');
    const inventoryPage = fs.readFileSync(repoFile('src', 'app', 'admin', 'inventory', 'page.tsx'), 'utf8');
    const receiptModal = fs.readFileSync(repoFile('src', 'features', 'parts', 'ImportReceiptModals.tsx'), 'utf8');
    const importApi = fs.readFileSync(repoFile('src', 'app', 'api', 'inventory', 'import', 'route.ts'), 'utf8');

    assert.match(suppliersPage, /reserveSupplierDocumentId\(data\)/);
    assert.match(suppliersPage, /contactMethods/);
    assert.match(inventoryPage, /buildSupplierContactDocumentFields\(contactInput\)/);
    assert.match(receiptModal, /buildSupplierContactDocumentFields\(contactInput\)/);
    assert.match(importApi, /supplierId: sId/);
    assert.match(importApi, /supplier_transactions/);
    assert.match(inventoryPage, /function receiptItemHasSupplier\(receipt: ImportReceipt, item: ImportReceiptItem\)/);
    assert.match(inventoryPage, /receipt\.supplierId/);
    assert.match(importApi, /function normalizeImportPaymentMethod\(value: unknown\): ImportPaymentMethod/);
    assert.match(importApi, /method === 'cash' \|\| method === 'bank' \|\| method === 'debt'/);
    assert.match(importApi, /!item\.supplier && !item\.supplierId && !receipt\.supplierId/);
    assert.match(receiptModal, /useState<'cash' \| 'bank' \| 'debt'>\('debt'\)/);
    assert.doesNotMatch(receiptModal, /setPaymentMethod\('paid'\)/);
});
