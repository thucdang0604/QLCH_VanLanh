export type RepairMediaPlacement = 'pre_repair' | 'post_repair';

export type BackgroundRepairMediaSession = {
    ticketId: string | null;
    uploaded: Record<RepairMediaPlacement, Set<string>>;
    submitted: Record<RepairMediaPlacement, Set<string>>;
    attaching: Record<RepairMediaPlacement, Set<string>>;
    attached: Record<RepairMediaPlacement, Set<string>>;
    excluded: Record<RepairMediaPlacement, Set<string>>;
};

export function createBackgroundRepairMediaSession(): BackgroundRepairMediaSession {
    const placements = () => ({ pre_repair: new Set<string>(), post_repair: new Set<string>() });
    return {
        ticketId: null,
        uploaded: placements(),
        submitted: placements(),
        attaching: placements(),
        attached: placements(),
        excluded: placements(),
    };
}

export function canAttachBackgroundMedia(session: BackgroundRepairMediaSession, placement: RepairMediaPlacement, url: string): boolean {
    return !!session.ticketId && session.uploaded[placement].has(url)
        && !session.excluded[placement].has(url)
        && !session.submitted[placement].has(url)
        && !session.attached[placement].has(url)
        && !session.attaching[placement].has(url);
}

// Concrete numbers are valid inside Firestore array transforms; serverTimestamp() is not.
export function buildRepairMediaTimelineEntry(status: string, placement: RepairMediaPlacement, source: string, userId: string) {
    return {
        status,
        note: placement === 'pre_repair'
            ? 'Thêm media tiếp nhận từ tác vụ nền'
            : source === 'youtube' ? 'Them link YouTube ban giao' : 'Them media ban giao',
        timestamp: Date.now(),
        userId,
    };
}
