import React, { useState } from 'react';
import FileUpload from './FileUpload';

interface ReportImportProps {
    onImport: (text: string) => Promise<void>;
}

const ReportImport: React.FC<ReportImportProps> = ({ onImport }) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);

    const handleFileUpload = async (text: string) => {
        setIsProcessing(true);
        try {
            await onImport(text);
            alert('✅ Relatórios importados e processados com sucesso!');
            setIsExpanded(false);
        } catch (error) {
            console.error('Erro ao importar relatórios:', error);
            alert('❌ Erro ao processar relatórios. Verifique o formato do arquivo.');
        } finally {
            setIsProcessing(false);
        }
    };

    const downloadTemplate = () => {
        const template = `CONSULTOR|GESTOR|MÊS|ATIVIDADES
João Silva|Maria Santos|1|Entregou todas as tarefas dentro do prazo. Recebeu elogio do cliente pela qualidade do trabalho.
Pedro Oliveira|Maria Santos|1|Apresentou 2 faltas não justificadas. Dificuldade em comunicação com a equipe.
Ana Costa|Carlos Souza|2|Performance excelente. Superou expectativas nas entregas. Participou de treinamento técnico.
Lucas Ferreira|Carlos Souza|2|Não entregou projeto no prazo. Reclamação do cliente sobre qualidade do código. Advertência aplicada.`;

        const blob = new Blob([template], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'template_relatorios_atividades.txt';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

    return (
        <div className="mb-6 border border-gray-300 rounded-lg overflow-hidden">
            <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="w-full bg-gradient-to-r from-purple-600 to-purple-700 text-white px-6 py-4 flex justify-between items-center hover:from-purple-700 hover:to-purple-800 transition"
            >
                <div className="flex items-center gap-3">
                    <span className="text-2xl">📊</span>
                    <div className="text-left">
                        <h3 className="font-bold text-lg">Importar Relatórios de Atividades em Lote</h3>
                        <p className="text-sm text-purple-100">Processar múltiplos relatórios de uma vez com análise automática de risco</p>
                    </div>
                </div>
                <span className="text-2xl">{isExpanded ? '▲' : '▼'}</span>
            </button>

            {isExpanded && (
                <div className="bg-white p-6 border-t border-gray-200">
                    <div className="space-y-6">
                        {/* Instruções */}
                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                            <h4 className="font-semibold text-blue-900 mb-3">📋 Formato do Arquivo:</h4>
                            <div className="space-y-2 text-sm text-blue-800">
                                <p><strong>Formato:</strong> Arquivo de texto (.txt) com uma linha por relatório</p>
                                <p><strong>Estrutura:</strong> <code className="bg-blue-100 px-2 py-1 rounded">CONSULTOR | GESTOR | MÊS | ATIVIDADES</code></p>
                                <p><strong>Separador:</strong> Pipe (|) entre os campos</p>
                                <p><strong>Mês:</strong> Número de 1 a 12</p>
                            </div>
                        </div>

                        {/* Exemplo */}
                        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                            <h4 className="font-semibold text-gray-800 mb-2">💡 Exemplo:</h4>
                            <pre className="text-xs bg-white p-3 rounded border border-gray-300 overflow-x-auto">
{`João Silva | Maria Santos | 1 | Entregou todas as tarefas dentro do prazo. Recebeu elogio do cliente.
Pedro Oliveira | Maria Santos | 1 | Apresentou 2 faltas não justificadas. Dificuldade em comunicação.
Ana Costa | Carlos Souza | 2 | Performance excelente. Superou expectativas nas entregas.`}
                            </pre>
                        </div>

                        {/* Botão de Template */}
                        <div className="flex justify-center">
                            <button
                                onClick={downloadTemplate}
                                className="bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 transition flex items-center gap-2"
                            >
                                <span>📥</span>
                                Baixar Template de Exemplo
                            </button>
                        </div>

                        {/* Upload */}
                        <div className="border-t pt-6">
                            <h4 className="font-semibold text-gray-800 mb-3">📤 Fazer Upload:</h4>
                            <FileUpload onUpload={handleFileUpload} />
                            {isProcessing && (
                                <div className="mt-4 text-center">
                                    <p className="text-blue-600 font-medium">⏳ Processando relatórios com IA...</p>
                                    <p className="text-sm text-gray-600">Analisando riscos e atualizando scores dos consultores</p>
                                </div>
                            )}
                        </div>

                        {/* Legenda de Risco */}
                        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                            <h4 className="font-semibold text-gray-800 mb-3">📊 Análise Automática de Risco:</h4>
                            <div className="grid grid-cols-2 gap-3 text-sm">
                                <div className="flex items-center gap-2">
                                    <div className="w-4 h-4 rounded-full bg-red-500"></div>
                                    <span><strong>1 - Crítico:</strong> Problemas graves detectados</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <div className="w-4 h-4 rounded-full bg-orange-500"></div>
                                    <span><strong>2 - Alto:</strong> Atenção necessária</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <div className="w-4 h-4 rounded-full bg-yellow-500"></div>
                                    <span><strong>3 - Médio:</strong> Pontos de melhoria</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <div className="w-4 h-4 rounded-full bg-green-500"></div>
                                    <span><strong>4 - Baixo:</strong> Performance positiva</span>
                                </div>
                            </div>
                            <p className="text-xs text-gray-600 mt-3">
                                💡 A IA analisa palavras-chave nas atividades e determina automaticamente o nível de risco.
                                Consultores com risco 1 ou 2 são automaticamente colocados em quarentena.
                            </p>
                        </div>

                        {/* Palavras-chave */}
                        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                            <h4 className="font-semibold text-yellow-900 mb-2">🔍 Palavras-chave Monitoradas:</h4>
                            <div className="grid grid-cols-3 gap-4 text-xs">
                                <div>
                                    <p className="font-semibold text-red-700 mb-1">Alto Risco:</p>
                                    <p className="text-gray-700">falta, atraso, não entregou, problema, conflito, reclamação, advertência</p>
                                </div>
                                <div>
                                    <p className="font-semibold text-orange-700 mb-1">Médio Risco:</p>
                                    <p className="text-gray-700">dificuldade, desafio, atenção, melhorar, ajuste, revisão</p>
                                </div>
                                <div>
                                    <p className="font-semibold text-green-700 mb-1">Positivo:</p>
                                    <p className="text-gray-700">ótimo, excelente, sucesso, entregou, superou, destaque, elogio</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ReportImport;
