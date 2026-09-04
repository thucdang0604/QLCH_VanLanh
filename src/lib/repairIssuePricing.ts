import type { RepairIssue, RepairIssueBillingMode } from '@/lib/types';

type RepairPartIssueLink = {
    issueId?: string;
    status?: string;
};

function isActivePartForIssue(part: RepairPartIssueLink): boolean {
    return Boolean(part.issueId) && part.status !== 'rejected';
}

/**
 * Existing tickets did not have issueId/billingMode. They retain the legacy
 * behaviour (all issue estimates are service fees) until a user explicitly
 * associates a part with that issue.
 */
export function resolveRepairIssueBillingMode(
    issue: RepairIssue,
    parts: RepairPartIssueLink[],
): RepairIssueBillingMode {
    if (issue.billingMode) return issue.billingMode;
    return parts.some(part => part.issueId === issue.id && isActivePartForIssue(part))
        ? 'parts_only'
        : 'service_only';
}

export function getRepairIssueLaborCost(
    issues: RepairIssue[] | undefined,
    parts: RepairPartIssueLink[],
    fallbackLaborCost = 0,
): number {
    if (!issues?.length) return Math.max(0, Number(fallbackLaborCost) || 0);

    return issues.reduce((total, issue) => {
        const mode = resolveRepairIssueBillingMode(issue, parts);
        if (mode === 'parts_only' || mode === 'free') return total;
        return total + Math.max(0, Number(issue.estimatedPrice) || 0);
    }, 0);
}
