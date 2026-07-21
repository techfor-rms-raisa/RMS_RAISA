/**
 * RanqueamentoPage.tsx - Dashboard de Ranqueamento de Candidatos (RAISA)
 *
 * Caminho: src/components/raisa/RanqueamentoPage.tsx
 *
 * Layout mestre-detalhe:
 *   - Esquerda: lista de Vagas (busca + contador de candidatos)
 *   - Direita:  ranking da vaga selecionada, em DOIS blocos:
 *       (1) Ranqueados     -> candidatos com entrevista concluída,
 *                             ordenados pelo Score de Ranqueamento
 *                             (0.30 CV + 0.50 Técnico + 0.20 Comunicação)
 *       (2) Pré-ranking     -> candidatos ainda sem entrevista,
 *                             ordenados só pelo Score do CV
 *
 * Visão COMPLETA para qualquer perfil RAISA (todos os candidatos da
 * vaga, independe do analista que inseriu) — decisão de 21/07/2026.
 *
 * Reaproveita o componente visual ScoreCompatibilidadeCircle.
 *
 * Versão: 1.0
 * Data: 21/07/2026
 */

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  Trophy, Search, Briefcase, User, Award, AlertTriangle,
  Loader2, ChevronRight, CheckCircle, XCircle, HelpCircle,
  ClipboardList, Mic
} from 'lucide-react';
import { Vaga, Candidatura } from '@/types';
import { useRanqueamento, CandidatoRanqueado } from '@/hooks/supabase/useRanqueamento';
// ⚠️ Verifique este caminho: ScoreCompatibilidadeCircle deve estar na pasta raisa.
import ScoreCompatibilidadeCircle from './ScoreCompatibilidadeCircle';

// ============================================
// PROPS
// ============================================

interface RanqueamentoPageProps {
  vagas: Vaga[];
  candidaturas: Candidatura[];
  currentUserId?: number;
}

// ============================================
// HELPERS VISUAIS
// ============================================

const medalha = (posicao: number): string => {
  if (posicao === 1) return '🥇';
  if (posicao === 2) return '🥈';
  if (posicao === 3) return '🥉';
  return `${posicao}º`;
};

const DecisaoBadge: React.FC<{ decisao: string | null }> = ({ decisao }) => {
  if (!decisao) {
    return (
      <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
        <HelpCircle className="w-3 h-3" /> Sem decisão
      </span>
    );
  }
  const d = decisao.toUpperCase();
  if (d.includes('APROV')) {
    return (
      <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700">
        <CheckCircle className="w-3 h-3" /> Aprovado
      </span>
    );
  }
  if (d.includes('REPROV')) {
    return (
      <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700">
        <XCircle className="w-3 h-3" /> Reprovado
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700">
      <AlertTriangle className="w-3 h-3" /> {decisao}
    </span>
  );
};

const MiniScore: React.FC<{ label: string; valor: number | null }> = ({ label, valor }) => (
  <div className="flex flex-col items-center px-2">
    <span className="text-[10px] uppercase tracking-wide text-gray-400">{label}</span>
    <span className="text-sm font-semibold text-gray-700">
      {valor === null || valor === undefined ? '—' : `${valor}%`}
    </span>
  </div>
);

// ============================================
// LINHA DO RANKING
// ============================================

const LinhaRanking: React.FC<{
  candidato: CandidatoRanqueado;
  posicao: number;
  modo: 'ranqueado' | 'pre';
}> = ({ candidato, posicao, modo }) => {
  const scoreExibido =
    modo === 'ranqueado'
      ? Math.round(candidato.score_ranking ?? 0)
      : candidato.score_cv;

  return (
    <div className="flex items-center gap-4 p-4 border-b last:border-b-0 hover:bg-gray-50 transition-colors">
      {/* Posição */}
      <div className="w-10 text-center text-lg font-bold text-gray-700 flex-shrink-0">
        {modo === 'ranqueado' ? medalha(posicao) : `${posicao}º`}
      </div>

      {/* Score circular */}
      <div className="flex-shrink-0">
        <ScoreCompatibilidadeCircle
          score={scoreExibido}
          tamanho="sm"
          mostrarLabel={false}
          animado={false}
        />
      </div>

      {/* Nome + status */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <User className="w-4 h-4 text-gray-400 flex-shrink-0" />
          <p className="font-semibold text-gray-900 truncate">{candidato.candidato_nome}</p>
        </div>
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          <span className="text-xs text-gray-500">{candidato.candidatura_status}</span>
          {modo === 'ranqueado' && <DecisaoBadge decisao={candidato.decisao_analista} />}
          {modo === 'pre' && (
            <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-600">
              <ClipboardList className="w-3 h-3" /> Só CV — sem entrevista
            </span>
          )}
        </div>
      </div>

      {/* Scores detalhados (apenas ranqueados) */}
      {modo === 'ranqueado' ? (
        <div className="flex items-center divide-x divide-gray-200 flex-shrink-0">
          <MiniScore label="CV" valor={candidato.score_cv} />
          <MiniScore label="Técnico" valor={candidato.score_tecnico} />
          <MiniScore label="Comunic." valor={candidato.score_comunicacao} />
        </div>
      ) : (
        <div className="flex items-center flex-shrink-0">
          <MiniScore label="CV" valor={candidato.score_cv} />
        </div>
      )}
    </div>
  );
};

// ============================================
// COMPONENTE PRINCIPAL
// ============================================

const RanqueamentoPage: React.FC<RanqueamentoPageProps> = ({
  vagas = [],
  candidaturas = [],
}) => {
  const [buscaVaga, setBuscaVaga] = useState('');
  const [vagaSelecionadaId, setVagaSelecionadaId] = useState<string | null>(null);

  const { ranking, loading, error, carregarRanking, limpar } = useRanqueamento();

  // Contagem de candidatos por vaga (para o badge da lista mestre)
  const contagemPorVaga = useMemo(() => {
    const mapa: Record<string, number> = {};
    candidaturas.forEach((c) => {
      const vid = String(c.vaga_id);
      mapa[vid] = (mapa[vid] || 0) + 1;
    });
    return mapa;
  }, [candidaturas]);

  // Vagas filtradas pela busca (só vagas que têm ao menos 1 candidato)
  const vagasFiltradas = useMemo(() => {
    const termo = buscaVaga.trim().toLowerCase();
    return vagas
      .filter((v) => (contagemPorVaga[String(v.id)] || 0) > 0)
      .filter((v) => (termo ? (v.titulo || '').toLowerCase().includes(termo) : true))
      .sort((a, b) => (contagemPorVaga[String(b.id)] || 0) - (contagemPorVaga[String(a.id)] || 0));
  }, [vagas, buscaVaga, contagemPorVaga]);

  const vagaSelecionada = useMemo(
    () => vagas.find((v) => String(v.id) === String(vagaSelecionadaId)),
    [vagas, vagaSelecionadaId]
  );

  // Separar ranking em dois blocos
  const ranqueados = useMemo(
    () => ranking.filter((c) => c.tem_entrevista),
    [ranking]
  );
  const preRanking = useMemo(
    () => ranking.filter((c) => !c.tem_entrevista),
    [ranking]
  );

  const selecionarVaga = useCallback(
    (vaga: Vaga) => {
      setVagaSelecionadaId(String(vaga.id));
      const idNum = parseInt(String(vaga.id), 10);
      carregarRanking(idNum);
    },
    [carregarRanking]
  );

  useEffect(() => {
    return () => limpar();
  }, [limpar]);

  return (
    <div className="bg-white rounded-xl shadow-lg p-6">
      {/* Título */}
      <div className="mb-6">
        <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
          <Trophy className="text-amber-500" />
          Ranqueamento de Candidatos
        </h2>
        <p className="text-sm text-gray-500">
          Selecione uma vaga para ver o posicionamento dos candidatos — CV + Entrevista Técnica, do melhor ao pior.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ============================ */}
        {/* MESTRE: LISTA DE VAGAS       */}
        {/* ============================ */}
        <div className="lg:col-span-1">
          <div className="relative mb-3">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={buscaVaga}
              onChange={(e) => setBuscaVaga(e.target.value)}
              placeholder="Buscar vaga..."
              className="w-full pl-9 pr-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="border rounded-lg divide-y max-h-[70vh] overflow-y-auto">
            {vagasFiltradas.length === 0 ? (
              <div className="p-6 text-center text-sm text-gray-400">
                Nenhuma vaga com candidatos.
              </div>
            ) : (
              vagasFiltradas.map((v) => {
                const ativa = String(v.id) === String(vagaSelecionadaId);
                return (
                  <button
                    key={v.id}
                    onClick={() => selecionarVaga(v)}
                    className={`w-full text-left p-3 flex items-center justify-between gap-2 transition-colors ${
                      ativa ? 'bg-blue-50' : 'hover:bg-gray-50'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Briefcase className={`w-4 h-4 flex-shrink-0 ${ativa ? 'text-blue-600' : 'text-gray-400'}`} />
                        <span className={`text-sm font-medium truncate ${ativa ? 'text-blue-700' : 'text-gray-800'}`}>
                          {v.titulo}
                        </span>
                      </div>
                      <span className="text-xs text-gray-400 ml-6">
                        {contagemPorVaga[String(v.id)] || 0} candidato(s)
                      </span>
                    </div>
                    <ChevronRight className={`w-4 h-4 flex-shrink-0 ${ativa ? 'text-blue-600' : 'text-gray-300'}`} />
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* ============================ */}
        {/* DETALHE: RANKING DA VAGA     */}
        {/* ============================ */}
        <div className="lg:col-span-2">
          {!vagaSelecionadaId ? (
            <div className="h-full min-h-[300px] flex flex-col items-center justify-center text-gray-400 border-2 border-dashed rounded-xl">
              <Trophy className="w-12 h-12 mb-3" />
              <p className="font-medium">Selecione uma vaga à esquerda</p>
              <p className="text-sm">O ranking dos candidatos aparecerá aqui.</p>
            </div>
          ) : loading ? (
            <div className="h-full min-h-[300px] flex flex-col items-center justify-center text-gray-500">
              <Loader2 className="w-8 h-8 animate-spin mb-3 text-blue-500" />
              <p className="text-sm">Calculando ranqueamento...</p>
            </div>
          ) : error ? (
            <div className="p-6 bg-red-50 border border-red-200 rounded-xl text-red-700 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" />
              <span className="text-sm">{error}</span>
            </div>
          ) : ranking.length === 0 ? (
            <div className="h-full min-h-[300px] flex flex-col items-center justify-center text-gray-400 border-2 border-dashed rounded-xl">
              <User className="w-12 h-12 mb-3" />
              <p className="font-medium">Nenhum candidato nesta vaga</p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Cabeçalho da vaga */}
              <div className="bg-gray-50 rounded-lg p-4">
                <h3 className="font-semibold text-gray-900">{vagaSelecionada?.titulo}</h3>
                <p className="text-xs text-gray-500 mt-1">
                  {ranking.length} candidato(s) • {ranqueados.length} entrevistado(s) • {preRanking.length} só CV
                </p>
              </div>

              {/* BLOCO 1: RANQUEADOS */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Award className="w-5 h-5 text-amber-500" />
                  <h4 className="font-semibold text-gray-800">
                    Ranqueados <span className="text-gray-400 font-normal">({ranqueados.length})</span>
                  </h4>
                  <span className="text-xs text-gray-400 ml-1">CV + entrevista técnica concluída</span>
                </div>
                {ranqueados.length === 0 ? (
                  <div className="p-4 text-sm text-gray-400 border rounded-lg flex items-center gap-2">
                    <Mic className="w-4 h-4" />
                    Ainda não há candidatos com entrevista técnica concluída nesta vaga.
                  </div>
                ) : (
                  <div className="border rounded-lg overflow-hidden">
                    {ranqueados.map((c, i) => (
                      <LinhaRanking
                        key={c.candidatura_id}
                        candidato={c}
                        posicao={i + 1}
                        modo="ranqueado"
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* BLOCO 2: PRÉ-RANKING (SÓ CV) */}
              {preRanking.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <ClipboardList className="w-5 h-5 text-blue-500" />
                    <h4 className="font-semibold text-gray-800">
                      Pré-ranking <span className="text-gray-400 font-normal">({preRanking.length})</span>
                    </h4>
                    <span className="text-xs text-gray-400 ml-1">só CV — aguardando entrevista técnica</span>
                  </div>
                  <div className="border rounded-lg overflow-hidden opacity-90">
                    {preRanking.map((c, i) => (
                      <LinhaRanking
                        key={c.candidatura_id}
                        candidato={c}
                        posicao={i + 1}
                        modo="pre"
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default RanqueamentoPage;
