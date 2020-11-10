const puppeteer = require('puppeteer');
const fs = require('fs');

async function search(page, url, retryCount) {
    await executeWithRetry(() => page.goto(url, { waitUntil: 'load' }), retryCount);
    await page.waitForSelector('div.entry-product');
    var campUrls = await page.$$eval('div.entry-product > div > a ', links => links.map(link => link.href));
    var results= [];
    for (campUrl of campUrls) {
        try {
            console.log(`Processing Camp at: ${campUrl}`);

            // navigate to the camp specific page
            await executeWithRetry(() => page.goto(campUrl, { waitUntil: 'load' }), retryCount);

            await page.waitForSelector('div#x-legacy-panel-2', { timeout: 10000 });
            var mapFrame = page.mainFrame().childFrames().find(f => f.url().indexOf('maps/embed') > 0);
            if (!mapFrame) {
                // no embedded map on the page, move to the next one
                continue;
            }

            // wait for map contents to load
            await mapFrame.waitFor(() => document.querySelector('div.place-desc-large .place-name'));
            // get place and address info out of the embedded map
            var place = await mapFrame.evaluate(() => document.querySelector('div.place-desc-large .place-name').innerText); 
            var address = await mapFrame.evaluate(() => document.querySelector('div.place-desc-large .address').innerText);
            var mapUrl = await mapFrame.evaluate(() => document.querySelector('a.navigate-link').href);
            var title = await page.evaluate(() => document.querySelector('.entry-title').innerText);
            var result = {
                title,
                place,
                address,
                lat: mapUrl.match(/@([\d\.-]+),([\d\.-]+)/)[1],
                lon: mapUrl.match(/@([\d\.-]+),([\d\.-]+)/)[2],
                campUrl,
                mapUrl
            };

            results.push(result);
        } catch (ex) {
            console.log(`Skipped because of missing map`);
        }
    }

    return results;
}

async function executeWithRetry(functionToExecute, retryCount = 3) {
    try {
        return await functionToExecute();
    } catch (ex) {
        if (retryCount > 0) {
            return await executeWithRetry(functionToExecute, --retryCount);
        } else {
            return null;
        }
    }
}

async function scrape(url, retryCount, headless, outputPath, proxyServer) {
    const launchOptions = {
        headless,
        defaultViewport: null,
        args: [ '--disable-web-security', '--disable-features=site-per-process' ]
    };

    if (proxyServer) {
        launchOptions.args = [`--proxy-server=${proxyServer}`];
    }

    const browser = await puppeteer.launch(launchOptions);
    const page = await browser.newPage();
    await executeWithRetry(() => page.goto(url, { waitUntil: 'load' }), retryCount);
    // wait for search form to load
    await page.waitForSelector('#menu-main-menu');
    //return {};
    const categories = await page.evaluate(() => Array.from(document.querySelectorAll('ul#menu-main-menu li#menu-item-1138 ul.sub-menu li a')).map(a=> ({url: a.href, title:a.innerText})));
    console.log(`${categories.length} sports found`);

    const results = [];
    for (category of categories) {
        try {
            console.log(`Looking for '${category.title}' camps`);
            const items = await search(page, category.url, retryCount);
            results.push({ sportUrl: category.url, sportTitle: category.title, camps: items });
        } catch (ex) {
            console.log(`Couldn't find camps for '${category.title}'`);
        }
    }

    await browser.close();
    if(outputPath) {
        fs.writeFileSync(outputPath, JSON.stringify(results));
    }

    return results;
}

module.exports.scrape = scrape;