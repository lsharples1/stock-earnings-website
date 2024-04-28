import { NextRequest, NextResponse } from "next/server";
import yahooFinance from 'yahoo-finance2';
import puppeteer from "puppeteer";
import { JSDOM } from 'jsdom';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { getJson } from 'serpapi';

/**
 * 
 * @param request 
 * @returns documentResponses: [{ documentType: string; fiscalPeriod: string; documentResponse: string; }[]]
 */
export async function POST(
    request: NextRequest,
) {
    const body = await request.json();
    console.log('body', body);
    const retrieveDocuments = await getDocumentResponses(body);
    console.log('retrieveDocuments', retrieveDocuments);
   
    return NextResponse.json({ documentResponses: retrieveDocuments});
}


async function getDocumentResponses(body: { ticker: string; documentType: string[]; fiscalPeriod: string[]; }) {
     // 1. get the investor relations url for the company
     const investorRelationsPageUrl = await getInvestorRelationsUrl(body.ticker);
    console.log('investorRelationsPageUrl', investorRelationsPageUrl);

     // 2. using the investor relations website, get the quarterly results page url
     const quarterlyResultsPageUrl = await getQuarterlyResultsPageUrl(investorRelationsPageUrl);
     console.log('quarterlyResultsPageUrl', quarterlyResultsPageUrl);
    // const quarterlyResultsPageUrl = 'https://investors.block.xyz/financials/quarterly-earnings-reports/default.aspx'
     // 3. using the quarterly results page, get the documents for the specified document type(s) and fiscal period(s)
     const documentResponses = await findDocumentsFromIRWebsite(quarterlyResultsPageUrl, body.documentType, body.fiscalPeriod);
     console.log('documentResponses', documentResponses);
     return documentResponses;
}


async function getInvestorRelationsUrl(ticker: string) {
    const assetProfile = await yahooFinance.quoteSummary(ticker, {
        modules: ['assetProfile']
    
    });
    let irWebsite;
    if (assetProfile.assetProfile?.website) { // if we have the company's normal website, we will use that to find the IR website
            irWebsite = await getInvestorRelationsUrlUtil(assetProfile.assetProfile.website);
        }
    return irWebsite;
    }

async function getInvestorRelationsUrlUtil(ticker: string) {
    const serpResponse = await getJson({
        q: `${ticker} investor relations site`,
        location: 'United States',
        hl: 'en',
        gl: 'us',
        google_domain: 'google.com',
        api_key: process.env.SERP_API_KEY,
    });
    console.log('serpResponse', serpResponse.organic_results);
    return serpResponse.organic_results[0].link;
}

async function getQuarterlyResultsPageUrl(irWebsite: string) {
    const relevantTerms = ['earn', 'invest', 'relation', 'quarter', 'result', 'report', 'financ'];
    // first scrape the IR home page to find the link to the quarterly results page
    const links = await scrapePageForLinks(irWebsite, relevantTerms);
    console.log('links', links.length);

    // create a propmt asking OpenAI to interpret the links to find the quarterly results page
    const prompt = `Interpret the links to find the quarterly earnings results page for the company. Please return the link in this json format: {earningsPage: urlToEarningsPage}.
    Some links are complete URLs, some are relative URLs, ensure you return the full URL using this base website as a guide: ${irWebsite}.
    The links are: \n\n${links.map(link => link.href).join('\n')}`;
    const response = await openAiChatResponse(prompt);
    return response.earningsPage;
}



/**
 * 
 * @param quarterlyResultsPageUrl the url for the quarterly results page of the investor relations website
 * @param documentType  containing any of [EarningsRelease, EarningsPresentation, EarningsWebcast]
 * @param fiscalPeriod containing 1+ fiscal periods to return documents for
 * @returns documentResponses: [{ documentType: string; fiscalPeriod: string; documentResponse: string; }[]]
 */
async function findDocumentsFromIRWebsite(quarteryResultsPageUrl: string, documentType: string[], fiscalPeriod: string[]) {
        // in order to filter our links, we need to make a list of relevant terms to look for.
    // lets start with the quarter and year of the fiscal period which will be in the format '1Q2024'  but we want to separate the quarter and year




    const quarters = fiscalPeriod.map(period => period.substring(0, 2));
    const years = fiscalPeriod.map(period => period.substring(2));

    const relaseKeywords = ['release', 'report', 'summary'];
    const presentationKeywords = ['presentation', 'deck', 'slide'];
    const webcastKeywords = ['webcast', 'call', 'webinar', 'conference', 'audio'];

    let keywords = ['earn', 'earnings', 'invest', 'investor', 'press', 'analyst'];
    if (documentType.includes('EarningsRelease')) {
        keywords = keywords.concat(relaseKeywords);
    } 
    if (documentType.includes('EarningsPresentation')) {
        keywords = keywords.concat(presentationKeywords);
    }
    if (documentType.includes('EarningsWebcast')) {
        keywords = keywords.concat(webcastKeywords);
    }

    let relevantTerms = quarters.concat(years).concat(keywords);
    // remove any duplicates
    relevantTerms = [...new Set(relevantTerms)];
    console.log('relevantTermms', relevantTerms);

    const needUserAgent = await checkIfWeNeedUserAgent(quarteryResultsPageUrl);
    console.log('needUserAgent', needUserAgent);

    // we have to consider that the website has selectors or buttons for the year and if so we have to click on them to get the dynamic content
    // const hiddenLinks = await scrapeDynamicContentForLinks(quarteryResultsPageUrl, relevantTerms, needUserAgent);

 
    // first we need to scrape the quarterly results page to find the links to the documents
    let visibleLinks = await scrapeVisiblePageForLinks(quarteryResultsPageUrl, relevantTerms, needUserAgent);

    console.log('visibleLinks', visibleLinks);


    // Determine if we need to split this into multiple requests: simple way is to get totalDocumentResponses =  documentType.length * fiscalPeriod.length
    // If this is greater than 18, we should split it into multiple requests. Max number of totalDocumentResponses is 36 (3 document types * 12 fiscal periods). Have seen success with all 36, but is right at the limit so this provides a good buffer.
    // Kind of a hacky way to do this- definitely better ways, but haven't seen major issues so not a priority to fix.
    
    const totalDocumentResponses = documentType.length * fiscalPeriod.length;

    if (totalDocumentResponses > 18) {
        console.log(`Splitting into chunks for ${documentType.length} document types and ${fiscalPeriod.length} fiscal periods`);
        // create 2 arrays for documentType and fiscalPeriod by cutting in half like so: 
        const [documentTypePrompt1, documentTypePrompt2] = splitArray(documentType);
        const [fiscalPeriodPrompt1, fiscalPeriodPrompt2] = splitArray(fiscalPeriod);

        const prompt1 = generateClaudePrompt(visibleLinks.filter(link => link !== null), documentTypePrompt1, fiscalPeriodPrompt1);
        const response1 = await anthropicChatResponse(prompt1);

        const prompt2 = generateClaudePrompt(visibleLinks.filter(link => link !== null), documentTypePrompt2, fiscalPeriodPrompt2);
        const response2 = await anthropicChatResponse(prompt2);

        let overallResponse = response1.concat(response2);
        return overallResponse;
    }

    const prompt = generateClaudePrompt(visibleLinks.filter(link => link !== null), documentType, fiscalPeriod);
    const response = await anthropicChatResponse(prompt);
    return response;  
}

function splitArray(array: string[]) {
    const midIndex = Math.ceil(array.length / 2);
    const firstPart = array.slice(0, midIndex);
    const secondPart = array.slice(midIndex);
    return [firstPart, secondPart];
}

    /**
     * 
     * @param visibleLinks links to the documents on the quarterly earnings results page of the investor relations website
     * @param documentType array with > 1 of Earnings Presentation, Earnings Webcast, Earnings Release
     * @param fiscalPeriod array with > 1 of 'xQyyyy' where x is the quarter and yyyy is the year
     * @returns prompt to send to OpenAI
     * With this prompt, what we want to accomplish is to get the links to the documents for the specified document type(s) and fiscal period(s)
     * We will return the links in the format: [{documentType: string, fiscalPeriod: string, documentResponse: string}]. If any of the documents are not found, the documentResponse should be 'Document not found'
     * There are a few other names for each document type, but this is not an exhaustive list, and more may be added in the future:
     * Earnings Presentation: Analyst Slide Deck, Investor Presentation
     * Earnings Webcast: Earnings Call, Earnings Webinar, Conference Call
     * Earnings Release: Earnings Report, Earnings Press Release, Earnings Summary
     */
function generateClaudePrompt(visibleLinks: { href: string; text: string; }[], documentType: string[], fiscalPeriod: string[]) {
    const prompt = `
        You are given a list of links to documents on the quarterly earnings results page of the investor relations website.
        You are also given a list of document types: Earnings Presentation (which may also have a name similar to Analyst Slide Deck or Investor Presentation), Earnings Webcast (which may also have a name similar to Earnings Call, Earnings Webinar, or Conference Call), and Earnings Release (which may also have a name similar to Earnings Report, Earnings Press Release, or Earnings Summary).
        You are also given a list of fiscal periods to return documents for in the format of 'xQyyyy' where x is the quarter and yyyy is the year.
        Given the href links and text, find the documents for the specified document type(s) and fiscal period(s) and return a JSON ARRAY of this format, with no other text surrounding it: [{documentType: string, fiscalPeriod: string, documentResponse: link.href}] YOU MUST USE THE EXACT HREF LINK IN THE documentResponse.
        If any of the documents are not found, the documentResponse should be 'Document not found'.
        The links are: \n\n${JSON.stringify(visibleLinks)}
        The document types are: ${documentType.join(', ')}
        The fiscal periods are: ${fiscalPeriod.join(', ')}
    `
    console.log('Generated Claude Prompt', prompt);
    return prompt;
}



async function scrapePageForLinks(irWebsite: string, relevantTerms: string[]) {
    console.log('irWebsite', irWebsite);
    console.log('relevantTerms', relevantTerms);
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

    console.log('linkDetails', linkDetails);
    return linkDetails;  // You might want to return this if needed elsewhere
}

async function scrapeVisiblePageForLinks(irWebsite: string, relevantTerms: string[], needUserAgent: boolean) {
    console.log('irWebsite', irWebsite);
    console.log('relevantTerms', relevantTerms);
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    if (needUserAgent) {
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3');
    }
    let status = await page.goto(irWebsite, { waitUntil: 'networkidle0' }); // Ensures all scripts are fully loaded
    status = status.status();
    console.log('status', status);

    const anchors = await page.evaluate((relevantTerms) => {
        const links = Array.from(document.querySelectorAll('a'));
        return links.map(link => {
            // Combine text from all child <span> elements
            let spansText = Array.from(link.querySelectorAll('span'))
            spansText = spansText.map(span => span.textContent.trim()).join(' ');
                                   
            const fullText = `${link.textContent.trim()} ${spansText}`.trim().toLowerCase();
            // Filter check for fiscal periods, years, and keywords
            
            const isRelevantLink = relevantTerms.some(term => fullText.includes(term.toLowerCase()));
            return isRelevantLink ? { href: link.href, text: link.textContent.trim() } : null;
        }).filter(Boolean); // Remove any nulls from the array
    }, relevantTerms);

    console.log('Length from scraping visible page for anchors', anchors.length);
    await browser.close();
    return anchors;
}

async function scrapeDynamicContentForLinks(irWebsite: string, relevantTerms: string[], needUserAgent: boolean) {
    console.log('irWebsite', irWebsite);
    console.log('relevantTerms', relevantTerms);
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    try {

        if (needUserAgent) {
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3');
        }
        let status = await page.goto(irWebsite, { waitUntil: 'networkidle0' }); // Ensures all scripts are fully loaded
        status = status.status();
        console.log('status', status);
        const anchors1 = await page.evaluate(() => {
            const links = Array.from(document.querySelectorAll('a'));
            const linksToReturn = [];
            links.map(link => {
                link.text.includes('Audio') && linksToReturn.push({href: link.href, text: link.textContent.trim(), class: link.className});
            })
            return linksToReturn;
        });
        console.log('anchors1length', anchors1);
    
        // click on year selectors if they exist
        const selectors = await page.evaluate(() => {
            const selectors = Array.from(document.querySelectorAll('select'));
            return selectors.map(selector => {
                return { name: selector.name, options: Array.from(selector.querySelectorAll('option')).map(option => option.value), class: selector.className, id: selector.id};
            });
        });
        let allAnchors = [];
        console.log('selectors', selectors);
        console.log('selector 1 options', selectors[1].options[1]);
        await page.waitForSelector(`#${selectors[1].id}`);
        // await Promise.all([
        //     page.waitForResponse
        //     page.select(`#${selectors[1].id}`, selectors[1].options[1])
        // ])

        const anchors = await page.evaluate(() => {
            const links = Array.from(document.querySelectorAll('a'));
            const linksToReturn = [];
            links.map(link => {

                link.text.includes('Audio') && linksToReturn.push({href: link.href, text: link.textContent.trim(), class: link.className});
            })
            return linksToReturn;
        });
    console.log('anchors in dynamic content', anchors);

        await browser.close();

        
    } catch (error) {
        console.error('Error with scraping dynamic content', error);
        browser.close();
    }
}

async function checkIfWeNeedUserAgent(url: string) {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    let status = await page.goto(url, { waitUntil: 'networkidle0' }); // Ensures all scripts are fully loaded
    status = status.status();
    console.log('status', status);
    await browser.close();
    return status !== 200;

}

async function scrapeVisiblePageForLinksUnfiltered(irWebsite: string) {
    console.log('irWebsite', irWebsite);
    const browser = await puppeteer.launch({
        headless: false,
    });
    const page = await browser.newPage();
    await page.goto(irWebsite, { waitUntil: 'networkidle0' }); // Ensures all scripts are fully loaded

    const anchors = await page.evaluate(() => {
        const links = Array.from(document.querySelectorAll('a'));
        const linksToReturn = [];
        links.map(link => {
            linksToReturn.push({href: link.href, text: link.textContent.trim(), class: link.className});
        })
        return linksToReturn;
    }
    );
    console.log('SPANS', anchors.length);

    await browser.close();
    return anchors;
}

/**
 * 
 * @param prompt the prompt to send to OpenAI
 * @returns the response from OpenAI
 */
async function openAiChatResponse(prompt: string) {
    const openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY!,
      });
      const response = await openai.chat.completions.create({
        model: 'gpt-4',
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      })
        console.log('openai response', response);
        const message = response.choices[0].message;
        console.log('message', message);
        if (message.content) {
            return JSON.parse(message.content)
        } else {
            console.error('Error with OpenAI response', message);
            throw new Error('Error with OpenAI response');
        }
}

async function anthropicChatResponse(prompt: string) {
    const anthropic = new Anthropic({
        apiKey: process.env.ANTHROPIC_API_KEY!,
      });

    const response = await anthropic.messages.create({
    model: "claude-3-opus-20240229",
    max_tokens: 4096,
    system: "ONLY REPLY WITH JSON. DO NOT INCLUDE ANY TEXT OTHER THAN JSON IN YOUR RESPONSE.",
    messages: [
        { role: "user", content: prompt }
    ],
    });
    console.log('anthropic response', response);
    const message = response.content[0];
    console.log('message', message);
    if (message.text) {
        const parsedResponse = parseJsonArrayUtil(message.text);
        console.log('parsedResponse from anthropic model', parsedResponse);
        return parsedResponse;
    } else {
        console.error('Error with Anthropic response', message);
        throw new Error('Error with Anthropic response');
    }
}

/**
 * 
 * @param text response from model
 * @returns JSON array
 * This function has a backup plan to remove any leading text before the first '['. Catches cases where the model adds extra text before the JSON which happens infrequently with prompt engineering, but easily fixed with this function.
 */
function parseJsonArrayUtil(text: string) {
    try {
        return JSON.parse(text);
    } catch (error) {
        const firstCurly = text.indexOf('[');
        if (firstCurly > -1) {
            try {
                return JSON.parse(text.substring(firstCurly));
            } catch (secondError) {
                console.error('Failed to parse on second attempt', secondError);
            }
        }
        throw error; // Re-throw the original error if second attempt fails
    }
}


