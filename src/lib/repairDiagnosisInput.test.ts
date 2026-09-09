import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeDiagnosisIssue } from './repairDiagnosisInput';

test('diagnosis issue omits an unspecified billing mode for Firestore', () => {
    const issue = normalizeDiagnosisIssue({
        id: 'issue-1',
        label: 'Thay pin',
        estimatedPrice: 200_000,
    }, 0);

    assert.equal('billingMode' in issue, false);
    assert.deepEqual(issue, {
        id: 'issue-1',
        label: 'Thay pin',
        estimatedPrice: 200_000,
        status: 'pending',
        categoryPath: [],
        serviceName: '',
        serviceId: '',
    });
});

test('diagnosis issue retains an explicit billing mode', () => {
    const issue = normalizeDiagnosisIssue({
        id: 'issue-1',
        label: 'Thay pin',
        estimatedPrice: 200_000,
        billingMode: 'parts_and_service',
    }, 0);

    assert.equal(issue.billingMode, 'parts_and_service');
});
