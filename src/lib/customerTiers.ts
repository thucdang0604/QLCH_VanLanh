export type CustomerTier = 'Smember' | 'Gold' | 'Silver' | 'Bronze';

export interface TierConfig {
    name: CustomerTier;
    minSpent: number;
    discountPercent: number;
}

export const TIER_CONFIGS: TierConfig[] = [
    { name: 'Smember', minSpent: 30000000, discountPercent: 5 }, // Ví dụ: 5% cho Smember
    { name: 'Gold', minSpent: 15000000, discountPercent: 3 },    // 3% cho Gold
    { name: 'Silver', minSpent: 5000000, discountPercent: 1 },   // 1% cho Silver
    { name: 'Bronze', minSpent: 0, discountPercent: 0 },         // 0% cho Bronze
];

/**
 * Tính toán thứ hạng khách hàng dựa trên tổng chi tiêu.
 * @param totalSpent Tổng số tiền khách đã chi tiêu
 * @returns Thứ hạng khách hàng (CustomerTier)
 */
export function calculateCustomerTier(totalSpent: number): CustomerTier {
    for (const tier of TIER_CONFIGS) {
        if (totalSpent >= tier.minSpent) {
            return tier.name;
        }
    }
    return 'Bronze';
}

/**
 * Lấy phần trăm giảm giá theo thứ hạng khách hàng.
 * @param tier Thứ hạng khách hàng
 * @returns Phần trăm giảm giá (0-100)
 */
export function getTierDiscountPercent(tier: CustomerTier): number {
    const config = TIER_CONFIGS.find((c) => c.name === tier);
    return config?.discountPercent || 0;
}
