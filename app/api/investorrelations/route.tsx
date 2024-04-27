import { NextRequest, NextResponse } from "next/server";
import yahooFinance from 'yahoo-finance2';

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
    const assetProfile = await yahooFinance.quoteSummary(body.ticker, {
        modules: ['assetProfile']
    
    });
    let irWebsite;
    if (assetProfile.assetProfile?.irWebsite) {
        // if we have the IR website, great now we can start the next step of getting earnings reports
        irWebsite = assetProfile.assetProfile.irWebsite;
        return NextResponse.json({ documentResponses: [{ documentType: body.documentType[0], fiscalPeriod: body.fiscalPeriod[0], documentResponse: irWebsite }] });

    } else {
        // if Yahoo Finance doesn't have a generic website, throw an error for now
        if (!assetProfile.assetProfile?.website) {
            return NextResponse.json({ irWebsite: null });
        }
        // sometimes the website is the IR website so we need to check if "invest" is in the URL, then we can assume it's the IR website
        if (assetProfile.assetProfile?.website?.includes('invest')) {
            irWebsite = assetProfile.assetProfile.website;
            // if we have the IR website, great now we can start the next step of getting earnings reports
            return NextResponse.json({ documentResponses: [{ documentType: body.documentType[0], fiscalPeriod: body.fiscalPeriod[0], documentResponse: irWebsite }] });
        }
        // if we don't have the IR website, we can get the company's website, and then we will use a utility to find the IR website
        irWebsite = await findIRWebsite(assetProfile.assetProfile.website.replace('https://www.', ''));
        return NextResponse.json({ documentResponses: [{ documentType: body.documentType[0], fiscalPeriod: body.fiscalPeriod[0], documentResponse: irWebsite }] });
    }
}

async function findIRWebsite(website: string) {
    // we will use a utility to find the IR website based on the company's website
    // starting with a heuristic approach... investors.website, investor.website, website/ir, website/investors, 
    // we'll go through these, trying a get request to see if it's a valid page, if it is, we'll return it
    // if none of these work, we'll return the original website

    // TODO: maybe use LLM here to genereate the heuristics
    const heuristics = [`https://investors.${website}`, `https://investor.${website}`, `https://ir.${website}`, `https://${website}/ir`, `https://${website}/investors`];

    console.log('heuristics', heuristics);
    for (const heuristic of heuristics) {
        try {
            const response = await fetch(heuristic, {redirect: 'follow'});
            console.log('response', response);
            if (response.ok) {
                console.log('found IR website', heuristic);
                return heuristic;
            }
        } catch (e) {
            console.error(e);
        }
    }
}
