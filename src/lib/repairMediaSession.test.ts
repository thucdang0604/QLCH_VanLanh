import assert from 'node:assert/strict';
import test from 'node:test';
import { FieldValue, Firestore } from 'firebase-admin/firestore';
import { buildRepairMediaTimelineEntry, canAttachBackgroundMedia, createBackgroundRepairMediaSession } from './repairMediaSession';

test('media timeline payload is accepted by Firestore locally without a commit', () => {
    const db = new Firestore({ projectId: 'demo-repair-media-test' });
    for (const placement of ['pre_repair', 'post_repair'] as const) {
        const entry = buildRepairMediaTimelineEntry('received', placement, 'upload', 'staff-1');
        assert.equal(typeof entry.timestamp, 'number');
        assert.doesNotThrow(() => db.batch().update(db.doc('repairs/test'), {
            [placement === 'pre_repair' ? 'preRepairMedia' : 'postRepairMedia']: FieldValue.arrayUnion('https://example.invalid/video.mp4'),
            updatedAt: FieldValue.serverTimestamp(),
            statusTimeline: FieldValue.arrayUnion(entry),
        }));
    }
});

test('uploads attach only after binding and never attach removed or already submitted media', () => {
    const session = createBackgroundRepairMediaSession();
    session.uploaded.pre_repair.add('video');
    assert.equal(canAttachBackgroundMedia(session, 'pre_repair', 'video'), false);
    session.ticketId = 'ticket-1';
    assert.equal(canAttachBackgroundMedia(session, 'pre_repair', 'video'), true);
    for (const key of ['excluded', 'submitted', 'attaching', 'attached'] as const) {
        session[key].pre_repair.add('video');
        assert.equal(canAttachBackgroundMedia(session, 'pre_repair', 'video'), false, key);
        session[key].pre_repair.delete('video');
    }
    assert.equal(canAttachBackgroundMedia(session, 'pre_repair', 'video'), true);
});

test('placements and forms do not share queues or exclusions', () => {
    const first = createBackgroundRepairMediaSession();
    const next = createBackgroundRepairMediaSession();
    first.ticketId = 'first';
    next.ticketId = 'next';
    first.uploaded.pre_repair.add('video');
    first.excluded.post_repair.add('video');
    assert.equal(canAttachBackgroundMedia(first, 'pre_repair', 'video'), true);
    assert.equal(canAttachBackgroundMedia(first, 'post_repair', 'video'), false);
    assert.equal(canAttachBackgroundMedia(next, 'pre_repair', 'video'), false);
});
