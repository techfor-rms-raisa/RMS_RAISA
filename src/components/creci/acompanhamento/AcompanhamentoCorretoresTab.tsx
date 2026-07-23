/**
 * AcompanhamentoCorretoresTab.tsx — Módulo CRECI / Aba Acompanhamento
 *
 * Componente raiz da aba "Acompanhamento": KPIs, filtros e o layout
 * mestre-detalhe (carteira à esquerda, ficha do corretor à direita).
 *
 * Caminho: src/components/creci/acompanhamento/AcompanhamentoCorretoresTab.tsx
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * O QUE É A CARTEIRA
 * ═══════════════════════════════════════════════════════════════════════════
 * Corretor com INTERESSE = Sim OU NEGÓCIO = Fechado. É o pós-venda do módulo
 * CRECI: a partir desse marco, o corretor passa a ter ficha de contrato,
 * registro de conversas/acordos e follow-ups. Nenhum corretor sai da carteira
 * — o histórico é permanente.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * RBAC (decisão de produto — Messias, 23/07/2026)
 * ═══════════════════════════════════════════════════════════════════════════
 * Este form NÃO usa o RBAC por dono aplicado em email_leads:
 *   LEITURA → Administrador, SDR e Gestão Comercial veem a carteira INTEIRA,
 *             sem filtro por responsável.
 *   ESCRITA → Administrador e SDR, em QUALQUER corretor da carteira,
 *             independentemente de quem esteja em corretores_creci.analista.
 *             Quem gerencia o corretor é o SDR.
 *
 * A permissão real é aplicada no servidor (api/creci-acompanhamento.ts).
 * O que existe aqui é UX: esconder um botão não protege dado.
 *
 * Histórico:
 *  - v1.0 (23/07/2026): versão inicial.
 */

import React, { useState, useMemo, useCallback } from 'react';
import type { Atividade, CurrentUser, SituacaoFiltro, StatusContratoFiltro } from './creciAcompanhamento.types';
import {
  LABEL_STATUS_CONTRATO,
  formatBRL,
  podeLerCarteira,
} from './creciAcompanhamento.types';
import { useCarteira, useFichaCorretor } from './useAcompanhamento';
import CarteiraLista from './CarteiraLista';
import CorretorFicha from './CorretorFicha';
import AtividadeFormModal from './AtividadeFormModal';

interface Props {
  currentUser?: CurrentUser;
}

const AcompanhamentoCorretoresTab: React.FC<Props> = ({ currentUser }) => {
  const [selecionadoId, setSelecionadoId] = useState<number | null>(null);
  const [modalAberto, setModalAberto] = useState(false);
  const [atividadeEditando, setAtividadeEditando] = useState<Atividade | null>(null);
  const [toast, setToast] = useState<{ tipo: 'ok' | 'erro'; msg: string } | null>(null);

  const carteira = useCarteira(currentUser);
  const ficha = useFichaCorretor(selecionadoId, currentUser);

  const itemSelecionado = useMemo(
    () => carteira.corretores.find(c => c.corretor_id === selecionadoId) || null,
    [carteira.corretores, selecionadoId]
  );

  const notificar = useCallback((tipo: 'ok' | 'erro', msg: string) => {
    setToast({ tipo, msg });
    setTimeout(() => setToast(null), 4000);
  }, []);

  const onSucesso = useCallback(
    (msg: string) => {
      notificar('ok', msg);
      carteira.recarregar(); // agregados da lista mudaram
    },
    [notificar, carteira]
  );

  const onErro = useCallback((msg: string) => notificar('erro', msg), [notificar]);

  const handleSalvarAtividade = useCallback(
    async (dados: Record<string, unknown>, atividadeId: number | null) => {
      if (atividadeId) return ficha.atualizarAtividade(atividadeId, dados);
      return ficha.criarAtividade(dados);
    },
    [ficha]
  );

  const handleConcluirFup = useCallback(
    async (id: number) => {
      try {
        await ficha.concluirFup(id);
        onSucesso('Follow-up concluído.');
      } catch (e: any) {
        onErro(e?.message || 'Erro ao concluir o follow-up.');
      }
    },
    [ficha, onSucesso, onErro]
  );

  // ── Guarda de perfil ───────────────────────────────────────────────────────
  if (!currentUser) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-10 text-center">
        <div className="text-4xl mb-3">🔒</div>
        <p className="text-sm text-gray-600 font-medium">Usuário não identificado</p>
        <p className="text-xs text-gray-400 mt-1">Faça login novamente para acessar a carteira.</p>
      </div>
    );
  }

  if (!podeLerCarteira(currentUser)) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-10 text-center">
        <div className="text-4xl mb-3">🔒</div>
        <p className="text-sm text-gray-600 font-medium">Acesso não liberado para este perfil</p>
        <p className="text-xs text-gray-400 mt-1">
          A carteira de acompanhamento é acessível a Administrador, SDR e Gestão Comercial.
          Seu perfil atual é "{currentUser.tipo_usuario}".
        </p>
      </div>
    );
  }

  const k = carteira.kpis;
  const selectCls =
    'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500';

  return (
    <div>
      {/* ── TOAST ── */}
      {toast && (
        <div
          className={`mb-3 rounded-lg px-4 py-2 text-sm border ${
            toast.tipo === 'ok'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-red-50 border-red-200 text-red-800'
          }`}
        >
          <i className={`fa-solid ${toast.tipo === 'ok' ? 'fa-check' : 'fa-triangle-exclamation'} mr-2`} />
          {toast.msg}
        </div>
      )}

      {/* ── KPIs ── */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
        <Kpi label="Na carteira" valor={k?.total_carteira} sub="interesse + fechados" />
        <Kpi label="Interessados" valor={k?.interessados} sub="sem negócio fechado" cor="text-amber-600" />
        <Kpi label="Negócios fechados" valor={k?.negocios_fechados} sub="com data de fechamento" cor="text-emerald-600" />
        <Kpi
          label="Contratos em andamento"
          valor={k?.contratos_em_andamento}
          sub={formatBRL(k?.valor_em_andamento ?? null)}
          cor="text-indigo-600"
        />
        <div
          className={`rounded-lg border p-3 ${
            (k?.fups_vencidos || 0) > 0 ? 'border-rose-200 bg-rose-50' : 'border-gray-200 bg-white'
          }`}
        >
          <p
            className={`text-[11px] uppercase tracking-wide ${
              (k?.fups_vencidos || 0) > 0 ? 'text-rose-600' : 'text-gray-500'
            }`}
          >
            FUPs vencidos
          </p>
          <p
            className={`text-2xl font-bold ${
              (k?.fups_vencidos || 0) > 0 ? 'text-rose-700' : 'text-gray-800'
            }`}
          >
            {k ? k.fups_vencidos : '—'}
          </p>
          <p className={`text-[11px] ${(k?.fups_vencidos || 0) > 0 ? 'text-rose-500' : 'text-gray-400'}`}>
            {k && k.corretores_com_fup_vencido > 0
              ? `${k.corretores_com_fup_vencido} corretor${k.corretores_com_fup_vencido > 1 ? 'es' : ''}`
              : 'nada atrasado'}
          </p>
        </div>
      </div>

      {/* ── FILTROS ── */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-4">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-gray-500 mb-1">Buscar</label>
            <input
              type="text"
              placeholder="Nome, CRECI ou e-mail..."
              value={carteira.filtros.busca}
              onChange={e => carteira.setFiltros(f => ({ ...f, busca: e.target.value }))}
              className={selectCls}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Situação</label>
            <select
              value={carteira.filtros.situacao}
              onChange={e =>
                carteira.setFiltros(f => ({ ...f, situacao: e.target.value as SituacaoFiltro }))
              }
              className={selectCls}
            >
              <option value="todos">Todos (interesse + fechado)</option>
              <option value="interesse">Somente interesse</option>
              <option value="fechado">Somente negócio fechado</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Status do contrato</label>
            <select
              value={carteira.filtros.status_contrato}
              onChange={e =>
                carteira.setFiltros(f => ({
                  ...f,
                  status_contrato: e.target.value as StatusContratoFiltro,
                }))
              }
              className={selectCls}
            >
              <option value="todos">Todos</option>
              <option value="sem_contrato">Sem contrato</option>
              {(Object.keys(LABEL_STATUS_CONTRATO) as (keyof typeof LABEL_STATUS_CONTRATO)[]).map(s => (
                <option key={s} value={s}>
                  {LABEL_STATUS_CONTRATO[s]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Responsável</label>
            <select
              value={carteira.filtros.responsavel}
              onChange={e => carteira.setFiltros(f => ({ ...f, responsavel: e.target.value }))}
              className={selectCls}
            >
              <option value="">Todos</option>
              {carteira.responsaveis.map(r => (
                <option key={r.analista} value={r.analista}>
                  {r.analista} ({r.total})
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex items-center justify-between mt-2 gap-3 flex-wrap">
          <p className="text-xs text-red-700">
            {carteira.total} corretor{carteira.total === 1 ? '' : 'es'} na carteira
            <span className="text-gray-500"> — visão completa (todos os responsáveis)</span>
          </p>
          {!carteira.podeEscrever && (
            <p className="text-[11px] text-sky-700 bg-sky-50 border border-sky-200 px-2 py-1 rounded">
              <i className="fa-solid fa-eye mr-1" /> Perfil somente leitura
            </p>
          )}
        </div>
      </div>

      {carteira.erro && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <i className="fa-solid fa-triangle-exclamation mr-2" />
          {carteira.erro}
        </div>
      )}

      {/* ── MESTRE-DETALHE ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-4">
          <CarteiraLista
            corretores={carteira.corretores}
            selecionadoId={selecionadoId}
            onSelecionar={setSelecionadoId}
            loading={carteira.loading}
            total={carteira.total}
            page={carteira.page}
            totalPages={carteira.totalPages}
            onPage={carteira.setPage}
          />
        </div>

        <div className="lg:col-span-8">
          <CorretorFicha
            itemCarteira={itemSelecionado}
            corretor={ficha.corretor}
            contrato={ficha.contrato}
            lead={ficha.lead}
            atividades={ficha.atividades}
            emails={ficha.emails}
            avisoEmails={ficha.avisoEmails}
            loading={ficha.loading}
            loadingEmails={ficha.loadingEmails}
            salvando={ficha.salvando}
            podeEscrever={carteira.podeEscrever}
            onCarregarEmails={ficha.carregarEmails}
            onNovaAtividade={() => {
              setAtividadeEditando(null);
              setModalAberto(true);
            }}
            onEditarAtividade={a => {
              setAtividadeEditando(a);
              setModalAberto(true);
            }}
            onConcluirFup={handleConcluirFup}
            onSalvarContrato={ficha.salvarContrato}
            onSucesso={onSucesso}
            onErro={onErro}
          />
        </div>
      </div>

      {/* ── MODAL DE ATIVIDADE ── */}
      {carteira.podeEscrever && (
        <AtividadeFormModal
          aberto={modalAberto}
          atividade={atividadeEditando}
          contrato={ficha.contrato}
          salvando={ficha.salvando}
          onFechar={() => {
            setModalAberto(false);
            setAtividadeEditando(null);
          }}
          onSalvar={handleSalvarAtividade}
          onSucesso={onSucesso}
          onErro={onErro}
        />
      )}
    </div>
  );
};

// ── KPI Card ────────────────────────────────────────────────────────────────
const Kpi: React.FC<{
  label: string;
  valor?: number | null;
  sub?: string;
  cor?: string;
}> = ({ label, valor, sub, cor = 'text-gray-800' }) => (
  <div className="bg-white rounded-lg border border-gray-200 p-3">
    <p className="text-[11px] uppercase tracking-wide text-gray-500">{label}</p>
    <p className={`text-2xl font-bold ${cor}`}>
      {valor === null || valor === undefined ? '—' : Number(valor).toLocaleString('pt-BR')}
    </p>
    {sub && <p className="text-[11px] text-gray-400">{sub}</p>}
  </div>
);

export default AcompanhamentoCorretoresTab;
