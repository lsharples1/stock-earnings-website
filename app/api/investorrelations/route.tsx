import { NextRequest, NextResponse } from "next/server";
import yahooFinance from 'yahoo-finance2';

export async function POST(
    request: NextRequest,
) {
    const body = await request.json();
    console.log('body', body);
    const assetProfile = await yahooFinance.quoteSummary(body.ticker, {
        modules: ['assetProfile']
    
    });
    console.log('assetProfile', assetProfile);
    if (assetProfile.assetProfile?.irWebsite) {
        console.log('has IR website');
        return NextResponse.json({ irWebsite: assetProfile.assetProfile.irWebsite });
    } else {
        console.log('no IR website');
        return NextResponse.json({ website: assetProfile.assetProfile?.website });
    }

    
}
