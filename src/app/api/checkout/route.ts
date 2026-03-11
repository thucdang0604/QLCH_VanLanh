import { NextRequest, NextResponse } from 'next/server';
import { addDoc, collection } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();

        const { customer, items, shipping, payment, total, note, isVAT } = body;

        // Validate required fields
        if (!customer?.fullName || !customer?.phone || !items?.length) {
            return NextResponse.json(
                { error: 'Missing required fields' },
                { status: 400 }
            );
        }

        // Create order document
        const order = {
            customer: {
                fullName: customer.fullName,
                phone: customer.phone,
                email: customer.email || '',
            },
            shipping: {
                province: shipping?.province || '',
                district: shipping?.district || '',
                ward: shipping?.ward || '',
                address: shipping?.address || '',
            },
            items: items.map((item: any) => ({
                productId: item.id,
                name: item.name,
                price: item.price,
                quantity: item.quantity,
                variant: item.variant || '',
            })),
            payment: {
                method: payment || 'cod',
                status: 'pending',
            },
            total: total || 0,
            note: note || '',
            isVAT: isVAT || false,
            status: 'Pending',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        };

        const docRef = await addDoc(collection(db, 'orders'), order);

        return NextResponse.json({
            success: true,
            orderId: docRef.id,
            message: 'Order created successfully',
        });
    } catch (error) {
        console.error('Checkout error:', error);
        return NextResponse.json(
            { error: 'Failed to create order' },
            { status: 500 }
        );
    }
}
