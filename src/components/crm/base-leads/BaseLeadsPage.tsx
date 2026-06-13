/**
 * BaseLeadsPage.tsx — Container da Base de Leads
 *
 * Caminho: src/components/crm/base-leads/BaseLeadsPage.tsx
 * Versão: 1.8 (Coluna ANALISTA + ordenação configurável — 13/06/2026)
 *
 * v1.8 (13/06/2026 — Coluna ANALISTA + ordenação configurável):
 *   Continuação da reorganização Prospect/Lead (v1.7). Plugado o novo
 *   estado de ordenação do hook `useLeads` v1.2 na tabela "Meus Leads":
 *
 *    - `useEffect` da aba 'leads' ganha `leadsH.ordenarPor` na dep array
 *      → recarrega a lista quando o usuário troca a ordem no dropdown.
 *    - Novo handler `onOrdenarPorChange` faz duas coisas em sequência:
 *        1. Reseta paginação para a página 1 (UX coerente — ao mudar
 *           ordem, faz sentido começar do topo).
 *        2. Atualiza o estado `ordenarPor` no hook.
 *    - `<LeadsTab>` recebe 2 props novas: `ordenarPor` e
 *      `onOrdenarPorChange` (consumidos pelo dropdown da v1.1).
 *
 *   Sem mudança em outros pontos do container. Cirurgia mínima.
 *
 * v1.7 (13/06/2026 — Fase 1 da reorganização Prospect/Lead):
 *   Reorganização visual e funcional das sub-abas para alinhar o
 *   funil com o vocabulário real (Prospect → Lead → Campanha → saídas):
 *
 *   ORDEM NOVA (6 abas):
 *     1. 🏢 Minhas Empresas    (rename de "Empresas")
 *     2. 👥 Meus Leads          (rename de "Leads")
 *     3. 🔗 Vincular em Lote    (sem mudança)
 *     4. 💬 Respostas Campanhas (rename de "Respostas")
 *     5. ⚠️ E-mails Inválidos   (rename de "Inválidos")
 *     6. 🚫 Opt-Out              (NOVA — movida das Configurações)
 *
 *   Mudanças aditivas:
 *    - `abaAtiva` agora aceita 'opt_out' (chave interna; literal exibida
 *      é "Opt-Out").
 *    - Import do novo OptOutTab local (src/components/crm/base-leads/),
 *      com RBAC contextual: Admin/GR&S vê todos; GC/SDR vê apenas
 *      opt-outs cujos leads são deles (filtro por reservado_por feito
 *      no backend crm-config v1.1).
 *    - Header da página renomeado de "Empresas & Leads" para
 *      "Base de Leads" — consistência com o item do menu lateral
 *      e neutralidade em relação ao crescimento de abas (Respostas,
 *      Inválidos, Opt-Out são saídas, não entidades).
 *    - Labels visuais das abas existentes renomeados conforme a tabela
 *      acima. NENHUMA mudança nas chaves internas (`empresas`, `leads`,
 *      `respostas`, `invalidos`, `vincular_em_lote`) para preservar
 *      compat com deep-links, telemetria e código a jusante.
 *
 *   Sem impacto em:
 *    - KPI cards (continuam com label compacto: Empresas, Leads,
 *      Prospects, Clientes, Opt-Out — mantém leitura rápida).
 *    - Hooks (useEmpresas, useLeads, useRespostas, useInvalidos —
 *      inalterados).
 *    - Endpoints existentes (apenas crm-config.ts ganhou filtro
 *      reservado_por; ver v1.1).
 *
 * v1.6 (11/06/2026 — Opt-out manual / Bloco 4 do plano OPT-OUT 100%):
 *   Plugado o callback `onDesabilitar` no LeadFormModal. Handler
 *   `handleDesabilitarLead` chama o novo método `useLeads.desabilitar`
 *   (v1.1), exibe feedback ao usuário (toast/alert com total cancelado),
 *   fecha o modal e recarrega listagem + stats para refletir o badge
 *   "Opt-out" e a saída do lead das contagens.
 *   - Não-bloqueante: se o callback ficasse desinstalado (ex.: futura
 *     mudança), o LeadFormModal v1.2 simplesmente não renderiza o botão.
 *
 * v1.5 (10/06/2026 — Vinculação em Lote): nova aba "🎯 Vincular em Lote"
 *   adicionada ao lado de Empresas/Leads/Respostas/Inválidos. Permite ao
 *   Gestor Comercial/SDR vincular múltiplos leads a uma campanha existente
 *   (status ativa/pausada/agendada) em uma única operação, com possibilidade
 *   de alteração de vertical em lote. Substitui o fluxo arriscado de "Editar
 *   Campanha → adicionar leads".
 *   🛡️ REGRA CRECI BIDIRECIONAL aplicada: leads CRECI não aparecem nesta aba
 *   e a vertical CRECI não pode ser destino (defesa em profundidade backend).
 *   Mudanças aditivas neste arquivo:
 *    - `abaAtiva` agora aceita 'vincular_em_lote'
 *    - Import de VincularEmLoteTab
 *    - Nova entrada no array de tabs (sem badge — não tem listagem persistente)
 *    - Renderização condicional
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
// 🆕 v1.5 (Vinculação em Lote — 10/06/2026)
import VincularEmLoteTab from './VincularEmLoteTab';
// 🆕 v1.7 (Reorganização Prospect/Lead — 13/06/2026)
//   OptOutTab movido das Configurações para a Base de Leads.
//   Esta é a versão local com RBAC contextual (filtra por
//   reservado_por para GC/SDR). O OptOutTab antigo de
//   src/components/crm/configuracoes/ continua no repo apenas
//   para preservar histórico Git — não é mais importado.
import OptOutTab from './OptOutTab';
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
  // 🆕 v1.5 (Vinculação em Lote — 10/06/2026) — agora aceita 'vincular_em_lote'.
  // 🆕 v1.7 (Reorganização Prospect/Lead — 13/06/2026) — agora aceita 'opt_out'.
  const [abaAtiva, setAbaAtiva] = useState<
    'empresas' | 'leads' | 'respostas' | 'invalidos' | 'vincular_em_lote' | 'opt_out'
  >('empresas');

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
  }, [abaAtiva, leadsH.pagina, leadsH.busca, leadsH.filtroFunil, leadsH.ordenarPor]);

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

  // ════════════════════════════════════════════════════════════
  // 🆕 v1.6 — OPT-OUT MANUAL (Bloco 4 do plano OPT-OUT 100%)
  // ════════════════════════════════════════════════════════════
  //
  // Disparado pelo modal de confirmação dupla do LeadFormModal (v1.2),
  // após o gestor/SDR clicar em "Confirmar Opt-Out". Chama o método
  // `useLeads.desabilitar` (v1.1), que por sua vez aciona a action
  // POST `desabilitar_lead` em /api/crm-leads (v1.11) com a cascata
  // completa em 4 passos (opt_out + email_optout + cancela fila
  // global + histórico).
  //
  // Após sucesso:
  //   • Mostra alert com total de envios cancelados (feedback explícito
  //     ao usuário — útil porque um lead pode estar em várias campanhas).
  //   • Fecha o modal de edição e limpa o formLead.
  //   • Recarrega listagem + stats (badge "Opt-out" aparece imediatamente
  //     e contador "OPT-OUT" do KPI no topo é atualizado).
  //   • Se `ja_estava_optout=true` (idempotência — cliquezinho duplo),
  //     mostra mensagem informativa em vez de "X cancelados".
  //
  // Em caso de falha, o hook `useLeads.desabilitar` já exibe um alert
  // com o erro retornado pelo backend, então aqui só verificamos `ok`.
  const handleDesabilitarLead = async (motivo: string | null): Promise<void> => {
    if (!formLead.id) return;
    const resultado = await leadsH.desabilitar(
      formLead.id,
      motivo,
      currentUser.nome_usuario
    );
    if (!resultado.ok) return;

    if (resultado.ja_estava_optout) {
      alert('ℹ️ Este lead já estava em opt-out. Nenhuma ação adicional foi necessária.');
    } else {
      const plural = resultado.total_cancelados === 1 ? '' : 's';
      alert(
        `✅ Lead em opt-out.\n` +
          `${resultado.total_cancelados} envio${plural} pendente${plural} ` +
          `cancelado${plural} em campanhas ativas, pausadas e agendadas.`
      );
    }

    setModalLead(null);
    setFormLead({});
    leadsH.carregar();
    leadsH.carregarStats();
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
            <i className="fa-solid fa-building-user text-indigo-600"></i>
            Base de Leads
          </h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Gestão do funil de prospecção, respostas e saídas LGPD
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
      {/*
       * 🆕 v1.7 (13/06/2026) — Nova ordem das abas (6 entradas):
       *   1. Minhas Empresas         (key='empresas')
       *   2. Meus Leads              (key='leads')
       *   3. Vincular em Lote        (key='vincular_em_lote')
       *   4. Respostas Campanhas     (key='respostas')
       *   5. E-mails Inválidos       (key='invalidos')
       *   6. Opt-Out                 (key='opt_out')  ← NOVA
       *
       * Mantemos as chaves internas para preservar compat (deep-links,
       * useEffect dependentes, telemetria). Só os labels mudam.
       */}
      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <div className="flex border-b overflow-x-auto">
          {[
            {
              key: 'empresas' as const,
              label: 'Minhas Empresas',
              icon: 'fa-solid fa-building',
              // 🆕 v1.3 — `stats` (carregado no mount) tem o total agregado;
              //   `empresasH.total` só fica preenchido após a primeira
              //   carga da aba. O `??` garante que o badge não pisque "0"
              //   antes de o usuário clicar.
              count: stats?.total_empresas ?? empresasH.total,
            },
            {
              key: 'leads' as const,
              label: 'Meus Leads',
              icon: 'fa-solid fa-users',
              // 🆕 v1.3 — somatório de leads + prospects + clientes
              //   (o `total_leads` do stats filtra só funil_status='lead',
              //   por isso somamos os 3 funis para corresponder à listagem).
              count: stats
                ? stats.total_leads + stats.total_prospects + stats.total_clientes
                : leadsH.total,
            },
            // 🆕 v1.5 (Vinculação em Lote — 10/06/2026)
            //   Sem badge de contagem — esta aba não exibe uma listagem
            //   persistente, é uma operação de vinculação ad-hoc.
            //   🆕 v1.7 — promovida para a 3ª posição (entre Leads e
            //   Respostas), pois é a ponte ativos→campanha no funil.
            {
              key: 'vincular_em_lote' as const,
              label: 'Vincular em Lote',
              icon: 'fa-solid fa-link',
              count: null as number | null,
            },
            // 🆕 v1.2 (Fase 8-Inbox)
            {
              key: 'respostas' as const,
              label: 'Respostas Campanhas',
              icon: 'fa-solid fa-reply',
              count: stats?.total_respostas ?? respostasH.total, // 🆕 v1.3
            },
            {
              key: 'invalidos' as const,
              label: 'E-mails Inválidos',
              icon: 'fa-solid fa-circle-exclamation',
              count: stats?.total_invalidos ?? invalidosH.total, // 🆕 v1.3
            },
            // 🆕 v1.7 (13/06/2026) — Opt-Out movido das Configurações.
            //   Badge usa stats.total_optout (já vinha do crm-leads stats).
            //   Para GC/SDR, o backend (crm-config v1.1) filtra a listagem
            //   por leads do ator; o contador global no card KPI continua
            //   refletindo o universo do RBAC do usuário pelo mesmo
            //   mecanismo do stats.
            {
              key: 'opt_out' as const,
              label: 'Opt-Out',
              icon: 'fa-solid fa-ban',
              count: stats?.total_optout ?? null,
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
                // 🆕 v1.7 — 'opt_out' gerencia paginação internamente
                //          (o OptOutTab não usa hook compartilhado).
              }}
              className={`flex-1 md:flex-none px-6 py-3 text-sm font-medium flex items-center justify-center gap-2 border-b-2 transition-colors whitespace-nowrap ${
                abaAtiva === tab.key
                  ? 'border-indigo-600 text-indigo-600 bg-indigo-50/50'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}
            >
              <i className={tab.icon}></i>
              {tab.label}
              {tab.count !== null && tab.count !== undefined && (
                <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full text-xs">
                  {tab.count}
                </span>
              )}
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
            // 🆕 v1.8 (13/06/2026) — Ordenação configurável
            ordenarPor={leadsH.ordenarPor}
            loading={leadsH.loading}
            onBuscaChange={leadsH.setBusca}
            onFiltroFunilChange={(v) => {
              leadsH.setFiltroFunil(v);
              leadsH.setPagina(1);
            }}
            // 🆕 v1.8 — Ao mudar ordenação, volta para a 1ª página
            //   (UX coerente: faz sentido começar do topo após reordenar).
            onOrdenarPorChange={(v) => {
              leadsH.setOrdenarPor(v);
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

        {/* 🆕 v1.5 (Vinculação em Lote — 10/06/2026) — Aba Vincular em Lote */}
        {abaAtiva === 'vincular_em_lote' && (
          <VincularEmLoteTab currentUser={currentUser} />
        )}

        {/* 🆕 v1.7 (Reorganização Prospect/Lead — 13/06/2026) — Aba Opt-Out */}
        {abaAtiva === 'opt_out' && (
          <OptOutTab currentUser={currentUser} />
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
        onDesabilitar={handleDesabilitarLead}
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
