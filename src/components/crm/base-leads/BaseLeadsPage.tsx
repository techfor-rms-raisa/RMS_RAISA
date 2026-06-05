/**
 * BaseLeadsPage.tsx — Container da Base de Leads
 *
 * Caminho: src/components/crm/base-leads/BaseLeadsPage.tsx
 * Versão: 1.4 (Lead RBAC fix — 05/06/2026)
 *
 * v1.4 (05/06/2026 — Lead RBAC fix): leads criados via "Novo Lead"
 *   estavam ficando com vertical=NULL, apto_campanha=false,
 *   reservado_por=NULL — e por isso invisíveis para a action
 *   `leads_disponiveis` da campanha. Correção em 3 frentes:
 *    - Instancia hook `useTiposCampanha` no mount, passa lista para
 *      o LeadFormModal alimentar o seletor de vertical.
 *    - Instancia hook `useResponsaveis` no mount (apenas se o usuário
 *      logado for Administrador). Passa lista de GC/SDR para o
 *      LeadFormModal alimentar o seletor de "Reservado para".
 *    - Para não-admin, o LeadFormModal trava automaticamente
 *      `reservado_por = currentUser.id` (lógica interna do modal).
 *
 * v1.3 (04/06/2026 — Fase 8-fix2): badges das 4 abas (Empresas / Leads /
 *   Respostas / Inválidos) agora usam `stats.total_*` como fonte primária
 *   e caem em `*H.total` apenas como fallback. Antes os badges ficavam
 *   zerados até o usuário clicar em cada aba (porque os hooks só carregam
 *   sob demanda). Com a v1.5 do `crm-leads.ts` devolvendo `total_respostas`
 *   e `total_invalidos` no payload de `stats` (já chamado no mount), o
 *   número correto aparece desde o primeiro render — sem custo extra de
 *   requisições.
 *
 * v1.2 (04/06/2026 — Fase 8-Inbox): novas abas "Respostas" e "Inválidos".
 *   Mudanças aditivas:
 *    - `abaAtiva` agora aceita 'respostas' e 'invalidos'.
 *    - Imports dos novos hooks (useRespostas, useInvalidos) e componentes
 *      (RespostasTab, InvalidosTab).
 *    - useEffects para carregar cada tab sob demanda (mesmo padrão das
 *      abas existentes).
 *    - Handler `abrirEditarLeadPorId(leadId)`: usado pela aba Inválidos
 *      para corrigir cadastro do lead. Faz fetch em /api/crm-leads
 *      ?action=detalhe_lead, popula o formLead e abre o LeadFormModal
 *      em modo 'editar'.
 *    - Após edição bem-sucedida, todas as 4 listagens são recarregadas
 *      (empresas, leads, respostas, invalidos) para refletir mudanças.
 *
 * v1.1 (03/06/2026 — Fase 7-MVP): suporte a deep link.
 *   Recebe prop opcional `deepLinkLeadId`. Quando presente, força a aba
 *   'leads' e dispara `abrirDetalhe(N)` automaticamente. Após consumir,
 *   chama `onDeepLinkConsumed` para limpar o state no App.tsx — evita
 *   reabertura ao re-render.
 *
 * v1.0 (Fase 1C — 29/05/2026): primeira versão.
 *   Substitui o componente monolítico EmpresasLeadsCRM.tsx.
 *   Responsabilidades:
 *    - Orquestrar os hooks useEmpresas, useLeads, useImportProspects.
 *    - Gerenciar os modais (Empresa/Lead form, Importação) e
 *      drawers (Empresa/Lead detalhe).
 *    - Renderizar header + KPIs + abas Empresas/Leads.
 */

import React, { useEffect, useState } from 'react';
import { useEmpresas } from '../shared/hooks/useEmpresas';
import { useLeads } from '../shared/hooks/useLeads';
import { useImportProspects } from '../shared/hooks/useImportProspects';
// 🆕 v1.2 (Fase 8-Inbox) — hooks das novas abas
import { useRespostas } from '../shared/hooks/useRespostas';
import { useInvalidos } from '../shared/hooks/useInvalidos';
// 🆕 v1.4 (Lead RBAC fix) — hooks para o LeadFormModal
import { useTiposCampanha } from '../shared/hooks/useTiposCampanha';
import { useResponsaveis } from '../shared/hooks/useResponsaveis';

import EmpresasTab from './EmpresasTab';
import LeadsTab from './LeadsTab';
// 🆕 v1.2 (Fase 8-Inbox) — componentes das novas abas
import RespostasTab from './RespostasTab';
import InvalidosTab from './InvalidosTab';
import EmpresaFormModal from './EmpresaFormModal';
import LeadFormModal from './LeadFormModal';
import EmpresaDetailDrawer from './EmpresaDetailDrawer';
import LeadDetailDrawer from './LeadDetailDrawer';
import ImportProspectsModal from './ImportProspectsModal';

import KpiCard from '../shared/components/KpiCard';
import type { CurrentUserLite, Empresa, Lead } from '../types/crm.types';

// ════════════════════════════════════════════════════════════
// PROPS
// ════════════════════════════════════════════════════════════

export interface BaseLeadsPageProps {
  currentUser: CurrentUserLite;
  /**
   * 🆕 v1.1 (Fase 7-MVP) — Deep link opcional.
   * Quando presente, BaseLeadsPage automaticamente:
   *   1. Muda para a aba 'leads'.
   *   2. Chama useLeads.abrirDetalhe(N) para abrir o drawer do lead.
   *   3. Invoca onDeepLinkConsumed para o App.tsx limpar o state e
   *      evitar reabertura em renders subsequentes.
   */
  deepLinkLeadId?: number | null;
  onDeepLinkConsumed?: () => void;
}

// ════════════════════════════════════════════════════════════
// COMPONENTE
// ════════════════════════════════════════════════════════════

const BaseLeadsPage: React.FC<BaseLeadsPageProps> = ({
  currentUser,
  deepLinkLeadId,
  onDeepLinkConsumed,
}) => {
  // ── Aba ativa ──
  // 🆕 v1.2 (Fase 8-Inbox) — agora aceita 'respostas' e 'invalidos'.
  const [abaAtiva, setAbaAtiva] = useState<'empresas' | 'leads' | 'respostas' | 'invalidos'>(
    'empresas'
  );

  // ── Hooks ──
  const empresasH = useEmpresas();
  const leadsH = useLeads();
  const importH = useImportProspects();
  // 🆕 v1.2 (Fase 8-Inbox)
  const respostasH = useRespostas();
  const invalidosH = useInvalidos();
  // 🆕 v1.4 (Lead RBAC fix) — fontes p/ o LeadFormModal
  const tiposCampanhaH = useTiposCampanha();
  const responsaveisH = useResponsaveis();

  // ── Modais de formulário ──
  const [modalEmpresa, setModalEmpresa] = useState<'criar' | 'editar' | null>(null);
  const [modalLead, setModalLead] = useState<'criar' | 'editar' | null>(null);
  const [formEmpresa, setFormEmpresa] = useState<Partial<Empresa>>({});
  const [formLead, setFormLead] = useState<Partial<Lead>>({});

  // ── Modal de importação ──
  const [modalImportarAberto, setModalImportarAberto] = useState(false);

  // ── Efeitos: carregar dados ──
  useEffect(() => {
    leadsH.carregarStats();
    // 🆕 v1.4 — Verticais (todos os perfis precisam para o seletor)
    tiposCampanhaH.carregar();
    // 🆕 v1.4 — Lista de responsáveis (somente Admin precisa)
    if (currentUser.tipo_usuario === 'Administrador') {
      responsaveisH.carregar();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (abaAtiva === 'empresas') {
      empresasH.carregar();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    abaAtiva,
    empresasH.pagina,
    empresasH.busca,
    empresasH.filtroSetor,
  ]);

  useEffect(() => {
    if (abaAtiva === 'leads') {
      leadsH.carregar();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abaAtiva, leadsH.pagina, leadsH.busca, leadsH.filtroFunil]);

  // 🆕 v1.2 (Fase 8-Inbox) — carregamento das novas abas sob demanda
  useEffect(() => {
    if (abaAtiva === 'respostas') {
      respostasH.carregar();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abaAtiva, respostasH.pagina, respostasH.busca]);

  useEffect(() => {
    if (abaAtiva === 'invalidos') {
      invalidosH.carregar();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abaAtiva, invalidosH.pagina, invalidosH.busca]);

  // 🆕 v1.1 (Fase 7-MVP) — Consumo do deep link.
  // Quando recebemos deepLinkLeadId pelo App.tsx (parser de URL), forçamos
  // a aba 'leads' e abrimos o drawer do lead automaticamente. Em seguida,
  // disparamos onDeepLinkConsumed para o App.tsx limpar o state — assim
  // re-renders subsequentes deste componente NÃO reabrem o drawer.
  //
  // Atenção: a dependência inclui apenas deepLinkLeadId (não leadsH) para
  // evitar loop. leadsH.abrirDetalhe é estável via useCallback no hook.
  useEffect(() => {
    if (deepLinkLeadId && deepLinkLeadId > 0) {
      setAbaAtiva('leads');
      leadsH.abrirDetalhe(deepLinkLeadId);
      onDeepLinkConsumed?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deepLinkLeadId]);

  // ════════════════════════════════════════════════════════════
  // HANDLERS — EMPRESA
  // ════════════════════════════════════════════════════════════

  const abrirCriarEmpresa = () => {
    setFormEmpresa({});
    setModalEmpresa('criar');
  };

  const abrirEditarEmpresa = (empresa: Empresa) => {
    setFormEmpresa(empresa);
    setModalEmpresa('editar');
  };

  const salvarEmpresa = async () => {
    const ok = await empresasH.salvar(formEmpresa as any, currentUser.nome_usuario);
    if (ok) {
      setModalEmpresa(null);
      setFormEmpresa({});
      empresasH.carregar();
      leadsH.carregarStats();
    }
  };

  const abrirDetalheEmpresa = (id: number) => {
    empresasH.abrirDetalhe(id);
  };

  // ════════════════════════════════════════════════════════════
  // HANDLERS — LEAD
  // ════════════════════════════════════════════════════════════

  const abrirCriarLead = () => {
    setFormLead({});
    setModalLead('criar');
  };

  const abrirEditarLead = (lead: Lead) => {
    setFormLead(lead);
    setModalLead('editar');
  };

  // 🆕 v1.2 (Fase 8-Inbox) — chamado pela aba Inválidos.
  //   A aba só tem o lead_id (a listagem não traz o objeto Lead completo).
  //   Aqui buscamos o lead pelo endpoint detalhe_lead, populamos o formLead
  //   e abrimos o modal em modo editar — fluxo idêntico ao `abrirEditarLead`
  //   tradicional, só com o passo extra de carregar os dados.
  const abrirEditarLeadPorId = async (leadId: number) => {
    try {
      const resp = await fetch(`/api/crm-leads?action=detalhe_lead&id=${leadId}`);
      const data = await resp.json();
      if (data?.success && data.lead) {
        setFormLead(data.lead);
        setModalLead('editar');
      } else {
        alert(data?.error || 'Lead não encontrado.');
      }
    } catch (err: any) {
      alert('Erro ao carregar lead: ' + (err?.message || 'desconhecido'));
    }
  };

  const salvarLead = async () => {
    const ok = await leadsH.salvar(formLead as any, currentUser.nome_usuario);
    if (ok) {
      setModalLead(null);
      setFormLead({});
      leadsH.carregar();
      leadsH.carregarStats();
      // 🆕 v1.2 — recarrega as listagens das outras abas para refletir
      // qualquer mudança no e-mail (relevante para resolver itens da aba
      // Inválidos: ao corrigir o e-mail, o item correspondente em
      // email_fila ainda fica com status='bounce'/'erro', mas o usuário
      // pode reenfileirar via campanha — fluxo manual atual).
      if (abaAtiva === 'respostas') respostasH.carregar();
      if (abaAtiva === 'invalidos') invalidosH.carregar();
    }
  };

  const abrirDetalheLead = (id: number) => {
    // Se o drawer de empresa estiver aberto, fechar para evitar overlap.
    if (empresasH.detalhe) empresasH.fecharDetalhe();
    leadsH.abrirDetalhe(id);
  };

  const confirmarMudancaFunil = async (
    novoStatus: string,
    motivoPerda: string | null
  ): Promise<boolean> => {
    if (!leadsH.leadSelecionado) return false;
    const ok = await leadsH.mudarFunil(
      leadsH.leadSelecionado.id,
      novoStatus,
      motivoPerda,
      currentUser.nome_usuario
    );
    if (ok) {
      // Recarregar detalhe + listagem + stats
      await leadsH.abrirDetalhe(leadsH.leadSelecionado.id);
      leadsH.carregar();
      leadsH.carregarStats();
    }
    return ok;
  };

  // ════════════════════════════════════════════════════════════
  // HANDLERS — IMPORTAÇÃO
  // ════════════════════════════════════════════════════════════

  const abrirImportacao = () => {
    setModalImportarAberto(true);
    importH.carregar();
  };

  const fecharImportacao = () => {
    setModalImportarAberto(false);
    importH.reset();
  };

  const executarImportacao = async () => {
    const resultado = await importH.executar(currentUser.nome_usuario);
    if (resultado) {
      // Recarrega tudo após import bem-sucedida
      empresasH.carregar();
      leadsH.carregar();
      leadsH.carregarStats();
    }
  };

  // ════════════════════════════════════════════════════════════
  // RENDER
  // ════════════════════════════════════════════════════════════

  const stats = leadsH.stats;

  return (
    <div className="space-y-4">
      {/* ── Header ── */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
            <i className="fa-solid fa-building text-indigo-600"></i>
            Empresas & Leads
          </h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Gestão do funil de prospecção e campanhas de email
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={abrirImportacao}
            className="px-3 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 flex items-center gap-1.5 transition-colors"
          >
            <i className="fa-solid fa-download"></i> Importar Prospects
          </button>
          <button
            onClick={abrirCriarEmpresa}
            className="px-3 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 flex items-center gap-1.5 transition-colors"
          >
            <i className="fa-solid fa-plus"></i> Nova Empresa
          </button>
        </div>
      </div>

      {/* ── KPI Cards ── */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <KpiCard
            label="Empresas"
            valor={stats.total_empresas}
            icon="fa-solid fa-building"
            cor="purple"
          />
          <KpiCard
            label="Leads"
            valor={stats.total_leads}
            icon="fa-solid fa-users"
            cor="gray"
          />
          <KpiCard
            label="Prospects"
            valor={stats.total_prospects}
            icon="fa-solid fa-user-check"
            cor="blue"
          />
          <KpiCard
            label="Clientes"
            valor={stats.total_clientes}
            icon="fa-solid fa-handshake"
            cor="green"
          />
          <KpiCard
            label="Opt-Out"
            valor={stats.total_optout}
            icon="fa-solid fa-ban"
            cor="red"
          />
        </div>
      )}

      {/* ── Abas ── */}
      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <div className="flex border-b overflow-x-auto">
          {[
            {
              key: 'empresas' as const,
              label: 'Empresas',
              icon: 'fa-solid fa-building',
              // 🆕 v1.3 — `stats` (carregado no mount) tem o total agregado;
              //   `empresasH.total` só fica preenchido após a primeira
              //   carga da aba. O `??` garante que o badge não pisque "0"
              //   antes de o usuário clicar.
              count: stats?.total_empresas ?? empresasH.total,
            },
            {
              key: 'leads' as const,
              label: 'Leads',
              icon: 'fa-solid fa-users',
              // 🆕 v1.3 — somatório de leads + prospects + clientes
              //   (o `total_leads` do stats filtra só funil_status='lead',
              //   por isso somamos os 3 funis para corresponder à listagem).
              count: stats
                ? stats.total_leads + stats.total_prospects + stats.total_clientes
                : leadsH.total,
            },
            // 🆕 v1.2 (Fase 8-Inbox)
            {
              key: 'respostas' as const,
              label: 'Respostas',
              icon: 'fa-solid fa-reply',
              count: stats?.total_respostas ?? respostasH.total, // 🆕 v1.3
            },
            {
              key: 'invalidos' as const,
              label: 'Inválidos',
              icon: 'fa-solid fa-circle-exclamation',
              count: stats?.total_invalidos ?? invalidosH.total, // 🆕 v1.3
            },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => {
                setAbaAtiva(tab.key);
                // Reseta paginação ao trocar de aba
                if (tab.key === 'empresas') empresasH.setPagina(1);
                else if (tab.key === 'leads') leadsH.setPagina(1);
                else if (tab.key === 'respostas') respostasH.setPagina(1);
                else if (tab.key === 'invalidos') invalidosH.setPagina(1);
              }}
              className={`flex-1 md:flex-none px-6 py-3 text-sm font-medium flex items-center justify-center gap-2 border-b-2 transition-colors whitespace-nowrap ${
                abaAtiva === tab.key
                  ? 'border-indigo-600 text-indigo-600 bg-indigo-50/50'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}
            >
              <i className={tab.icon}></i>
              {tab.label}
              <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full text-xs">
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        {/* ════════════════════════ CONTEÚDO DA ABA ════════════════════════ */}
        {abaAtiva === 'empresas' && (
          <EmpresasTab
            empresas={empresasH.empresas}
            total={empresasH.total}
            pagina={empresasH.pagina}
            pageSize={empresasH.pageSize}
            busca={empresasH.busca}
            filtroSetor={empresasH.filtroSetor}
            loading={empresasH.loading}
            onBuscaChange={empresasH.setBusca}
            onFiltroSetorChange={(v) => {
              empresasH.setFiltroSetor(v);
              empresasH.setPagina(1);
            }}
            onBuscar={() => {
              empresasH.setPagina(1);
              empresasH.carregar();
            }}
            onPaginaChange={empresasH.setPagina}
            onAbrirDetalhe={abrirDetalheEmpresa}
            onEditar={abrirEditarEmpresa}
          />
        )}

        {abaAtiva === 'leads' && (
          <LeadsTab
            leads={leadsH.leads}
            total={leadsH.total}
            pagina={leadsH.pagina}
            pageSize={leadsH.pageSize}
            busca={leadsH.busca}
            filtroFunil={leadsH.filtroFunil}
            loading={leadsH.loading}
            onBuscaChange={leadsH.setBusca}
            onFiltroFunilChange={(v) => {
              leadsH.setFiltroFunil(v);
              leadsH.setPagina(1);
            }}
            onBuscar={() => {
              leadsH.setPagina(1);
              leadsH.carregar();
            }}
            onPaginaChange={leadsH.setPagina}
            onAbrirDetalhe={abrirDetalheLead}
            onEditar={abrirEditarLead}
            onNovoLead={abrirCriarLead}
          />
        )}

        {/* 🆕 v1.2 (Fase 8-Inbox) — Aba Respostas */}
        {abaAtiva === 'respostas' && (
          <RespostasTab
            itens={respostasH.itens}
            total={respostasH.total}
            pagina={respostasH.pagina}
            pageSize={respostasH.pageSize}
            busca={respostasH.busca}
            loading={respostasH.loading}
            onBuscaChange={respostasH.setBusca}
            onBuscar={() => {
              respostasH.setPagina(1);
              respostasH.carregar();
            }}
            onPaginaChange={respostasH.setPagina}
            onAbrirLead={abrirDetalheLead}
          />
        )}

        {/* 🆕 v1.2 (Fase 8-Inbox) — Aba Inválidos */}
        {abaAtiva === 'invalidos' && (
          <InvalidosTab
            itens={invalidosH.itens}
            total={invalidosH.total}
            pagina={invalidosH.pagina}
            pageSize={invalidosH.pageSize}
            busca={invalidosH.busca}
            loading={invalidosH.loading}
            onBuscaChange={invalidosH.setBusca}
            onBuscar={() => {
              invalidosH.setPagina(1);
              invalidosH.carregar();
            }}
            onPaginaChange={invalidosH.setPagina}
            onEditarLead={abrirEditarLeadPorId}
          />
        )}
      </div>

      {/* ════════════════════════════════════════════════════════════ */}
      {/* MODAIS                                                       */}
      {/* ════════════════════════════════════════════════════════════ */}

      <EmpresaFormModal
        modo={modalEmpresa}
        form={formEmpresa}
        loading={empresasH.loading}
        onChange={setFormEmpresa}
        onSalvar={salvarEmpresa}
        onFechar={() => setModalEmpresa(null)}
      />

      <LeadFormModal
        modo={modalLead}
        form={formLead}
        loading={leadsH.loading}
        empresas={empresasH.empresas}
        verticais={tiposCampanhaH.tipos}
        currentUser={currentUser}
        responsaveis={responsaveisH.responsaveis}
        onChange={setFormLead}
        onSalvar={salvarLead}
        onFechar={() => setModalLead(null)}
      />

      <ImportProspectsModal
        aberto={modalImportarAberto}
        loading={importH.loading}
        disponiveis={importH.disponiveis}
        selecionados={importH.selecionados}
        resultado={importH.resultado}
        onToggleSelecionado={importH.toggleSelecionado}
        onSelecionarTodos={importH.selecionarTodos}
        onExecutar={executarImportacao}
        onFechar={fecharImportacao}
      />

      {/* ════════════════════════════════════════════════════════════ */}
      {/* DRAWERS                                                      */}
      {/* ════════════════════════════════════════════════════════════ */}

      <EmpresaDetailDrawer
        detalhe={empresasH.detalhe}
        onFechar={empresasH.fecharDetalhe}
        onAbrirLead={abrirDetalheLead}
      />

      <LeadDetailDrawer
        lead={leadsH.leadSelecionado}
        timeline={leadsH.timeline}
        campanhas={leadsH.campanhasDoLead}
        respostas={leadsH.respostas}
        loadingFunil={leadsH.loading}
        onFechar={leadsH.fecharDetalhe}
        onConfirmarFunil={confirmarMudancaFunil}
      />
    </div>
  );
};

export default BaseLeadsPage;
