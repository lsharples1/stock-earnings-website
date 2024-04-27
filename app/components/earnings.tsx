'use client';
import { useState } from 'react';

export default function Earnings() {
    const [ticker, setTicker] = useState('');
  
    const handleSubmit = async () => {
    fetch('/api/investorrelations', {
        method: 'POST',
        headers: {
        'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ticker: ticker }),
    })
        .then((response) => response.json())
        .then((data) => {
        console.log('Success:', data);
        })
        .catch((error) => {
        console.error('Error:', error);
        });

    }

    return (
        <>
        <div className="flex flex-row items-center">
            <label htmlFor="ticker" className="text-xl font-semibold m-5">
                Enter a ticker symbol:
            </label>
            <input type="text" placeholder="Enter a ticker symbol" className='text-black border-2 border-sky-700 rounded-md p-2'
                value={ticker} onChange={e => setTicker(e.target.value)} />
        </div>
        <button className='text-white bg-sky-700 px-4' onClick={() => handleSubmit()}>Publish</button>
        </>
    )

}
