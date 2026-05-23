/**
 * Sanitize HTML content before rendering via dangerouslySetInnerHTML.
 * Strips dangerous elements: <script>, <style>, event handlers, javascript: URLs.
 * Allows safe iframes (YouTube, Facebook) only.
 */
export function sanitizeHtml(html: string): string {
    const input = html || '';
    return input
        // Replace &nbsp; with regular spaces to fix word-wrap / text overflow
        .replace(/&nbsp;/gi, ' ')
        .replace(/\u00A0/g, ' ')
        // Drop script/style blocks entirely
        .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, '')
        // Remove inline event handlers like onclick="..."
        .replace(/\son\w+\s*=\s*(["']).*?\1/gi, '')
        // Neutralize javascript: URLs
        .replace(/(href|src)\s*=\s*(["'])\s*javascript:[\s\S]*?\2/gi, '$1="#"')
        // Basic iframe allowlist: only YouTube/Facebook embeds; strip others
        .replace(/<iframe\b([^>]*?)\bsrc=(["'])([^"']+)\2([^>]*)\/?>.*?(<\/iframe>)?/gi, (m, pre, q, src, post) => {
            const s = String(src || '');
            const ok = /^(https?:)?\/\/(www\.)?(youtube\.com|youtu\.be|www\.facebook\.com|web\.facebook\.com)\//i.test(s);
            return ok ? `<iframe${pre} src="${s}"${post}></iframe>` : '';
        });
}
