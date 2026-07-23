/**
 * CarteiraLista.tsx — Módulo CRECI / Aba Acompanhamento
 *
 * Coluna mestre: cards dos corretores da carteira de acompanhamento.
 * Corretor entra na carteira quando INTERESSE = Sim ou NEGÓCIO = Fechado.
 *
 * Caminho: src/components/creci/acompanhamento/CarteiraLista.tsx
 *
 * Ordenação vem do banco (RPC listar_carteira_creci): FUP vencido primeiro,
 * depois última atividade mais recente. Quem precisa de ação sobe.
 *
 * Histórico:
 *  - v1.0 (23/07/2026): versão inicial.
 */

import React from 'react';
import type { CarteiraItem } from './creciAcompanhamento.types';
import {
  LABEL_STATUS_CONTRATO,
  CORES_STATUS_CONTRATO,
  formatBRL,
  formatData,
} from './creciAcompanhamento.types';

interface Props {
  corretores: CarteiraItem[];
  selecionadoId: number | null;
  onSelecionar: (id: number) => void;
  loading: boolean;
  total: number;
  page: number;
  totalPages: number;
  onPage: (p: number) => void;
}

const CarteiraLista: React.FC<Props> = ({
  corretores,
  selecionadoId,
  onSelecionar,
  loading,
  total,
  page,
  totalPages,
  onPage,
}) => {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
      {/* Cabeçalho */}
      <div className="px-3 py-2 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
        <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Carteira</span>
        <span className="text-[11px] text-gray-400">
          {loading ? 'carregando...' : `${total} corretor${total === 1 ? '' : 'es'}`}
        </span>
      </div>

      {/* Lista */}
      <div className="max-h-[620px] overflow-y-auto divide-y divide-gray-100">
        {loading && corretores.length === 0 && (
          <div className="p-6 text-center text-sm text-gray-400">Carregando carteira...</div>
        )}

        {!loading && corretores.length === 0 && (
          <div className="p-6 text-center">
            <div className="text-3xl mb-2">🤝</div>
            <p className="text-sm text-gray-600 font-medium">Nenhum corretor na carteira</p>
            <p className="text-xs text-gray-400 mt-1">
              Corretores aparecem aqui quando o SDR marca INTERESSE = Sim ou NEGÓCIO = Fechado
              na aba Lista CRECI.
            </p>
          </div>
        )}

        {corretores.map(c => {
          const ativo = c.corretor_id === selecionadoId;
          return (
            <button
              key={c.corretor_id}
              type="button"
              onClick={() => onSelecionar(c.corretor_id)}
              className={`w-full text-left px-3 py-3 border-l-4 transition-colors ${
                ativo
                  ? 'bg-indigo-50 border-indigo-500'
                  : 'border-transparent hover:bg-gray-50'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-semibold text-gray-800 leading-tight">{c.nome}</p>
                {c.fup_vencido && (
                  <span
                    className="shrink-0 mt-0.5 text-rose-500"
                    title={`Follow-up pendente desde ${formatData(c.fup_pendente_em)}`}
                  >
                    <i className="fa-solid fa-bell text-xs" />
                  </span>
                )}
              </div>

              <p className="text-[11px] text-gray-500 mt-0.5">
                {c.creci}
                {c.cidade ? ` · ${c.cidade}` : ''}
                {c.uf ? `/${c.uf}` : ''}
              </p>

              {/* Badges de situação */}
              <div className="flex flex-wrap gap-1 mt-1.5">
                {c.interesse === 'yes' && (
                  <span className="text-[11px] bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full">
                    👍 Interesse
                  </span>
                )}
                {c.negocio_fechado && (
                  <span className="text-[11px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full">
                    🤝 Fechado
                  </span>
                )}
                {c.status_contrato ? (
                  <span
                    className={`text-[11px] px-2 py-0.5 rounded-full ${
                      CORES_STATUS_CONTRATO[c.status_contrato]
                    }`}
                  >
                    {LABEL_STATUS_CONTRATO[c.status_contrato]}
                  </span>
                ) : (
                  c.negocio_fechado && (
                    <span className="text-[11px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                      sem contrato
                    </span>
                  )
                )}
                {c.fup_vencido && (
                  <span className="text-[11px] bg-rose-600 text-white px-2 py-0.5 rounded-full">
                    FUP vencido
                  </span>
                )}
              </div>

              <p className="text-[11px] text-gray-400 mt-1.5">
                {c.ultima_atividade_em
                  ? `última atividade: ${formatData(c.ultima_atividade_em)}`
                  : 'sem atividade registrada'}
                {c.valor_contrato !== null ? ` · ${formatBRL(c.valor_contrato)}` : ''}
              </p>
            </button>
          );
        })}
      </div>

      {/* Paginação */}
      {totalPages > 1 && (
        <div className="px-3 py-2 border-t border-gray-200 bg-gray-50 flex items-center justify-between">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => onPage(page - 1)}
            className="text-xs px-2.5 py-1 rounded border border-gray-300 bg-white text-gray-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            ← Anterior
          </button>
          <span className="text-[11px] text-gray-500">
            Página {page} de {totalPages}
          </span>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => onPage(page + 1)}
            className="text-xs px-2.5 py-1 rounded border border-gray-300 bg-white text-gray-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Próxima →
          </button>
        </div>
      )}
    </div>
  );
};

export default CarteiraLista;
