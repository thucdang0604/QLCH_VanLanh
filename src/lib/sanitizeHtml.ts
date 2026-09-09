import sanitize from 'sanitize-html';

/**
 * Server-side allowlist for article and catalog rich text. This intentionally
 * accepts only the formatting emitted by the editor; it never attempts to
 * remove dangerous fragments with regular expressions.
 */
const RICH_TEXT_SANITIZE_OPTIONS = {
    allowedTags: [
        'p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'strike',
        'blockquote', 'pre', 'code', 'ul', 'ol', 'li',
        'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
        'a', 'img', 'figure', 'figcaption', 'iframe',
        'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'hr', 'div', 'span',
    ],
    allowedAttributes: {
        '*': ['class', 'style'],
        a: ['href', 'name', 'target', 'rel'],
        img: ['src', 'alt', 'width', 'height', 'loading'],
        iframe: ['src', 'width', 'height', 'title', 'allow', 'allowfullscreen', 'frameborder'],
        th: ['colspan', 'rowspan'],
        td: ['colspan', 'rowspan'],
    },
    allowedClasses: {
        '*': [/^ql-(align|indent)-[a-z0-9-]+$/i],
    },
    allowedStyles: {
        '*': {
            'text-align': [/^(left|right|center|justify)$/],
            color: [/^#[0-9a-f]{3,8}$/i, /^rgba?\((?:\d{1,3}%?\s*,\s*){2}\d{1,3}%?(?:\s*,\s*(?:0|1|0?\.\d+))?\)$/i],
            'background-color': [/^#[0-9a-f]{3,8}$/i, /^rgba?\((?:\d{1,3}%?\s*,\s*){2}\d{1,3}%?(?:\s*,\s*(?:0|1|0?\.\d+))?\)$/i],
        },
    },
    allowedSchemes: ['http', 'https', 'mailto', 'tel'],
    allowedSchemesByTag: {
        img: ['http', 'https'],
        iframe: ['http', 'https'],
    },
    allowedIframeHostnames: [
        'youtube.com', 'www.youtube.com', 'www.youtube-nocookie.com',
        'youtu.be', 'www.facebook.com', 'web.facebook.com',
    ],
    allowProtocolRelative: false,
    disallowedTagsMode: 'discard' as const,
    // If the iframe host allowlist stripped its source, discard the inert shell too.
    exclusiveFilter: (frame: { tag: string; attribs: Record<string, string> }) => frame.tag === 'iframe' && !frame.attribs.src,
    transformTags: {
        a: (tagName: string, attribs: Record<string, string>) => ({
            tagName,
            attribs: attribs.target === '_blank'
                ? { ...attribs, rel: 'noopener noreferrer' }
                : attribs,
        }),
        img: (tagName: string, attribs: Record<string, string>) => ({
            tagName,
            attribs: { ...attribs, loading: 'lazy' },
        }),
    },
};

/** Sanitize untrusted article/product rich text before `dangerouslySetInnerHTML`. */
export function sanitizeHtml(html: string): string {
    const input = html || '';
    return sanitize(
        input
            // Preserve the previous presentation behavior without weakening the allowlist.
            .replace(/&nbsp;/gi, ' ')
            .replace(/\u00A0/g, ' '),
        RICH_TEXT_SANITIZE_OPTIONS,
    );
}
