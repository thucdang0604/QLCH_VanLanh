import type { RepairIssue } from '@/lib/types';

export type DiagnosisIssueInput = Partial<Pick<RepairIssue, 'id' | 'label' | 'estimatedPrice' | 'status' | 'categoryPath' | 'serviceName' | 'billingMode'>>;

/**
 * Validates the narrow issue payload that technicians may change during diagnosis.
 * Optional properties are omitted so the resulting object is valid Firestore data.
 */
export function normalizeDiagnosisIssue(issue: DiagnosisIssueInput, index: number): RepairIssue {
    const label = typeof issue?.label === 'string' ? issue.label.trim() : '';
    if (!label || label.length > 300) throw new Error(`Lỗi thứ ${index + 1} chưa hợp lệ.`);

    const estimatedPrice = Number(issue.estimatedPrice);
    if (!Number.isFinite(estimatedPrice) || estimatedPrice < 0 || estimatedPrice > 1_000_000_000) {
        throw new Error(`Giá dự kiến của lỗi thứ ${index + 1} chưa hợp lệ.`);
    }

    const categoryPath = Array.isArray(issue.categoryPath)
        ? issue.categoryPath.filter((item): item is string => typeof item === 'string').map(item => item.trim()).filter(Boolean).slice(0, 3)
        : [];
    const status = issue.status === 'resolved' || issue.status === 'unresolved' ? issue.status : 'pending';
    const billingMode = issue.billingMode === 'parts_only' || issue.billingMode === 'parts_and_service' || issue.billingMode === 'free'
        ? issue.billingMode
        : issue.billingMode === 'service_only' ? 'service_only' : undefined;

    return {
        id: typeof issue.id === 'string' && issue.id.trim() ? issue.id.trim().slice(0, 120) : `diagnosis-${index + 1}`,
        label,
        estimatedPrice,
        status,
        // Taxonomy is the source of classification. A concrete service is not
        // written from the technician diagnosis screen.
        categoryPath,
        serviceName: typeof issue.serviceName === 'string' ? issue.serviceName.trim().slice(0, 160) : '',
        serviceId: '',
        ...(billingMode ? { billingMode } : {}),
    };
}
