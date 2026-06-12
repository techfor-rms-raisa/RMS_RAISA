/**
 * LeadDetailDrawer.tsx — Drawer de detalhe do lead
 *
 * Caminho: src/components/crm/base-leads/LeadDetailDrawer.tsx
 * Versão: 1.1 (Fase 2 / F5 — 12/06/2026)
 *
 * v1.1 — Recovery Pipeline UI (F5 — Fase 2 do Email Recovery Pipeline):
 *   - Badge "Inválido" no header (vermelho) quando bounced/motivo_invalidacao
 *   - Nova seção "Recuperação de E-mail" entre Dados e Campanhas
 *     (visível só quando lead invalidado)
 *   - Botão "Tentar Recovery" → POST /api/campaign-email-recovery?action=recover_lead
 *     (orquestra MX + padrão da empresa + Snov.io)
 *   - Edição manual + "Validar e Reativar" → POST .../?action=manual_revalidate
 *     (MX obrigatório + Snov.io opcional via checkbox)
 *   - Indicador de tentativas restantes (D9: máx 3)
 *   - Feedback visual de cada operação (sucesso verde / erro vermelho)
 *   - useEffect carrega status do Recovery ao abrir o drawer
 *   - 2 props novas opcionais: criadoPor, onRecoveryConcluido (zero impacto no caller)
 *
 *   ⚠️ NADA do layout original foi modificado — apenas adições aditivas.
 *
 * v1.0 (Fase 1C — 29/05/2026): versão original
 *   - Header, dados do lead, campanhas, respostas, timeline
 *   - Modal "Alterar Funil"
 */

import React, { useState, useEffect, useCallback } from 'react';
import { FUNIL_LABELS } from '../shared/components/FunilBadge';
import { HISTORICO_ICONS, formatDateTime } from '../types/crm.constants';
import type { Lead, HistoricoItem } from '../types/crm.types';

// ════════════════════════════════════════════════════════════
// 🆕 v1.1 — TIPOS DO RECOVERY (locais ao componente)
// ════════════════════════════════════════════════════════════

interface RecoveryLeadInfo {
  id: number;
  email: string;
  nome?: string;
  bounced: boolean;
  bounced_em: string | null;
  bounced_motivo: string | null;
  apto_campanha: boolean;
  tentativas_recovery: number;
  motivo_invalidacao: string | null;
  recovery_em: string | null;
}

interface RecoveryStatusResponse {
  success: boolean;
  lead: RecoveryLeadInfo;
  pode_tentar_recovery: boolean;
  tentativas_restantes: number;
  modo_sugerido: 'auto' | 'manual' | null;
}

interface RecoveryMessage {
  type: 'success' | 'error';
  text: string;
}

// ════════════════════════════════════════════════════════════
// PROPS
// ════════════════════════════════════════════════════════════

export interface LeadDetailDrawerProps {
  lead: Lead | null;
  timeline: HistoricoItem[];
  campanhas: any[];
  respostas: any[];
  loadingFunil: boolean;
  onFechar: () => void;
  /**
   * Chamado quando o usuário confirma a mudança de funil.
   * O componente pai (BaseLeadsPage) cuida do reload via hook.
   */
  onConfirmarFunil: (novoStatus: string, motivoPerda: string | null) => Promise<boolean>;
  /**
   * 🆕 v1.1 — Identificador do operador atual (email do usuário logado).
   * Enviado como `criado_por` nas chamadas de Recovery e gravado no histórico.
   * Default: 'desconhecido' (compatibilidade com caller atual).
   */
  criadoPor?: string;
  /**
   * 🆕 v1.1 — Callback opcional disparado após Recovery bem-sucedido OU
   * edição manual validada. O pai pode usar para recarregar a lista de leads
   * e refletir o novo estado (email atualizado, bounced=false, etc.).
   */
  onRecoveryConcluido?: () => void;
}

// ════════════════════════════════════════════════════════════
// COMPONENTE
// ════════════════════════════════════════════════════════════

const LeadDetailDrawer: React.FC<LeadDetailDrawerProps> = ({
  lead,
  timeline,
  campanhas,
  respostas,
  loadingFunil,
  onFechar,
  onConfirmarFunil,
  criadoPor = 'desconhecido',
  onRecoveryConcluido,
}) => {
  // ── Estado original (preservado intacto) ─────────────
  const [modalFunil, setModalFunil] = useState(false);
  const [novoFunil, setNovoFunil] = useState('');
  const [motivoPerda, setMotivoPerda] = useState('');

  // ── 🆕 v1.1: Estado do Recovery ──────────────────────
  const [recoveryStatus, setRecoveryStatus] = useState<RecoveryStatusResponse | null>(null);
  const [isRecovering, setIsRecovering] = useState(false);
  const [isManualValidating, setIsManualValidating] = useState(false);
  const [novoEmailManual, setNovoEmailManual] = useState('');
  const [validarComSnovio, setValidarComSnovio] = useState(false);
  const [recoveryMessage, setRecoveryMessage] = useState<RecoveryMessage | null>(null);

  // ── 🆕 v1.1: Carregar status do Recovery ao abrir/trocar lead ─
  const carregarRecoveryStatus = useCallback(async (leadId: number) => {
    try {
      const r = await fetch(
        `/api/campaign-email-recovery?action=lead_status&lead_id=${leadId}`
      );
      const json = await r.json();
      if (json && json.success) {
        setRecoveryStatus(json);
      } else {
        setRecoveryStatus(null);
      }
    } catch (err) {
      // Falha silenciosa — UI degrada graciosamente (badge usa lead.bounced direto)
      console.error('[LeadDetailDrawer] Erro ao carregar status do Recovery:', err);
      setRecoveryStatus(null);
    }
  }, []);

  useEffect(() => {
    if (lead?.id) {
      carregarRecoveryStatus(lead.id);
      // Reset estados locais ao mudar de lead
      setNovoEmailManual('');
      setValidarComSnovio(false);
      setRecoveryMessage(null);
    }
  }, [lead?.id, carregarRecoveryStatus]);

  // ── 🆕 v1.1: Ações do Recovery ───────────────────────
  const acionarRecovery = async () => {
    if (!lead) return;
    setIsRecovering(true);
    setRecoveryMessage(null);
    try {
      const r = await fetch('/api/campaign-email-recovery?action=recover_lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lead_id: lead.id, criado_por: criadoPor }),
      });
      const json = await r.json();
      if (json.success) {
        setRecoveryMessage({
          type: 'success',
          text: `E-mail recuperado: ${json.email_recuperado}. ${json.campanhas_re_enfileiradas || 0} campanha(s) reativada(s).`,
        });
        onRecoveryConcluido?.();
      } else {
        const detalhe =
          json.status === 'invalid_mx'
            ? `MX inválido (${json.mx_erro || 'sem detalhes'})`
            : json.status === 'no_match'
            ? `Nenhum padrão válido encontrado em ${json.candidatos_testados || 0} testes`
            : json.status === 'limit_reached'
            ? 'Limite de 3 tentativas atingido — lead definitivamente irrecuperável'
            : json.error || `Recovery falhou (${json.status})`;
        setRecoveryMessage({ type: 'error', text: detalhe });
      }
      // Recarregar status (sucesso ou falha, o tentativas_recovery muda)
      await carregarRecoveryStatus(lead.id);
    } catch (err: any) {
      setRecoveryMessage({
        type: 'error',
        text: err?.message || 'Erro de comunicação com o servidor',
      });
    } finally {
      setIsRecovering(false);
    }
  };

  const acionarManualRevalidate = async () => {
    if (!lead || !novoEmailManual.trim()) return;
    setIsManualValidating(true);
    setRecoveryMessage(null);
    try {
      const r = await fetch('/api/campaign-email-recovery?action=manual_revalidate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lead_id: lead.id,
          novo_email: novoEmailManual.trim(),
          criado_por: criadoPor,
          validar_snovio: validarComSnovio,
        }),
      });
      const json = await r.json();
      if (json.success) {
        setRecoveryMessage({
          type: 'success',
          text: `Reativado com sucesso: ${json.email_novo}. ${json.campanhas_re_enfileiradas || 0} campanha(s) reativada(s).`,
        });
        setNovoEmailManual('');
        onRecoveryConcluido?.();
      } else {
        const detalhe =
          json.status === 'invalid_mx'
            ? `Domínio sem MX válido (${json.mx_erro || 'sem detalhes'})`
            : json.status === 'snovio_rejected'
            ? `Snov.io rejeitou: ${json.snovio_status || 'sem detalhes'}`
            : json.status === 'limit_reached'
            ? 'Limite de 3 tentativas atingido'
            : json.error || 'Validação falhou';
        setRecoveryMessage({ type: 'error', text: detalhe });
      }
      await carregarRecoveryStatus(lead.id);
    } catch (err: any) {
      setRecoveryMessage({
        type: 'error',
        text: err?.message || 'Erro de comunicação com o servidor',
      });
    } finally {
      setIsManualValidating(false);
    }
  };

  if (!lead) return null;

  const funilAtual = FUNIL_LABELS[lead.funil_status] || FUNIL_LABELS.lead;

  // 🆕 v1.1: derivados do recovery status
  // Considera invalidado se: (a) já temos status fresh, OU (b) lead.bounced do prop (fallback)
  const leadInvalidado = !!(
    recoveryStatus?.lead?.bounced ||
    recoveryStatus?.lead?.motivo_invalidacao ||
    (lead as any).bounced // fallback caso o tipo Lead já tenha o campo
  );
  const podeTentarRecovery = recoveryStatus?.pode_tentar_recovery === true;
  const tentativasUsadas = recoveryStatus?.lead?.tentativas_recovery ?? 0;
  const tentativasRestantes = recoveryStatus?.tentativas_restantes ?? 3;
  const modoSugerido = recoveryStatus?.modo_sugerido;
  const motivoInvalidacao = recoveryStatus?.lead?.motivo_invalidacao;
  const limiteAtingido = tentativasUsadas >= 3;

  const abrirModalFunil = () => {
    setNovoFunil('');
    setMotivoPerda('');
    setModalFunil(true);
  };

  const confirmar = async () => {
    if (!novoFunil) return;
    const ok = await onConfirmarFunil(
      novoFunil,
      novoFunil === 'perdido' ? motivoPerda : null
    );
    if (ok) {
      setModalFunil(false);
      setNovoFunil('');
      setMotivoPerda('');
    }
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-50 flex justify-end">
        <div className="bg-white w-full max-w-2xl h-full overflow-y-auto shadow-2xl">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b bg-indigo-50 sticky top-0 z-10">
            <div className="flex-1">
              <h2 className="text-lg font-bold text-gray-800">{lead.nome}</h2>
              <p className="text-sm text-gray-500">
                {lead.cargo || '—'} — {lead.email}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {/* 🆕 v1.1: Badge "Inválido" — antes do badge funil */}
              {leadInvalidado && (
                <span
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700 border border-red-200"
                  title={
                    motivoInvalidacao
                      ? `Inválido — motivo: ${motivoInvalidacao}`
                      : 'E-mail com bounce'
                  }
                >
                  <i className="fa-solid fa-triangle-exclamation"></i> Inválido
                </span>
              )}
              {/* Badge funil clicável → abre modal (preservado) */}
              <button
                onClick={abrirModalFunil}
                className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium ${funilAtual.cor} hover:opacity-80 transition-opacity cursor-pointer`}
                title="Clique para alterar o funil"
              >
                <i className={funilAtual.icon}></i> {funilAtual.label}
                <i className="fa-solid fa-chevron-down text-[10px] ml-1"></i>
              </button>
              <button
                onClick={onFechar}
                className="text-gray-400 hover:text-gray-600 text-2xl ml-3"
                aria-label="Fechar"
              >
                &times;
              </button>
            </div>
          </div>

          {/* Dados do lead */}
          <div className="p-6 border-b">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-gray-500">Empresa:</span>{' '}
                {lead.email_empresas?.nome || '—'}
              </div>
              <div>
                <span className="text-gray-500">Setor:</span>{' '}
                {lead.email_empresas?.setor || '—'}
              </div>
              <div>
                <span className="text-gray-500">Telefone:</span> {lead.telefone || '—'}
              </div>
              <div>
                <span className="text-gray-500">Score:</span> {lead.score_engajamento}/100
              </div>
              <div>
                <span className="text-gray-500">Emails recebidos:</span>{' '}
                {lead.total_emails_recebidos}
              </div>
              <div>
                <span className="text-gray-500">Emails abertos:</span>{' '}
                {lead.total_emails_abertos}
              </div>
              <div>
                <span className="text-gray-500">Clicados:</span>{' '}
                {lead.total_emails_clicados}
              </div>
              <div>
                <span className="text-gray-500">Respostas:</span> {lead.total_respostas}
              </div>
            </div>

            {lead.linkedin_url && (
              <a
                href={lead.linkedin_url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 mt-3 text-sm text-blue-600 hover:underline"
              >
                <i className="fa-brands fa-linkedin"></i> Ver LinkedIn
              </a>
            )}

            {lead.tags && lead.tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-3">
                {lead.tags.map((tag: string) => (
                  <span
                    key={tag}
                    className="bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded text-xs"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}

            {lead.notas && (
              <p className="text-sm text-gray-600 mt-3 bg-gray-50 p-2 rounded">
                {lead.notas}
              </p>
            )}

            {lead.opt_out && (
              <div className="mt-3 bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm flex items-center gap-2">
                <i className="fa-solid fa-ban"></i> Este lead está na lista de opt-out e
                não receberá campanhas.
              </div>
            )}
          </div>

          {/* ════════════════════════════════════════════════════════════ */}
          {/* 🆕 v1.1: SEÇÃO RECUPERAÇÃO DE E-MAIL                         */}
          {/*    Visível APENAS quando lead invalidado (bounce ou MX)       */}
          {/* ════════════════════════════════════════════════════════════ */}
          {leadInvalidado && (
            <div className="p-6 border-b bg-red-50/30">
              <h3 className="text-sm font-bold text-red-700 mb-3 flex items-center gap-2">
                <i className="fa-solid fa-envelope-circle-check text-red-600"></i>
                Recuperação de E-mail
              </h3>

              {/* Status atual do Recovery */}
              <div className="bg-white border border-red-200 rounded-lg p-3 mb-3 text-sm">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="text-gray-500">Tentativas usadas:</span>{' '}
                    <span className="font-medium">{tentativasUsadas}/3</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Restantes:</span>{' '}
                    <span
                      className={`font-medium ${
                        tentativasRestantes === 0
                          ? 'text-red-600'
                          : tentativasRestantes === 1
                          ? 'text-amber-600'
                          : 'text-green-600'
                      }`}
                    >
                      {tentativasRestantes}
                    </span>
                  </div>
                  {motivoInvalidacao && (
                    <div className="col-span-2">
                      <span className="text-gray-500">Motivo da invalidação:</span>{' '}
                      <span className="font-medium">{motivoInvalidacao}</span>
                    </div>
                  )}
                  {modoSugerido && podeTentarRecovery && (
                    <div className="col-span-2">
                      <span className="text-gray-500">Modo sugerido:</span>{' '}
                      <span className="font-medium">
                        {modoSugerido === 'auto'
                          ? 'Automático (padrão conhecido — 1 verificação)'
                          : 'Manual (testa até 30 padrões)'}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Feedback da última operação */}
              {recoveryMessage && (
                <div
                  className={`mb-3 px-3 py-2 rounded-lg text-sm flex items-start gap-2 ${
                    recoveryMessage.type === 'success'
                      ? 'bg-green-50 border border-green-200 text-green-700'
                      : 'bg-red-50 border border-red-200 text-red-700'
                  }`}
                >
                  <i
                    className={`fa-solid ${
                      recoveryMessage.type === 'success'
                        ? 'fa-circle-check'
                        : 'fa-circle-xmark'
                    } mt-0.5`}
                  ></i>
                  <span className="flex-1">{recoveryMessage.text}</span>
                </div>
              )}

              {/* Botão Recovery automático + edição manual (se ainda pode tentar) */}
              {podeTentarRecovery ? (
                <>
                  <button
                    onClick={acionarRecovery}
                    disabled={isRecovering || isManualValidating}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    title={
                      modoSugerido === 'auto'
                        ? 'Padrão de e-mail da empresa já é conhecido — vai testar 1 padrão (~1 crédito Snov.io)'
                        : 'Sem padrão conhecido — vai testar até 30 padrões (~30 créditos Snov.io)'
                    }
                  >
                    {isRecovering ? (
                      <>
                        <i className="fa-solid fa-spinner fa-spin"></i> Tentando
                        recovery... (pode demorar até 30s)
                      </>
                    ) : (
                      <>
                        <i className="fa-solid fa-rotate"></i> Tentar Recovery
                        {modoSugerido === 'auto' ? ' (1 padrão)' : ' (até 30 padrões)'}
                      </>
                    )}
                  </button>

                  <div className="my-3 text-xs text-gray-400 text-center">— ou —</div>

                  {/* Edição manual */}
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Novo e-mail (edição manual)
                    </label>
                    <input
                      type="email"
                      value={novoEmailManual}
                      onChange={(e) => setNovoEmailManual(e.target.value)}
                      placeholder="ex: novo.email@empresa.com.br"
                      className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-indigo-400 focus:outline-none mb-2"
                      disabled={isRecovering || isManualValidating}
                    />
                    <label className="flex items-center gap-2 text-xs text-gray-600 mb-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={validarComSnovio}
                        onChange={(e) => setValidarComSnovio(e.target.checked)}
                        disabled={isRecovering || isManualValidating}
                      />
                      Validar também com Snov.io (consome 1 crédito ~$0.004)
                    </label>
                    <button
                      onClick={acionarManualRevalidate}
                      disabled={
                        !novoEmailManual.trim() ||
                        !novoEmailManual.includes('@') ||
                        isRecovering ||
                        isManualValidating
                      }
                      className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {isManualValidating ? (
                        <>
                          <i className="fa-solid fa-spinner fa-spin"></i> Validando...
                        </>
                      ) : (
                        <>
                          <i className="fa-solid fa-circle-check"></i> Validar e Reativar
                        </>
                      )}
                    </button>
                  </div>
                </>
              ) : (
                // Recovery indisponível (limite, ainda carregando, ou outro motivo)
                <div className="bg-gray-100 border border-gray-200 text-gray-600 px-3 py-3 rounded-lg text-sm flex items-center gap-2">
                  <i className="fa-solid fa-ban"></i>
                  <span>
                    {!recoveryStatus
                      ? 'Carregando status do Recovery...'
                      : limiteAtingido
                      ? 'Limite de 3 tentativas atingido. Lead definitivamente irrecuperável.'
                      : 'Recovery indisponível no momento.'}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Campanhas do lead */}
          {campanhas.length > 0 && (
            <div className="p-6 border-b">
              <h3 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2">
                <i className="fa-solid fa-bullhorn text-indigo-500"></i> Campanhas (
                {campanhas.length})
              </h3>
              <div className="space-y-2">
                {campanhas.map((c: any) => (
                  <div
                    key={c.id}
                    className="flex items-center justify-between p-2 bg-gray-50 rounded text-sm"
                  >
                    <span className="font-medium">
                      {c.email_campanhas?.nome || 'Campanha'}
                    </span>
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <span>Step {c.step_atual}</span>
                      <span
                        className={`px-2 py-0.5 rounded ${
                          c.status === 'ativa'
                            ? 'bg-green-100 text-green-700'
                            : 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {c.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Respostas do lead */}
          {respostas.length > 0 && (
            <div className="p-6 border-b">
              <h3 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2">
                <i className="fa-solid fa-reply text-teal-500"></i> Respostas (
                {respostas.length})
              </h3>
              <div className="space-y-2">
                {respostas.map((r: any) => (
                  <div key={r.id} className="p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium">
                        {r.assunto || '(sem assunto)'}
                      </span>
                      <span className="text-xs text-gray-400">
                        {formatDateTime(r.recebido_em)}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600 line-clamp-3">
                      {r.corpo_texto || '—'}
                    </p>
                    {r.classificacao !== 'pendente' && (
                      <span className="inline-block mt-1 px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-xs">
                        {r.classificacao}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Timeline */}
          <div className="p-6">
            <h3 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2">
              <i className="fa-solid fa-clock-rotate-left text-amber-500"></i> Timeline
            </h3>
            {timeline.length === 0 ? (
              <p className="text-sm text-gray-400 py-4 text-center">
                Nenhum evento registrado
              </p>
            ) : (
              <div className="relative">
                {/* Linha vertical */}
                <div className="absolute left-3 top-2 bottom-2 w-0.5 bg-gray-200"></div>

                <div className="space-y-3">
                  {timeline.map((item) => (
                    <div key={item.id} className="flex items-start gap-3 pl-1">
                      <div className="relative z-10 w-6 h-6 rounded-full bg-white border-2 border-gray-200 flex items-center justify-center flex-shrink-0">
                        <i
                          className={`text-xs ${
                            HISTORICO_ICONS[item.tipo] ||
                            'fa-solid fa-circle text-gray-400'
                          }`}
                        ></i>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-800">{item.descricao || item.tipo}</p>
                        <div className="flex items-center gap-2 text-xs text-gray-400 mt-0.5">
                          <span>{formatDateTime(item.criado_em)}</span>
                          {item.criado_por && <span>— {item.criado_por}</span>}
                          {item.email_campanhas?.nome && (
                            <span className="text-indigo-500">
                              ({item.email_campanhas.nome})
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════ */}
      {/* MODAL: ALTERAR FUNIL                                         */}
      {/* ════════════════════════════════════════════════════════════ */}
      {modalFunil && (
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm">
            <div className="px-6 py-4 border-b">
              <h2 className="text-lg font-bold text-gray-800">Alterar Funil</h2>
              <p className="text-sm text-gray-500">{lead.nome}</p>
            </div>
            <div className="p-6 space-y-3">
              {Object.entries(FUNIL_LABELS).map(([key, val]) => (
                <button
                  key={key}
                  onClick={() => setNovoFunil(key)}
                  disabled={key === lead.funil_status}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm transition-colors ${
                    novoFunil === key
                      ? 'bg-indigo-50 border-2 border-indigo-500'
                      : key === lead.funil_status
                      ? 'bg-gray-100 opacity-50 cursor-not-allowed'
                      : 'bg-gray-50 hover:bg-gray-100 border-2 border-transparent'
                  }`}
                >
                  <i className={`${val.icon} w-5`}></i>
                  <span className="font-medium">{val.label}</span>
                  {key === lead.funil_status && (
                    <span className="text-xs text-gray-400 ml-auto">(atual)</span>
                  )}
                </button>
              ))}
              {novoFunil === 'perdido' && (
                <div className="mt-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Motivo da perda
                  </label>
                  <input
                    value={motivoPerda}
                    onChange={(e) => setMotivoPerda(e.target.value)}
                    placeholder="Ex: Não tem interesse, concorrente, etc."
                    className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-indigo-400 focus:outline-none"
                  />
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 px-6 py-4 border-t bg-gray-50">
              <button
                onClick={() => setModalFunil(false)}
                className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
              >
                Cancelar
              </button>
              <button
                onClick={confirmar}
                disabled={!novoFunil || loadingFunil}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
              >
                {loadingFunil ? 'Salvando...' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default LeadDetailDrawer;
