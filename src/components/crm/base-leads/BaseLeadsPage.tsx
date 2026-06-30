/**
 * BaseLeadsPage.tsx — Container da Base de Leads
 *
 * Caminho: src/components/crm/base-leads/BaseLeadsPage.tsx
 * Versão: 1.16 (Filtros "CRECI" e "Analista" na aba "Meus Leads" — 30/06/2026)
 *
 * 🆕 v1.16 (30/06/2026 — Filtros "CRECI" e "Analista" na aba "Meus Leads"):
 *   Liga 2 novos filtros perfil-aware ao LeadsTab v1.2 e ao useLeads v1.4.
 *   Motivação: GC/SDR/Admin afogados com 2.360+ leads CRECI dominando a
 *   aba "Meus Leads". Esta versão dá controle granular sem comprometer
 *   o RBAC já vigente (v1.20 no backend).
 *
 *   Mudanças cirúrgicas:
 *    - Novo `useMemo` `defaultsLeads`: calcula `defaultIncluirCreci` e
 *      `defaultFiltroAnalista` por perfil do `currentUser`.
 *        • Admin/SDR/GC → defaultIncluirCreci=true (Admin esconde com
 *          o pill quando quiser; SDR mantém CRECI por ser seu core; GC
 *          nunca vê CRECI por RBAC então o default é cosmético).
 *        • Admin/SDR → defaultFiltroAnalista='mine_or_unassigned' (vê
 *          seus + órfãos para alocar sem trocar filtro).
 *        • GC → defaultFiltroAnalista='mine' (RBAC já força, mas
 *          mantém o estado canônico).
 *
 *    - Novos `useMemo`s para a LeadsTab:
 *        • `mostrarFiltroCreci`: true para Admin e SDR (GC oculta).
 *        • `filtroAnalistaDisabled`: true para GC (dropdown inerte).
 *        • `opcoesFiltroAnalista`: lista construída a partir do
 *          `responsaveisH.responsaveis`. Para Admin: 4 opções fixas
 *          + 1 por outro analista. Para SDR: 3 opções fixas (sem
 *          'all' nem outros analistas — RBAC restringe). Para GC: 1
 *          opção fixa (dropdown desabilitado).
 *
 *    - `useLeads` agora recebe `defaultIncluirCreci` e
 *      `defaultFiltroAnalista` via options. Sem mais nenhum efeito
 *      colateral — o hook v1.4 inicializa os states e propaga.
 *
 *    - `<LeadsTab>` recebe 5 props novas: `incluirCreci`,
 *      `filtroAnalista`, `mostrarFiltroCreci`, `opcoesFiltroAnalista`,
 *      `filtroAnalistaDisabled` + 2 handlers (`onIncluirCreciChange`,
 *      `onFiltroAnalistaChange`). Ao mudar qualquer filtro, voltamos
 *      para a página 1 (UX coerente com a mudança de ordenação na v1.8).
 *
 *    - `useEffect` da aba 'leads' adiciona `leadsH.incluirCreci` e
 *      `leadsH.filtroAnalista` na dep array — recarrega ao alternar.
 *
 *   Dependência: useLeads v1.4 (estados + setters), LeadsTab v1.2 (UI),
 *   crm-leads.ts v1.23 (parâmetros backend).
 *
 *   Compatibilidade: nenhum dos arquivos a montante quebra. Se algum
 *   caller (outra página) usar useLeads sem os novos defaults, o
 *   comportamento legado v1.3 fica preservado (incluirCreci=true,
 *   filtroAnalista=''). LeadsTab v1.2 idem: sem os novos props, os
 *   controles simplesmente não renderizam.
 *
 * 🆕 v1.15 (23/06/2026 — Recuperação de inválidos para campanha):
 *   Adiciona o fluxo "Promover" na aba "E-mails Inválidos". Quando o
 *   lead foi previamente corrigido (bounced=false), o gestor/SDR pode
 *   recuperá-lo diretamente para uma campanha sem precisar navegar
 *   para o Wizard ou para a aba Vincular em Lote.
 *
 *   Mudanças cirúrgicas:
 *    - Novo import: RecuperarParaCampanhaModal.
 *    - Novo state: `recuperandoLeadItem` (objeto do InvalidoItem
 *      selecionado — guardamos o objeto inteiro para evitar requisição
 *      adicional, já temos nome/email/vertical do listar_invalidos v1.22).
 *    - Novo state: `recuperandoLeadIds` (Set<number>) para mostrar
 *      spinner no botão Promover enquanto a chamada está em andamento.
 *    - Handler `handleAbrirRecuperar(leadId)`: encontra o item na
 *      listagem corrente e abre o modal.
 *    - Handler `handleConfirmarRecuperacao(leadId, campanhaId)`: chama
 *      `invalidosH.recuperarParaCampanha`, mostra feedback, fecha o
 *      modal e recarrega aba+stats em sucesso.
 *    - <InvalidosTab> recebe 2 props novas: `onPromover` e
 *      `promovendoLeadIds`.
 *    - RecuperarParaCampanhaModal instanciado junto dos demais modais.
 *
 *   Dependência runtime:
 *     • Backend crm-leads.ts v1.22 (action recuperar_invalido_para_campanha
 *       + listar_invalidos com bounced/vertical no payload).
 *     • useInvalidos.ts v1.3 (método recuperarParaCampanha).
 *     • InvalidosTab.tsx v1.3 (botão Promover purple).
 *     • RecuperarParaCampanhaModal.tsx v1.0 (componente novo).
 *
 *   Compatibilidade: InvalidosTab v1.3 mantém props opcionais — se
 *   `onPromover` for omitido, o botão Promover não aparece (degradação
 *   graciosa preservada).
 *
 * v1.14 (18/06/2026 — Sub-fase 3.D refino: Anti-duplicidade de importação):
 *   Cirurgia mínima: passa a nova prop `onVerificarDuplicidade` ao
 *   `ImportarListaLeadsModal` v1.1, ligando ao método
 *   `leadsImportadosH.verificarDuplicidade` do hook v1.4. Permite ao
 *   modal classificar cada email da planilha contra `email_leads`,
 *   `email_optout` e `prospect_leads` na pré-visualização e bloquear
 *   submit de duplicatas (LGPD + integridade do CRM).
 *
 *   Dependência: backend revalidacao-leads-importados v1.5 com action
 *   POST `?action=verificar_duplicidade`, e prospect-revalidate v1.4
 *   com defesa em profundidade no INSERT preventivo.
 *
 * v1.13 (18/06/2026 — Sub-fase 3.D refino: Promover Lead manual):
 *   Adiciona o fluxo de promoção manual para leads importados que
 *   caíram em `nao_localizado` (cascade automatizado falhou).
 *
 *   Mudanças cirúrgicas:
 *    - Novo import: PromoverLeadModal.
 *    - Novo state: `promovendoLead: LeadImportado | null`.
 *    - LeadsImportadosTab recebe nova prop `onPromover`.
 *    - PromoverLeadModal instanciado junto dos demais modais, chamando
 *      `leadsImportadosH.promoverManualmente(lead_id)` no onConfirmar.
 *    - Após promoção bem-sucedida: dispara `leadsH.carregarStats()` para
 *      o badge "Leads" refletir o novo total (que ganhou 1 lead promovido).
 *      A aba "Leads Importados" já tem o item removido localmente pelo
 *      hook v1.3.
 *
 *   Dependência: backend revalidacao-leads-importados v1.3 com a action
 *   POST `?action=promover_manualmente`, e helper promover-email-lead v1.1
 *   com origem parametrizada.
 *
 * v1.12 (17/06/2026 — Sub-fase 3.D: Auto-promoção + Edição):
 *   Complementa a Sub-fase 3.C (v1.11) com:
 *    - Modal "Editar Lead Importado" — formulário rico permitindo
 *      ajustar dados do lead antes de revalidar/promover.
 *    - Auto-promoção transparente para o usuário: rodada de validação
 *      que termina com status_atualizacao='atualizado' e sem
 *      review_manual transfere o lead para email_leads (CRM) e remove
 *      de prospect_leads na mesma chamada. A aba "Leads Importados"
 *      naturalmente diminui à medida que leads são promovidos.
 *
 *   Mudanças cirúrgicas:
 *    - Novo import: EditarLeadImportadoModal.
 *    - Novos states: `modalEditarLead` + `editandoLead`.
 *    - Handler `abrirEditarLead(lead)` / `fecharEditarLead()` / `salvarEdicao()`.
 *    - LeadsImportadosTab agora recebe prop `onEditar`.
 *    - EditarLeadImportadoModal instanciado junto dos demais modais.
 *
 *   Dependência: backend prospect-leads-importados v1.1 com suporte a
 *   PATCH, e prospect-revalidate v1.2 com auto-promoção integrada.
 *
 * v1.11 (17/06/2026 — Sub-fase 3.C: Importar Lista de Leads):
 *   Adiciona o fluxo de importação manual de leads via Excel/CSV no topo
 *   do BaseLeadsPage, complementando o "Importar Prospects" existente
 *   (que continua intacto). Cobre o caso de uso de GC/SDR que recebe
 *   uma planilha externa e quer enriquecê-la via cascata de revalidação
 *   (Hunter+Snov.io+Apollo+Gemini) ANTES de virar email_leads do CRM.
 *
 *   Mudanças cirúrgicas:
 *    - Novo import: useLeadsImportados (hook orquestrador da nova aba).
 *    - Novo import: ImportarListaLeadsModal (modal de upload xlsx/csv).
 *    - Novo import: LeadsImportadosTab (aba dedicada com tabela + ações).
 *    - `abaAtiva` agora aceita 'leads_importados' (entre 'leads' e
 *      'vincular_em_lote' — ordem semântica do funil).
 *    - `responsaveisH.carregar()` agora dispara para TODOS os perfis
 *      (não só Administrador), porque o modal de upload precisa da
 *      lista de GC/SDR pra resolver a coluna "Responsável" da planilha.
 *    - Novo state `modalImportarListaAberto` + handlers (abrir/fechar/concluído).
 *    - Novo botão "Importar Lista de Leads" (teal-600) entre os 2 botões
 *      existentes no header (indigo "Importar Prospects" + emerald "Nova Empresa").
 *    - Nova entrada no array de tabs (ícone fa-file-import).
 *    - useEffect para carregar a nova aba quando ativa.
 *    - Renderização condicional + modal.
 *
 *   Dependência runtime:
 *     • Pacote `xlsx` (SheetJS) — instalar com `npm install xlsx`.
 *     • Backend prospect-revalidate v1.1 (suporte a INSERT preventivo).
 *     • Endpoint /api/prospect-leads-importados v1.0.
 *     • Migration 2026-06-17_prospect_leads_motor_importacao.sql aplicada
 *       (CHECK constraint do `motor` aceita 'importacao_lista').
 *
 * v1.10 (16/06/2026 — F8: Botão Recovery na aba Inválidos):
 *   Pluga o motor de Recovery (api/campaign-email-recovery — em
 *   Production desde 13/06/2026, Sub-fase 3.A) diretamente na aba
 *   "E-mails Inválidos". Antes, Recovery só era acionável via SQL
 *   ou drawer Meus Leads. Agora o gestor/SDR vê o lead inválido na
 *   aba dedicada e dispara o Recovery com 1 clique.
 *
 *   Mudanças cirúrgicas:
 *
 *    - Novo state `recoveringLeadIds: Set<number>` rastreia leads em
 *      Recovery em andamento. Backed por React state com Set imutável
 *      (substitui por `new Set(prev)` em cada UPDATE).
 *
 *    - Novo handler `handleTentarRecovery(leadId)`:
 *        1. `window.confirm` com aviso sobre tentativas restantes.
 *        2. Adiciona leadId ao Set de em-andamento.
 *        3. POST /api/campaign-email-recovery
 *             body: { action: 'recover_lead', lead_id, criado_por }
 *        4. Decisão por `response.status`:
 *             'recovered' → alert sucesso com email novo
 *             'no_match'  → alert info com tentativas restantes
 *             'limite_atingido' → alert ÂMBAR (3/3 esgotado)
 *             'dominio_invalido' → alert ÂMBAR (MX falhou)
 *             erro (network/500) → alert vermelho
 *        5. Remove leadId do Set.
 *        6. Recarrega `invalidosH` + `leadsH.carregarStats()` para que
 *           o badge da aba e a listagem reflitam o estado novo.
 *
 *    - `<InvalidosTab>` recebe 2 props novas:
 *        `onTentarRecovery` (handler)
 *        `recoveringLeadIds` (array de leads em andamento — usado pelo
 *                              componente para mostrar spinner no botão)
 *
 *   Dependência runtime: o motor Recovery (api/campaign-email-recovery
 *   v2.0) JÁ ESTÁ EM PRODUCTION desde 13/06/2026. Esta v1.10 apenas
 *   conecta a UI ao endpoint existente — zero risco de regressão fora
 *   do escopo da aba Inválidos.
 *
 *   Compatibilidade: o InvalidosTab v1.1 já aceita `onTentarRecovery`
 *   como prop opcional (degradação graciosa — sem prop, sem botão).
 *   A v1.2 do InvalidosTab (entregue junto) adiciona o spinner via
 *   `recoveringLeadIds`.
 *
 * v1.9 (14/06/2026 — Bug 1: Empresas no Modal Lead):
 *   Em Production o dropdown "Empresa" do LeadFormModal aparecia sem
 *   opções (só "Sem empresa") mesmo quando havia empresas cadastradas
 *   (cenário pós-deploy do INSERT de TECHFORTI). Causa-raiz: o
 *   `empresasH.carregar()` SÓ era disparado quando a aba ativa era
 *   "empresas" (useEffect dependente de `abaAtiva`). Se o usuário
 *   entrasse direto na aba "leads" (deep link, refresh, navegação
 *   por outro fluxo) e abrisse o modal, o array `empresas` chegava
 *   vazio. Fix: passar `empresasH.carregar()` para o useEffect de
 *   mount global, no mesmo lugar onde `tiposCampanhaH.carregar()`
 *   já era chamado. O useEffect específico da aba 'empresas'
 *   permanece para tratar mudanças de paginação/busca/setor dentro
 *   da aba. Bug 2 (verticais divergentes) foi tratado em paralelo
 *   no CampanhaWizard.tsx v2.2 e crm-campanhas.ts v1.15.
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

import React, { useEffect, useMemo, useState } from 'react';
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
import LeadsTab, { type OpcaoFiltroAnalista } from './LeadsTab';
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
// 🆕 v1.11 (Sub-fase 3.C — 17/06/2026)
import { useLeadsImportados } from '../shared/hooks/useLeadsImportados';
import ImportarListaLeadsModal from './ImportarListaLeadsModal';
import LeadsImportadosTab from './LeadsImportadosTab';
// 🆕 v1.12 (Sub-fase 3.D — 17/06/2026)
import EditarLeadImportadoModal from './EditarLeadImportadoModal';
import type { LeadImportado } from '../shared/hooks/useLeadsImportados';
// 🆕 v1.13 (Sub-fase 3.D refino — 18/06/2026)
import PromoverLeadModal from './PromoverLeadModal';
// 🆕 v1.15 (Recuperação de inválidos para campanha — 23/06/2026)
import RecuperarParaCampanhaModal from '../campanhas/RecuperarParaCampanhaModal';
// 🆕 v1.15 — InvalidoItem estendido (com bounced + vertical do backend v1.22)
import type { InvalidoItem } from '../shared/hooks/useInvalidos';

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
  // 🆕 v1.11 (Sub-fase 3.C — 17/06/2026) — agora aceita 'leads_importados'.
  const [abaAtiva, setAbaAtiva] = useState<
    'empresas' | 'leads' | 'leads_importados' | 'respostas' | 'invalidos' | 'vincular_em_lote' | 'opt_out'
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
  // 🆕 v1.2 (Fase 8-Inbox)
  // 🆕 v1.11 (22/06/2026) — RBAC propagado também para useRespostas v1.1
  //   (filtro por dono da CAMPANHA) e useInvalidos v1.2 (filtro por dono
  //   do LEAD, mesma regra do useLeads v1.3).
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

  // 🆕 v1.10 (F8 — 16/06/2026) — Recovery em andamento por lead.
  // Set imutável para garantir re-render do InvalidosTab quando o
  // estado muda. O componente filho usa este Set para mostrar spinner
  // no botão "Recovery" dos leads que estão sendo processados.
  const [recoveringLeadIds, setRecoveringLeadIds] = useState<Set<number>>(new Set());

  // 🆕 v1.15 (23/06/2026 — Recuperação de inválidos para campanha):
  //   Item completo do InvalidoItem selecionado pelo botão "Promover" do
  //   InvalidosTab v1.3. Guardamos o objeto inteiro (não só o ID) porque
  //   o backend listar_invalidos v1.22 já devolve nome/email/vertical no
  //   payload — evitamos uma requisição extra ao detalhe_lead.
  const [recuperandoLeadItem, setRecuperandoLeadItem] = useState<InvalidoItem | null>(null);
  // Set imutável de leads em chamada ativa de recuperação (POST). O
  // InvalidosTab usa para mostrar spinner no botão Promover.
  const [recuperandoLeadIds, setRecuperandoLeadIds] = useState<Set<number>>(new Set());

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

  // ════════════════════════════════════════════════════════════
  // 🆕 v1.10 (16/06/2026 — F8) — RECOVERY DE EMAIL
  // ════════════════════════════════════════════════════════════
  //
  // Aciona o motor Recovery v2.0 (api/campaign-email-recovery, em
  // Production desde 13/06/2026 — Sub-fase 3.A) para tentar encontrar
  // o email correto de um lead bouncedo. Fluxo:
  //
  //   1. Confirma com o usuário (window.confirm) — Recovery consome
  //      tokens Snov.io + chamadas Gemini, por isso a ação não deve
  //      ser disparada sem confirmação consciente.
  //   2. Marca o leadId no Set `recoveringLeadIds` (spinner aparece).
  //   3. POST /api/campaign-email-recovery com action='recover_lead'.
  //   4. Decide a UX por `data.status`:
  //        'recovered'        → ✅ alert com novo email + recarrega aba
  //        'no_match'         → ⚠️ alert com tentativas restantes
  //        'limite_atingido'  → ⚠️ alert âmbar (3/3 esgotado)
  //        'dominio_invalido' → ⚠️ alert âmbar (MX falhou)
  //        outros (network/500) → ❌ alert vermelho
  //   5. Remove leadId do Set (spinner some).
  //   6. Recarrega listagem da aba + stats (badges).
  //
  // Em caso de SUCESSO, o lead some da aba Inválidos (porque o
  // backend reseta `bounced=false` e limpa `motivo_invalidacao` —
  // crm-leads.ts v1.11 PATCH atualizar_lead faz isso automaticamente
  // quando o email muda).
  //
  // RBAC: ação disponível para qualquer perfil que veja a aba
  //   Inválidos. Bloqueio fino (RBAC por reservado_por) deve ser
  //   adicionado no backend Recovery se necessário no futuro.
  const handleTentarRecovery = async (leadId: number) => {
    // Acha tentativas atuais para mensagem informativa
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

    // Marca o lead como em-Recovery (spinner aparece no botão)
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
      // Remove o lead do Set (spinner some)
      setRecoveringLeadIds((prev) => {
        const next = new Set(prev);
        next.delete(leadId);
        return next;
      });
      // Recarrega aba + stats — independente do resultado
      invalidosH.carregar();
      leadsH.carregarStats();
    }
  };

  // ════════════════════════════════════════════════════════════
  // 🆕 v1.15 (23/06/2026) — RECUPERAR INVÁLIDO PARA CAMPANHA
  // ════════════════════════════════════════════════════════════
  //
  // Fluxo do botão "Promover" da aba E-mails Inválidos (InvalidosTab v1.3):
  //
  //   1. handleAbrirRecuperar(leadId): encontra o item na listagem corrente
  //      e abre o modal RecuperarParaCampanhaModal. Não faz requisição
  //      extra — o item já tem nome/email/vertical do listar_invalidos v1.22.
  //
  //   2. RecuperarParaCampanhaModal carrega campanhas via
  //      GET /api/crm-campanhas?action=listar_campanhas_disponiveis_para_lead
  //      &lead_id={leadId} (action existente desde 09/06/2026, aceita lead_id).
  //
  //   3. Usuário escolhe campanha → modal invoca onConfirmar(leadId, campanhaId).
  //
  //   4. handleConfirmarRecuperacao(leadId, campanhaId):
  //      - Marca leadId em recuperandoLeadIds (spinner aparece no botão).
  //      - Chama invalidosH.recuperarParaCampanha → backend v1.22.
  //      - Sucesso: alert verde, fecha modal, recarrega aba + stats.
  //      - Erro:    alert vermelho, modal continua aberto (usuário pode
  //                 tentar outra campanha sem ter que reabrir tudo).
  //      - Sempre: remove leadId de recuperandoLeadIds (spinner some).
  //
  // RBAC: o botão Promover só aparece para leads com bounced=false (regra
  //   do InvalidosTab v1.3). O backend v1.22 valida de novo em defesa em
  //   profundidade (proteção contra race conditions).

  const handleAbrirRecuperar = (leadId: number) => {
    const item = invalidosH.itens.find((i: InvalidoItem) => i.lead_id === leadId);
    if (!item) {
      alert('Lead não encontrado na listagem atual — recarregue a página.');
      return;
    }
    setRecuperandoLeadItem(item);
  };

  const handleConfirmarRecuperacao = async (leadId: number, campanhaId: number) => {
    // Marca como em-andamento (spinner no botão Promover do InvalidosTab)
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
        setRecuperandoLeadItem(null); // fecha o modal
        invalidosH.carregar();
        leadsH.carregarStats();
      } else {
        // Modal CONTINUA aberto — usuário pode tentar outra campanha sem
        // reabrir tudo. Mostramos o erro estruturado do backend.
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
                // 🆕 v1.11 (Sub-fase 3.C — 17/06/2026)
                else if (tab.key === 'leads_importados') leadsImportadosH.setPage(1);
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
        {/* 🆕 v1.10 (16/06/2026 — F8) — props onTentarRecovery + recoveringLeadIds */}
        {/* 🆕 v1.15 (23/06/2026 — Recuperação) — props onPromover + promovendoLeadIds */}
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

      {/* 🆕 v1.15 (23/06/2026 — Recuperação de inválidos para campanha)
          Disparado pelo botão "Promover" (purple) da aba E-mails Inválidos
          quando o lead tem bounced=false (email já foi corrigido). */}
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

