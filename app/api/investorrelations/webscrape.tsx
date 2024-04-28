import puppeteer from "puppeteer";
import { JSDOM } from 'jsdom';

export async function scrapeHomePageForLinks(irWebsite: string, relevantTerms: string[]) {
    const data = await fetch(irWebsite);
    const html = await data.text();

    const { document } = (new JSDOM(html)).window;

    // Get all <a> tags from the document
    const links = document.querySelectorAll('a');
    // only return if href and text content are not empty and text contains any of the relevant terms
    const linkDetails = Array.from(links).map(link => {
        if (link.href && link.textContent.trim() && relevantTerms.some(term => link.textContent.trim().toLowerCase().includes(term.toLowerCase()))) {
            return { href: link.href, text: link.textContent.trim() }
        } else {
            return null;
        }
    }
    ).filter(Boolean);

    return linkDetails;  // You might want to return this if needed elsewhere
}

export async function scrapeVisiblePageForLinks(irWebsite: string, relevantTerms: string[], needUserAgent: boolean) {

    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    if (needUserAgent) {
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3');
    }
    await page.goto(irWebsite, { waitUntil: 'networkidle0' }); // Ensures all scripts are fully loaded

    const relevantAnchors = await findRelevantAnchors(page, relevantTerms);

    await browser.close();
    return relevantAnchors;
}

export async function scrapeDynamicContentForLinks(irWebsite: string, relevantTerms: string[], needUserAgent: boolean) {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    try {

        if (needUserAgent) {
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3');
        }
        await page.goto(irWebsite, { waitUntil: 'networkidle0' }); // Ensures all scripts are fully loaded

        let allAnchors = [];

        // click on year selectors if they exist
        const selectors = await page.evaluate(() => {
            const selectors = Array.from(document.querySelectorAll('select'));
            return selectors.map(selector => {
                return { name: selector.name, options: Array.from(selector.querySelectorAll('option')).map(option => option.value), class: selector.className, id: selector.id};
            });
        });

        for (let i = 0; i < selectors.length; i++) {
            const relevantOptions = selectors[i].options.filter(option => relevantTerms.some(term => option.toLowerCase().includes(term.toLowerCase())));
            if (relevantOptions.length === 0) {
                continue;
            }
            
            for (const option of relevantOptions) {
                // only click on selectors that contain relevant terms
                await page.select(`#${selectors[i].id}`, option);
                // wait for dynamic content to load
                await new Promise(r => setTimeout(r, 3000));
                const relevantAnchors = await findRelevantAnchors(page, relevantTerms);
                allAnchors = allAnchors.concat(relevantAnchors);
            }

        }

        await browser.close();
        return allAnchors;
        
    } catch (error) {
        console.error('Error with scraping dynamic content', error);
        browser.close();
    }
}

export async function findRelevantAnchors(page, relevantTerms: string[]) {
    const anchors = await page.evaluate((relevantTerms) => {
        const links = Array.from(document.querySelectorAll('a'));
        return links.map(link => {
            // Combine text from all child <span> elements
            let spansText = Array.from(link.querySelectorAll('span'))
            spansText = spansText.map(span => span.textContent.trim()).join(' ');
                                   
            const fullText = `${link.textContent.trim()} ${spansText}`.trim().toLowerCase();
            // Filter check for fiscal periods, years, and keywords
            
            const isRelevantLink = relevantTerms.some(term => fullText.includes(term.toLowerCase()) || link.href.includes(term.toLowerCase()));
            return isRelevantLink ? { href: link.href, text: link.textContent.trim() } : null;
        }).filter(Boolean); // Remove any nulls from the array
    }, relevantTerms);
    return anchors;
}

export async function checkIfWeNeedUserAgent(url: string) {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    let status = await page.goto(url, { waitUntil: 'networkidle0' }); // Ensures all scripts are fully loaded
    status = status.status();
    await browser.close();
    return status !== 200;

}