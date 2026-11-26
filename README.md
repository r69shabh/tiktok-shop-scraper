# TikTok Shop Scraper — Products, SKUs & Sellers

Turn public TikTok Shop product and storefront pages into structured data. Start with the links or product IDs you already have. Get one row per product with variant-level prices and stock, plus a seller profile for each storefront URL you supply.

Use it to compare product assortments, check SKU availability, or monitor price and shipping changes. No TikTok login or cookies are needed.

## Quick start

Paste one or more public product, store, or category URLs into **TikTok Shop URLs**, or list 19-digit **Product IDs** as strings. Set the product cap, then run the Actor. Browse **Products & sellers** in the Output tab or export the dataset as JSON or CSV.

### Products by URL or ID

```json
{
  "startUrls": [
    { "url": "https://www.tiktok.com/shop/pdp/equip-prime-protein-21g-bioavailable-from-grass-fed-beef/1732282041767727408" }
  ],
  "productIds": ["1729383941730701675"],
  "region": "US",
  "maxItems": 2,
  "includeReviews": true
}
```

### Discover products from a storefront and category

```json
{
  "startUrls": [
    { "url": "https://www.tiktok.com/shop/store/equip/7494352588342396208" },
    { "url": "https://www.tiktok.com/shop/c/health/700645" }
  ],
  "maxProductsPerListing": 8,
  "maxItems": 15,
  "includeRelatedVideos": true
}
```

| Input | Default | What it controls |
| --- | --- | --- |
| `startUrls`, `productIds` | — | Supply at least one; use public product, storefront-with-slug, or category links. |
| `region` | `US` | Market for IDs and legacy links; explicit regional URLs keep their own market. |
| `maxItems` | 30 | Caps unique product rows. It does not cap storefront rows. |
| `maxProductsPerListing` | 20 | Maximum product links followed from each listing's first page. Use 0 for storefront profiles only. |
| `includeReviews` | true | Include embedded review samples. Counts and ratings are independent. |
| `includeRelatedVideos` | false | Include related TikTok videos when the source embeds them. |
| `includeRaw` | false | Include source product data for debugging or custom mappings. |
| `proxyConfiguration` | Apify Proxy | For local runs without a token, set `{"useApifyProxy":false}`. |
| `maxRetries` | 2 | HTTP retries per URL, before the bounded Chromium fallback. |

## Output

Example **product** row (trimmed; values are a point-in-time snapshot):

```json
{
  "type": "product",
  "productId": "1732282041767727408",
  "url": "https://shop.tiktok.com/us/pdp/equip-prime-protein-21g-bioavailable-from-grass-fed-beef/1732282041767727408",
  "title": "Equip Foods Prime Clean Protein Powder",
  "brand": "Equip",
  "priceMin": 44.99,
  "priceMax": 88.39,
  "currency": "USD",
  "soldCount": 5894,
  "rating": 4.5,
  "reviewCount": 332,
  "ratingDistribution": { "1": 22, "2": 15, "3": 11, "4": 27, "5": 257 },
  "skus": [
    {
      "skuId": "1732282042194891056",
      "attributes": [{ "name": "Flavor", "value": "Variety Pack - 10 Servings" }],
      "price": 44.99,
      "originalPrice": null,
      "stock": 117
    }
  ],
  "seller": {
    "id": "7494352588342396208",
    "name": "Equip",
    "followers": 2724,
    "soldCount": 9591,
    "productCount": 10,
    "rating": 4.5
  }
}
```

| Fields | What you get |
| --- | --- |
| `type`, `productId`, `storeId`, `url`, `title`, `scrapedAt` | Record type, relevant ID, public page URL and UTC scrape time. IDs remain strings. |
| `description`, `brand`, `categories`, `specs` | Product text, category path and specifications. |
| `priceMin`, `priceMax`, `originalPrice`, `discount`, `currency` | Current price range and available comparison price and discount. |
| `soldCount`, `rating`, `reviewCount`, `ratingDistribution` | Sales and review metrics published on the product page. |
| `skus` | Variant IDs, option attributes, current and original prices, and stock counts. |
| `images`, `videoUrls`, `relatedVideos` | Catalog images, gallery video URLs and optional related videos. |
| `shipping`, `promotionTags` | Available shipping fee, delivery estimate and displayed promotion labels. |
| `seller`, `productCount`, `shopInfo` | Normalized seller metrics. Storefront rows also include the catalog size and full public shop profile. |
| `reviews`, `raw` | Optional embedded review sample and optional source product object. |

## Pricing

**$3 per 1,000 results ($0.003 per dataset row).** A successful unique product row or storefront row counts as one result, regardless of how many SKUs or reviews it includes. No charge for a category page itself, a failed URL, or a duplicate row. For example, 15 products and one storefront cost **$0.048** at that rate.

## How it compares

| Typical alternative | This Actor |
| --- | --- |
| Listing-only exports with one display price | Follows product links for detail, including per-SKU price and stock when exposed. |
| Raw page payloads that you have to map yourself | Stable product fields, a normalized seller object and an optional raw payload. |
| One fetch method, or a browser for every URL | Uses HTTP first, retries failed fetches with a fresh session, and uses a limited browser fallback. |

## FAQ and limitations

**Which markets work?** US has been validated locally. Other market codes are available for experimentation; coverage can vary by region.

**Does it support keywords or full catalogs?** Keyword search is not supported yet. Store and category discovery is limited to products embedded on the first page. Provide direct product links for items beyond that page.

**Why are some fields missing?** TikTok may omit or mask fields, and availability varies by page format and region. Missing values are `null` or empty arrays. Reviews are a sample, not the full history. Shipping estimates may depend on the viewing location, and media links can expire.

**What if TikTok blocks a page?** A challenge or generic page is not a result. The Actor tries HTTP first, then at most 20 browser fallback attempts per run. It does not solve CAPTCHAs. Unreadable pages are logged and recorded with reasons under `FAILED_REQUESTS` in the run's key-value store.

## Local development

Use Node.js 20 and Chrome. Run `npm ci`, `npm run check`, and `npm run build`. To use a local Chrome executable for fallback, set `APIFY_CHROME_EXECUTABLE_PATH` to its path.

```sh
APIFY_LOCAL_STORAGE_DIR="$PWD/storage" apify run --input '{
  "productIds":["1732282041767727408"],
  "maxItems":1,
  "proxyConfiguration":{"useApifyProxy":false}
}'
```
