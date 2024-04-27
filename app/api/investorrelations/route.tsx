import { NextRequest, NextResponse } from "next/server";
import yahooFinance from 'yahoo-finance2';
import puppeteer from "puppeteer";
import { JSDOM } from 'jsdom';
import OpenAI from 'openai';
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
    const documentResponses = await getDocumentResponses(body);
    console.log('documentResponses', documentResponses);
   
    return NextResponse.json({ documentResponses: [{ documentType: body.documentType[0], fiscalPeriod: body.fiscalPeriod[0], documentResponse: documentResponses[0] }] });
}


async function getDocumentResponses(body: { ticker: string; documentType: string[]; fiscalPeriod: string[]; }) {
     // 1. get the investor relations url for the company
     const investorRelationsPageUrl = await getInvestorRelationsUrl(body.ticker);
    console.log('investorRelationsPageUrl', investorRelationsPageUrl);

     // 2. using the investor relations website, get the quarterly results page url
     const quarteryResultsPageUrl = await getQuarterlyResultsPageUrl(investorRelationsPageUrl);
     console.log('quarteryResultsPageUrl', quarteryResultsPageUrl);
 
    //  const documentResponses = await findDocumentsFromIRWebsite(irWebsite, body.documentType, body.fiscalPeriod);
    //  console.log('documentResponses', documentResponses);
     
     // response format: [{ documentType: string; fiscalPeriod: string; documentResponse: string; }[]]
     return [investorRelationsPageUrl];

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
    // first scrape the IR home page to find the link to the quarterly results page
    const links = await scrapeHomePageForLinks(irWebsite);

    // create a propmt asking OpenAI to interpret the links to find the quarterly results page
    const prompt = `Interpret the links to find the quarterly earnings results page for the company. Please return the link in this json format: {earningsPage: urlToEarningsPage} The links are: \n\n${links.map(link => link.href).join('\n')}`;
    const response = await openAiChatResponse(prompt);
    return response.earningsPage;
}



/**
 * 
 * @param irWebsite the investor relations website for the company
 * @param documentType  containing any of [EarningsRelease, EarningsPresentation, EarningsWebcast]
 * @param fiscalPeriod containing 1+ fiscal periods to return documents for
 * @returns documentResponses: [{ documentType: string; fiscalPeriod: string; documentResponse: string; }[]]
 */
// async function findDocumentsFromIRWebsite(irWebsite: string, documentType: string[], fiscalPeriod: string[]) {
//     // starting with just 1Q2024 and documentType EarningsRelease, will expand to other document types and fiscal periods later

//     // first we need to scrape the IR website to find the links to the documents
//     const links = await scrapeHomePageForLinks(irWebsite);
//     console.log('links', links);

//     const relevantLinks = await openAiInterpretLinks(links, documentType, fiscalPeriod);
//     console.log('relevantLinks', relevantLinks);
// }




async function scrapeHomePageForLinks(irWebsite: string) {
    const data = await fetch(irWebsite);
    const html = await data.text();

    // get the main content of the page
    const { document } = (new JSDOM(html)).window;

    // Get all <a> tags from the document
    const links = document.querySelectorAll('a');
    const linkDetails = Array.from(links).map(link => ({
        href: link.href,  // Get the href attribute
        text: link.textContent.trim()  // Get the text content, trimmed
    }));

    return linkDetails;  // You might want to return this if needed elsewhere
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
            role: 'system',
            content: prompt,
          },
        ],
      })
        console.log('response', response);
        const message = response.choices[0].message;
        console.log('message', message);
        if (message.content) {
            return JSON.parse(message.content)
        } else {
            console.error('Error with OpenAI response', message);
            throw new Error('Error with OpenAI response');
        }
}

async function scrapeHomePagePup(irWebsite: string) {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    await page.goto(irWebsite, { waitUntil: 'networkidle0' }); // Ensures all scripts are fully loaded

    const anchors = await page.evaluate(() => {
        const links = Array.from(document.querySelectorAll('a'));
        return links.map(link => link.href);
    }
    );
    console.log('anchors', anchors);

    await browser.close();
    return anchors;
}
