import React, { useState, useEffect } from 'react';
import { 
    buscarEntrevistasPorCandidatura, 
    criarEntrevista, 
    uploadMediaFile,
    type Entrevista 
} from '../../services/interviewService';
import { 
    processarTranscricaoManual, 
    sumarizarEntrevista,
    validarTranscricao,
    extrairEstatisticasTranscricao,
    formatarTranscricao
} from '../../services/interviewTranscriptionService';

interface InterviewManagerProps {
    candidatura_id: number;
    vaga_id: number;
    vaga_descricao: string;
    analista_id: number;
    onClose?: () => void;
}

export default function InterviewManager({
    candidatura_id,
    vaga_id,
    vaga_descricao,
    analista_id,
    onClose
}: InterviewManagerProps) {
    const [entrevistas, setEntrevistas] = useState<Entrevista[]>([]);
    const [loading, setLoading] = useState(true);
    const [showNovaEntrevista, setShowNovaEntrevista] = useState(false);
    const [entrevistaSelecionada, setEntrevistaSelecionada] = useState<Entrevista | null>(null);

    // Form states
    const [dataEntrevista, setDataEntrevista] = useState('');
    const [tipoEntrevista, setTipoEntrevista] = useState<'comportamental' | 'tecnica' | 'cliente' | 'mista'>('tecnica');
    const [plataforma, setPlataforma] = useState<'Teams' | 'Zoom' | 'Meet' | 'Presencial' | 'Outra'>('Teams');
    const [duracaoMinutos, setDuracaoMinutos] = useState('');
    const [transcricaoTexto, setTranscricaoTexto] = useState('');
    const [mediaFile, setMediaFile] = useState<File | null>(null);
    const [observacoes, setObservacoes] = useState('');

    const [processando, setProcessando] = useState(false);
    const [mensagem, setMensagem] = useState<{ tipo: 'success' | 'error'; texto: string } | null>(null);

    useEffect(() => {
        carregarEntrevistas();
    }, [candidatura_id]);

    const carregarEntrevistas = async () => {
        setLoading(true);
        const data = await buscarEntrevistasPorCandidatura(candidatura_id);
        setEntrevistas(data);
        setLoading(false);
    };

    const handleCriarEntrevista = async () => {
        if (!dataEntrevista) {
            setMensagem({ tipo: 'error', texto: 'Data da entrevista é obrigatória' });
            return;
        }

        setProcessando(true);
        setMensagem(null);

        try {
            // 1. Upload de mídia (se houver)
            let mediaUrl = '';
            let mediaFilename = '';
            let mediaSizeMb = 0;

            if (mediaFile) {
                const uploadResult = await uploadMediaFile(mediaFile, candidatura_id);
                if (uploadResult) {
                    mediaUrl = uploadResult.url;
                    mediaFilename = uploadResult.filename;
                    mediaSizeMb = uploadResult.size_mb;
                }
            }

            // 2. Criar entrevista
            const novaEntrevista: Entrevista = {
                candidatura_id,
                vaga_id,
                analista_id,
                data_entrevista: new Date(dataEntrevista).toISOString(),
                tipo_entrevista: tipoEntrevista,
                plataforma,
                duracao_minutos: duracaoMinutos ? parseInt(duracaoMinutos) : undefined,
                media_url: mediaUrl || undefined,
                media_filename: mediaFilename || undefined,
                media_size_mb: mediaSizeMb || undefined,
                transcricao_texto: transcricaoTexto.trim() || undefined,
                transcricao_fonte: transcricaoTexto.trim() ? 'manual' : undefined,
                observacoes_analista: observacoes || undefined,
                status: transcricaoTexto.trim() ? 'transcrita' : 'realizada',
                criado_por: analista_id
            };

            const entrevistaCriada = await criarEntrevista(novaEntrevista);

            if (!entrevistaCriada) {
                throw new Error('Erro ao criar entrevista');
            }

            // 3. Se tem transcrição, processar e sumarizar
            if (transcricaoTexto.trim()) {
                await processarTranscricaoManual(entrevistaCriada.id!, transcricaoTexto);
                await sumarizarEntrevista(entrevistaCriada.id!, vaga_descricao);
            }

            setMensagem({ tipo: 'success', texto: 'Entrevista criada com sucesso!' });
            limparFormulario();
            setShowNovaEntrevista(false);
            await carregarEntrevistas();
        } catch (error) {
            console.error('Erro ao criar entrevista:', error);
            setMensagem({ tipo: 'error', texto: 'Erro ao criar entrevista. Tente novamente.' });
        } finally {
            setProcessando(false);
        }
    };

    const handleSumarizar = async (entrevista: Entrevista) => {
        if (!entrevista.id) return;

        setProcessando(true);
        setMensagem(null);

        try {
            const result = await sumarizarEntrevista(entrevista.id, vaga_descricao);
            
            if (result.success) {
                setMensagem({ tipo: 'success', texto: 'Entrevista sumarizada com sucesso!' });
                await carregarEntrevistas();
            } else {
                setMensagem({ tipo: 'error', texto: result.error || 'Erro ao sumarizar' });
            }
        } catch (error) {
            setMensagem({ tipo: 'error', texto: 'Erro ao sumarizar entrevista' });
        } finally {
            setProcessando(false);
        }
    };

    const limparFormulario = () => {
        setDataEntrevista('');
        setTipoEntrevista('tecnica');
        setPlataforma('Teams');
        setDuracaoMinutos('');
        setTranscricaoTexto('');
        setMediaFile(null);
        setObservacoes('');
    };

    const validacao = transcricaoTexto ? validarTranscricao(transcricaoTexto) : null;
    const stats = transcricaoTexto ? extrairEstatisticasTranscricao(transcricaoTexto) : null;

    return (
        <div className="bg-white rounded-lg shadow-lg p-6">
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-gray-800">Gerenciar Entrevistas</h2>
                <div className="flex gap-2">
                    <button
                        onClick={() => setShowNovaEntrevista(!showNovaEntrevista)}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                    >
                        {showNovaEntrevista ? 'Cancelar' : '+ Nova Entrevista'}
                    </button>
                    {onClose && (
                        <button
                            onClick={onClose}
                            className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
                        >
                            Fechar
                        </button>
                    )}
                </div>
            </div>

            {mensagem && (
                <div className={`mb-4 p-4 rounded-lg ${
                    mensagem.tipo === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
                }`}>
                    {mensagem.texto}
                </div>
            )}

            {/* Formulário Nova Entrevista */}
            {showNovaEntrevista && (
                <div className="mb-6 p-6 bg-gray-50 rounded-lg border border-gray-200">
                    <h3 className="text-lg font-semibold mb-4">Nova Entrevista</h3>
                    
                    <div className="grid grid-cols-2 gap-4 mb-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Data da Entrevista *
                            </label>
                            <input
                                type="datetime-local"
                                value={dataEntrevista}
                                onChange={(e) => setDataEntrevista(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Tipo de Entrevista
                            </label>
                            <select
                                value={tipoEntrevista}
                                onChange={(e) => setTipoEntrevista(e.target.value as any)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                            >
                                <option value="tecnica">Técnica</option>
                                <option value="comportamental">Comportamental</option>
                                <option value="cliente">Cliente</option>
                                <option value="mista">Mista</option>
                            </select>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Plataforma
                            </label>
                            <select
                                value={plataforma}
                                onChange={(e) => setPlataforma(e.target.value as any)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                            >
                                <option value="Teams">Teams</option>
                                <option value="Zoom">Zoom</option>
                                <option value="Meet">Google Meet</option>
                                <option value="Presencial">Presencial</option>
                                <option value="Outra">Outra</option>
                            </select>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Duração (minutos)
                            </label>
                            <input
                                type="number"
                                value={duracaoMinutos}
                                onChange={(e) => setDuracaoMinutos(e.target.value)}
                                placeholder="Ex: 45"
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                            />
                        </div>
                    </div>

                    <div className="mb-4">
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Arquivo de Áudio/Vídeo (opcional)
                        </label>
                        <input
                            type="file"
                            accept="audio/*,video/*"
                            onChange={(e) => setMediaFile(e.target.files?.[0] || null)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        />
                        {mediaFile && (
                            <p className="text-sm text-gray-600 mt-1">
                                Arquivo selecionado: {mediaFile.name} ({(mediaFile.size / (1024 * 1024)).toFixed(2)} MB)
                            </p>
                        )}
                    </div>

                    <div className="mb-4">
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Transcrição da Entrevista
                        </label>
                        <textarea
                            value={transcricaoTexto}
                            onChange={(e) => setTranscricaoTexto(e.target.value)}
                            placeholder="Cole aqui a transcrição da entrevista (do Teams, Zoom, ou manual)..."
                            rows={10}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                        />
                        {stats && (
                            <div className="mt-2 text-sm text-gray-600 flex gap-4">
                                <span>{stats.total_palavras} palavras</span>
                                <span>{stats.total_linhas} linhas</span>
                                <span>~{stats.tempo_leitura_minutos} min de leitura</span>
                            </div>
                        )}
                        {validacao && !validacao.valida && (
                            <div className="mt-2 text-sm text-red-600">
                                {validacao.problemas.join(', ')}
                            </div>
                        )}
                    </div>

                    <div className="mb-4">
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Observações do Analista
                        </label>
                        <textarea
                            value={observacoes}
                            onChange={(e) => setObservacoes(e.target.value)}
                            placeholder="Observações adicionais sobre a entrevista..."
                            rows={3}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        />
                    </div>

                    <button
                        onClick={handleCriarEntrevista}
                        disabled={processando || !dataEntrevista}
                        className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed font-semibold"
                    >
                        {processando ? 'Processando...' : 'Criar e Sumarizar Entrevista'}
                    </button>
                </div>
            )}

            {/* Lista de Entrevistas */}
            <div>
                <h3 className="text-lg font-semibold mb-4">Entrevistas Realizadas ({entrevistas.length})</h3>
                
                {loading ? (
                    <p className="text-gray-600">Carregando...</p>
                ) : entrevistas.length === 0 ? (
                    <p className="text-gray-600">Nenhuma entrevista registrada ainda.</p>
                ) : (
                    <div className="space-y-4">
                        {entrevistas.map((entrevista) => (
                            <div key={entrevista.id} className="p-4 border border-gray-200 rounded-lg hover:shadow-md transition-shadow">
                                <div className="flex justify-between items-start mb-2">
                                    <div>
                                        <h4 className="font-semibold text-gray-800">
                                            {entrevista.tipo_entrevista} - {entrevista.plataforma}
                                        </h4>
                                        <p className="text-sm text-gray-600">
                                            {new Date(entrevista.data_entrevista).toLocaleString('pt-BR')}
                                            {entrevista.duracao_minutos && ` • ${entrevista.duracao_minutos} min`}
                                        </p>
                                    </div>
                                    <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                                        entrevista.status === 'sumarizada' ? 'bg-green-100 text-green-800' :
                                        entrevista.status === 'transcrita' ? 'bg-blue-100 text-blue-800' :
                                        'bg-gray-100 text-gray-800'
                                    }`}>
                                        {entrevista.status}
                                    </span>
                                </div>

                                {entrevista.sumario_narrativo && (
                                    <div className="mt-3 p-3 bg-blue-50 rounded-lg">
                                        <p className="text-sm text-gray-700">{entrevista.sumario_narrativo}</p>
                                        {entrevista.recomendacao_proxima_etapa && (
                                            <p className="text-sm font-semibold text-blue-700 mt-2">
                                                Recomendação: {entrevista.recomendacao_proxima_etapa}
                                            </p>
                                        )}
                                    </div>
                                )}

                                {entrevista.status === 'transcrita' && !entrevista.sumario_ia && (
                                    <button
                                        onClick={() => handleSumarizar(entrevista)}
                                        disabled={processando}
                                        className="mt-3 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:bg-gray-400 text-sm"
                                    >
                                        Sumarizar com IA
                                    </button>
                                )}

                                <button
                                    onClick={() => setEntrevistaSelecionada(entrevista)}
                                    className="mt-2 text-sm text-blue-600 hover:text-blue-800"
                                >
                                    Ver detalhes completos →
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Modal de Detalhes */}
            {entrevistaSelecionada && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto p-6">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-xl font-bold">Detalhes da Entrevista</h3>
                            <button
                                onClick={() => setEntrevistaSelecionada(null)}
                                className="text-gray-500 hover:text-gray-700 text-2xl"
                            >
                                ×
                            </button>
                        </div>

                        <div className="space-y-4">
                            {entrevistaSelecionada.sumario_ia && (
                                <>
                                    <div>
                                        <h4 className="font-semibold mb-2">Resumo Narrativo:</h4>
                                        <p className="text-gray-700">{entrevistaSelecionada.sumario_ia.narrativeSummary}</p>
                                    </div>

                                    <div>
                                        <h4 className="font-semibold mb-2">Pontos Fortes:</h4>
                                        <ul className="list-disc list-inside space-y-1">
                                            {entrevistaSelecionada.sumario_ia.strengths.map((s, i) => (
                                                <li key={i} className="text-gray-700">{s}</li>
                                            ))}
                                        </ul>
                                    </div>

                                    <div>
                                        <h4 className="font-semibold mb-2">Áreas de Desenvolvimento:</h4>
                                        <ul className="list-disc list-inside space-y-1">
                                            {entrevistaSelecionada.sumario_ia.areasForDevelopment.map((a, i) => (
                                                <li key={i} className="text-gray-700">{a}</li>
                                            ))}
                                        </ul>
                                    </div>

                                    <div>
                                        <h4 className="font-semibold mb-2">Fit Cultural:</h4>
                                        <p className="text-gray-700">
                                            {entrevistaSelecionada.sumario_ia.culturalFitScore}/5
                                        </p>
                                    </div>

                                    {entrevistaSelecionada.sumario_ia.keyQuotes.length > 0 && (
                                        <div>
                                            <h4 className="font-semibold mb-2">Citações Importantes:</h4>
                                            {entrevistaSelecionada.sumario_ia.keyQuotes.map((q, i) => (
                                                <blockquote key={i} className="border-l-4 border-blue-500 pl-4 py-2 mb-2 italic text-gray-700">
                                                    "{q.quote}" - <span className="font-semibold">{q.speaker}</span>
                                                </blockquote>
                                            ))}
                                        </div>
                                    )}
                                </>
                            )}

                            {entrevistaSelecionada.transcricao_texto && (
                                <div>
                                    <h4 className="font-semibold mb-2">Transcrição Completa:</h4>
                                    <div className="bg-gray-50 p-4 rounded-lg max-h-96 overflow-y-auto">
                                        <pre className="whitespace-pre-wrap text-sm text-gray-700 font-mono">
                                            {entrevistaSelecionada.transcricao_texto}
                                        </pre>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
