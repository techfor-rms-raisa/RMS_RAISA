import React, { useState } from 'react';
import { analyzeCandidate } from '../../services/raisaService';
import { RiskFactor } from '../types';

const AnaliseRisco: React.FC = () => {
    const [resumeText, setResumeText] = useState('');
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [risks, setRisks] = useState<RiskFactor[] | null>(null);

    const handleAnalyze = async () => {
        if (!resumeText) return;
        setIsAnalyzing(true);
        const results = await analyzeCandidate(resumeText);
        setRisks(results);
        setIsAnalyzing(false);
    };

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 h-full">
            <div className="bg-white p-6 rounded-lg shadow-md flex flex-col">
                <h2 className="text-xl font-bold mb-4 text-[#1E3A8A]">Análise de Currículo (AI)</h2>
                <p className="text-sm text-gray-500 mb-4">Cole o texto do currículo abaixo para identificar fatores de risco comportamentais e técnicos.</p>
                <textarea 
                    className="flex-1 w-full border rounded-lg p-4 font-mono text-sm focus:ring-2 focus:ring-blue-500 outline-none resize-none bg-gray-50"
                    placeholder="Cole o texto do currículo aqui..."
                    value={resumeText}
                    onChange={e => setResumeText(e.target.value)}
                />
                <button 
                    onClick={handleAnalyze} 
                    disabled={isAnalyzing || !resumeText}
                    className="mt-4 bg-[#7C3AED] text-white py-3 rounded-lg font-bold hover:bg-opacity-90 disabled:opacity-50 flex justify-center items-center"
                >
                    {isAnalyzing ? (
                        <>
                            <svg className="animate-spin h-5 w-5 mr-3" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            Analisando com Gemini...
                        </>
                    ) : '🔍 Analisar Riscos'}
                </button>
            </div>

            <div className="bg-white p-6 rounded-lg shadow-md overflow-y-auto">
                <h2 className="text-xl font-bold mb-4 text-gray-800">Resultados da Análise</h2>
                
                {!risks && !isAnalyzing && (
                    <div className="text-center text-gray-400 mt-20">
                        <p>Os resultados aparecerão aqui.</p>
                    </div>
                )}

                {risks && risks.length === 0 && (
                    <div className="bg-green-100 text-green-800 p-4 rounded-lg text-center">
                        ✅ Nenhum fator de risco crítico identificado.
                    </div>
                )}

                <div className="space-y-4">
                    {risks?.map((risk, idx) => (
                        <div key={idx} className={`p-4 rounded-lg border-l-4 ${
                            risk.risk_level === 'high' ? 'bg-red-50 border-red-500' : 
                            risk.risk_level === 'medium' ? 'bg-yellow-50 border-yellow-500' : 'bg-blue-50 border-blue-500'
                        }`}>
                            <div className="flex justify-between items-start">
                                <h3 className="font-bold text-gray-800">{risk.risk_type}</h3>
                                <span className={`text-xs px-2 py-1 rounded uppercase font-bold ${
                                    risk.risk_level === 'high' ? 'bg-red-200 text-red-800' : 
                                    risk.risk_level === 'medium' ? 'bg-yellow-200 text-yellow-800' : 'bg-blue-200 text-blue-800'
                                }`}>
                                    {risk.risk_level}
                                </span>
                            </div>
                            <p className="text-sm mt-2 text-gray-700"><strong>Padrão:</strong> {risk.detected_pattern}</p>
                            <p className="text-xs mt-2 text-gray-500 italic">"{risk.evidence}"</p>
                            <div className="mt-2 text-right">
                                <span className="text-xs text-gray-400">Confiança IA: {(risk.ai_confidence * 100).toFixed(0)}%</span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default AnaliseRisco;