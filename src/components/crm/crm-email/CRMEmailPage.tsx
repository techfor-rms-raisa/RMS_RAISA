/**
 * CRMEmailPage.tsx — Container do módulo "CRM E-mail"
 *
 * Caminho: src/components/crm/crm-email/CRMEmailPage.tsx
 * Versão: 1.0 (Separação CRM E-mail vs Base de Leads — 01/07/2026)
 *
 * 🆕 v1.0 (01/07/2026 — Separação CRM E-mail vs Base de Leads):
 *   Novo container que isola as 3 abas de comunicação por e-mail
 *   (CRM E-mail, E-mails Inválidos e Opt-Out) que antes viviam no
 *   BaseLeadsPage. A separação segue a decisão de produto do Messias:
 *   Base de Leads = "gestão do funil de leads" pura; CRM E-mail =
 *   "painel de comunicação com leads via e-mail".
 *
 *   Estrutura interna (mesmo padrão do BaseLeadsPage):
 *     - Header com título + subtítulo
 *     - 3 KPI cards (Respostas / Inválidos / Opt-Out)
 *     - Sub-nav horizontal de 3 abas
 *     - Conteúdo da aba ativa
 *     - Modais (LeadFormModal para editar e-mail inválido +
 *       RecuperarParaCampanhaModal para promover inválido corrigido)
 *
 *   Autonomia deliberada:
 *     • Instancia seus próprios hooks (useRespostas, useInvalidos,
 *       useLeads para stats+edição, useTiposCampanha e useResponsaveis
 *       para o LeadFormModal). Nenhum estado é compartilhado com o
 *       BaseLeadsPage — cada página tem seu próprio ciclo de vida.
 *
 *     • Traz TODOS os handlers relacionados aos 3 fluxos:
 *         - handleTentarRecovery      (motor Recovery 3.A)
 *         - handleAbrirRecuperar      (abre modal de promoção)
 *         - handleConfirmarRecuperacao (confirma promoção para campanha)
 *         - abrirEditarLeadPorId      (edição inline do lead inválido)
 *         - salvarLead + handleDesabilitarLead (fluxo do LeadFormModal)
 *
 *   Bridge para o BaseLeadsPage (Opção A — decidida 01/07/2026):
 *     • Quando o operador clica em "Abrir detalhe completo do lead"
 *       no header de uma thread (RespostasTab), o CRMEmailPage NÃO
 *       tem seu próprio LeadDetailDrawer — em vez disso, chama a
 *       prop `onAbrirLeadEmBase(leadId)` que o App.tsx implementa como
 *       setCurrentView('crm_base_leads') + setDeepLinkLeadId(leadId).
 *       O drawer abre no BaseLeadsPage via o mecanismo de deep link
 *       existente (v60.4). Uma tela de contexto por vez.
 *
 *     • Para o "Editar cadastro" da aba Inválidos, a decisão foi
 *       OPOSTA: o LeadFormModal fica inline aqui. Motivo semântico:
 *       "estou olhando os inválidos, quero corrigir agora" não deve
 *       forçar uma navegação. Custa 2 hooks extras (tiposCampanha e
 *       responsaveis) — vale a pena.
 *
 *   Dependências:
 *     - useRespostas v2.1, useInvalidos v1.3, useLeads v1.4
 *     - useTiposCampanha, useResponsaveis
 *     - RespostasTab v2.3, InvalidosTab v1.3, OptOutTab v1.0
 *     - LeadFormModal, RecuperarParaCampanhaModal v1.0
 *     - Backend: crm-leads.ts v1.25.5 (respostas), v1.22 (invalidos),
 *                crm-config v1.1 (opt-out), campaign-email-recovery
 */

import React, { useEffect, useState } from 'react';
import { useRespostas } from '../shared/hooks/useRespostas';
import { useInvalidos } from '../shared/hooks/useInvalidos';
import { useLeads } from '../shared/hooks/useLeads';
import { useTiposCampanha } from '../shared/hooks/useTiposCampanha';
import { useResponsaveis } from '../shared/hooks/useResponsaveis';

import RespostasTab from '../base-leads/RespostasTab';
import InvalidosTab from '../base-leads/InvalidosTab';
import OptOutTab from '../base-leads/OptOutTab';
import LeadFormModal from '../base-leads/LeadFormModal';
import RecuperarParaCampanhaModal from '../campanhas/RecuperarParaCampanhaModal';

import KpiCard from '../shared/components/KpiCard';
import type { CurrentUserLite, Lead } from '../types/crm.types';
import type { InvalidoItem } from '../shared/hooks/useInvalidos';

// ════════════════════════════════════════════════════════════
// PROPS
// ════════════════════════════════════════════════════════════

export interface CRMEmailPageProps {
  currentUser: CurrentUserLite;
  /**
   * Bridge Opção A — o CRMEmailPage não hospeda o LeadDetailDrawer.
   * Quando o operador clica em "Abrir detalhe completo" no header de
   * uma thread, chamamos essa prop e o App.tsx troca para
   * `crm_base_leads` + seta o deepLinkLeadId, o que faz o BaseLeadsPage
   * abrir automaticamente o drawer daquele lead.
   */
  onAbrirLeadEmBase: (leadId: number) => void;
}

// ════════════════════════════════════════════════════════════
// COMPONENTE
// ════════════════════════════════════════════════════════════

type AbaEmail = 'respostas' | 'invalidos' | 'opt_out';

const CRMEmailPage: React.FC<CRMEmailPageProps> = ({
  currentUser,
  onAbrirLeadEmBase,
}) => {
  // ── Aba ativa ──
  const [abaAtiva, setAbaAtiva] = useState<AbaEmail>('respostas');

  // ── Hooks ──
  const respostasH = useRespostas({
    currentUser: {
      id: currentUser.id,
      tipo_usuario: currentUser.tipo_usuario,
    },
  });
  const invalidosH = useInvalidos({
    currentUser: {
      id: currentUser.id,
      tipo_usuario: currentUser.tipo_usuario,
    },
  });
  // useLeads: usamos apenas .carregarStats() (para os badges/KPIs) e
  // .salvar() + .desabilitar() (fluxo de edição inline do LeadFormModal
  // disparado pela aba Inválidos). NÃO usamos listagem/filtros — CRECI
  // e filtroAnalista não fazem sentido aqui, então mantemos os defaults.
  const leadsH = useLeads({
    currentUser: {
      id: currentUser.id,
      tipo_usuario: currentUser.tipo_usuario,
    },
  });
  // Sources para o LeadFormModal (dropdowns de vertical e responsável)
  const tiposCampanhaH = useTiposCampanha();
  const responsaveisH = useResponsaveis();

  // ── Modais ──
  const [modalLead, setModalLead] = useState<'criar' | 'editar' | null>(null);
  const [formLead, setFormLead] = useState<Partial<Lead>>({});

  // Recovery em andamento (Set imutável para re-render)
  const [recoveringLeadIds, setRecoveringLeadIds] = useState<Set<number>>(new Set());

  // Modal Recuperar Para Campanha
  const [recuperandoLeadItem, setRecuperandoLeadItem] = useState<InvalidoItem | null>(null);
  const [recuperandoLeadIds, setRecuperandoLeadIds] = useState<Set<number>>(new Set());

  // ════════════════════════════════════════════════════════════
  // EFEITOS
  // ════════════════════════════════════════════════════════════

  // Mount inicial: stats globais + fontes do LeadFormModal
  useEffect(() => {
    leadsH.carregarStats();
    tiposCampanhaH.carregar();
    responsaveisH.carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Aba Respostas — carregar sob demanda
  useEffect(() => {
    if (abaAtiva === 'respostas') {
      respostasH.carregar();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abaAtiva, respostasH.pagina, respostasH.busca]);

  // Aba Inválidos — carregar sob demanda
  useEffect(() => {
    if (abaAtiva === 'invalidos') {
      invalidosH.carregar();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abaAtiva, invalidosH.pagina, invalidosH.busca]);

  // ════════════════════════════════════════════════════════════
  // HANDLERS — EDIÇÃO INLINE DO LEAD (chamado pela aba Inválidos)
  // ════════════════════════════════════════════════════════════

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
      leadsH.carregarStats();
      // Recarrega inválidos — corrigir email pode remover o lead da aba
      // (backend limpa bounced_motivo quando email muda).
      if (abaAtiva === 'invalidos') invalidosH.carregar();
      if (abaAtiva === 'respostas') respostasH.carregar();
    }
  };

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
    leadsH.carregarStats();
    if (abaAtiva === 'invalidos') invalidosH.carregar();
  };

  // ════════════════════════════════════════════════════════════
  // HANDLER — RECOVERY (motor 3.A)
  // ════════════════════════════════════════════════════════════

  const handleTentarRecovery = async (leadId: number) => {
    const itemAtual = invalidosH.itens.find((i: any) => i.lead_id === leadId);
    const tentativas = itemAtual?.tentativas_recovery ?? 0;
    const restantes = Math.max(0, 3 - tentativas);

    const confirmou = window.confirm(
      `Tentar recuperar o email correto deste lead via motor de Recovery?\n\n` +
      `Tentativas restantes: ${restantes}/3\n\n` +
      `Esta operação consome créditos Snov.io e chamadas Gemini API. ` +
      `Pode levar até ~60 segundos.`,
    );
    if (!confirmou) return;

    setRecoveringLeadIds((prev) => {
      const next = new Set(prev);
      next.add(leadId);
      return next;
    });

    try {
      const resp = await fetch('/api/campaign-email-recovery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'recover_lead',
          lead_id: leadId,
          criado_por: currentUser.nome_usuario || 'sistema',
        }),
      });
      const data = await resp.json().catch(() => ({}));

      if (!resp.ok) {
        alert(
          `❌ Falha no Recovery (HTTP ${resp.status}):\n` +
          (data?.error || 'Erro desconhecido. Verifique os logs do Vercel.'),
        );
      } else {
        switch (data?.status) {
          case 'recovered':
            alert(
              `✅ Email recuperado com sucesso!\n\n` +
              `Novo email: ${data?.email || '—'}\n` +
              `Método: ${data?.metodo_validacao || 'snov.io'}\n` +
              `Posição na cascata: ${data?.posicao ?? '—'}\n\n` +
              `O lead foi reenfileirado nas campanhas em que estava ativo.`,
            );
            break;
          case 'no_match':
            alert(
              `⚠️ Recovery não encontrou um email válido nesta tentativa.\n\n` +
              `Tentativas restantes: ${Math.max(0, 3 - (data?.tentativas_recovery ?? tentativas + 1))}/3\n\n` +
              `Você pode tentar novamente ou corrigir o email manualmente.`,
            );
            break;
          case 'limite_atingido':
            alert(
              `⚠️ Tentativas de Recovery esgotadas (3/3).\n\n` +
              `Corrija o email manualmente clicando em "Editar".`,
            );
            break;
          case 'dominio_invalido':
            alert(
              `⚠️ Domínio do email é inválido (MX inexistente).\n\n` +
              `Recovery não pode operar. Corrija o email manualmente.`,
            );
            break;
          default:
            alert(
              `Recovery concluído com status: "${data?.status || 'desconhecido'}".\n\n` +
              (data?.mensagem || 'Veja os logs para detalhes.'),
            );
        }
      }
    } catch (err: any) {
      alert('❌ Erro de rede ao chamar Recovery: ' + (err?.message || 'desconhecido'));
    } finally {
      setRecoveringLeadIds((prev) => {
        const next = new Set(prev);
        next.delete(leadId);
        return next;
      });
      invalidosH.carregar();
      leadsH.carregarStats();
    }
  };

  // ════════════════════════════════════════════════════════════
  // HANDLERS — RECUPERAR INVÁLIDO PARA CAMPANHA
  // ════════════════════════════════════════════════════════════

  const handleAbrirRecuperar = (leadId: number) => {
    const item = invalidosH.itens.find((i: InvalidoItem) => i.lead_id === leadId);
    if (!item) {
      alert('Lead não encontrado na listagem atual — recarregue a página.');
      return;
    }
    setRecuperandoLeadItem(item);
  };

  const handleConfirmarRecuperacao = async (leadId: number, campanhaId: number) => {
    setRecuperandoLeadIds((prev) => {
      const next = new Set(prev);
      next.add(leadId);
      return next;
    });

    try {
      const resultado = await invalidosH.recuperarParaCampanha(
        leadId,
        campanhaId,
        currentUser.nome_usuario,
      );

      if (resultado.success) {
        const nomeCamp = resultado.vinculo?.campanha_nome || 'campanha';
        const enfileirados = resultado.vinculo?.enfileirados ?? 0;
        alert(
          `✅ Lead recuperado com sucesso!\n\n` +
          `Vinculado à campanha: "${nomeCamp}"\n` +
          (enfileirados > 0
            ? `Emails enfileirados imediatamente: ${enfileirados}\n\n`
            : `O lead receberá os emails quando a campanha iniciar.\n\n`) +
          `O lead saiu da aba "E-mails Inválidos".`,
        );
        setRecuperandoLeadItem(null);
        invalidosH.carregar();
        leadsH.carregarStats();
      } else {
        alert(
          `❌ Não foi possível recuperar o lead:\n\n${resultado.error || 'Erro desconhecido.'}`,
        );
      }
    } catch (err: any) {
      alert(
        `❌ Erro de rede ao recuperar lead:\n\n${err?.message || 'desconhecido'}`,
      );
    } finally {
      setRecuperandoLeadIds((prev) => {
        const next = new Set(prev);
        next.delete(leadId);
        return next;
      });
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
            <i className="fa-solid fa-envelope-open-text text-indigo-600"></i>
            CRM E-mail
          </h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Respostas de campanhas, e-mails inválidos e opt-outs LGPD
          </p>
        </div>
      </div>

      {/* ── KPI Cards ── */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <KpiCard
            label="Respostas"
            valor={stats.total_respostas ?? respostasH.total}
            icon="fa-solid fa-envelope-open-text"
            cor="blue"
          />
          <KpiCard
            label="E-mails Inválidos"
            valor={stats.total_invalidos ?? invalidosH.total}
            icon="fa-solid fa-circle-exclamation"
            cor="red"
          />
          <KpiCard
            label="Opt-Out"
            valor={stats.total_optout}
            icon="fa-solid fa-ban"
            cor="gray"
          />
        </div>
      )}

      {/* ── Sub-nav horizontal ── */}
      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <div className="flex border-b overflow-x-auto">
          {[
            {
              key: 'respostas' as const,
              label: 'CRM E-mail',
              icon: 'fa-solid fa-envelope-open-text',
              count: stats?.total_respostas ?? respostasH.total,
            },
            {
              key: 'invalidos' as const,
              label: 'E-mails Inválidos',
              icon: 'fa-solid fa-circle-exclamation',
              count: stats?.total_invalidos ?? invalidosH.total,
            },
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
                if (tab.key === 'respostas') respostasH.setPagina(1);
                else if (tab.key === 'invalidos') invalidosH.setPagina(1);
                // 'opt_out' gerencia paginação internamente
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

        {/* Aba "CRM E-mail" — RespostasTab v2.3 */}
        {abaAtiva === 'respostas' && (
          <RespostasTab
            // ── Estado A — Inbox ──
            threads={respostasH.threads}
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
            onAbrirThread={(leadId, campanhaId) =>
              respostasH.abrirThread(leadId, campanhaId)
            }
            // ── Estado B — Thread aberta ──
            threadAtiva={respostasH.threadAtiva}
            mensagens={respostasH.mensagens}
            loadingThread={respostasH.loadingThread}
            erroThread={respostasH.erroThread}
            onVoltarParaInbox={respostasH.voltarParaInbox}
            // Editor + envio outbound
            podeResponder={respostasH.podeResponder}
            motivoBloqueio={respostasH.motivoBloqueio}
            enviando={respostasH.enviando}
            erroEnvio={respostasH.erroEnvio}
            onResponder={respostasH.responder}
            currentUserNome={
              (currentUser as any).nome_usuario || (currentUser as any).nome || undefined
            }
            currentUserEmail={
              (currentUser as any).email_usuario ||
              (currentUser as any).email ||
              undefined
            }
            // ── Bridge Opção A — navega para BaseLeadsPage com deep link ──
            onAbrirLead={onAbrirLeadEmBase}
          />
        )}

        {/* Aba "E-mails Inválidos" — InvalidosTab v1.3 */}
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
            onTentarRecovery={handleTentarRecovery}
            recoveringLeadIds={Array.from(recoveringLeadIds)}
            onPromover={handleAbrirRecuperar}
            promovendoLeadIds={Array.from(recuperandoLeadIds)}
          />
        )}

        {/* Aba "Opt-Out" — OptOutTab v1.0 */}
        {abaAtiva === 'opt_out' && (
          <OptOutTab currentUser={currentUser} />
        )}
      </div>

      {/* ════════════════════════════════════════════════════════════ */}
      {/* MODAIS                                                       */}
      {/* ════════════════════════════════════════════════════════════ */}

      {/* Editar Lead (disparado pelo "Editar cadastro" da aba Inválidos) */}
      <LeadFormModal
        modo={modalLead}
        form={formLead}
        loading={leadsH.loading}
        empresas={[]}
        verticais={tiposCampanhaH.tipos}
        currentUser={currentUser}
        responsaveis={responsaveisH.responsaveis}
        onChange={setFormLead}
        onSalvar={salvarLead}
        onFechar={() => setModalLead(null)}
        onDesabilitar={handleDesabilitarLead}
      />

      {/* Recuperar Inválido para Campanha (botão "Promover" purple) */}
      <RecuperarParaCampanhaModal
        aberto={recuperandoLeadItem !== null}
        leadId={recuperandoLeadItem?.lead_id ?? null}
        leadNome={recuperandoLeadItem?.lead_nome ?? ''}
        leadEmail={recuperandoLeadItem?.lead_email ?? ''}
        leadVertical={recuperandoLeadItem?.vertical ?? null}
        criadoPorEmail={currentUser.nome_usuario}
        isLoading={
          recuperandoLeadItem
            ? recuperandoLeadIds.has(recuperandoLeadItem.lead_id)
            : false
        }
        onFechar={() => setRecuperandoLeadItem(null)}
        onConfirmar={handleConfirmarRecuperacao}
      />
    </div>
  );
};

export default CRMEmailPage;
