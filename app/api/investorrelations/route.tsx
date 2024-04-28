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
     const quarteryResultsPageUrl = await getQuarterlyResultsPageUrl(investorRelationsPageUrl);
     console.log('quarteryResultsPageUrl', quarteryResultsPageUrl);
     // 3. using the quarterly results page, get the documents for the specified document type(s) and fiscal period(s)
     const documentResponses = await findDocumentsFromIRWebsite(quarteryResultsPageUrl, body.documentType, body.fiscalPeriod);
     console.log('documentResponses', documentResponses);
     return documentResponses;
}


async function getInvestorRelationsUrl(ticker: string) {
    const assetProfile = await yahooFinance.quoteSummary(ticker, {
        modules: ['assetProfile']
    
    });
    let irWebsite;
    if (assetProfile.assetProfile?.irWebsite) {
        // if we have the IR website, great now we can start the next step of getting earnings reports
        return assetProfile.assetProfile.irWebsite;
    } else {
        if (assetProfile.assetProfile?.website) { // if we have the company's home page, we will use that to find the IR website
            irWebsite = await getInvestorRelationsUrlUtil(assetProfile.assetProfile.website.replace('https://www.', ''));

        } else if (assetProfile.assetProfile?.name) { // if we have the company's name, we will use that to find the IR website
            irWebsite = await getInvestorRelationsUrlUtil(assetProfile.assetProfile.name);
        }
        return irWebsite;
    }
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
    const prompt = `Interpret the links to find the quarterly earnings results page for the company. Please return the link in this json format: {earningsPage: urlToEarningsPage} The links are: \n\n${links.map(link => link.href).join('\n')}`;
    const response = await openAiChatResponse(prompt);
    return response.earningsPage;
}



/**
 * 
 * @param quarteryResultsPageUrl the url for the quarterly results page of the investor relations website
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
    const webcastKeywords = ['webcast', 'call', 'webinar', 'conference'];

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
 
    // first we need to scrape the quarterly results page to find the links to the documents
    let visibleLinks = await scrapeVisiblePageForLinks(quarteryResultsPageUrl, relevantTerms);
    console.log('visibleLinks', visibleLinks);



    // filter links to 

    // now we need a prompt to ask OpenAI to:
    // 1. get the links to the documents for the specified document type(s) and fiscal period(s)
    // 2. return the links in the format: [{documentType: string, fiscalPeriod: string, documentResponse: string}]. if any of the documents are not found, the documentResponse should be 'Document not found'
    // as help in the prompt, here are a few other names for each document type, but this is not an exhaustive list:
    // Earnings Presentation: Analyst Slide Deck, Investor Presentation
    // Earnings Webcast: Earnings Call, Earnings Webinar, Conference Call
    // Earnings Release: Earnings Report, Earnings Press Release, Earnings Summary

    const prompt = `
        You are given a list of links to documents on the quarterly earnings results page of the investor relations website.
        You are also given a list of document types: Earnings Presentation (which may also have a name similar to Analyst Slide Deck or Investor Presentation), Earnings Webcast (which may also have a name similar to Earnings Call, Earnings Webinar, or Conference Call), and Earnings Release (which may also have a name similar to Earnings Report, Earnings Press Release, or Earnings Summary).
        You are also given a list of fiscal periods to return documents for in the format of '1Q2024', '4Q2023', etc.
        Given the links, find the documents for the specified document type(s) and fiscal period(s) and return a JSON ARRAY of this format, with no other text surrounding it: [{documentType: string, fiscalPeriod: string, documentResponse: link.href}]. If any of the documents are not found, the documentResponse should be 'Document not found'.
        The links are: \n\n${JSON.stringify(visibleLinks)}
        The document types are: ${documentType.join(', ')}
        The fiscal periods are: ${fiscalPeriod.join(', ')}
    `
    console.log('prompt', prompt);
    const response = await anthropicChatResponse(prompt);
    console.log('response', response);  
    return response;  
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



    // const linkDetails = Array.from(links).map(link => ({
    //     href: link.href,  // Get the href attribute
    //     text: link.textContent.trim()  // Get the text content, trimmed
    // }));
    console.log('linkDetails', linkDetails);
    return linkDetails;  // You might want to return this if needed elsewhere
}

async function scrapeVisiblePageForLinks(irWebsite: string, relevantTerms: string[]) {
    console.log('irWebsite', irWebsite);
    console.log('relevantTerms', relevantTerms);
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    await page.goto(irWebsite, { waitUntil: 'networkidle0' }); // Ensures all scripts are fully loaded

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

async function scrapeVisiblePageForSpans(irWebsite: string) {
    console.log('irWebsite', irWebsite);
    const browser = await puppeteer.launch();
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
    max_tokens: 1024,
    system: "Repond to prompt with JSON",
    messages: [
        { role: "user", content: prompt }
    ],
    });
    console.log('anthropic response', response);
    const message = response.content[0];
    console.log('message', message);
    if (message.text) {
        return JSON.parse(message.text);
    } else {
        console.error('Error with Anthropic response', message);
        throw new Error('Error with Anthropic response');
    }
 


      
     


}


