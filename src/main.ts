import { Actor, type ProxyConfigurationOptions } from 'apify';
import { CheerioCrawler, PlaywrightCrawler, RequestList, log } from 'crawlee';
import { chromium } from 'playwright';
import { parsePage, type ParseOptions } from './parser.js';
import { identifyUrl, productById, REGIONS, type Target } from './urls.js';

type Input = Partial<ParseOptions> & {
    startUrls?: ({ url: string } | string)[];
    productIds?: string[];
    maxItems?: number;
    maxProductsPerListing?: number;
    maxRetries?: number;
    proxyConfiguration?: ProxyConfigurationOptions;
};
type Failure = { url: string; reason: string; stage: 'input' | 'http' | 'browser' };
const BROWSER_LIMIT = 20;
const DEFAULT_PROXY = { useApifyProxy: true };
const reason = (error: unknown) => (error instanceof Error ? error.message : String(error)).split('\n')[0];

function integer(value: number | undefined, fallback: number, min: number, max: number, name: string) {
    const result = value ?? fallback;
    if (!Number.isInteger(result) || result < min || result > max) {
        throw new Error(`${name} must be an integer between ${min} and ${max}`);
    }
    return result;
}

await Actor.main(async () => {
    const input = await Actor.getInput<Input>() ?? {};
    const options: ParseOptions = {
        region: input.region ?? 'US',
        includeReviews: input.includeReviews ?? true,
        includeRelatedVideos: input.includeRelatedVideos ?? false,
        includeRaw: input.includeRaw ?? false,
    };
    if (!REGIONS.includes(options.region)) throw new Error('Unsupported region code');
    if (options.region !== 'US') log.warning('Only US pages have been validated', { region: options.region });
    const maxItems = integer(input.maxItems, 30, 1, 1000, 'maxItems');
    const maxProductsPerListing = integer(input.maxProductsPerListing, 20, 0, 100, 'maxProductsPerListing');
    const maxRetries = integer(input.maxRetries, 2, 0, 5, 'maxRetries');
    const urls = input.startUrls ?? [];
    const ids = input.productIds ?? [];
    if (!Array.isArray(urls) || !Array.isArray(ids) || urls.length + ids.length > 200) {
        throw new Error('Provide startUrls and productIds as arrays with at most 200 entries combined');
    }
    if (!urls.length && !ids.length) throw new Error('Provide at least one startUrl or productId');

    const failures: Failure[] = [];
    function failed(url: string, stage: Failure['stage'], message: string) {
        failures.push({ url, reason: message, stage });
        log.warning('TikTok Shop request failed', { url, stage, reason: message });
    }

    const direct = new Map<string, Target>();
    const listings = new Map<string, Target>();
    for (const entry of urls) {
        const url = typeof entry === 'string' ? entry : entry?.url;
        const target = typeof url === 'string' ? identifyUrl(url, options.region) : null;
        if (!target) {
            failed('Invalid startUrls entry', 'input', 'Expected a public TikTok Shop product, store, or category HTTPS URL');
        } else {
            (target.kind === 'product' ? direct : listings).set(target.url, target);
        }
    }
    for (const id of ids) {
        const target = typeof id === 'string' ? productById(id, options.region) : null;
        if (target) direct.set(target.url, target);
        else failed('Invalid productIds entry', 'input', 'Expected a 19-digit product ID string');
    }

    const productIds = new Set<string>();
    const storeIds = new Set<string>();
    const discovered = new Map<string, Target>();
    let browserAttempts = 0;
    try {
        const proxyConfiguration = await Actor.createProxyConfiguration(input.proxyConfiguration ?? DEFAULT_PROXY);
        const seen = (target: Target) => target.kind === 'product' ? productIds.has(target.id)
            : target.kind === 'store' && storeIds.has(target.id);

        async function handle(html: Parameters<typeof parsePage>[0], target: Target, loadedUrl: string) {
            if (seen(target)) return;
            const result = parsePage(html, target, loadedUrl, options);
            if (result.kind === 'product') {
                if (productIds.size >= maxItems) return;
                await Actor.pushData(result.row);
                productIds.add(result.row.productId);
                return;
            }
            if (result.row) {
                await Actor.pushData(result.row);
                storeIds.add(result.row.storeId);
            }
            for (const product of result.products.slice(0, maxProductsPerListing)) discovered.set(product.url, product);
            if (result.hasMore) log.info('Only first-page listing products are supported', { url: target.url });
        }

        async function crawl(targets: Target[]) {
            if (!targets.length) return;
            const byUrl = new Map(targets.map((target) => [target.url, target]));
            const retryInBrowser: { target: Target; httpReason: string }[] = [];
            const requestList = await RequestList.open(null, [...byUrl.keys()]);
            const http = new CheerioCrawler({
                requestList,
                proxyConfiguration,
                useSessionPool: true,
                sessionPoolOptions: { maxPoolSize: 1 },
                maxConcurrency: 1,
                maxRequestRetries: maxRetries,
                maxSessionRotations: 0,
                navigationTimeoutSecs: 20,
                requestHandlerTimeoutSecs: 30,
                async requestHandler({ $, request }) {
                    await handle($, byUrl.get(request.url)!, request.loadedUrl ?? request.url);
                },
                async errorHandler({ session }, error) {
                    session?.retire();
                    log.debug('HTTP attempt failed; retrying', { reason: reason(error) });
                },
                async failedRequestHandler({ request }, error) {
                    const target = byUrl.get(request.url)!;
                    retryInBrowser.push({ target, httpReason: reason(error) });
                },
            });
            await http.run();
            const remaining = retryInBrowser.filter(({ target }) => !seen(target));
            const pending = remaining.slice(0, BROWSER_LIMIT - browserAttempts);
            for (const { target, httpReason } of remaining.slice(pending.length)) {
                failed(target.url, 'http', `${httpReason}; browser fallback limit reached`);
            }
            if (!pending.length) return;
            browserAttempts += pending.length;
            const httpReasons = new Map(pending.map(({ target, httpReason }) => [target.url, httpReason]));
            const browser = new PlaywrightCrawler({
                requestList: await RequestList.open(null, [...httpReasons.keys()]),
                proxyConfiguration,
                maxConcurrency: 1,
                maxRequestRetries: 0,
                maxSessionRotations: 0,
                navigationTimeoutSecs: 25,
                requestHandlerTimeoutSecs: 30,
                launchContext: {
                    launcher: chromium,
                    launchOptions: process.env.APIFY_CHROME_EXECUTABLE_PATH
                        ? { executablePath: process.env.APIFY_CHROME_EXECUTABLE_PATH }
                        : { channel: 'chrome' },
                },
                preNavigationHooks: [async (_, gotoOptions) => { gotoOptions.waitUntil = 'domcontentloaded'; }],
                async requestHandler({ page, request }) {
                    await handle(await page.content(), byUrl.get(request.url)!, page.url());
                },
                async failedRequestHandler({ request }, error) {
                    if (!seen(byUrl.get(request.url)!)) {
                        failed(request.url, 'browser', `HTTP: ${httpReasons.get(request.url)}; browser: ${reason(error)}`);
                    }
                },
            });
            await browser.run();
        }

        await crawl([...listings.values()]);
        const products = [...new Map([...direct, ...discovered]).values()];
        for (let start = 0; start < products.length && productIds.size < maxItems;) {
            const batch = products.slice(start, start + maxItems - productIds.size);
            start += batch.length;
            await crawl(batch.filter((target) => !seen(target)));
        }
    } finally {
        await Actor.setValue('FAILED_REQUESTS', failures);
    }
    const summary = `Products: ${productIds.size}; stores: ${storeIds.size}; failed requests: ${failures.length}; browser attempts: ${browserAttempts}`;
    log.info(summary);
    await Actor.setStatusMessage(summary);
});
