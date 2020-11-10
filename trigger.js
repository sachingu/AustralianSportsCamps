const args = require('minimist')(process.argv.slice(2), { boolean: 'headless' });
const scraper = require('./index');

(async () => {
    let url = args.url;
    if (!url) {
        url = 'https://australiansportscamps.com.au/book/';
    }

    const proxyServer = args.proxy;
    const headless = args.headless;
    const retries = args.retries || 10;
    const outputPath = args.output;

    const scrapedData = await scraper.scrape(url, retries, headless, outputPath, proxyServer);
    console.log(JSON.stringify(scrapedData));
})();