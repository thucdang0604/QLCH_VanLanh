import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebaseAdmin';
import { FieldValue } from 'firebase-admin/firestore';

// In-memory rate limiting map for IPs
// Key: IP address, Value: { count: number, resetAt: number }
const ipRateLimit = new Map<string, { count: number; resetAt: number }>();

export async function POST(req: NextRequest) {
    try {
        // 1. Get Client IP for Rate Limiting
        const ip = req.headers.get('x-forwarded-for')?.split(',')[0] || 
                   req.headers.get('x-real-ip') || 
                   'unknown';

        const now = Date.now();
        
        // Rate Limit: Max 10 requests per minute per IP
        if (ip !== 'unknown') {
            const limitRecord = ipRateLimit.get(ip);
            if (limitRecord && now < limitRecord.resetAt) {
                if (limitRecord.count >= 10) {
                    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
                }
                limitRecord.count++;
            } else {
                ipRateLimit.set(ip, { count: 1, resetAt: now + 60000 });
            }
        }

        // 2. Device Identity & Visit Frequency Check via Cookies
        const deviceIdCookie = req.cookies.get('vl_device_id');
        const visitCookie = req.cookies.get('vl_visit_today');
        
        const deviceId = deviceIdCookie?.value || `device_${Math.random().toString(36).substring(2, 15)}_${Date.now()}`;
        
        // If they already visited today (based on cookie), we don't need to increment Firestore
        // We return success early to save database writes.
        if (visitCookie?.value === 'true') {
            // Just ensure device ID cookie is persisted if it was missing
            const response = NextResponse.json({ success: true, message: 'Already tracked today' });
            if (!deviceIdCookie) {
                response.cookies.set('vl_device_id', deviceId, {
                    maxAge: 60 * 60 * 24 * 365, // 1 year
                    httpOnly: true,
                    secure: process.env.NODE_ENV === 'production',
                    sameSite: 'lax'
                });
            }
            return response;
        }

        // 3. Unique Visit - Save to Firestore via Admin SDK
        const db = getAdminDb();
        const dateObj = new Date();
        const year = dateObj.getFullYear();
        const month = String(dateObj.getMonth() + 1).padStart(2, '0');
        const dateStr = String(dateObj.getDate()).padStart(2, '0');
        const todayStr = `${year}-${month}-${dateStr}`;

        const batch = db.batch();

        // 3a. Increment the daily summary counter (Keep compatibility with Admin Dashboard)
        const analyticsRef = db.collection('analytics').doc(todayStr);
        batch.set(analyticsRef, {
            visitors: FieldValue.increment(1)
        }, { merge: true });

        // 3b. Log the unique device visit for accurate auditing and spam prevention
        const visitLogRef = db.collection('analytics').doc(todayStr).collection('visits').doc(deviceId);
        batch.set(visitLogRef, {
            timestamp: FieldValue.serverTimestamp(),
            ip: ip,
            userAgent: req.headers.get('user-agent') || 'unknown'
        });

        await batch.commit();

        // 4. Set Response Cookies
        const response = NextResponse.json({ success: true, message: 'Visit tracked' });
        
        // Persistent device ID (1 year)
        if (!deviceIdCookie) {
            response.cookies.set('vl_device_id', deviceId, {
                maxAge: 60 * 60 * 24 * 365,
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'lax'
            });
        }

        // Calculate seconds until midnight (end of day) for TTL cookie
        const tomorrow = new Date(year, dateObj.getMonth(), dateObj.getDate() + 1);
        const secondsUntilMidnight = Math.floor((tomorrow.getTime() - dateObj.getTime()) / 1000);

        // Daily TTL visit cookie
        response.cookies.set('vl_visit_today', 'true', {
            maxAge: secondsUntilMidnight,
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax'
        });

        return response;

    } catch (error) {
        console.error('Analytics tracking error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
