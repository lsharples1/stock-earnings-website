
export function mergeAndDedupeArrays(visibleLinks: ({ href: string; text: string | undefined; } | null)[], hiddenLinks: ({ href: string; text: string | undefined; } | null)[]) {
    const combinedLinks = [...visibleLinks, ...hiddenLinks];
    const uniqueLinksMap = new Map();

    for (const link of combinedLinks) {
        // Use the href and text as the key because both properties are used to determine uniqueness
        const key = `${link?.href}|${link?.text}`;
        if (!uniqueLinksMap.has(key)) {
            uniqueLinksMap.set(key, link);
        }
    }
    // Convert the map values back to an array
    return Array.from(uniqueLinksMap.values());

}

export function splitArray(array: string[]) {
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
export function generateClaudePrompt(visibleLinks: { href: string; text: string; }[], documentType: string[], fiscalPeriod: string[]) {
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

/**
 * 
 * @param text response from model
 * @returns JSON array
 * This function has a backup plan to remove any leading text before the first '['. Catches cases where the model adds extra text before the JSON which happens infrequently with prompt engineering, but easily fixed with this function.
 */
export function parseJsonArrayUtil(text: string) {
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