'use client';
import { useState } from 'react';
import MultiSelectDropdown from './multiselectDropdown';
import DocumentResponseSection from './documentResponseSection';

export default function Earnings() {
    const [ticker, setTicker] = useState('');

    const [documentType, setDocumentType] = useState<string[]>([]);
    const documentOptions = [
        { label: 'Earnings Release', value: 'EarningsRelease' },
        { label: 'Earnings Presentation', value: 'EarningsPresentation' },
        { label: 'Earnings Webcast', value: 'EarningsWebcast' },
    ]

    const [fiscalPeriod, setFiscalPeriods] = useState<string[]>([]);
    const fiscalPeriodOptions = [
        { label: '1Q2024', value: '1Q2024' },
        { label: '4Q2023', value: '4Q2023' },
        { label: '3Q2023', value: '3Q2023' },
        { label: '2Q2023', value: '2Q2023' },
        { label: '1Q2023', value: '1Q2023' },
        { label: '4Q2022', value: '4Q2022' },
        { label: '3Q2022', value: '3Q2022' },
        { label: '2Q2022', value: '2Q2022' },
        { label: '1Q2022', value: '1Q2022' },
        { label: '4Q2021', value: '4Q2021' },
        { label: '3Q2021', value: '3Q2021' },
        { label: '2Q2021', value: '2Q2021' },
    ]


    const [isFetching, setIsFetching] = useState(false);
    const [error, setError] = useState(false);
    const [documentResponses, setDocumentResponses] = useState<{ documentType: string; fiscalPeriod: string; documentResponse: string; }[]>([]);

  
    const handleSubmit = async () => {
        setError(false);
        if (!ticker) {
            alert('Please enter a ticker symbol');
            return;
        }
        setIsFetching(true);
        fetch('/api/investorrelations', {
            method: 'POST',
            headers: {
            'Content-Type': 'application/json',
            },
            body: JSON.stringify({ ticker: ticker, documentType: documentType.length > 0 ? documentType : documentOptions.map(doc => doc.label), fiscalPeriod: fiscalPeriod.length > 0 ? fiscalPeriod : fiscalPeriodOptions.map(period => period.value)}),
        })
        .then((response) => response.json())
        .then((data) => {
            console.log('Success:', data);
            setIsFetching(false);
            setDocumentResponses(data.documentResponses);
        })
        .catch((error) => {
            setIsFetching(false);
            setError(true);
            console.error('Error:', error);
        });
    }

    return (
        <div className= 'flex flex-col items-center justify-evenly min-h-screen'>
            <div className="flex flex-row items-center">
                <label htmlFor="ticker" className="text-xl font-semibold">
                    Enter a ticker symbol:
                </label>
                <input type="text" placeholder="Enter a ticker symbol" className='text-black border-2 border-sky-700 rounded-md p-2 m-2'
                    value={ticker} onChange={e => setTicker(e.target.value)} />
            </div>
            <div className="flex flex-row items-center">
                <div className="flex flex-col">
                <label htmlFor="ticker" className="text-xl font-semibold">
                    Select fiscal period(s):
                </label>
                <label htmlFor="ticker" className="text-xs">
                    (CMD+click to select multiple options, default is all periods)
                </label>
                </div>
            <MultiSelectDropdown options={fiscalPeriodOptions} onChange={setFiscalPeriods} />
            </div>
            <div className="flex flex-row items-center">
                <div className="flex flex-col">
                <label htmlFor="ticker" className="text-xl font-semibold">
                    Select document type(s):
                </label>
                <label htmlFor="ticker" className="text-xs">
                    (CMD+click to select multiple options, default is all types)
                </label>
                </div>
            <MultiSelectDropdown options={documentOptions} onChange={setDocumentType} />
            </div>
            <button className='text-white bg-sky-700 px-4 rounded-md p-3' onClick={() => handleSubmit()} disabled={isFetching}> { isFetching ? 'Fetching Documents...' : 'Generate Report'}</button>
            <DocumentResponseSection documentResponses={documentResponses} isFetching={isFetching} documentOptions={documentOptions} isUnexpectedError={error}/>
        </div>
    )

}
