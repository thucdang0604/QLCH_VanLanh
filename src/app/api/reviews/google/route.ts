import { NextResponse } from 'next/server';

export async function GET() {
    try {
        const apiKey = process.env.GOOGLE_MAPS_API_KEY;
        const placeId = process.env.GOOGLE_PLACE_ID;

        if (!apiKey || !placeId) {
            // Return mock data if not configured
            return NextResponse.json({
                rating: 4.9,
                total_ratings: 156,
                reviews: [
                    {
                        author_name: "Nguyễn Văn A",
                        rating: 5,
                        text: "Dịch vụ sửa chữa rất tốt, nhân viên nhiệt tình, báo giá rõ ràng.",
                        time: Date.now() / 1000 - 86400 * 2,
                        profile_photo_url: "https://ui-avatars.com/api/?name=Nguyen+Van+A&background=random"
                    },
                    {
                        author_name: "Trần Thị B",
                        rating: 5,
                        text: "Mình thay pin iPhone ở đây, xài rất trâu, bảo hành uy tín 12 tháng. Đã giới thiệu cho bạn bè.",
                        time: Date.now() / 1000 - 86400 * 5,
                        profile_photo_url: "https://ui-avatars.com/api/?name=Tran+Thi+B&background=random"
                    },
                    {
                        author_name: "Lê Hoàng C",
                        rating: 5,
                        text: "Cửa hàng sạch sẽ, thợ chuyên nghiệp. Máy tính mình sửa nhanh lấy ngay, rất tiện.",
                        time: Date.now() / 1000 - 86400 * 10,
                        profile_photo_url: "https://ui-avatars.com/api/?name=Le+Hoang+C&background=random"
                    },
                    {
                        author_name: "Phạm Minh D",
                        rating: 4,
                        text: "Sửa máy tốt nhưng cuối tuần hơi đông nên đợi khoảng 30 phút.",
                        time: Date.now() / 1000 - 86400 * 15,
                        profile_photo_url: "https://ui-avatars.com/api/?name=Pham+Minh+D&background=random"
                    }
                ]
            });
        }

        const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=rating,user_ratings_total,reviews&key=${apiKey}&language=vi`;
        const res = await fetch(url, {
            next: { revalidate: 86400 } // Cache cho 1 ngày
        });

        if (!res.ok) {
            throw new Error(`Google API responded with status ${res.status}`);
        }

        const data = await res.json();
        
        if (data.status !== 'OK') {
            throw new Error(`Google API error: ${data.status}`);
        }

        return NextResponse.json({
            rating: data.result.rating,
            total_ratings: data.result.user_ratings_total,
            reviews: data.result.reviews || []
        });

    } catch (error: unknown) {
        console.error('Google Reviews Error:', (error as Error).message);
        return NextResponse.json({ error: 'Failed to fetch reviews' }, { status: 500 });
    }
}
