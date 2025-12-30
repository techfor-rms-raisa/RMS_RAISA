/**
 * NovaCandidaturaModal.tsx - Modal de Nova Candidatura
 * 
 * Modal completo para:
 * - Importar CV (upload ou colar texto)
 * - Selecionar Vaga
 * - Análise automática via IA
 * - Exibição de Score e GAPs
 * - Salvamento automático no Banco de Talentos
 * - Criação de Candidatura
 * 
 * Versão: 1.0
 * Data: 30/12/2025
 */

import React, { useState, useEffect, useCallback } from 'react';
import { 
  X, Upload, FileText, Search, Sparkles, 
  CheckCircle, XCircle, AlertTriangle, Loader2,
  User, Mail, Phone, Briefcase, MapPin
} from 'lucide-react';
import { Vaga } from '@/types';
import { useAnaliseCandidato, EtapaAnalise } from '@/hooks/supabase/useAnaliseCandidato';
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
  const [modoInput, setModoInput] = useState<ModoInput>('texto');
  const [textoCV, setTextoCV] = useState('');
  const [vagaSelecionadaId, setVagaSelecionadaId] = useState<string>('');
  const [observacoes, setObservacoes] = useState('');
  const [etapaModal, setEtapaModal] = useState<'input' | 'analise' | 'resultado'>('input');

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

  // Vaga selecionada
  const vagaSelecionada = vagas.find(v => v.id === vagaSelecionadaId);

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
      resetar();
    }
  }, [isOpen, resetar]);

  // ============================================
  // HANDLERS
  // ============================================

  const handleFechar = () => {
    resetar();
    onClose();
  };

  const handleAnalisarCV = async () => {
    if (!textoCV.trim()) {
      alert('Por favor, cole o texto do currículo');
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

    const candidatura = await criarCandidatura(
      vagaSelecionada.id,
      estado.pessoa_id,
      currentUserId,
      dadosExtraidos,
      textoCV,
      observacoes
    );

    if (candidatura) {
      alert(`✅ Candidatura criada com sucesso!\nCandidato: ${dadosExtraidos.nome}\nVaga: ${vagaSelecionada.titulo}`);
      
      if (onCandidaturaCriada) {
        onCandidaturaCriada(parseInt(candidatura.id));
      }
      
      handleFechar();
    }
  };

  const handleNovaAnalise = () => {
    setEtapaModal('input');
    setTextoCV('');
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
        {loading && (
          <div className="bg-orange-50 border-b border-orange-200 px-6 py-3">
            <div className="flex items-center gap-3">
              <Loader2 className="w-5 h-5 text-orange-600 animate-spin" />
              <span className="text-orange-800 font-medium">{estado.mensagem}</span>
            </div>
            <div className="mt-2 h-2 bg-orange-200 rounded-full overflow-hidden">
              <div 
                className="h-full bg-orange-500 transition-all duration-500"
                style={{ width: `${estado.progresso}%` }}
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
                      onClick={() => setModoInput('texto')}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                        modoInput === 'texto' 
                          ? 'bg-orange-100 text-orange-700' 
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      📝 Colar Texto
                    </button>
                    <button
                      onClick={() => setModoInput('upload')}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                        modoInput === 'upload' 
                          ? 'bg-orange-100 text-orange-700' 
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      📤 Upload PDF (em breve)
                    </button>
                  </div>

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

                  {/* Upload (desabilitado por enquanto) */}
                  {modoInput === 'upload' && (
                    <div className="border-2 border-dashed border-gray-300 rounded-xl p-12 text-center bg-gray-50">
                      <Upload className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                      <p className="text-gray-500">Upload de PDF em desenvolvimento...</p>
                      <p className="text-sm text-gray-400 mt-2">Por enquanto, copie e cole o texto do currículo</p>
                    </div>
                  )}

                  {/* Botão Analisar */}
                  <div className="mt-6 text-center">
                    <button
                      onClick={handleAnalisarCV}
                      disabled={loading || textoCV.length < 100}
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
                <div className="text-center py-12">
                  <Search className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                  <p className="text-gray-500 text-lg">Busca no Banco de Talentos</p>
                  <p className="text-sm text-gray-400 mt-2">
                    Selecione uma vaga acima para buscar candidatos compatíveis
                  </p>
                  <button 
                    className="mt-4 bg-blue-500 text-white px-6 py-2 rounded-lg hover:bg-blue-600 transition"
                    onClick={() => alert('Funcionalidade em desenvolvimento')}
                  >
                    🔍 Buscar Candidatos
                  </button>
                </div>
              )}

              {/* ABA: SUGESTÕES IA */}
              {abaAtiva === 'sugestoes' && (
                <div className="text-center py-12">
                  <Sparkles className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                  <p className="text-gray-500 text-lg">Sugestões Automáticas da IA</p>
                  <p className="text-sm text-gray-400 mt-2">
                    A IA buscará os melhores candidatos do banco para a vaga selecionada
                  </p>
                  <button 
                    className="mt-4 bg-purple-500 text-white px-6 py-2 rounded-lg hover:bg-purple-600 transition"
                    onClick={() => alert('Funcionalidade em desenvolvimento')}
                    disabled={!vagaSelecionadaId}
                  >
                    🤖 Buscar Sugestões
                  </button>
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
