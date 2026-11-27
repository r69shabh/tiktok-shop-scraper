import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { PageError, parsePage } from '../src/parser.js';
import { identifyUrl, productById } from '../src/urls.js';

const options = { region: 'US', includeRaw: false, includeReviews: true, includeRelatedVideos: false } as const;
const equip = 'https://shop.tiktok.com/us/pdp/equip-prime-protein-21g-bioavailable-from-grass-fed-beef/1732282041767727408';
const storeUrl = 'https://shop.tiktok.com/us/store/equip/7494352588342396208';
const categoryUrl = 'https://shop.tiktok.com/us/c/health/700645';
const charger = 'https://shop.tiktok.com/us/pdp/gan-charger-tobrbe-retractable-80w-fast-charging-adapter-with-type-c-usb/1730891614229271019';
const fixture = (name: string) => readFileSync(new URL(`fixtures/${name}.html`, import.meta.url), 'utf8');

function parse(name: string, url: string, overrides = {}) {
    const target = identifyUrl(url, 'US');
    assert.ok(target);
    return parsePage(fixture(name), target, url, { ...options, ...overrides });
}

test('extracts product, seller, stock, price, delivery, and review data from canonical product HTML', () => {
    const result = parse('product', equip);
    assert.equal(result.kind, 'product');
    const { row } = result;
    assert.equal(row.productId, '1732282041767727408');
    assert.equal(row.brand, 'Equip');
    assert.match(row.description ?? '', /bioavailable/);
    assert.deepEqual([row.priceMin, row.priceMax, row.currency], [44.99, 88.39, 'USD']);
    assert.equal(row.soldCount, 5894);
    assert.equal(row.categories.length, 4);
    assert.equal(row.skus.length, 18);
    assert.deepEqual(row.skus[0], {
        skuId: '1732282042194891056',
        attributes: [{ name: 'Flavor', value: 'Variety Pack - 10 Servings' }],
        price: 44.99,
        originalPrice: null,
        stock: 117,
    });
    assert.equal(row.ratingDistribution?.['5'], 257);
    assert.equal(row.reviews?.length, 5);
    assert.equal(row.seller.followers, 2724);
    assert.equal(row.shipping?.fee, 0);
    assert.equal(row.shipping?.freeShipping, true);
    assert.ok(row.images.length);
    assert.ok(row.promotionTags.includes('Flash sale'));
    assert.equal('raw' in row, false);
    assert.equal('relatedVideos' in row, false);
});

test('parses legacy HTML with an empty embedded review sample and missing rating distribution', () => {
    const result = parse('legacy-product', 'https://shop.tiktok.com/view/product/1729383941730701675?region=US');
    assert.equal(result.kind, 'product');
    assert.equal(result.row.title, 'UNbrush Detangling Hair Brush by FHI Heat');
    assert.equal(result.row.categories[0].name, 'Beauty & Personal Care');
    assert.deepEqual(result.row.reviews, []);
    assert.equal(result.row.ratingDistribution, null);
});

test('drops placeholder specs without losing meaningful short values', () => {
    const specs = [
        { name: 'Missing uppercase', value: 'NULL' },
        { name: 'Missing lowercase', value: ' null ' },
        { name: 'Not applicable', value: 'N/A' },
        { name: 'Dash', value: '-' },
        { name: 'Empty', value: '' },
        { name: 'Manufacturer postal code', value: 'PD' },
        { name: 'Manufacturer address (city)', value: 'DG' },
        { name: 'Manufacturer address (province)', value: 'DG' },
        { name: 'Connector', value: 'USB' },
        { name: 'Charging standard', value: 'PD' },
    ];
    const html = fixture('product').replace('"specifications":[', `"specifications":[${JSON.stringify(specs).slice(1, -1)},`);
    const target = identifyUrl(equip, 'US');
    assert.ok(target);
    const result = parsePage(html, target, equip, options);
    assert.equal(result.kind, 'product');
    assert.deepEqual(result.row.specs.filter(({ name }) => specs.some((spec) => spec.name === name)), [
        { name: 'Connector', value: 'USB' },
        { name: 'Charging standard', value: 'PD' },
    ]);
    assert.equal(result.row.brand, 'Equip');
});

test('honors video, review, and raw options independently', () => {
    const result = parse('product-videos', charger, { includeRelatedVideos: true, includeReviews: false, includeRaw: true });
    assert.equal(result.kind, 'product');
    assert.equal(result.row.videoUrls.length, 1);
    assert.equal(result.row.relatedVideos?.length, 16);
    assert.equal(result.row.priceMax, 19.56);
    assert.equal(result.row.originalPrice, 29.93);
    assert.equal(result.row.skus[0].originalPrice, 29.93);
    assert.equal('reviews' in result.row, false);
    assert.ok(result.row.raw?.shop_info);
});

test('extracts a seller row and distinct first-page product detail URLs from a store', () => {
    const result = parse('store', storeUrl);
    assert.equal(result.kind, 'listing');
    assert.equal(result.row?.type, 'store');
    assert.equal(result.row?.storeId, '7494352588342396208');
    assert.equal(result.row?.productCount, 10);
    assert.equal(result.row?.shopInfo.region, 'US');
    assert.equal('shop_logo' in result.row!.shopInfo, false);
    assert.equal('raw' in result.row!, false);
    assert.equal(result.hasMore, false);
    assert.equal(result.products.length, 10);
    assert.equal(result.products[0].url, equip);
});

test('includes the original storefront media payload only with raw output enabled', () => {
    const result = parse('store', storeUrl, { includeRaw: true });
    assert.equal(result.kind, 'listing');
    assert.ok(result.row?.raw?.shop_logo);
    assert.equal('shop_logo' in result.row.shopInfo, false);
});

test('extracts category products without producing a dataset row', () => {
    const result = parse('category', categoryUrl);
    assert.equal(result.kind, 'listing');
    assert.equal(result.row, null);
    assert.equal(result.products.length, 12);
    assert.equal(result.hasMore, true);
    assert.equal(result.products[0].id, '1729612400012136923');
});

test('rejects challenges, generic shells, malformed JSON and product mismatches', () => {
    assert.throws(() => parse('challenge', charger), { name: 'Error', message: /Security Check/ });
    assert.throws(() => parse('generic', equip), /generic page/);
    assert.throws(() => parse('product', charger), /does not match/);
    const target = productById('1732282041767727408', 'US')!;
    assert.throws(() => parsePage('<title>TikTok</title>', target, equip, options), /Missing.*router data/);
    assert.throws(() => parsePage('<script id="__MODERN_ROUTER_DATA__">{</script>', target, equip, options), /Invalid.*router data/);
    assert.throws(() => parsePage(fixture('product'), target, 'https://www.tiktok.com/shop', options), PageError);
});

test('classifies supported URLs and treats IDs as strings without accepting arbitrary hosts or paths', () => {
    assert.deepEqual(identifyUrl(`${equip}?trackParams=foo#details`, 'US'), { kind: 'product', id: '1732282041767727408', url: equip });
    assert.equal(productById('1732282041767727408', 'GB')?.url, 'https://www.tiktok.com/view/product/1732282041767727408?region=GB');
    assert.equal(productById('1e19', 'US'), null);
    assert.equal(identifyUrl('https://tiktok.com.evil.example/shop/pdp/1732282041767727408', 'US'), null);
    assert.equal(identifyUrl('https://www.tiktok.com/shop/s/protein-powder', 'US'), null);
});
