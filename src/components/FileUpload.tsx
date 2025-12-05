import React, { useState } from 'react';
import { analyzeReport } from '../services/geminiService';
import { AIAnalysisResult } from '../components/types';
import * as pdfjsLib from 'pdfjs-dist';

const getPdfJs = () => {
    // @ts-ignore 
    return pdfjsLib.default || pdfjsLib;
};

const pdfjs = getPdfJs();
if (pdfjs.GlobalWorkerOptions) {
    pdfjs.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}

interface FileUploadProps {
  onAnalysisComplete: (results: AIAnalysisResult[]) => void;
}

const FileUpload: React.FC<FileUploadProps> = ({ onAnalysisComplete }) => {
  const [isLoading, setIsLoading] = useState(false);

  const extractTextFromPDF = async (file: File): Promise<string> => {
    const pdfjs = getPdfJs();
    const arrayBuffer = await file.arrayBuffer();
    const loadingTask = pdfjs.getDocument(arrayBuffer);
    const pdf = await loadingTask.promise;
    let fullText = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      fullText += textContent.items.map((item: any) => item.str).join(' ') + '\n';
    }
    return fullText;
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setIsLoading(true);
    try {
        let text = file.type === 'application/pdf' ? await extractTextFromPDF(file) : await file.text();
        const results = await analyzeReport(text);
        onAnalysisComplete(results);
    } catch (err) {
        console.error(err);
        alert("Erro ao processar arquivo.");
    } finally {
        setIsLoading(false);
    }
  };

  return (
    <div className="bg-white p-6 rounded-lg shadow-md mb-8">
      <h2 className="text-xl font-bold text-[#4D5253] mb-4">Upload Relatório</h2>
      <label className="cursor-pointer bg-[#533738] text-white px-4 py-2 rounded">
          {isLoading ? 'Processando...' : 'Selecionar PDF/TXT'}
          <input type="file" className="hidden" onChange={handleFileChange} accept=".txt,.pdf" disabled={isLoading} />
      </label>
    </div>
  );
};

export default FileUpload;