export function calculatePosDiscountBreakdown({
    discountableSubtotal,
    manualDiscount,
    autoDiscountAmount,
    autoDiscountApplied,
}: {
    discountableSubtotal: number;
    manualDiscount: number;
    autoDiscountAmount: number;
    autoDiscountApplied: boolean;
}) {
    const eligibleSubtotal = Math.max(0, discountableSubtotal);
    const appliedAutoDiscount = autoDiscountApplied
        ? Math.min(Math.max(0, autoDiscountAmount), eligibleSubtotal)
        : 0;
    const appliedManualDiscount = Math.min(
        Math.max(0, manualDiscount),
        Math.max(0, eligibleSubtotal - appliedAutoDiscount),
    );

    return {
        appliedAutoDiscount,
        appliedManualDiscount,
        effectiveDiscount: appliedAutoDiscount + appliedManualDiscount,
    };
}
