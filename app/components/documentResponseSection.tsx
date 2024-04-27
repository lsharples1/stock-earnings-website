import React from 'react'

interface DocumentResponseSectionProps {
    documentResponses: {
        documentType: string;
        fiscalPeriod: string;
        documentResponse: string;
    }[];
    isFetching: boolean;

}

const DocumentResponseSection: React.FC<DocumentResponseSectionProps> = ({documentResponses, isFetching}) => {
  return (
    <div className='bg-white rounded-md m-5 h-4/6 w-4/5'>
      {!isFetching && !documentResponses.length ? (
        <div className='p-4 text-black'>
          <p>Generate report to see documents!</p>
        </div>
      ) : isFetching ? (
        <div className='p-4 text-black'>
          <p>Fetching documents...</p>
        </div>
      ) : (
        <div className='p-4'>
          {documentResponses.map((documentResponse, index) => (
            <div key={index} className='border-b-2 border-gray-200 p-2'>
              <p>Document Type: {documentResponse.documentType}</p>
              <p>Fiscal Period: {documentResponse.fiscalPeriod}</p>
              <p>Document Response: {documentResponse.documentResponse}</p>
            </div>
          ))}
        </div>
      )}
      
      
    </div>
  )
}

export default DocumentResponseSection