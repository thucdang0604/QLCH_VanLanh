'use client';

/**
 * VideoEmbed — Lightweight component to embed YouTube / Facebook videos
 * Extracts video ID from URL and renders an <iframe> directly.
 * Supports: YouTube (watch, shorts, youtu.be), Facebook video
 */

function getYouTubeId(url: string): string | null {
    const patterns = [
        /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
    ];
    for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match) return match[1];
    }
    return null;
}

function isFacebookVideo(url: string): boolean {
    return /facebook\.com.*\/videos\//.test(url) || /fb\.watch/.test(url);
}

export default function VideoEmbed({ url }: { url: string }) {
    if (!url) return null;

    const youtubeId = getYouTubeId(url);

    if (youtubeId) {
        return (
            <div className="relative w-full pt-[56.25%] rounded-xl overflow-hidden shadow-sm">
                <iframe
                    src={`https://www.youtube.com/embed/${youtubeId}?rel=0`}
                    title="YouTube video"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    allowFullScreen
                    className="absolute top-0 left-0 w-full h-full border-0"
                />
            </div>
        );
    }

    if (isFacebookVideo(url)) {
        const encodedUrl = encodeURIComponent(url);
        return (
            <div className="relative w-full pt-[56.25%] rounded-xl overflow-hidden shadow-sm">
                <iframe
                    src={`https://www.facebook.com/plugins/video.php?href=${encodedUrl}&show_text=false&width=734`}
                    title="Facebook video"
                    allow="autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share"
                    allowFullScreen
                    className="absolute top-0 left-0 w-full h-full border-0"
                />
            </div>
        );
    }

    // Fallback: try as direct video URL
    return (
        <div className="relative w-full pt-[56.25%] rounded-xl overflow-hidden shadow-sm bg-black">
            <video
                src={url}
                controls
                className="absolute top-0 left-0 w-full h-full"
            />
        </div>
    );
}
