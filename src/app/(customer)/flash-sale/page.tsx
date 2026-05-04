import { fetchFlashSaleProducts } from '@/app/(customer)/_lib/server-queries';
import { isAdminAvailable } from '@/lib/firebaseAdmin';
import FlashSaleClient from './page.client';
import type { Metadata } from 'next';

export const revalidate = 30;

export const metadata: Metadata = {
    title: 'Flash Sale - Giảm giá sốc | Văn Lành Service',
    description: 'Săn deal hot, giảm giá sốc từ 10-50% cho điện thoại, laptop tại Văn Lành Service.',
};

export default async function FlashSalePage() {
    let products: any[] = [];

    if (isAdminAvailable()) {
        try {
            products = await fetchFlashSaleProducts();
        } catch (error) {
            console.error('[FlashSale SSR] Error:', error);
        }
    }

    return <FlashSaleClient products={products} />;
}
