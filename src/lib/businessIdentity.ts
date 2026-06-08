import { DEFAULT_CONFIG, type SiteConfig, type StoreBranch } from './config-defaults';
import { SITE_URL } from './constants';

export interface BusinessIdentity {
    siteName: string;
    siteUrl: string;
    domain: string;
    logoUrl: string;
    mainPhone: string;
    formattedPhone: string;
    email: string;
    address: string;
    mapLink: string;
    primaryBranch: StoreBranch;
    socials: {
        zaloLink: string;
        facebookLink: string;
    };
}

function stripTrailingSlash(value: string) {
    return value.replace(/\/+$/, '');
}

function getDomain(siteUrl: string) {
    try {
        return new URL(siteUrl).hostname;
    } catch {
        return siteUrl.replace(/^https?:\/\//, '').split('/')[0] || 'localhost';
    }
}

function getMapsSearchUrl(address: string) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

export function formatBusinessPhone(raw: string) {
    const digits = raw.replace(/\D/g, '');
    if (digits.length === 10) {
        return `${digits.slice(0, 4)}.${digits.slice(4, 7)}.${digits.slice(7)}`;
    }
    return raw;
}

export function getBusinessIdentity(config?: Partial<SiteConfig>): BusinessIdentity {
    const fallbackBranch = DEFAULT_CONFIG.store_branches[0];
    const primaryBranch = config?.store_branches?.[0] || fallbackBranch;
    const contactInfo = {
        ...DEFAULT_CONFIG.contact_info,
        ...(config?.contact_info || {}),
    };
    const siteName = config?.siteName || DEFAULT_CONFIG.siteName;
    const mainPhone = contactInfo.main_phone || primaryBranch.phone || DEFAULT_CONFIG.contact_info.main_phone;
    const address = contactInfo.address || primaryBranch.address || DEFAULT_CONFIG.contact_info.address;
    const mapLink = primaryBranch.mapLink || getMapsSearchUrl(address);
    const siteUrl = stripTrailingSlash(SITE_URL);

    return {
        siteName,
        siteUrl,
        domain: getDomain(siteUrl),
        logoUrl: config?.logoUrl || DEFAULT_CONFIG.logoUrl,
        mainPhone,
        formattedPhone: formatBusinessPhone(mainPhone),
        email: contactInfo.email || DEFAULT_CONFIG.contact_info.email,
        address,
        mapLink,
        primaryBranch,
        socials: {
            zaloLink: contactInfo.zalo_link || `https://zalo.me/${mainPhone.replace(/\D/g, '')}`,
            facebookLink: contactInfo.facebook_link || DEFAULT_CONFIG.contact_info.facebook_link,
        },
    };
}
