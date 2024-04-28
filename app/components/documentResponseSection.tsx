import React from 'react'

interface DocumentResponseSectionProps {
    documentResponses: {
        documentType: string;
        fiscalPeriod: string;
        documentResponse: string;
    }[];
    documentOptions: { label: string; value: string }[];
    isFetching: boolean;
    isUnexpectedError: boolean;

}

const handleOpenDocument = (fileUrl: string) => {
  window.open(fileUrl, "Title", "toolbar=no,location=no,directories=no,status=no,menubar=no,scrollbars=yes,resizable=yes,width=780,height=200,top="+(screen.height-400)+",left="+(screen.width-840))
} 

const DocumentDisplay = ({ fileUrl }: { fileUrl: string }) => {
  if (!fileUrl || fileUrl.match('Document not found')){
    return (
      <div className='flex flex-row'>
        <p className='font-bold mr-2'>Document URL:</p>
        <p className='text-red-800'>Document not found</p>
      </div>
    )
  }
    return (
      <div className='flex flex-row'>
        <p className='font-bold mr-2'>Document URL:</p>
        <button onClick={()=>handleOpenDocument(fileUrl)} className='text-blue-800 hover:underline'>
          {fileUrl}
        </button>

      </div>
    )
  }

const DocumentResponseSection: React.FC<DocumentResponseSectionProps> = ({documentResponses, documentOptions, isFetching, isUnexpectedError}) => {
  return (
    <div className='bg-white rounded-md m-5 h-4/6 w-4/5'>
      {
        isUnexpectedError ? (
          <div className='p-4 text-red-800'>
            <p>There was an unexpected error fetching the documents. Please try again.</p>
          </div>
        ) : !isFetching && !documentResponses.length ? (
        <div className='p-4 text-black'>
          <p>Generate report to see documents!</p>
        </div>
      ) : isFetching ? (
        <div className='p-4 text-black'>
          <p>Fetching documents...</p>
        </div>
      ) : (
        <div className='p-4'>
          {
          documentResponses.map((documentResponse, index) => (
            <div key={index} className='border-b-2 border-gray-200 p-2'>
              <p className='font-bold mr-2'>Document Type: <span className='font-normal'>  {documentOptions.find(option => option.value === documentResponse.documentType)?.label || documentResponse.documentType}</span></p>
              <p className='font-bold mr-2'>Fiscal Period: <span className='font-normal'>{documentResponse.fiscalPeriod}</span></p>
              <DocumentDisplay fileUrl={documentResponse.documentResponse} />
            </div>
          ))}
        </div>
      )}
      
      
    </div>
  )
}

export default DocumentResponseSection