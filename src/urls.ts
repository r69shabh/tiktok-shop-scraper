const HOSTS = new Set(['www.tiktok.com', 'shop.tiktok.com', 'tiktok.com']);
const ID = /^\d{19}$/;
const PREFIX = '(?:shop|[a-z]{2})';
const PRODUCT = new RegExp(`^/(?:${PREFIX}/)?pdp/(?:[\\w%-]+/)?(\\d{19})/?$`);
const LISTING = new RegExp(`^/${PREFIX}/(store|c)/[\\w%-]+/(\\d+)/?$`);

export const REGIONS = ['US', 'GB', 'BR', 'FR', 'DE', 'ES', 'IT', 'IE', 'JP', 'MX', 'ID', 'TH', 'VN', 'MY', 'PH', 'SG'] as const;
export type Region = typeof REGIONS[number];
export type Target = { kind: 'product' | 'store' | 'category'; url: string; id: string };

export function identifyUrl(input: string, region: Region): Target | null {
    let url: URL;
    try {
        url = new URL(input);
    } catch {
        return null;
    }
    if (url.protocol !== 'https:' || !HOSTS.has(url.hostname) || url.username || url.password || url.port) return null;
    const legacy = /^\/(?:shop\/)?view\/product\/(\d{19})\/?$/.exec(url.pathname);
    const product = legacy ?? PRODUCT.exec(url.pathname);
    const listing = LISTING.exec(url.pathname);
    const legacyStore = /^\/view\/shop\/(\d{19})\/?$/.exec(url.pathname);
    url.hash = '';
    url.search = '';
    if (legacy || legacyStore) url.searchParams.set('region', region);
    if (product) return { kind: 'product', url: url.href, id: product[1] };
    if (legacyStore) return { kind: 'store', url: url.href, id: legacyStore[1] };
    if (listing) return { kind: listing[1] === 'store' ? 'store' : 'category', url: url.href, id: listing[2] };
    return null;
}

export function productById(id: string, region: Region): Target | null {
    if (!ID.test(id)) return null;
    return identifyUrl(`https://www.tiktok.com/view/product/${id}`, region);
}
