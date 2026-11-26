import { load } from 'cheerio';
import { identifyUrl, productById, type Region, type Target } from './urls.js';

type Obj = Record<string, unknown>;
type HtmlQuery = (selector: string) => { text(): string; length: number };
const obj = (value: unknown): Obj => value && typeof value === 'object' && !Array.isArray(value) ? value as Obj : {};
const array = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const objects = (value: unknown) => array(value).map(obj);
const str = (value: unknown): string | null => typeof value === 'string' && value.trim() ? value.trim() : null;
const num = (value: unknown): number | null => {
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    const text = str(value)?.replaceAll(',', '');
    return text && /^-?\d+(?:\.\d+)?$/.test(text) && Number.isFinite(Number(text)) ? Number(text) : null;
};
const bool = (value: unknown): boolean | null => typeof value === 'boolean' ? value : null;
const strings = (values: unknown[]) => [...new Set(values.map(str).filter((v): v is string => v !== null))];
const metric = (data: Obj, key: string) => num(data[key]);

export type ParseOptions = {
    region: Region;
    includeRaw: boolean;
    includeReviews: boolean;
    includeRelatedVideos: boolean;
};

export class PageError extends Error {}

function sellerInfo(shop: Obj, backup: Obj, region: Region) {
    const link = shop.shop_link ?? backup.shop_link;
    return {
        id: str(shop.seller_id ?? backup.seller_id),
        name: str(shop.shop_name ?? backup.name),
        url: typeof link === 'string' ? identifyUrl(link, region)?.url ?? null : null,
        followers: num(shop.followers_count ?? backup.follower_count),
        soldCount: num(shop.sold_count),
        productCount: num(shop.on_sell_product_count ?? backup.product_count),
        rating: num(shop.shop_rating ?? backup.rating_value ?? backup.rating),
        reviewCount: num(shop.review_count),
        videoCount: num(shop.video_count),
        feedbackMetrics: objects(shop.shop_exp_scores).map((score) => ({
            name: str(score.score_description),
            value: str(score.format_score),
            score: num(score.score),
            assessment: str(score.experience_format_description),
        })),
    };
}

function productRow(components: Map<string, Obj>, target: Target, url: string, options: ParseOptions, scrapedAt: string) {
    const data = components.get('product_info') ?? {};
    const product = obj(data.product_info);
    const productId = str(product.product_id);
    const title = str(product.title);
    if (!title || productId !== target.id || (data.error_code != null && num(data.error_code) !== 0)) {
        throw new PageError('Product data is missing, unavailable, or does not match the requested ID');
    }
    const price = obj(product.price);
    const ratings = obj(product.review);
    const reviews = obj(data.review_info ?? data.reviews_info);
    const distribution = obj(obj(reviews.review_ratings).rating_result);
    const skus = objects(product.skus).flatMap((sku) => {
        const skuId = str(sku.sku_id);
        if (!skuId) return [];
        const skuPrice = obj(sku.price);
        return [{
            skuId,
            attributes: objects(sku.sku_sale_props).map((attr) => ({ name: str(attr.prop_name), value: str(attr.prop_value) })),
            price: num(skuPrice.sale_price_decimal),
            originalPrice: num(skuPrice.origin_price_decimal),
            stock: num(sku.stock),
        }];
    });
    const skuPrices = skus.flatMap((sku) => sku.price === null ? [] : [sku.price]);
    const priceMin = num(price.min_sku_price) ?? (skuPrices.length ? Math.min(...skuPrices) : null);
    const priceMax = num(price.max_sku_price) ?? (price.is_interval_price === false && priceMin !== null
        ? priceMin : skuPrices.length ? Math.max(...skuPrices) : null);
    const specs = objects(product.specifications).map((spec) => ({ name: str(spec.name), value: str(spec.value) }));
    const categories = objects(data.categories ?? obj(data.category_info).recommended_categories);
    const shipping = obj(product.logistic);
    const hasShippingModule = Object.keys(obj(product.shipping_module)).length > 0;
    const promotion = obj(data.promotion_tag);
    const reviewerRows = objects(reviews.product_reviews ?? data.hot_reviews);
    return {
        type: 'product' as const,
        productId, url, title,
        description: strings(objects(product.desc_blocks).map((block) => block.text)).join('\n\n') || null,
        brand: str(product.brand) ?? specs.find(({ name }) => name?.toLowerCase() === 'brand')?.value ?? null,
        categories: categories.map((category) => ({ id: str(category.category_id), name: str(category.category_name) })),
        priceMin,
        priceMax,
        originalPrice: num(price.min_sku_original_price),
        discount: str(price.discount),
        currency: str(price.currency),
        soldCount: num(product.sold_count),
        rating: num(ratings.product_rating ?? obj(reviews.review_ratings).overall_score),
        reviewCount: num(ratings.review_count ?? reviews.total_reviews),
        ratingDistribution: Object.keys(distribution).length
            ? Object.fromEntries(Object.entries(distribution).map(([star, count]) => [star, num(count)])) : null,
        images: strings(objects(product.images).map((image) => array(image.url_list).find(str))),
        videoUrls: strings([product.header_video, product.desc_video].flatMap((video) => {
            const sources = objects(obj(video).video_infos);
            return [sources.find((source) => str(source.main_url))?.main_url];
        })),
        skus,
        specs,
        shipping: Object.keys(shipping).length || hasShippingModule ? {
            method: str(shipping.delivery_name),
            freeShipping: bool(shipping.free_shipping),
            fee: num(obj(shipping.shipping_fee).price_val),
            currency: str(obj(shipping.shipping_fee).currency),
            deliveryMinDays: metric(shipping, 'delivery_min_days'),
            deliveryMaxDays: metric(shipping, 'delivery_max_days'),
            leadTime: str(shipping.lead_time),
            notes: strings(objects(obj(product.shipping_module).description_list).map((line) => line.text)),
        } : null,
        promotionTags: strings(Object.values(obj(promotion.placement_labels)).flatMap((labels) => objects(labels).map((label) => label.text))),
        seller: sellerInfo(obj(data.shop_info), obj(product.seller), options.region),
        ...(options.includeReviews ? { reviews: reviewerRows.map((review) => ({
            id: str(review.review_id),
            skuId: str(review.sku_id),
            rating: num(review.review_rating),
            text: str(review.review_text),
            country: str(review.review_country),
            verifiedPurchase: bool(review.is_verified_purchase),
            incentivized: bool(review.is_incentivized_review),
        })) } : {}),
        ...(options.includeRelatedVideos ? { relatedVideos: objects(components.get('video_list')?.related_videos).map((video) => ({
            id: str(video.item_id),
            title: str(video.title),
            url: str(video.content_url),
            plays: num(video.play_count),
            likes: num(video.like_count),
            duration: num(video.duration),
        })) } : {}),
        scrapedAt,
        ...(options.includeRaw ? { raw: data } : {}),
    };
}

function listing(components: Map<string, Obj>, target: Target, url: string, options: ParseOptions, scrapedAt: string) {
    const isStore = target.kind === 'store';
    const shop = obj(components.get('shop_info')?.shopInfo);
    const catalog = isStore ? components.get('feed_list_store_list_product')
        : obj(components.get('homepage_products')?.categoryProductsData);
    const cards = isStore ? catalog?.products : catalog?.productList;
    if (isStore && (str(shop.seller_id) !== target.id || !str(shop.shop_name))) {
        throw new PageError('Store data is missing or does not match the requested ID');
    }
    if (!isStore && (!Array.isArray(cards) || str(obj(components.get('homepage_products')?.categoryInfo).category_id) !== target.id)) {
        throw new PageError('Category data is missing or does not match the requested ID');
    }
    const products = new Map<string, Target>();
    for (const card of objects(cards)) {
        const id = str(card.product_id);
        if (!id || products.has(id)) continue;
        const link = str(obj(card.seo_url).canonical_url);
        const targetFromLink = link ? identifyUrl(link, options.region) : null;
        const next = targetFromLink?.kind === 'product' && targetFromLink.id === id ? targetFromLink : productById(id, options.region);
        if (next) products.set(id, next);
    }
    return {
        kind: 'listing' as const,
        products: [...products.values()],
        hasMore: (isStore ? catalog?.has_more : catalog?.hasMore) === true,
        row: isStore ? {
            type: 'store' as const,
            url,
            title: str(shop.shop_name),
            storeId: target.id,
            seller: sellerInfo(shop, {}, options.region),
            productCount: num(shop.on_sell_product_count),
            shopInfo: shop,
            scrapedAt,
        } : null,
    };
}

export function parsePage(html: string | HtmlQuery, target: Target, loadedUrl: string, options: ParseOptions) {
    const $ = typeof html === 'string' ? load(html) : html;
    if ($('title').text().trim().toLowerCase() === 'security check' || $('#captcha-config').length) {
        throw new PageError('TikTok returned a Security Check page');
    }
    const loaded = identifyUrl(loadedUrl, options.region);
    if (loaded?.kind !== target.kind || loaded.id !== target.id) throw new PageError('Redirected away from the requested TikTok Shop page');
    const script = $('script#__MODERN_ROUTER_DATA__').text();
    if (!script) throw new PageError('Missing TikTok Shop router data');
    let decoded: unknown;
    try {
        decoded = JSON.parse(script);
    } catch {
        throw new PageError('Invalid TikTok Shop router data');
    }
    const routes = Object.values(obj(obj(decoded).loaderData)).map(obj);
    const route = routes.find((entry) => Array.isArray(obj(entry.page_config).components_map));
    if (!route) throw new PageError('TikTok returned a generic page without shop data');
    const components = new Map<string, Obj>();
    for (const component of objects(obj(route.page_config).components_map)) {
        if (typeof component.component_name === 'string' && component.component_data) {
            components.set(component.component_name, obj(component.component_data));
        }
    }
    const canonicalUrl = str(obj(route.route_info).canonical_url);
    const canonical = canonicalUrl ? identifyUrl(canonicalUrl, options.region) : null;
    const url = canonical?.kind === target.kind && canonical.id === target.id ? canonical.url : loaded.url;
    const scrapedAt = new Date().toISOString();
    return target.kind === 'product'
        ? { kind: 'product' as const, row: productRow(components, target, url, options, scrapedAt) }
        : listing(components, target, url, options, scrapedAt);
}
