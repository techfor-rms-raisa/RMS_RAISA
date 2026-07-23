/**
 * AtividadesTimeline.tsx — Módulo CRECI / Aba Acompanhamento
 *
 * Timeline de atividades do corretor: conversas, acordos, reuniões e notas,
 * com destaque para follow-ups pendentes.
 *
 * Caminho: src/components/creci/acompanhamento/AtividadesTimeline.tsx
 *
 * Não existe exclusão de atividade — por decisão de produto, o histórico de
 * acompanhamento é permanente. Correções são feitas por edição, preservando
 * a autoria original.
 *
 * Histórico:
 *  - v1.0 (23/07/2026): versão inicial.
 */

import React, { useState, useMemo } from 'react';
import type { Atividade } from './creciAcompanhamento.types';
import {
  LABEL_TIPO_ATIVIDADE,
  ICONE_TIPO_ATIVIDADE,
  COR_BORDA_TIPO,
  formatData,
  formatDataHora,
  fupVencido,
} from './creciAcompanhamento.types';

type FiltroTipo = 'todas' | 'conversas' | 'acordos' | 'fup';

interface Props {
  atividades: Atividade[];
  loading: boolean;
  podeEscrever: boolean;
  salvando: boolean;
  onNova: () => void;
  onEditar: (a: Atividade) => void;
  onConcluirFup: (id: number) => void;
}

const AtividadesTimeline: React.FC<Props> = ({
  atividades,
  loading,
  podeEscrever,
  salvando,
  onNova,
  onEditar,
  onConcluirFup,
}) => {
  const [filtro, setFiltro] = useState<FiltroTipo>('todas');

  const fupsPendentes = useMemo(
    () => atividades.filter(a => a.fup_em && !a.fup_concluido_em).length,
    [atividades]
  );

  const visiveis = useMemo(() => {
    switch (filtro) {
      case 'conversas':
        return atividades.filter(a => ['conversa', 'whatsapp', 'reuniao'].includes(a.tipo));
      case 'acordos':
        return atividades.filter(a => ['acordo', 'proposta', 'documentacao'].includes(a.tipo));
      case 'fup':
        return atividades.filter(a => a.fup_em && !a.fup_concluido_em);
      default:
        return atividades;
    }
  }, [atividades, filtro]);

  const chip = (valor: FiltroTipo, label: string, extra = '') => (
    <button
      key={valor}
      type="button"
      onClick={() => setFiltro(valor)}
      className={`px-2.5 py-1 rounded-full transition-colors ${
        filtro === valor ? 'bg-gray-800 text-white' : extra || 'bg-gray-100 text-gray-600 hover:bg-gray-200'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div>
      {/* Barra de filtros */}
      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <div className="flex gap-2 text-xs flex-wrap">
          {chip('todas', 'Todas')}
          {chip('conversas', 'Conversas')}
          {chip('acordos', 'Acordos')}
          {chip(
            'fup',
            `FUP pendente${fupsPendentes > 0 ? ` (${fupsPendentes})` : ''}`,
            fupsPendentes > 0 ? 'bg-rose-100 text-rose-700 hover:bg-rose-200' : ''
          )}
        </div>

        {podeEscrever && (
          <button
            type="button"
            onClick={onNova}
            className="text-xs text-indigo-600 hover:underline"
          >
            + Registrar atividade
          </button>
        )}
      </div>

      {loading && (
        <div className="p-6 text-center text-sm text-gray-400">Carregando atividades...</div>
      )}

      {!loading && visiveis.length === 0 && (
        <div className="p-6 text-center border border-dashed border-gray-200 rounded-lg">
          <div className="text-3xl mb-2">📝</div>
          <p className="text-sm text-gray-600 font-medium">
            {atividades.length === 0
              ? 'Nenhuma atividade registrada'
              : 'Nenhuma atividade neste filtro'}
          </p>
          {atividades.length === 0 && podeEscrever && (
            <p className="text-xs text-gray-400 mt-1">
              Registre a primeira conversa para começar o histórico deste corretor.
            </p>
          )}
        </div>
      )}

      <div className="space-y-3">
        {visiveis.map(a => {
          const pendente = !!a.fup_em && !a.fup_concluido_em;
          const vencido = pendente && fupVencido(a.fup_em);

          return (
            <div
              key={a.id}
              className={`border-l-4 rounded-r-lg p-3 ${
                vencido
                  ? 'border-rose-500 bg-rose-50'
                  : `${COR_BORDA_TIPO[a.tipo]} bg-white border-t border-r border-b border-gray-200`
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-800">
                    <i className={`${ICONE_TIPO_ATIVIDADE[a.tipo]} mr-1.5 text-gray-500`} />
                    {LABEL_TIPO_ATIVIDADE[a.tipo]}
                  </p>
                  <p className="text-xs text-gray-600 mt-1">
                    {formatDataHora(a.data_atividade)} · {a.executado_por_nome}
                    {a.origem === 'automatico' && (
                      <span className="text-gray-400"> · registro automático</span>
                    )}
                  </p>
                  <p className="text-sm text-gray-700 mt-2 whitespace-pre-wrap break-words">
                    {a.descricao}
                  </p>

                  {a.contrato_id && (
                    <div className="mt-2 text-[11px] text-emerald-700 bg-emerald-50 inline-block px-2 py-1 rounded">
                      <i className="fa-solid fa-link mr-1" /> Vinculado ao contrato
                    </div>
                  )}
                </div>

                {/* Selo de FUP */}
                {a.fup_em && (
                  <span
                    className={`shrink-0 text-[11px] px-2 py-1 rounded-full whitespace-nowrap ${
                      a.fup_concluido_em
                        ? 'bg-emerald-100 text-emerald-800'
                        : vencido
                        ? 'bg-rose-600 text-white'
                        : 'bg-amber-100 text-amber-800'
                    }`}
                  >
                    {a.fup_concluido_em
                      ? `FUP concluído ${formatData(a.fup_concluido_em)}`
                      : `FUP ${formatData(a.fup_em)}${vencido ? ' · vencido' : ''}`}
                  </span>
                )}
              </div>

              {a.fup_concluido_em && a.fup_concluido_por_nome && (
                <p className="text-[11px] text-gray-400 mt-2">
                  Concluído por {a.fup_concluido_por_nome}
                </p>
              )}

              {podeEscrever && (
                <div className="flex gap-2 mt-3">
                  {pendente && (
                    <button
                      type="button"
                      disabled={salvando}
                      onClick={() => onConcluirFup(a.id)}
                      className="text-xs bg-white border border-rose-300 text-rose-700 px-2.5 py-1 rounded-lg hover:bg-rose-50 disabled:opacity-40"
                    >
                      Concluir FUP
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={salvando}
                    onClick={() => onEditar(a)}
                    className="text-xs bg-white border border-gray-300 text-gray-700 px-2.5 py-1 rounded-lg hover:bg-gray-50 disabled:opacity-40"
                  >
                    {pendente ? 'Reagendar / Editar' : 'Editar'}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default AtividadesTimeline;
