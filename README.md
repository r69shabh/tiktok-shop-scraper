# TikTok Shop Scraper — SKU Price & Stock Monitor

Monitor prices and stock for known US TikTok Shop products. Paste the product or storefront URLs you already track, then run on demand or set up a schedule in Apify. Compare successive exports by `productId` and `skuId` to spot price changes, stockouts, and restocks when TikTok exposes those values.

Each snapshot includes SKU options, current and original prices, stock counts, and available sales, ratings, and shipping data. Storefront rows add seller ratings, feedback metrics, followers, and catalog size. No TikTok login or cookies are needed. This Actor follows supplied links; it does not support keyword search or send change alerts itself.

## Quick start

Paste one or more public product, store, or category URLs into **TikTok Shop URLs**, or list 19-digit **Product IDs** as strings. Set the product cap, then run the Actor. Browse **Products & sellers** in the Output tab or export the dataset as JSON or CSV.

### Products by URL or ID

```json
{
  "startUrls": [
    { "url": "https://www.tiktok.com/shop/pdp/gan-charger-tobrbe-retractable-80w-fast-charging-adapter-with-type-c-usb/1730891614229271019" }
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
    { "url": "https://www.tiktok.com/shop/store/case-mate/7495222674546788482" },
    { "url": "https://shop.tiktok.com/us/c/beauty-personal-care/601450" }
  ],
  "maxProductsPerListing": 8,
  "maxItems": 15,
  "includeRelatedVideos": true
}
```

| Input | Default | What it controls |
| --- | --- | --- |
| `startUrls`, `productIds` | — | Supply at least one; use public product, storefront-with-slug, or category links. |
| `region` | `US` | US is the only supported market. Applies to IDs and legacy links. |
| `maxItems` | 30 | Caps unique product rows. It does not cap storefront rows. |
| `maxProductsPerListing` | 20 | Maximum product links followed from each listing's first page. Use 0 for storefront profiles only. |
| `includeReviews` | true | Include embedded review samples. Counts and ratings are independent. |
| `includeRelatedVideos` | false | Include related TikTok videos when the source embeds them. |
| `includeRaw` | false | Include the original source payload for products and storefronts. |
| `proxyConfiguration` | Apify Proxy | Use the default unless your workflow requires a different proxy. |
| `maxRetries` | 2 | HTTP retries per URL, before the bounded Chromium fallback. |

## Output

Example **product** row (trimmed to two variants; values are a point-in-time snapshot):

```json
{
  "type": "product",
  "productId": "1730891614229271019",
  "url": "https://shop.tiktok.com/us/pdp/gan-charger-tobrbe-retractable-80w-fast-charging-adapter-with-type-c-usb/1730891614229271019",
  "title": "TOBRBE 3 in 1 GaN Charger, Retractable 80W MAX Fast Charger Block with Type-C Cable & 2 USB Ports, Portable Adapter iPhone Smartphone Electronic, Yellow, Cellphone, Folding Charging",
  "brand": "TOBRBE",
  "priceMin": 19.01,
  "priceMax": 19.01,
  "currency": "USD",
  "skus": [
    {
      "skuId": "1730891614229336555",
      "attributes": [
        {
          "name": "Color",
          "value": "Yellow"
        }
      ],
      "price": 19.01,
      "originalPrice": 29.08,
      "stock": 197
    },
    {
      "skuId": "1731133018277974507",
      "attributes": [
        {
          "name": "Color",
          "value": "Green"
        }
      ],
      "price": 19.01,
      "originalPrice": 29.08,
      "stock": 396
    }
  ],
  "seller": {
    "id": "7495561244401306091",
    "name": "COMFMET-US",
    "followers": 242,
    "soldCount": 298844,
    "productCount": 156,
    "rating": 4.4
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
| `seller`, `productCount`, `shopInfo` | Normalized seller metrics. Storefront rows include catalog size and public shop details without storefront media payloads. |
| `reviews`, `raw` | Optional embedded product review sample and optional original product or storefront payload. |

## Pricing

**$3 per 1,000 results ($0.003 per dataset row).** A successful unique product row or storefront row counts as one result, regardless of how many SKUs or reviews it includes. No charge for a category page itself, a failed URL, or a duplicate row. For example, 15 products and one storefront cost **$0.048** at that rate.

## How it compares

| Typical alternative | This Actor |
| --- | --- |
| Listing-only exports with one display price | Follows product links for detail, including per-SKU price and stock when exposed. |
| Raw page payloads that you have to map yourself | Stable product fields, a normalized seller object and an optional raw payload. |
| One fetch method, or a browser for every URL | Uses HTTP first, retries failed fetches with a fresh session, and uses a limited browser fallback. |

## FAQ and limitations

**Which markets work?** The US marketplace is supported. Use US product and storefront URLs; other marketplaces are not validated.

**Does it support keywords or full catalogs?** Keyword search is not supported yet. Store and category discovery is limited to products embedded on the first page. Provide direct product links for items beyond that page.

**Why are some fields missing?** TikTok may omit or mask fields, and availability varies by page format and region. Missing values are `null` or empty arrays. Reviews are a sample, not the full history. Shipping estimates may depend on the viewing location, and media links can expire.

**What if TikTok blocks a page?** A challenge or generic page is not a result. The Actor tries HTTP first, then at most 20 browser fallback attempts per run. It does not solve CAPTCHAs. Unreadable pages are logged and recorded with reasons under `FAILED_REQUESTS` in the run's key-value store.
