const SEARCH_CRAWLER_PATTERN = /\b(?:googlebot|google-inspectiontool|googleother|bingbot|bingpreview|duckduckbot|yandexbot|baiduspider|facebookexternalhit|twitterbot|linkedinbot|slackbot|discordbot)\b/i;

/**
 * Analytics endpoints may use this to avoid counting automated crawls as
 * human engagement. It is not an authorization or abuse-prevention control:
 * user-agent strings are spoofable.
 */
export function isKnownSearchCrawlerUserAgent(userAgent: string | null): boolean {
    return Boolean(userAgent && SEARCH_CRAWLER_PATTERN.test(userAgent));
}
