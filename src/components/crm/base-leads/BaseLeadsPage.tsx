/**
 * BaseLeadsPage.tsx — Container da Base de Leads
 *
 * Caminho: src/components/crm/base-leads/BaseLeadsPage.tsx
 * Versão: 1.19 (Separação CRM E-mail vs Base de Leads — 01/07/2026)
 *
 * 🆕 v1.19 (01/07/2026 — Separação CRM E-mail vs Base de Leads):
 *   As 3 abas de comunicação por e-mail (CRM E-mail / E-mails Inválidos
 *   / Opt-Out) foram MOVIDAS para o novo container CRMEmailPage.tsx
 *   (view 'crm_email' no Sidebar). Este componente passa a hospedar
 *   apenas 4 abas de gestão de funil de leads:
 *
 *     1. Minhas Empresas       (key='empresas')
 *     2. Meus Leads            (key='leads')
 *     3. Leads Importados      (key='leads_importados')
 *     4. Vincular em Lote      (key='vincular_em_lote')
 *
 *   Removido cirurgicamente (tudo migrado para CRMEmailPage.tsx v1.0):
 *     - Imports: useRespostas, useInvalidos, RespostasTab, InvalidosTab,
 *       OptOutTab, RecuperarParaCampanhaModal, InvalidoItem type
 *     - Hooks instanciados: respostasH, invalidosH
 *     - States: recoveringLeadIds, recuperandoLeadItem, recuperandoLeadIds
 *     - useEffects: aba 'respostas' e aba 'invalidos'
 *     - Handlers: handleTentarRecovery, handleAbrirRecuperar,
 *                 handleConfirmarRecuperacao
 *     - Modal: <RecuperarParaCampanhaModal />
 *     - KPI card: "Opt-Out" (fica apenas no CRMEmailPage)
 *     - Tab entries e blocos {abaAtiva === X && <XTab />} das 3 abas
 *
 *   Preservado sem mudanças:
 *     - Deep link do App.tsx (v60.4) — continua abrindo o drawer
 *       de detalhe do lead automaticamente. É esse mecanismo que o
 *       CRMEmailPage usa (via prop onAbrirLeadEmBase) para o botão
 *       "Abrir detalhe completo" no header da thread.
 *     - LeadFormModal + fluxo criar/editar lead — permanece aqui
 *       (é usado por Meus Leads, Empresas, Leads Importados).
 *     - salvarLead simplificado (removidas as chamadas de recarregar
 *       respostas/invalidos — hooks nem existem mais aqui).
 *
 * Histórico anterior:
 *  - v1.18 (30/06/2026) — Pacote P2 "CRM E-mail" Outbound (ligação do
 *    editor de resposta ao RespostasTab v2.3). MIGRADO ao CRMEmailPage.
 *  - v1.17 (30/06/2026) — Pacote P1 "CRM E-mail" (Inbox + Thread
 *    read-only). MIGRADO ao CRMEmailPage.
 *  - v1.16 (30/06/2026) — Filtros CRECI + Analista na aba Meus Leads.
 *  - v1.15 (23/06/2026) — Fluxo "Promover" na aba Inválidos. MIGRADO.
 *  - v1.14 (18/06/2026) — Anti-duplicidade em Importar Lista de Leads.
 *  - v1.13 (18/06/2026) — Promover Lead manual (Leads Importados).
 *  - v1.12 (17/06/2026) — Editar Lead Importado + auto-promoção.
 *  - v1.11 (17/06/2026) — Aba "Leads Importados".
 *  - v1.10 (16/06/2026) — Recovery de e-mail. MIGRADO.
 *  - Versões < 1.10 documentadas no histórico Git.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { useEmpresas } from '../shared/hooks/useEmpresas';
import { useLeads } from '../shared/hooks/useLeads';
import { useImportProspects } from '../shared/hooks/useImportProspects';
// 🆕 v1.4 (Lead RBAC fix) — hooks para o LeadFormModal
import { useTiposCampanha } from '../shared/hooks/useTiposCampanha';
import { useResponsaveis } from '../shared/hooks/useResponsaveis';

import EmpresasTab from './EmpresasTab';
import LeadsTab, { type OpcaoFiltroAnalista } from './LeadsTab';
// 🆕 v1.5 (Vinculação em Lote — 10/06/2026)
import VincularEmLoteTab from './VincularEmLoteTab';
// 🆕 v1.19 (01/07/2026 — Separação CRM E-mail vs Base de Leads):
//   Imports removidos (todos migrados para CRMEmailPage.tsx v1.0):
//     - useRespostas, useInvalidos (hooks)
//     - RespostasTab, InvalidosTab, OptOutTab (componentes)
//     - RecuperarParaCampanhaModal + InvalidoItem (Recuperação)
import EmpresaFormModal from './EmpresaFormModal';
import LeadFormModal from './LeadFormModal';
import EmpresaDetailDrawer from './EmpresaDetailDrawer';
import LeadDetailDrawer from './LeadDetailDrawer';
import ImportProspectsModal from './ImportProspectsModal';
// 🆕 v1.11 (Sub-fase 3.C — 17/06/2026)
import { useLeadsImportados } from '../shared/hooks/useLeadsImportados';
import ImportarListaLeadsModal from './ImportarListaLeadsModal';
import LeadsImportadosTab from './LeadsImportadosTab';
// 🆕 v1.12 (Sub-fase 3.D — 17/06/2026)
import EditarLeadImportadoModal from './EditarLeadImportadoModal';
import type { LeadImportado } from '../shared/hooks/useLeadsImportados';
// 🆕 v1.13 (Sub-fase 3.D refino — 18/06/2026)
import PromoverLeadModal from './PromoverLeadModal';

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
  // 🆕 v1.19 (01/07/2026) — Reduzido para 4 abas. Removidas:
  //   'respostas', 'invalidos', 'opt_out' (migradas ao CRMEmailPage).
  const [abaAtiva, setAbaAtiva] = useState<
    'empresas' | 'leads' | 'leads_importados' | 'vincular_em_lote'
  >('empresas');

  // ── Hooks ──
  const empresasH = useEmpresas();

  // 🆕 v1.16 (30/06/2026) — Defaults dos filtros novos da aba "Meus Leads"
  //   calculados por perfil. Calculados ANTES do useLeads para serem
  //   injetados via options (o hook só inicializa uma vez por mount).
  //
  //   Regra de produto (Messias, 30/06/2026):
  //     • incluirCreci default:
  //         - Admin → true (esconde via pill quando quiser)
  //         - SDR   → true (CRECI é o core operacional dela)
  //         - GC    → true (cosmético; RBAC do backend já bloqueia CRECI)
  //     • filtroAnalista default:
  //         - Admin → 'mine_or_unassigned' (vê seus + órfãos para alocar)
  //         - SDR   → 'mine_or_unassigned' (idem; pode alocar leads CRECI órfãos)
  //         - GC    → 'mine' (RBAC força; mantém estado canônico)
  const defaultsLeads = useMemo(() => {
    const tipo = currentUser.tipo_usuario;
    return {
      defaultIncluirCreci: true,
      defaultFiltroAnalista:
        tipo === 'Gestão Comercial' ? 'mine' : 'mine_or_unassigned',
    };
  }, [currentUser.tipo_usuario]);

  // 🆕 v1.11 (22/06/2026) — RBAC de visibilidade na aba "Meus Leads".
  //   Passa o currentUser para useLeads v1.3, que propaga para o backend
  //   crm-leads.ts v1.20 (actions listar_leads e stats).
  //   Decisão de produto: cada GC/SDR vê apenas leads sob sua
  //   responsabilidade (reservado_por); GC nunca vê CRECI; SDR vê todos
  //   CRECI; Admin vê tudo.
  // 🆕 v1.16 (30/06/2026) — também propaga os defaults dos filtros novos.
  const leadsH = useLeads({
    currentUser: {
      id: currentUser.id,
      tipo_usuario: currentUser.tipo_usuario,
    },
    defaultIncluirCreci: defaultsLeads.defaultIncluirCreci,
    defaultFiltroAnalista: defaultsLeads.defaultFiltroAnalista,
  });
  const importH = useImportProspects();
  // 🆕 v1.19 (01/07/2026) — useRespostas e useInvalidos migrados ao CRMEmailPage.
  // 🆕 v1.4 (Lead RBAC fix) — fontes p/ o LeadFormModal
  const tiposCampanhaH = useTiposCampanha();
  const responsaveisH = useResponsaveis();
  // 🆕 v1.11 (Sub-fase 3.C — 17/06/2026) — hook da nova aba "Leads Importados"
  const leadsImportadosH = useLeadsImportados({ userId: currentUser.id });

  // ── Modais de formulário ──
  const [modalEmpresa, setModalEmpresa] = useState<'criar' | 'editar' | null>(null);
  const [modalLead, setModalLead] = useState<'criar' | 'editar' | null>(null);
  const [formEmpresa, setFormEmpresa] = useState<Partial<Empresa>>({});
  const [formLead, setFormLead] = useState<Partial<Lead>>({});

  // ── Modal de importação ──
  const [modalImportarAberto, setModalImportarAberto] = useState(false);
  // 🆕 v1.11 (Sub-fase 3.C — 17/06/2026) — Modal "Importar Lista de Leads"
  const [modalImportarListaAberto, setModalImportarListaAberto] = useState(false);
  // 🆕 v1.12 (Sub-fase 3.D — 17/06/2026) — Modal "Editar Lead Importado"
  const [editandoLead, setEditandoLead] = useState<LeadImportado | null>(null);
  // 🆕 v1.13 (Sub-fase 3.D refino — 18/06/2026) — Modal "Promover Lead manualmente"
  const [promovendoLead, setPromovendoLead] = useState<LeadImportado | null>(null);

  // 🆕 v1.19 (01/07/2026) — States removidos (migrados ao CRMEmailPage):
  //   - recoveringLeadIds (motor Recovery da aba Inválidos)
  //   - recuperandoLeadItem / recuperandoLeadIds (fluxo Promover)

  // ── Efeitos: carregar dados ──
  useEffect(() => {
    leadsH.carregarStats();
    // 🆕 v1.4 — Verticais (todos os perfis precisam para o seletor)
    tiposCampanhaH.carregar();
    // 🆕 v1.9 — Empresas (lista global, alimenta o dropdown do LeadFormModal
    // independente da aba de entrada). O useEffect específico da aba
    // 'empresas' permanece abaixo, cuidando de paginação/busca/setor.
    empresasH.carregar();
    // 🆕 v1.4 — Lista de responsáveis (somente Admin precisa)
    // 🆕 v1.11 (Sub-fase 3.C — 17/06/2026) — Agora também TODOS os perfis
    // precisam: o modal "Importar Lista de Leads" usa a lista para resolver
    // a coluna "Responsável" da planilha em `app_users.id`.
    responsaveisH.carregar();
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
  }, [
    abaAtiva,
    leadsH.pagina,
    leadsH.busca,
    leadsH.filtroFunil,
    leadsH.ordenarPor,
    // 🆕 v1.16 (30/06/2026) — recarrega ao trocar filtros novos
    leadsH.incluirCreci,
    leadsH.filtroAnalista,
  ]);

  // 🆕 v1.19 (01/07/2026) — useEffects das abas 'respostas' e 'invalidos'
  //   REMOVIDOS (migrados ao CRMEmailPage).

  // 🆕 v1.11 (Sub-fase 3.C — 17/06/2026) — carregar Leads Importados sob demanda
  useEffect(() => {
    if (abaAtiva === 'leads_importados') {
      leadsImportadosH.carregar();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    abaAtiva,
    leadsImportadosH.page,
    leadsImportadosH.perPage,
    leadsImportadosH.apenasMeus,
    leadsImportadosH.filtroStatus,
    leadsImportadosH.ordenacao,
  ]);

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
      // 🆕 v1.19 (01/07/2026) — Recarregamentos de respostasH/invalidosH
      //   removidos (hooks migrados ao CRMEmailPage). Se o operador corrigir
      //   um e-mail nesta página, o novo estado será visto na próxima visita
      //   à página CRM E-mail (que recarrega no mount).
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

  // 🆕 v1.16 (30/06/2026) — Lógica perfil-aware da toolbar da aba "Meus Leads".
  //   Memoizada para não recalcular a cada render. Atualiza apenas quando o
  //   perfil ou a lista de responsáveis muda.
  //
  //   • mostrarFiltroCreci: GC tem RBAC backend que esconde CRECI → pill seria
  //     redundante. Admin/SDR enxergam normalmente.
  //
  //   • filtroAnalistaDisabled: GC só vê os dele por design (RBAC). Dropdown
  //     fica visível para affordance mas inerte.
  //
  //   • opcoesFiltroAnalista: composta com 3 opções fixas + (se Admin) lista
  //     dos outros analistas + opção "Todos". SDR e GC NÃO veem outros
  //     analistas (não têm direito por RBAC). Para GC, é apenas "Meus".
  const mostrarFiltroCreci = useMemo(() => {
    return (
      currentUser.tipo_usuario === 'Administrador' ||
      currentUser.tipo_usuario === 'SDR'
    );
  }, [currentUser.tipo_usuario]);

  const filtroAnalistaDisabled = useMemo(() => {
    return currentUser.tipo_usuario === 'Gestão Comercial';
  }, [currentUser.tipo_usuario]);

  const opcoesFiltroAnalista = useMemo<OpcaoFiltroAnalista[]>(() => {
    const tipo = currentUser.tipo_usuario;

    // GC: só vê os dele (RBAC). Dropdown inerte com 1 opção visível.
    if (tipo === 'Gestão Comercial') {
      return [{ value: 'mine', label: 'Meus Leads' }];
    }

    // Opções fixas comuns a Admin e SDR
    const fixas: OpcaoFiltroAnalista[] = [
      { value: 'mine_or_unassigned', label: 'Meus + Sem analista' },
      { value: 'mine', label: 'Apenas meus' },
      { value: 'unassigned', label: 'Apenas sem analista' },
    ];

    // SDR para por aqui (RBAC bloqueia vê leads de outros, exceto CRECI).
    if (tipo === 'SDR') {
      return fixas;
    }

    // Admin: adiciona outros analistas + opção "Todos".
    //   Filtra o próprio Admin da lista de "outros" (já coberto por 'mine').
    //   Filtra também perfis sem nome ou ids inválidos por defesa.
    const outros: OpcaoFiltroAnalista[] = (responsaveisH.responsaveis || [])
      .filter(
        (r: any) =>
          r &&
          typeof r.id === 'number' &&
          r.id !== currentUser.id &&
          (r.nome_usuario || r.nome)
      )
      .map((r: any) => ({
        value: String(r.id),
        label: (r.nome_usuario || r.nome) as string,
      }))
      // Ordena alfabeticamente para previsibilidade
      .sort((a: OpcaoFiltroAnalista, b: OpcaoFiltroAnalista) =>
        a.label.localeCompare(b.label, 'pt-BR')
      );

    return [...fixas, ...outros, { value: 'all', label: 'Todos os analistas' }];
  }, [currentUser.tipo_usuario, currentUser.id, responsaveisH.responsaveis]);

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
            Gestão do funil de prospecção — empresas, leads e importações
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={abrirImportacao}
            className="px-3 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 flex items-center gap-1.5 transition-colors"
          >
            <i className="fa-solid fa-download"></i> Importar Prospects
          </button>
          {/* 🆕 v1.11 (Sub-fase 3.C — 17/06/2026) — Importar Lista de Leads (Excel/CSV) */}
          <button
            onClick={() => setModalImportarListaAberto(true)}
            className="px-3 py-2 bg-teal-600 text-white rounded-lg text-sm font-medium hover:bg-teal-700 flex items-center gap-1.5 transition-colors"
          >
            <i className="fa-solid fa-file-import"></i> Importar Lista de Leads
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
      {/* 🆕 v1.19 (01/07/2026) — KPI "Opt-Out" REMOVIDO (migrado ao
          CRMEmailPage). Grid ajustado de md:5 para md:4. */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
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
            // 🆕 v1.11 (Sub-fase 3.C — 17/06/2026) — Leads Importados (motor='importacao_lista')
            //   Posição: entre "Meus Leads" e "Vincular em Lote" (ordem semântica
            //   do funil — importar → revalidar → vincular à campanha).
            //   Badge usa o total atual do hook (carregado sob demanda quando
            //   a aba é aberta — pisca '—' até a primeira carga).
            {
              key: 'leads_importados' as const,
              label: 'Leads Importados',
              icon: 'fa-solid fa-file-import',
              count: leadsImportadosH.total,
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
            // 🆕 v1.19 (01/07/2026) — Tab entries REMOVIDAS:
            //   'respostas' (CRM E-mail), 'invalidos' (E-mails Inválidos),
            //   'opt_out' (Opt-Out). Todas migradas ao CRMEmailPage.
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => {
                setAbaAtiva(tab.key);
                // Reseta paginação ao trocar de aba
                if (tab.key === 'empresas') empresasH.setPagina(1);
                else if (tab.key === 'leads') leadsH.setPagina(1);
                // 🆕 v1.11 (Sub-fase 3.C — 17/06/2026)
                else if (tab.key === 'leads_importados') leadsImportadosH.setPage(1);
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
            // 🆕 v1.16 (30/06/2026) — Filtros novos
            incluirCreci={leadsH.incluirCreci}
            filtroAnalista={leadsH.filtroAnalista}
            mostrarFiltroCreci={mostrarFiltroCreci}
            opcoesFiltroAnalista={opcoesFiltroAnalista}
            filtroAnalistaDisabled={filtroAnalistaDisabled}
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
            // 🆕 v1.16 (30/06/2026) — Ao mudar filtros, volta para a 1ª página
            //   (mesma justificativa UX da ordenação).
            onIncluirCreciChange={(v) => {
              leadsH.setIncluirCreci(v);
              leadsH.setPagina(1);
            }}
            onFiltroAnalistaChange={(v) => {
              leadsH.setFiltroAnalista(v);
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

        {/* 🆕 v1.19 (01/07/2026) — Blocos das abas 'respostas' e 'invalidos'
            REMOVIDOS. Migrados ao CRMEmailPage.tsx. */}

        {/* 🆕 v1.5 (Vinculação em Lote — 10/06/2026) — Aba Vincular em Lote */}
        {abaAtiva === 'vincular_em_lote' && (
          <VincularEmLoteTab currentUser={currentUser} />
        )}

        {/* 🆕 v1.11 (Sub-fase 3.C — 17/06/2026) — Aba Leads Importados */}
        {abaAtiva === 'leads_importados' && (
          <LeadsImportadosTab
            hook={leadsImportadosH}
            // 🆕 v1.12 (Sub-fase 3.D — 17/06/2026)
            onEditar={(lead) => setEditandoLead(lead)}
            // 🆕 v1.13 (Sub-fase 3.D refino — 18/06/2026)
            onPromover={(lead) => setPromovendoLead(lead)}
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

      {/* 🆕 v1.11 (Sub-fase 3.C — 17/06/2026) — Modal "Importar Lista de Leads" */}
      <ImportarListaLeadsModal
        aberto={modalImportarListaAberto}
        responsaveis={responsaveisH.responsaveis}
        cotaResidual={leadsImportadosH.cotaResidual}
        onImportar={leadsImportadosH.importarLote}
        onConcluido={() => {
          // Após import, recarrega listagem da aba e stats globais
          leadsImportadosH.carregar();
          leadsH.carregarStats();
        }}
        onFechar={() => setModalImportarListaAberto(false)}
        // 🆕 v1.14 (Sub-fase 3.D refino — 18/06/2026) — Anti-duplicidade pré-upload
        onVerificarDuplicidade={leadsImportadosH.verificarDuplicidade}
      />

      {/* 🆕 v1.12 (Sub-fase 3.D — 17/06/2026) — Modal "Editar Lead Importado" */}
      <EditarLeadImportadoModal
        aberto={editandoLead !== null}
        lead={editandoLead}
        currentUser={currentUser}
        responsaveis={responsaveisH.responsaveis}
        verticaisDisponiveis={(tiposCampanhaH.tipos ?? []).map(t => t.nome)}
        onSalvar={async (lead_id, novos_dados) => {
          const atualizado = await leadsImportadosH.editar(lead_id, novos_dados);
          return atualizado;
        }}
        onFechar={() => setEditandoLead(null)}
      />

      {/* 🆕 v1.13 (Sub-fase 3.D refino — 18/06/2026) — Modal "Promover Lead manualmente" */}
      <PromoverLeadModal
        aberto={promovendoLead !== null}
        lead={promovendoLead}
        onConfirmar={async (lead_id) => {
          const r = await leadsImportadosH.promoverManualmente(lead_id);
          // Quando promoção bem-sucedida (ou lead já existia), o hook v1.3
          // remove o item do array local. Atualizamos as stats globais
          // (badge "Leads") para refletir o novo total de email_leads.
          if (r.success && (r.promovido || r.motivo === 'lead_ja_existia')) {
            leadsH.carregarStats();
          }
          return r;
        }}
        onFechar={() => setPromovendoLead(null)}
      />

      {/* 🆕 v1.19 (01/07/2026) — RecuperarParaCampanhaModal REMOVIDO
          (migrado ao CRMEmailPage — a aba Inválidos vive lá agora). */}

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

