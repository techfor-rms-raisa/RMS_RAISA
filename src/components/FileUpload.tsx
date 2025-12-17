import React, { useState, useRef } from 'react';
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
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const extractTextFromFile = async (file: File): Promise<string> => {
    if (file.type === 'application/pdf') {
      return await extractTextFromPDF(file);
    } else {
      return await file.text();
    }
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    setIsLoading(true);
    try {
      const text = await extractTextFromFile(file);
      const results = await analyzeReport(text);
      onAnalysisComplete(results);
    } catch (err) {
      console.error('Erro ao processar arquivo:', err);
      alert('❌ Erro ao processar arquivo. Verifique o formato e tente novamente.');
    } finally {
      setIsLoading(false);
      // Reset input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    
    setIsLoading(true);
    try {
      const text = await extractTextFromFile(file);
      const results = await analyzeReport(text);
      onAnalysisComplete(results);
    } catch (err) {
      console.error('Erro ao processar arquivo:', err);
      alert('❌ Erro ao processar arquivo. Verifique o formato e tente novamente.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Drag & Drop Area */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition ${
          isDragging
            ? 'border-blue-500 bg-blue-50'
            : 'border-gray-300 bg-gray-50 hover:border-gray-400'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={handleFileChange}
          accept=".txt,.pdf"
          disabled={isLoading}
        />
        
        <div className="flex flex-col items-center gap-2">
          <span className="text-4xl">📁</span>
          <div>
            <p className="font-semibold text-gray-700">
              {isLoading ? '⏳ Processando...' : 'Arraste o arquivo aqui ou clique para selecionar'}
            </p>
            <p className="text-sm text-gray-500 mt-1">
              Formatos aceitos: TXT, PDF
            </p>
          </div>
        </div>
      </div>

      {/* File Info */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800">
        <p><strong>💡 Dica:</strong> Você pode arrastar um arquivo TXT ou PDF diretamente nesta área, ou clicar para selecionar um arquivo do seu computador.</p>
      </div>
    </div>
  );
};

export default FileUpload;
