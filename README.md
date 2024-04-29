## Overview
This project creates a web app, taking a stock ticker, fiscal period(s) and document type(s) as user input.
It first finds the investor relations website for the given stock ticker, using Yahoo finance and Serp APIs. Then the program uses a combination of Puppeteer for web scraping and OpenAI's gpt-4 model to find the quarterly results/financials page from the investor relations website. Finally, it navigates to the quarterly results page, scrapes all relevant links, and uses Anthropic's claude-3-opus-20240229 model to find which links are the correct ones for the fiscal period(s) and document type(s) the user is looking for.

## Getting Started
Update .env.local.placeholder with OpenAI, Anthropic, and SerpAPI keys, remove .placeholder before use

```bash
nvm use 18.17.0
npm install
npm run build
npm start
```

See notes here: https://docs.google.com/document/d/1Un5a2b_9lvr339BDxkuBKMfPcD4kRCwbNYCClbpscsU/edit?usp=sharing


First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.


This project uses [`next/font`](https://nextjs.org/docs/basic-features/font-optimization) to automatically optimize and load Inter, a custom Google Font.


