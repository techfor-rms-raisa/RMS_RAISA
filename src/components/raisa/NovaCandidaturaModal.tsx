/**
 * NovaCandidaturaModal.tsx - Modal de Nova Candidatura
 * 
 * Modal completo para:
 * - Importar CV (upload PDF/DOCX/TXT ou colar texto)
 * - Selecionar Vaga
 * - Análise automática via IA
 * - Exibição de Score e GAPs
 * - Salvamento automático no Banco de Talentos
 * - Criação de Candidatura
 * 
 * Versão: 1.1 - INTEGRADO COM UPLOAD DE ARQUIVOS
 * Data: 30/12/2025
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  X, Upload, FileText, Search, Sparkles, 
  CheckCircle, XCircle, AlertTriangle, Loader2,
  User, Mail, Phone, Briefcase, MapPin, File
} from 'lucide-react';
import { Vaga } from '@/types';
import { useAnaliseCandidato, EtapaAnalise } from '@/hooks/supabase/useAnaliseCandidato';
import { useRaisaCVSearch, CandidatoMatch } from '@/hooks/supabase/useRaisaCVSearch';
import ScoreCompatibilidadeCircle, { ScoreCard } from './ScoreCompatibilidadeCircle';
import { AnaliseGapsCard } from './AnaliseGapsCard';

// ============================================
// TIPOS
// ============================================

interface NovaCandidaturaModalProps {
  isOpen: boolean;
  onClose: () => void;
  vagas: Vaga[];
  onCandidaturaCriada?: (candidaturaId: number) => void;
  currentUserId: number;
  vagaPreSelecionada?: Vaga;
}

type AbaAtiva = 'importar' | 'banco' | 'sugestoes';
type ModoInput = 'upload' | 'texto';

// ============================================
// COMPONENTE PRINCIPAL
// ============================================

const NovaCandidaturaModal: React.FC<NovaCandidaturaModalProps> = ({
  isOpen,
  onClose,
  vagas,
  onCandidaturaCriada,
  currentUserId,
  vagaPreSelecionada
}) => {
  // Estados do Modal
  const [abaAtiva, setAbaAtiva] = useState<AbaAtiva>('importar');
  const [modoInput, setModoInput] = useState<ModoInput>('upload');
  const [textoCV, setTextoCV] = useState('');
  const [vagaSelecionadaId, setVagaSelecionadaId] = useState<string>('');
  const [observacoes, setObservacoes] = useState('');
  const [etapaModal, setEtapaModal] = useState<'input' | 'analise' | 'resultado'>('input');
  
  // Estados de Origem/Indicação (NOVO)
  const [origem, setOrigem] = useState<'aquisicao' | 'indicacao_cliente'>('aquisicao');
  const [indicadoPorNome, setIndicadoPorNome] = useState('');
  const [indicadoPorCargo, setIndicadoPorCargo] = useState('');
  const [indicacaoObservacoes, setIndicacaoObservacoes] = useState('');
  
  // Estados de Upload de Arquivo
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [extraindoTexto, setExtraindoTexto] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Hook de análise
  const {
    estado,
    loading,
    error,
    analisarCV,
    criarCandidatura,
    resetar,
    dadosExtraidos,
    scoreCompatibilidade,
    analiseGaps
  } = useAnaliseCandidato();

  // 🆕 Hook de busca no Banco de Talentos (Match)
  const {
    matches,
    loading: loadingMatches,
    error: errorMatches,
    buscarParaVaga,
    criarCandidaturaDoMatch,
    carregarMatchesVaga
  } = useRaisaCVSearch();

  // 🆕 Estados para aba Banco de Talentos
  const [buscaBancoRealizada, setBuscaBancoRealizada] = useState(false);
  const [criandoCandidaturaMatch, setCriandoCandidaturaMatch] = useState<number | null>(null);
  const [filtroScoreMin, setFiltroScoreMin] = useState<number>(0);

  // Vaga selecionada
  const vagaSelecionada = vagas.find(v => v.id === vagaSelecionadaId);

  // Tipos de arquivo aceitos
  const tiposAceitos = '.pdf,.docx,.doc,.txt';

  // Pré-selecionar vaga se fornecida
  useEffect(() => {
    if (vagaPreSelecionada) {
      setVagaSelecionadaId(vagaPreSelecionada.id);
    }
  }, [vagaPreSelecionada]);

  // Reset ao abrir modal
  useEffect(() => {
    if (isOpen) {
      setEtapaModal('input');
      setTextoCV('');
      setObservacoes('');
      setArquivo(null);
      setUploadError(null);
      setUploadProgress(0);
      setBuscaBancoRealizada(false); // 🆕 Reset busca banco
      setFiltroScoreMin(0); // 🆕 Reset filtro
      // Reset campos de indicação
      setOrigem('aquisicao');
      setIndicadoPorNome('');
      setIndicadoPorCargo('');
      setIndicacaoObservacoes('');
      resetar();
    }
  }, [isOpen, resetar]);

  // ============================================
  // HANDLERS DE UPLOAD
  // ============================================

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadError(null);
    setArquivo(file);

    // Verificar tipo de arquivo
    const extensao = file.name.split('.').pop()?.toLowerCase();
    if (!['pdf', 'docx', 'doc', 'txt'].includes(extensao || '')) {
      setUploadError('Tipo de arquivo não suportado. Use PDF, DOCX ou TXT.');
      setArquivo(null);
      return;
    }

    // Verificar tamanho (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      setUploadError('Arquivo muito grande. Máximo 10MB.');
      setArquivo(null);
      return;
    }

    // Extrair texto do arquivo
    await extrairTextoDoArquivo(file);
  };

  const extrairTextoDoArquivo = async (file: File) => {
    const extensao = file.name.split('.').pop()?.toLowerCase();

    try {
      setExtraindoTexto(true);
      setUploadProgress(10);

      // Para TXT, extrair texto diretamente
      if (extensao === 'txt') {
        const texto = await file.text();
        setTextoCV(texto);
        setUploadProgress(100);
        setExtraindoTexto(false);
        return;
      }

      // Para PDF e DOCX, enviar para API Gemini
      setUploadProgress(30);
      
      const base64 = await fileToBase64(file);
      
      setUploadProgress(50);

      const response = await fetch('/api/gemini-cv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'extrair_texto',
          arquivo_base64: base64,
          arquivo_nome: file.name,
          arquivo_tipo: file.type
        })
      });

      setUploadProgress(80);

      if (!response.ok) {
        throw new Error('Erro ao extrair texto do arquivo');
      }

      const data = await response.json();
      setTextoCV(data.texto || '');
      setUploadProgress(100);

    } catch (err: any) {
      console.error('Erro na extração:', err);
      setUploadError('Erro ao extrair texto do arquivo. Tente colar o texto manualmente.');
    } finally {
      setExtraindoTexto(false);
    }
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const result = reader.result as string;
        const base64 = result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = error => reject(error);
    });
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    const file = e.dataTransfer.files?.[0];
    if (file) {
      // Simular o evento de change
      const fakeEvent = {
        target: { files: [file] }
      } as unknown as React.ChangeEvent<HTMLInputElement>;
      await handleFileChange(fakeEvent);
    }
  };

  // ============================================
  // HANDLERS PRINCIPAIS
  // ============================================

  const handleFechar = () => {
    resetar();
    onClose();
  };

  const handleAnalisarCV = async () => {
    if (!textoCV.trim()) {
      alert('Por favor, faça upload de um CV ou cole o texto');
      return;
    }

    setEtapaModal('analise');

    const resultado = await analisarCV(textoCV, vagaSelecionada);

    if (resultado) {
      setEtapaModal('resultado');
    }
  };

  const handleCriarCandidatura = async () => {
    if (!vagaSelecionada || !dadosExtraidos || !estado.pessoa_id) {
      alert('Dados incompletos para criar candidatura');
      return;
    }

    // Preparar dados de indicação
    const dadosIndicacao = origem === 'indicacao_cliente' ? {
      origem: 'indicacao_cliente' as const,
      indicado_por_nome: indicadoPorNome || undefined,
      indicado_por_cargo: indicadoPorCargo || undefined,
      indicacao_observacoes: indicacaoObservacoes || undefined
    } : {
      origem: 'aquisicao' as const
    };

    const candidatura = await criarCandidatura(
      vagaSelecionada.id,
      estado.pessoa_id,
      currentUserId,
      dadosExtraidos,
      textoCV,
      observacoes,
      dadosIndicacao
    );

    if (candidatura) {
      const tipoMsg = origem === 'indicacao_cliente' ? '📋 INDICAÇÃO' : '🔍 AQUISIÇÃO';
      alert(`✅ Candidatura criada com sucesso!\n${tipoMsg}\nCandidato: ${dadosExtraidos.nome}\nVaga: ${vagaSelecionada.titulo}`);
      
      if (onCandidaturaCriada) {
        onCandidaturaCriada(parseInt(candidatura.id));
      }
      
      handleFechar();
    }
  };

  const handleNovaAnalise = () => {
    setEtapaModal('input');
    setTextoCV('');
    setArquivo(null);
    setUploadProgress(0);
    resetar();
  };

  // ============================================
  // RENDER: NÃO ABERTO
  // ============================================

  if (!isOpen) return null;

  // ============================================
  // RENDER: MODAL
  // ============================================

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[95vh] overflow-hidden flex flex-col">
        
        {/* ============================================ */}
        {/* HEADER */}
        {/* ============================================ */}
        <div className="bg-gradient-to-r from-orange-500 to-red-500 text-white p-6">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-2xl font-bold flex items-center gap-2">
                ➕ Nova Candidatura
              </h2>
              <p className="text-orange-100 text-sm mt-1">
                Importe um CV, analise com IA e crie a candidatura
              </p>
            </div>
            <button 
              onClick={handleFechar}
              className="text-white hover:text-orange-200 text-3xl leading-none p-2"
            >
              <X className="w-8 h-8" />
            </button>
          </div>
        </div>

        {/* ============================================ */}
        {/* BARRA DE PROGRESSO */}
        {/* ============================================ */}
        {(loading || extraindoTexto) && (
          <div className="bg-orange-50 border-b border-orange-200 px-6 py-3">
            <div className="flex items-center gap-3">
              <Loader2 className="w-5 h-5 text-orange-600 animate-spin" />
              <span className="text-orange-800 font-medium">
                {extraindoTexto ? 'Extraindo texto do arquivo...' : estado.mensagem}
              </span>
            </div>
            <div className="mt-2 h-2 bg-orange-200 rounded-full overflow-hidden">
              <div 
                className="h-full bg-orange-500 transition-all duration-500"
                style={{ width: `${extraindoTexto ? uploadProgress : estado.progresso}%` }}
              />
            </div>
          </div>
        )}

        {/* ============================================ */}
        {/* ABAS (apenas na etapa input) */}
        {/* ============================================ */}
        {etapaModal === 'input' && (
          <div className="bg-gray-100 p-4 flex gap-2">
            <button 
              onClick={() => setAbaAtiva('importar')}
              className={`px-6 py-3 rounded-xl font-medium transition-all flex items-center gap-2 ${
                abaAtiva === 'importar' 
                  ? 'bg-gradient-to-r from-orange-500 to-red-500 text-white shadow-lg' 
                  : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              <Upload className="w-5 h-5" /> Importar CV
            </button>
            <button 
              onClick={() => setAbaAtiva('banco')}
              className={`px-6 py-3 rounded-xl font-medium transition-all flex items-center gap-2 ${
                abaAtiva === 'banco' 
                  ? 'bg-gradient-to-r from-orange-500 to-red-500 text-white shadow-lg' 
                  : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              <Search className="w-5 h-5" /> Banco de Talentos
            </button>
            <button 
              onClick={() => setAbaAtiva('sugestoes')}
              className={`px-6 py-3 rounded-xl font-medium transition-all flex items-center gap-2 ${
                abaAtiva === 'sugestoes' 
                  ? 'bg-gradient-to-r from-orange-500 to-red-500 text-white shadow-lg' 
                  : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              <Sparkles className="w-5 h-5" /> Sugestões IA
            </button>
          </div>
        )}

        {/* ============================================ */}
        {/* CONTEÚDO */}
        {/* ============================================ */}
        <div className="flex-1 overflow-y-auto p-6">
          
          {/* ETAPA: INPUT */}
          {etapaModal === 'input' && (
            <>
              {/* Seleção de Vaga */}
              <div className="mb-6">
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  📁 Selecionar Vaga {!vagaSelecionadaId && <span className="text-orange-500">(opcional para análise geral)</span>}
                </label>
                <select 
                  value={vagaSelecionadaId}
                  onChange={e => setVagaSelecionadaId(e.target.value)}
                  className="w-full border-2 border-gray-200 rounded-xl p-3 focus:border-orange-500 focus:ring-2 focus:ring-orange-200"
                >
                  <option value="">Selecione uma vaga para análise de compatibilidade...</option>
                  {vagas.filter(v => v.status === 'aberta').map(v => (
                    <option key={v.id} value={v.id}>
                      {v.titulo} - {v.senioridade} 
                      {v.stack_tecnologica && ` (${Array.isArray(v.stack_tecnologica) ? v.stack_tecnologica.slice(0, 3).join(', ') : v.stack_tecnologica})`}
                    </option>
                  ))}
                </select>
              </div>

              {/* ABA: IMPORTAR CV */}
              {abaAtiva === 'importar' && (
                <div className="space-y-4">
                  {/* Toggle Upload/Texto */}
                  <div className="flex gap-2 mb-4">
                    <button
                      onClick={() => setModoInput('upload')}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                        modoInput === 'upload' 
                          ? 'bg-orange-100 text-orange-700' 
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      📤 Upload Arquivo
                    </button>
                    <button
                      onClick={() => setModoInput('texto')}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                        modoInput === 'texto' 
                          ? 'bg-orange-100 text-orange-700' 
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      📝 Colar Texto
                    </button>
                  </div>

                  {/* Área de Upload */}
                  {modoInput === 'upload' && (
                    <div>
                      <div
                        onClick={() => fileInputRef.current?.click()}
                        onDragOver={handleDragOver}
                        onDrop={handleDrop}
                        className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
                          arquivo 
                            ? 'border-green-400 bg-green-50' 
                            : 'border-gray-300 hover:border-orange-400 bg-gray-50 hover:bg-orange-50'
                        }`}
                      >
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept={tiposAceitos}
                          onChange={handleFileChange}
                          className="hidden"
                        />
                        
                        {arquivo ? (
                          <div>
                            <File className="w-12 h-12 text-green-500 mx-auto mb-3" />
                            <p className="text-green-700 font-medium">{arquivo.name}</p>
                            <p className="text-sm text-green-600 mt-1">
                              {(arquivo.size / 1024).toFixed(1)} KB
                            </p>
                            {uploadProgress === 100 && (
                              <p className="text-green-600 text-sm mt-2 flex items-center justify-center gap-1">
                                <CheckCircle className="w-4 h-4" /> Texto extraído com sucesso!
                              </p>
                            )}
                          </div>
                        ) : (
                          <div>
                            <Upload className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                            <p className="text-gray-600 font-medium mb-1">
                              Arraste o CV aqui ou clique para selecionar
                            </p>
                            <p className="text-gray-400 text-sm">
                              PDF, DOCX, TXT (máx. 10MB)
                            </p>
                          </div>
                        )}
                      </div>

                      {uploadError && (
                        <div className="mt-3 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-center gap-2">
                          <XCircle className="w-5 h-5" />
                          {uploadError}
                        </div>
                      )}

                      {/* Preview do texto extraído */}
                      {textoCV && modoInput === 'upload' && (
                        <div className="mt-4">
                          <label className="block text-sm font-semibold text-gray-700 mb-2">
                            📄 Texto extraído ({textoCV.length} caracteres):
                          </label>
                          <div className="border rounded-lg p-4 bg-gray-50 max-h-48 overflow-y-auto">
                            <pre className="whitespace-pre-wrap text-sm text-gray-700 font-mono">
                              {textoCV.substring(0, 1500)}
                              {textoCV.length > 1500 && '...'}
                            </pre>
                          </div>
                          <p className="text-xs text-gray-500 mt-2">
                            Você pode editar o texto antes de analisar
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Área de Texto */}
                  {modoInput === 'texto' && (
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">
                        📄 Cole o texto do currículo:
                      </label>
                      <textarea
                        value={textoCV}
                        onChange={e => setTextoCV(e.target.value)}
                        placeholder="Cole aqui o conteúdo do currículo do candidato...

Exemplo:
Nome: João da Silva
Email: joao@email.com
Telefone: (11) 99999-9999

EXPERIÊNCIA PROFISSIONAL
- Empresa X (2020 - Atual): Desenvolvedor Full Stack
  - React, Node.js, PostgreSQL
  
FORMAÇÃO
- Bacharelado em Ciência da Computação - USP (2018)

HABILIDADES
- JavaScript, TypeScript, React, Node.js, PostgreSQL, Docker"
                        className="w-full h-64 border-2 border-gray-200 rounded-xl p-4 focus:border-orange-500 focus:ring-2 focus:ring-orange-200 font-mono text-sm resize-none"
                      />
                      <p className="text-xs text-gray-500 mt-2">
                        {textoCV.length} caracteres | Mínimo recomendado: 200 caracteres
                      </p>
                    </div>
                  )}

                  {/* Botão Analisar */}
                  <div className="mt-6 text-center">
                    <button
                      onClick={handleAnalisarCV}
                      disabled={loading || extraindoTexto || textoCV.length < 100}
                      className="bg-gradient-to-r from-orange-500 to-red-500 text-white px-8 py-3 rounded-xl font-semibold hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 mx-auto"
                    >
                      {loading ? (
                        <>
                          <Loader2 className="w-5 h-5 animate-spin" />
                          Analisando...
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-5 h-5" />
                          Analisar CV com IA
                        </>
                      )}
                    </button>
                    {textoCV.length > 0 && textoCV.length < 100 && (
                      <p className="text-xs text-orange-600 mt-2">
                        Adicione mais detalhes ao currículo (mínimo 100 caracteres)
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* ABA: BANCO DE TALENTOS */}
              {abaAtiva === 'banco' && (
                <div className="space-y-4">
                  {/* Se não tem vaga selecionada */}
                  {!vagaSelecionadaId && (
                    <div className="text-center py-12">
                      <Search className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                      <p className="text-gray-500 text-lg">Selecione uma Vaga</p>
                      <p className="text-sm text-gray-400 mt-2">
                        Escolha uma vaga no dropdown acima para buscar candidatos compatíveis
                      </p>
                    </div>
                  )}

                  {/* Se tem vaga, mostrar busca */}
                  {vagaSelecionadaId && (
                    <>
                      {/* Toolbar de busca */}
                      <div className="flex items-center justify-between bg-gray-50 p-3 rounded-lg">
                        <div className="flex items-center gap-3">
                          <button
                            onClick={async () => {
                              if (vagaSelecionada) {
                                setBuscaBancoRealizada(false);
                                await buscarParaVaga(vagaSelecionada);
                                setBuscaBancoRealizada(true);
                              }
                            }}
                            disabled={loadingMatches}
                            className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition"
                          >
                            {loadingMatches ? (
                              <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Buscando...
                              </>
                            ) : (
                              <>
                                <Search className="w-4 h-4" />
                                Buscar Candidatos
                              </>
                            )}
                          </button>

                          <div className="flex items-center gap-2">
                            <span className="text-sm text-gray-600">Score mín:</span>
                            <input
                              type="number"
                              value={filtroScoreMin}
                              onChange={e => setFiltroScoreMin(parseInt(e.target.value) || 0)}
                              min={0}
                              max={100}
                              className="border rounded px-2 py-1 w-16 text-center text-sm"
                            />
                          </div>
                        </div>

                        {buscaBancoRealizada && (
                          <span className="text-sm text-gray-500">
                            {matches.filter(m => m.score_total >= filtroScoreMin).length} candidato(s) encontrado(s)
                          </span>
                        )}
                      </div>

                      {/* Loading */}
                      {loadingMatches && !buscaBancoRealizada && (
                        <div className="text-center py-12">
                          <Loader2 className="w-12 h-12 text-blue-500 mx-auto mb-4 animate-spin" />
                          <p className="text-gray-600">Buscando candidatos compatíveis...</p>
                          <p className="text-sm text-gray-400">Analisando banco de talentos</p>
                        </div>
                      )}

                      {/* Erro */}
                      {errorMatches && (
                        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                          <p className="text-red-800">❌ {errorMatches}</p>
                        </div>
                      )}

                      {/* Sem resultados */}
                      {buscaBancoRealizada && matches.length === 0 && (
                        <div className="text-center py-12">
                          <span className="text-6xl">🔍</span>
                          <p className="mt-4 text-gray-600 text-lg">Nenhum candidato encontrado</p>
                          <p className="text-sm text-gray-400">
                            Adicione mais pessoas ao banco de talentos ou ajuste a vaga
                          </p>
                        </div>
                      )}

                      {/* Lista de Matches */}
                      {matches.filter(m => m.score_total >= filtroScoreMin).length > 0 && (
                        <div className="space-y-3 max-h-[400px] overflow-y-auto">
                          {matches
                            .filter(m => m.score_total >= filtroScoreMin)
                            .map((match, index) => (
                              <div
                                key={match.pessoa_id}
                                className={`border rounded-lg p-4 hover:shadow-md transition-shadow bg-white ${
                                  match.status === 'candidatura_criada' ? 'opacity-60' : ''
                                }`}
                              >
                                <div className="flex items-start gap-4">
                                  {/* Ranking */}
                                  <div className="text-center min-w-[40px]">
                                    <div className={`text-xl font-bold ${
                                      index === 0 ? 'text-yellow-500' :
                                      index === 1 ? 'text-gray-400' :
                                      index === 2 ? 'text-orange-400' :
                                      'text-gray-500'
                                    }`}>
                                      {index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `#${index + 1}`}
                                    </div>
                                  </div>

                                  {/* Score */}
                                  <div className="text-center min-w-[70px]">
                                    <div className={`text-2xl font-bold px-2 py-1 rounded ${
                                      match.score_total >= 80 ? 'text-green-600 bg-green-100' :
                                      match.score_total >= 60 ? 'text-yellow-600 bg-yellow-100' :
                                      match.score_total >= 40 ? 'text-orange-600 bg-orange-100' :
                                      'text-red-600 bg-red-100'
                                    }`}>
                                      {match.score_total}%
                                    </div>
                                    <span className="text-xs text-gray-500">Score</span>
                                  </div>

                                  {/* Info */}
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-1">
                                      <h4 className="font-bold text-gray-900 truncate">{match.nome}</h4>
                                      {match.status === 'candidatura_criada' && (
                                        <span className="bg-purple-100 text-purple-800 px-2 py-0.5 rounded text-xs">
                                          ✓ Candidatura criada
                                        </span>
                                      )}
                                    </div>
                                    
                                    <p className="text-sm text-gray-600 mb-2">
                                      {match.titulo_profissional} | {match.senioridade}
                                    </p>

                                    <div className="flex flex-wrap gap-2 text-xs text-gray-500 mb-2">
                                      <span>📧 {match.email}</span>
                                      {match.telefone && <span>📱 {match.telefone}</span>}
                                    </div>

                                    {/* Skills Match */}
                                    <div className="space-y-1">
                                      {match.skills_match.length > 0 && (
                                        <div className="flex flex-wrap gap-1">
                                          <span className="text-xs text-green-700 font-medium">✅</span>
                                          {match.skills_match.slice(0, 5).map((skill, i) => (
                                            <span key={i} className="bg-green-100 text-green-800 px-1.5 py-0.5 rounded text-xs">
                                              {skill}
                                            </span>
                                          ))}
                                          {match.skills_match.length > 5 && (
                                            <span className="text-xs text-green-600">+{match.skills_match.length - 5}</span>
                                          )}
                                        </div>
                                      )}
                                      
                                      {match.skills_faltantes.length > 0 && (
                                        <div className="flex flex-wrap gap-1">
                                          <span className="text-xs text-red-700 font-medium">⚠️</span>
                                          {match.skills_faltantes.slice(0, 3).map((skill, i) => (
                                            <span key={i} className="bg-red-100 text-red-800 px-1.5 py-0.5 rounded text-xs">
                                              {skill}
                                            </span>
                                          ))}
                                          {match.skills_faltantes.length > 3 && (
                                            <span className="text-xs text-red-600">+{match.skills_faltantes.length - 3}</span>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  </div>

                                  {/* Ação */}
                                  <div className="flex-shrink-0">
                                    {match.status !== 'candidatura_criada' ? (
                                      <button
                                        onClick={async () => {
                                          setCriandoCandidaturaMatch(match.pessoa_id);
                                          try {
                                            const candidaturaId = await criarCandidaturaDoMatch(
                                              parseInt(vagaSelecionadaId),
                                              match.pessoa_id,
                                              currentUserId
                                            );
                                            if (candidaturaId && onCandidaturaCriada) {
                                              onCandidaturaCriada(candidaturaId);
                                            }
                                          } finally {
                                            setCriandoCandidaturaMatch(null);
                                          }
                                        }}
                                        disabled={criandoCandidaturaMatch === match.pessoa_id}
                                        className="bg-green-600 text-white px-3 py-1.5 rounded text-sm hover:bg-green-700 disabled:opacity-50 flex items-center gap-1"
                                      >
                                        {criandoCandidaturaMatch === match.pessoa_id ? (
                                          <>
                                            <Loader2 className="w-3 h-3 animate-spin" />
                                            Criando...
                                          </>
                                        ) : (
                                          <>➕ Candidatura</>
                                        )}
                                      </button>
                                    ) : (
                                      <span className="text-purple-600 text-sm font-medium">
                                        ✓ Criada
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* ABA: SUGESTÕES IA */}
              {abaAtiva === 'sugestoes' && (
                <div className="space-y-4">
                  {/* Se não tem vaga selecionada */}
                  {!vagaSelecionadaId && (
                    <div className="text-center py-12">
                      <Sparkles className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                      <p className="text-gray-500 text-lg">Selecione uma Vaga</p>
                      <p className="text-sm text-gray-400 mt-2">
                        Escolha uma vaga no dropdown acima para receber sugestões da IA
                      </p>
                    </div>
                  )}

                  {/* Se tem vaga */}
                  {vagaSelecionadaId && (
                    <div className="text-center py-12">
                      <Sparkles className="w-16 h-16 text-purple-300 mx-auto mb-4" />
                      <p className="text-gray-600 text-lg mb-2">Sugestões Inteligentes</p>
                      <p className="text-sm text-gray-400 mb-4">
                        Use a aba "Banco de Talentos" para buscar candidatos compatíveis com a vaga
                      </p>
                      <button 
                        className="bg-purple-500 text-white px-6 py-2 rounded-lg hover:bg-purple-600 transition"
                        onClick={() => setAbaAtiva('banco')}
                      >
                        🔍 Ir para Busca
                      </button>
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {/* ETAPA: ANÁLISE EM PROGRESSO */}
          {etapaModal === 'analise' && (
            <div className="text-center py-12">
              <Loader2 className="w-16 h-16 text-orange-500 mx-auto mb-6 animate-spin" />
              <h3 className="text-xl font-semibold text-gray-800 mb-2">{estado.mensagem}</h3>
              <p className="text-gray-500">Aguarde enquanto a IA analisa o currículo...</p>
            </div>
          )}

          {/* ETAPA: RESULTADO */}
          {etapaModal === 'resultado' && dadosExtraidos && (
            <div className="space-y-6">
              
              {/* Card de Dados Extraídos */}
              <div className="bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-xl p-6">
                <div className="flex items-start gap-4">
                  <div className="w-16 h-16 bg-green-500 rounded-full flex items-center justify-center text-white text-2xl font-bold">
                    {dadosExtraidos.nome.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1">
                    <h3 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                      {dadosExtraidos.nome}
                      {estado.cpf_existente && (
                        <span className="bg-blue-100 text-blue-700 text-xs px-2 py-1 rounded-full">
                          Atualizado
                        </span>
                      )}
                      {!estado.cpf_existente && (
                        <span className="bg-green-100 text-green-700 text-xs px-2 py-1 rounded-full">
                          Novo no Banco
                        </span>
                      )}
                    </h3>
                    <p className="text-gray-600">{dadosExtraidos.titulo_profissional} | {dadosExtraidos.senioridade}</p>
                    
                    <div className="grid grid-cols-2 gap-4 mt-4 text-sm">
                      <div className="flex items-center gap-2 text-gray-600">
                        <Mail className="w-4 h-4" />
                        {dadosExtraidos.email || 'Não informado'}
                      </div>
                      <div className="flex items-center gap-2 text-gray-600">
                        <Phone className="w-4 h-4" />
                        {dadosExtraidos.telefone || 'Não informado'}
                      </div>
                      <div className="flex items-center gap-2 text-gray-600">
                        <Briefcase className="w-4 h-4" />
                        {dadosExtraidos.disponibilidade || 'A combinar'}
                      </div>
                      <div className="flex items-center gap-2 text-gray-600">
                        <MapPin className="w-4 h-4" />
                        {dadosExtraidos.cidade && dadosExtraidos.estado 
                          ? `${dadosExtraidos.cidade}/${dadosExtraidos.estado}` 
                          : 'Não informado'}
                      </div>
                    </div>

                    {/* Skills */}
                    {dadosExtraidos.skills && dadosExtraidos.skills.length > 0 && (
                      <div className="mt-4">
                        <p className="text-xs text-gray-500 mb-2">Skills detectadas:</p>
                        <div className="flex flex-wrap gap-1">
                          {dadosExtraidos.skills.slice(0, 10).map((skill, i) => (
                            <span key={i} className="bg-white text-gray-700 px-2 py-1 rounded text-xs border">
                              {skill.nome}
                            </span>
                          ))}
                          {dadosExtraidos.skills.length > 10 && (
                            <span className="text-gray-500 text-xs">
                              +{dadosExtraidos.skills.length - 10} mais
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Score de Compatibilidade */}
              {scoreCompatibilidade && vagaSelecionada && (
                <div className="bg-white border rounded-xl p-6">
                  <h4 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
                    📊 Compatibilidade com: {vagaSelecionada.titulo}
                  </h4>
                  <ScoreCard
                    score={scoreCompatibilidade.score_total}
                    skillsMatch={scoreCompatibilidade.skills_match}
                    skillsFaltantes={scoreCompatibilidade.skills_faltantes}
                    skillsExtras={scoreCompatibilidade.skills_extras}
                    justificativa={scoreCompatibilidade.justificativa}
                    recomendacao={scoreCompatibilidade.recomendacao}
                    detalhes={{
                      skills: scoreCompatibilidade.score_skills,
                      experiencia: scoreCompatibilidade.score_experiencia,
                      senioridade: scoreCompatibilidade.score_senioridade,
                      salario: scoreCompatibilidade.score_salario
                    }}
                  />
                </div>
              )}

              {/* Análise de GAPs */}
              {analiseGaps && (
                <AnaliseGapsCard
                  analiseGaps={analiseGaps}
                  candidatoNome={dadosExtraidos.nome}
                />
              )}

              {/* ORIGEM DO CANDIDATO (NOVO) */}
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                <label className="block text-sm font-semibold text-gray-700 mb-3">
                  🎯 Origem do Candidato
                </label>
                <div className="flex flex-wrap gap-3">
                  <label className={`flex items-center px-4 py-2 rounded-lg cursor-pointer transition-all ${
                    origem === 'aquisicao' 
                      ? 'bg-blue-100 border-2 border-blue-500 text-blue-700' 
                      : 'bg-white border-2 border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}>
                    <input
                      type="radio"
                      name="origem"
                      value="aquisicao"
                      checked={origem === 'aquisicao'}
                      onChange={() => setOrigem('aquisicao')}
                      className="sr-only"
                    />
                    <Search className="w-4 h-4 mr-2" />
                    <span className="text-sm font-medium">Aquisição Própria</span>
                  </label>
                  <label className={`flex items-center px-4 py-2 rounded-lg cursor-pointer transition-all ${
                    origem === 'indicacao_cliente' 
                      ? 'bg-amber-100 border-2 border-amber-500 text-amber-700' 
                      : 'bg-white border-2 border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}>
                    <input
                      type="radio"
                      name="origem"
                      value="indicacao_cliente"
                      checked={origem === 'indicacao_cliente'}
                      onChange={() => setOrigem('indicacao_cliente')}
                      className="sr-only"
                    />
                    <User className="w-4 h-4 mr-2" />
                    <span className="text-sm font-medium">Indicação do Cliente</span>
                  </label>
                </div>

                {/* Campos de Indicação (exibe apenas se indicação) */}
                {origem === 'indicacao_cliente' && (
                  <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-lg">
                    <h4 className="text-sm font-semibold text-amber-800 mb-3 flex items-center gap-2">
                      <User className="w-4 h-4" />
                      Dados da Indicação
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">Indicado por (nome)</label>
                        <input
                          type="text"
                          value={indicadoPorNome}
                          onChange={e => setIndicadoPorNome(e.target.value)}
                          placeholder="Nome de quem indicou"
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">Cargo de quem indicou</label>
                        <input
                          type="text"
                          value={indicadoPorCargo}
                          onChange={e => setIndicadoPorCargo(e.target.value)}
                          placeholder="Ex: Gerente de TI"
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                        />
                      </div>
                    </div>
                    <div className="mt-3">
                      <label className="block text-xs text-gray-600 mb-1">Observações da indicação</label>
                      <textarea
                        value={indicacaoObservacoes}
                        onChange={e => setIndicacaoObservacoes(e.target.value)}
                        placeholder="Contexto da indicação, relacionamento com o candidato..."
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm h-16"
                      />
                    </div>
                    <div className="mt-3 p-2 bg-amber-100 rounded text-xs text-amber-700">
                      ⚠️ Candidatos indicados <strong>não contam</strong> na performance do analista e podem ser aprovados diretamente.
                    </div>
                  </div>
                )}
              </div>

              {/* Observações */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  📝 Observações (opcional):
                </label>
                <textarea
                  value={observacoes}
                  onChange={e => setObservacoes(e.target.value)}
                  placeholder="Adicione observações sobre este candidato..."
                  className="w-full h-24 border rounded-xl p-3 text-sm"
                />
              </div>

              {/* Mensagem de Salvamento Automático */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800">
                <CheckCircle className="w-5 h-5 inline mr-2" />
                <strong>Banco de Talentos:</strong> {estado.pessoa_atualizada 
                  ? 'Dados do candidato foram ATUALIZADOS automaticamente.' 
                  : 'Candidato foi ADICIONADO ao banco de talentos.'}
              </div>
            </div>
          )}

          {/* ERRO */}
          {estado.etapa === 'erro' && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
              <XCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-red-800 mb-2">Erro na Análise</h3>
              <p className="text-red-600">{estado.erro || error}</p>
              <button
                onClick={handleNovaAnalise}
                className="mt-4 bg-red-500 text-white px-6 py-2 rounded-lg hover:bg-red-600"
              >
                Tentar Novamente
              </button>
            </div>
          )}
        </div>

        {/* ============================================ */}
        {/* FOOTER */}
        {/* ============================================ */}
        <div className="border-t bg-gray-50 px-6 py-4 flex justify-between items-center">
          <button
            onClick={handleFechar}
            className="text-gray-600 hover:text-gray-800 px-6 py-2"
          >
            Cancelar
          </button>
          
          <div className="flex gap-3">
            {etapaModal === 'resultado' && (
              <>
                <button
                  onClick={handleNovaAnalise}
                  className="bg-gray-200 text-gray-700 px-6 py-2 rounded-xl hover:bg-gray-300 transition"
                >
                  🔄 Nova Análise
                </button>
                
                {vagaSelecionada && (
                  <button
                    onClick={handleCriarCandidatura}
                    disabled={loading}
                    className="bg-gradient-to-r from-green-500 to-emerald-500 text-white px-6 py-2 rounded-xl hover:shadow-lg transition font-semibold flex items-center gap-2 disabled:opacity-50"
                  >
                    <CheckCircle className="w-5 h-5" />
                    Criar Candidatura
                  </button>
                )}
                
                {!vagaSelecionada && (
                  <span className="text-gray-500 text-sm py-2">
                    ✅ Candidato salvo no Banco de Talentos
                  </span>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default NovaCandidaturaModal;
