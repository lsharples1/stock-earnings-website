import { NextRequest, NextResponse } from "next/server";
import yahooFinance from 'yahoo-finance2';
import { scrapeHomePageForLinks, scrapeDynamicContentForLinks, scrapeVisiblePageForLinks, checkIfWeNeedUserAgent } from "./webscrape";
import { openAiChatResponse, anthropicChatResponse } from "./llmFunctions";
import { getJson } from 'serpapi';
import { mergeAndDedupeArrays, splitArray, generateClaudePrompt } from "./utils";

/**
 * 
 * @param request 
 * @returns documentResponses: [{ documentType: string; fiscalPeriod: string; documentResponse: string; }[]]
 */
export async function POST(
    request: NextRequest,
) {
    const body = await request.json();
    const retrieveDocuments = await getDocumentResponses(body);
   
    return NextResponse.json({ documentResponses: retrieveDocuments});
}


async function getDocumentResponses(body: { ticker: string; documentType: string[]; fiscalPeriod: string[]; }) {
     // 1. get the investor relations url for the company
     const investorRelationsPageUrl = await getInvestorRelationsUrl(body.ticker);
    console.log('investorRelationsPageUrl', investorRelationsPageUrl);

     // 2. using the investor relations website, get the quarterly results page url
     const quarterlyResultsPageUrl = await getQuarterlyResultsPageUrl(investorRelationsPageUrl);
     console.log('quarterlyResultsPageUrl', quarterlyResultsPageUrl);

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
    const links = await scrapeHomePageForLinks(irWebsite, relevantTerms);
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

    const needUserAgent = await checkIfWeNeedUserAgent(quarteryResultsPageUrl);

    // first we need to scrape the quarterly results page to find the links to the documents
    const visibleLinks = await scrapeVisiblePageForLinks(quarteryResultsPageUrl, relevantTerms, needUserAgent);

    // we have to consider that the website has selectors or buttons for the year and if so we have to click on them to get the dynamic content
    const hiddenLinks = await scrapeDynamicContentForLinks(quarteryResultsPageUrl, relevantTerms, needUserAgent);
 
    // merge the visible and hidden links and remove any duplicates
    const allRelevantLinks = mergeAndDedupeArrays(visibleLinks, hiddenLinks);


    // Determine if we need to split this into multiple requests: simple way is to get totalDocumentResponses =  documentType.length * fiscalPeriod.length
    // If this is greater than 18, we should split it into multiple requests. Max number of totalDocumentResponses is 36 (3 document types * 12 fiscal periods). Have seen success with all 36, but is right at the limit so this provides a good buffer.
    // Kind of a hacky way to do this- definitely better ways, but haven't seen major issues so not a priority to fix.
    
    const totalDocumentResponses = documentType.length * fiscalPeriod.length;

    if (totalDocumentResponses > 18) {
        console.log(`Splitting into chunks for ${documentType.length} document types and ${fiscalPeriod.length} fiscal periods`);
        // create 2 arrays for documentType and fiscalPeriod by cutting in half like so: 
        const [documentTypePrompt1, documentTypePrompt2] = splitArray(documentType);
        const [fiscalPeriodPrompt1, fiscalPeriodPrompt2] = splitArray(fiscalPeriod);

        const prompt1 = generateClaudePrompt(allRelevantLinks.filter(link => link !== null), documentTypePrompt1, fiscalPeriodPrompt1);
        const response1 = await anthropicChatResponse(prompt1);

        const prompt2 = generateClaudePrompt(allRelevantLinks.filter(link => link !== null), documentTypePrompt2, fiscalPeriodPrompt2);
        const response2 = await anthropicChatResponse(prompt2);

        let overallResponse = response1.concat(response2);
        return overallResponse;
    }

    const prompt = generateClaudePrompt(allRelevantLinks.filter(link => link !== null), documentType, fiscalPeriod);
    const response = await anthropicChatResponse(prompt);
    return response;  
}

















