/**
 * RecuperarParaCampanhaModal.tsx — Modal de recuperação de lead inválido
 *
 * Caminho: src/components/crm/campanhas/RecuperarParaCampanhaModal.tsx
 * Versão: 1.0 (Recuperação de inválidos para campanha — 23/06/2026)
 *
 * Disparado pelo botão "Promover" da aba "E-mails Inválidos" (InvalidosTab
 * v1.3). Permite ao GC/SDR escolher uma campanha elegível para receber um
 * lead que foi previamente CORRIGIDO (email reparado manualmente via
 * Editar, automaticamente via Recovery 3.A, ou nunca teve bounce real).
 *
 * Fluxo:
 *  1. Usuário clica em "Promover" no InvalidosTab (lead com bounced=false).
 *  2. BaseLeadsPage abre este modal passando `leadId`, `leadNome`,
 *     `leadEmail`, `leadVertical`, `criadoPorEmail`.
 *  3. O modal consulta:
 *       GET /api/crm-campanhas
 *         ?action=listar_campanhas_disponiveis_para_lead
 *         &lead_id={leadId}
 *         &criado_por={criadoPorEmail}
 *     (a action já existe desde 09/06/2026 — aceita lead_id OR prospect_id).
 *  4. Renderiza a lista de campanhas elegíveis (mesma regra do fluxo
 *     "Promover" da aba Leads Importados: vertical match, responsável
 *     match, status ativa/pausada/agendada, data_encerramento OK, não
 *     duplicar em outras campanhas em andamento).
 *  5. Usuário seleciona uma campanha e clica em "Confirmar".
 *  6. Modal invoca `onConfirmar(leadId, campanhaId)`.
 *  7. BaseLeadsPage chama useInvalidos.recuperarParaCampanha → backend
 *     v1.22 → vincula + limpa motivo_invalidacao + log.
 *
 * Pré-requisitos backend:
 *  - api/crm-campanhas.ts: action listar_campanhas_disponiveis_para_lead
 *    (v1.11 — já em Production, aceita lead_id ou prospect_id)
 *  - api/crm-leads.ts: action recuperar_invalido_para_campanha (v1.22 —
 *    entrega desta sessão)
 *
 * Decisões de UX (alinhadas com Messias em 23/06/2026):
 *  - Aviso amber no topo: "Email foi corrigido manualmente. Você assume
 *    o risco caso o novo email também bounce."
 *  - NÃO há opção "Apenas para o CRM" (o lead JÁ está no CRM — está só
 *    bloqueado na aba Inválidos). Diferente do SelecionarCampanhaModal
 *    do fluxo Prospect Engine, que sim oferece "Apenas CRM" como default.
 *  - Confirmação obrigatória — não auto-confirma ao clicar em uma campanha.
 *  - Estados claros: loading inicial / sem campanhas (com motivo) / lista /
 *    submitting.
 *  - Modal NÃO fecha sozinho em sucesso — quem fecha é o BaseLeadsPage
 *    após processar o feedback (mantém o padrão dos outros modais do CRM).
 */

import React, { useState, useEffect, useCallback } from 'react';

// ════════════════════════════════════════════════════════════════
// TIPOS
// ════════════════════════════════════════════════════════════════

interface CampanhaElegivel {
  id: number;
  nome: string;
  status: 'ativa' | 'pausada' | 'agendada';
  tipo: string;
  unidade: string | null;
  inicio_envio: string | null;
  data_encerramento: string | null;
  total_destinatarios: number | null;
  criado_em: string;
}

export interface RecuperarParaCampanhaModalProps {
  /** Whether the modal is open. */
  aberto: boolean;
  /** ID do lead em email_leads que será vinculado. */
  leadId: number | null;
  /** Nome do lead (header). */
  leadNome: string;
  /** Email atual do lead (já corrigido). */
  leadEmail: string;
  /** Vertical de negócios do lead (informativo). */
  leadVertical: string | null;
  /** E-mail do usuário atual (envia ao backend para RBAC). */
  criadoPorEmail: string;
  /** Indica que a confirmação está em andamento (desabilita botões). */
  isLoading: boolean;
  /** Fechar o modal (sem confirmar). */
  onFechar: () => void;
  /** Confirmar a recuperação para a campanha escolhida. */
  onConfirmar: (leadId: number, campanhaId: number) => void;
}

// ════════════════════════════════════════════════════════════════
// COMPONENTE
// ════════════════════════════════════════════════════════════════

const RecuperarParaCampanhaModal: React.FC<RecuperarParaCampanhaModalProps> = ({
  aberto,
  leadId,
  leadNome,
  leadEmail,
  leadVertical,
  criadoPorEmail,
  isLoading,
  onFechar,
  onConfirmar,
}) => {
  const [campanhas, setCampanhas] = useState<CampanhaElegivel[]>([]);
  const [motivoVazio, setMotivoVazio] = useState<string | null>(null);
  const [carregandoCampanhas, setCarregandoCampanhas] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [campanhaSelecionada, setCampanhaSelecionada] = useState<number | null>(null);

  // ════════════════════════════════════════════════════════════════
  // CARREGAR CAMPANHAS ELEGÍVEIS
  // ════════════════════════════════════════════════════════════════

  const carregarCampanhas = useCallback(async () => {
    if (!leadId) return;
    setCarregandoCampanhas(true);
    setErro(null);
    setMotivoVazio(null);

    try {
      const params = new URLSearchParams({
        action: 'listar_campanhas_disponiveis_para_lead',
        lead_id: String(leadId),
        criado_por: criadoPorEmail,
      });
      const resp = await fetch(`/api/crm-campanhas?${params}`);
      const data = await resp.json();

      if (!resp.ok || !data?.success) {
        setErro(data?.error || `Falha ao carregar campanhas (HTTP ${resp.status})`);
        setCampanhas([]);
      } else {
        const lista: CampanhaElegivel[] = data.campanhas || [];
        setCampanhas(lista);
        if (lista.length === 0 && data.motivo) {
          setMotivoVazio(data.motivo);
        }
      }
    } catch (err: any) {
      setErro(err?.message || 'Erro de rede ao buscar campanhas');
      setCampanhas([]);
    } finally {
      setCarregandoCampanhas(false);
    }
  }, [leadId, criadoPorEmail]);

  // Carrega quando o modal abre
  useEffect(() => {
    if (aberto && leadId) {
      setCampanhaSelecionada(null);
      carregarCampanhas();
    }
  }, [aberto, leadId, carregarCampanhas]);

  // Limpa estado ao fechar
  useEffect(() => {
    if (!aberto) {
      setCampanhas([]);
      setMotivoVazio(null);
      setErro(null);
      setCampanhaSelecionada(null);
    }
  }, [aberto]);

  // ════════════════════════════════════════════════════════════════
  // HANDLERS
  // ════════════════════════════════════════════════════════════════

  const handleConfirmar = () => {
    if (!leadId || !campanhaSelecionada || isLoading) return;
    onConfirmar(leadId, campanhaSelecionada);
  };

  const podeConfirmar =
    !!leadId && !!campanhaSelecionada && !isLoading && !carregandoCampanhas;

  // ════════════════════════════════════════════════════════════════
  // RENDER
  // ════════════════════════════════════════════════════════════════

  if (!aberto || !leadId) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* ── Header ── */}
        <div className="flex items-start justify-between px-6 py-4 border-b border-gray-200">
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
              <i className="fa-solid fa-rocket text-purple-600"></i>
              Recuperar lead para campanha
            </h2>
            <p className="text-sm text-gray-500 mt-0.5">
              Escolha a campanha que receberá este lead
            </p>
          </div>
          <button
            onClick={onFechar}
            disabled={isLoading}
            className="text-gray-400 hover:text-gray-600 text-2xl leading-none disabled:opacity-40"
            aria-label="Fechar"
          >
            &times;
          </button>
        </div>

        {/* ── Corpo (scrollável) ── */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {/* Info do lead */}
          <div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3">
            <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Lead</div>
            <div className="font-medium text-gray-800">{leadNome}</div>
            <div className="text-sm font-mono text-gray-600 mt-0.5">{leadEmail}</div>
            {leadVertical && (
              <div className="text-xs text-gray-500 mt-1">
                Vertical: <span className="font-medium text-gray-700">{leadVertical}</span>
              </div>
            )}
          </div>

          {/* Aviso de risco — ALINHADO COM MESSIAS 23/06/2026 */}
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
            <div className="flex gap-2">
              <i className="fa-solid fa-triangle-exclamation text-amber-600 mt-0.5"></i>
              <div className="flex-1 text-sm text-amber-900">
                <strong>Atenção:</strong> este lead estava na aba "E-mails Inválidos". O email
                foi corrigido (manualmente ou via Recovery), mas pode não ter sido validado
                externamente. Se o novo endereço bouncear novamente, o lead voltará para esta
                aba.
              </div>
            </div>
          </div>

          {/* Estados: loading / erro / vazio / lista */}
          {carregandoCampanhas ? (
            <div className="py-8 text-center text-gray-400">
              <i className="fa-solid fa-spinner fa-spin text-2xl"></i>
              <p className="mt-2 text-sm">Buscando campanhas elegíveis...</p>
            </div>
          ) : erro ? (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-800">
              <i className="fa-solid fa-circle-exclamation"></i> {erro}
            </div>
          ) : campanhas.length === 0 ? (
            <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 text-sm text-blue-900">
              <i className="fa-solid fa-circle-info"></i>{' '}
              {motivoVazio ||
                'Nenhuma campanha elegível encontrada para este lead no momento.'}
            </div>
          ) : (
            <div>
              <div className="text-sm font-semibold text-gray-700 mb-2">
                Campanhas disponíveis ({campanhas.length})
              </div>
              <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-72 overflow-y-auto">
                {campanhas.map((camp) => {
                  const selected = campanhaSelecionada === camp.id;
                  return (
                    <label
                      key={camp.id}
                      className={[
                        'flex items-start gap-3 px-4 py-3 cursor-pointer transition-colors',
                        selected ? 'bg-purple-50' : 'hover:bg-gray-50',
                      ].join(' ')}
                    >
                      <input
                        type="radio"
                        name="campanha-recuperar"
                        value={camp.id}
                        checked={selected}
                        onChange={() => setCampanhaSelecionada(camp.id)}
                        disabled={isLoading}
                        className="mt-1 text-purple-600 focus:ring-purple-500"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-gray-800 truncate">
                            {camp.nome}
                          </span>
                          <span
                            className={[
                              'text-[10px] px-1.5 py-0.5 rounded font-medium uppercase',
                              camp.status === 'ativa'
                                ? 'bg-emerald-100 text-emerald-700'
                                : camp.status === 'pausada'
                                  ? 'bg-amber-100 text-amber-700'
                                  : 'bg-gray-100 text-gray-700',
                            ].join(' ')}
                          >
                            {camp.status}
                          </span>
                        </div>
                        <div className="text-xs text-gray-500 mt-0.5 flex gap-3 flex-wrap">
                          <span>
                            <i className="fa-solid fa-tag mr-1"></i>
                            {camp.tipo}
                          </span>
                          {camp.unidade && (
                            <span>
                              <i className="fa-solid fa-building mr-1"></i>
                              {camp.unidade}
                            </span>
                          )}
                          {typeof camp.total_destinatarios === 'number' && (
                            <span>
                              <i className="fa-solid fa-users mr-1"></i>
                              {camp.total_destinatarios} destinatários
                            </span>
                          )}
                          {camp.data_encerramento && (
                            <span>
                              <i className="fa-solid fa-flag-checkered mr-1"></i>
                              encerra em {camp.data_encerramento}
                            </span>
                          )}
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* ── Footer (botões) ── */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-gray-200 bg-gray-50 rounded-b-xl">
          <button
            onClick={onFechar}
            disabled={isLoading}
            className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-100 disabled:opacity-40"
          >
            Cancelar
          </button>
          <button
            onClick={handleConfirmar}
            disabled={!podeConfirmar}
            className={[
              'px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2',
              podeConfirmar
                ? 'bg-purple-600 text-white hover:bg-purple-700'
                : 'bg-gray-200 text-gray-400 cursor-not-allowed',
            ].join(' ')}
          >
            {isLoading ? (
              <>
                <i className="fa-solid fa-spinner fa-spin"></i>
                Vinculando...
              </>
            ) : (
              <>
                <i className="fa-solid fa-rocket"></i>
                Confirmar recuperação
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default RecuperarParaCampanhaModal;

