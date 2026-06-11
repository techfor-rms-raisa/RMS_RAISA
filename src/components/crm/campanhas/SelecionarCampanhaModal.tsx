/**
 * SelecionarCampanhaModal.tsx — Modal de seleção de campanha ao promover lead
 *
 * Caminho: src/components/crm/campanhas/SelecionarCampanhaModal.tsx
 * Versão: 1.0 (Fase A — 09/06/2026)
 *
 * Fluxo:
 *  1. Usuário clica em "Campanhas" na tabela "Meus Leads Salvos"
 *     do ProspectSearchPage.
 *  2. ProspectSearchPage abre este modal passando `prospectId`,
 *     `leadNome`, `leadVertical` e `criadoPorEmail`.
 *  3. O modal consulta GET /api/crm-campanhas
 *     ?action=listar_campanhas_disponiveis_para_lead
 *     &prospect_id={prospectId}&criado_por={email}
 *     e exibe as campanhas elegíveis (vertical + responsável match +
 *     status ativa/pausada/agendada + data_encerramento OK + lead não
 *     duplicado em outras campanhas em andamento).
 *  4. Usuário escolhe entre:
 *      - "Apenas para o CRM (sem campanha)" — comportamento legado.
 *      - Uma campanha específica da lista.
 *  5. Click em "Confirmar" → invoca `onConfirm(campanhaId | null)`.
 *  6. O componente pai (`ProspectSearchPage > executarPromocao`) faz
 *     o POST /api/crm-leads action=promover_para_campanha com o
 *     `campanha_id` escolhido (null se "Apenas CRM").
 *
 * Pré-requisitos backend:
 *  - api/crm-campanhas.ts v1.11 (action listar_campanhas_disponiveis_para_lead)
 *  - api/crm-leads.ts v1.8 (promover_para_campanha aceita campanha_id)
 *
 * Decisões de UX (alinhadas com Messias em 09/06/2026):
 *  - Status elegíveis: ativa + pausada + agendada
 *  - Bloqueio de duplicação: backend filtra; aqui só exibimos
 *  - Default radio: "Apenas para o CRM" (operação mais conservadora)
 *  - Confirmação obrigatória (não auto-confirma ao clicar em uma campanha)
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

export interface SelecionarCampanhaModalProps {
  /** ID do prospect_lead (linha em prospect_leads) que será promovido. */
  prospectId: number;
  /** Nome do lead (para exibir no header). */
  leadNome: string;
  /** Vertical de negócios do lead (informativo). */
  leadVertical: string;
  /** E-mail do usuário atual (envia ao backend para RBAC). */
  criadoPorEmail: string;
  /** Indica que a promoção está em andamento (desabilita botões). */
  isLoading: boolean;
  /** Fechar o modal (sem confirmar). */
  onClose: () => void;
  /** Confirmar com a escolha: `null` = apenas CRM; `number` = vincula campanha. */
  onConfirm: (campanhaId: number | null) => void;
}

// ════════════════════════════════════════════════════════════════
// HELPERS DE FORMATAÇÃO
// ════════════════════════════════════════════════════════════════

/** Formata data ISO YYYY-MM-DD para dd/mm/yyyy. Aceita null. */
function formatarData(iso: string | null): string {
  if (!iso) return '';
  const [y, m, d] = iso.slice(0, 10).split('-');
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

/** Cor do badge por status (alinhado com CampanhasPage). */
function badgeClassesPorStatus(status: string): string {
  switch (status) {
    case 'ativa':
      return 'bg-green-100 text-green-700 border border-green-200';
    case 'pausada':
      return 'bg-amber-100 text-amber-700 border border-amber-200';
    case 'agendada':
      return 'bg-blue-100 text-blue-700 border border-blue-200';
    default:
      return 'bg-gray-100 text-gray-700 border border-gray-200';
  }
}

/** Calcula urgência da data de encerramento — devolve cor de tag. */
function corEncerramento(dataEnc: string | null): { texto: string; classe: string } | null {
  if (!dataEnc) return null;
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const enc = new Date(dataEnc + 'T00:00:00');
  const diffMs = enc.getTime() - hoje.getTime();
  const diffDias = Math.round(diffMs / (1000 * 60 * 60 * 24));

  if (diffDias <= 1) return { texto: `Encerra ${formatarData(dataEnc)}`, classe: 'text-red-600 bg-red-50 border border-red-200' };
  if (diffDias <= 7) return { texto: `Encerra ${formatarData(dataEnc)}`, classe: 'text-orange-700 bg-orange-50 border border-orange-200' };
  return { texto: `Encerra ${formatarData(dataEnc)}`, classe: 'text-gray-600 bg-gray-50 border border-gray-200' };
}

// ════════════════════════════════════════════════════════════════
// COMPONENTE
// ════════════════════════════════════════════════════════════════

const SelecionarCampanhaModal: React.FC<SelecionarCampanhaModalProps> = ({
  prospectId,
  leadNome,
  leadVertical,
  criadoPorEmail,
  isLoading,
  onClose,
  onConfirm,
}) => {
  // Estado de carregamento das campanhas (independente do isLoading da promoção)
  const [carregando, setCarregando] = useState<boolean>(true);
  const [erroCarregar, setErroCarregar] = useState<string | null>(null);
  const [motivoVazio, setMotivoVazio] = useState<string | null>(null);
  const [campanhas, setCampanhas] = useState<CampanhaElegivel[]>([]);

  // Escolha do usuário: 'crm' (default — só CRM) ou número da campanha
  const [escolha, setEscolha] = useState<'crm' | number>('crm');

  // ─────────────────────────────────────────────────────────────
  // Carregar campanhas elegíveis
  // ─────────────────────────────────────────────────────────────
  const carregarCampanhasElegiveis = useCallback(async () => {
    setCarregando(true);
    setErroCarregar(null);
    setMotivoVazio(null);
    try {
      const params = new URLSearchParams({
        action: 'listar_campanhas_disponiveis_para_lead',
        prospect_id: String(prospectId),
        criado_por: criadoPorEmail,
      });
      const resp = await fetch(`/api/crm-campanhas?${params}`);
      const data = await resp.json();

      if (!resp.ok || !data.success) {
        setErroCarregar(data?.error || `Falha ao carregar campanhas (HTTP ${resp.status})`);
        setCampanhas([]);
        return;
      }

      const lista: CampanhaElegivel[] = Array.isArray(data.campanhas) ? data.campanhas : [];
      setCampanhas(lista);
      if (lista.length === 0 && data.motivo) {
        setMotivoVazio(String(data.motivo));
      }
    } catch (err: any) {
      setErroCarregar(`Erro de rede: ${err?.message || 'desconhecido'}`);
      setCampanhas([]);
    } finally {
      setCarregando(false);
    }
  }, [prospectId, criadoPorEmail]);

  useEffect(() => {
    carregarCampanhasElegiveis();
  }, [carregarCampanhasElegiveis]);

  // ─────────────────────────────────────────────────────────────
  // Handler de confirmação
  // ─────────────────────────────────────────────────────────────
  const handleConfirmar = useCallback(() => {
    if (isLoading) return;
    if (escolha === 'crm') {
      onConfirm(null);
    } else {
      onConfirm(escolha);
    }
  }, [escolha, isLoading, onConfirm]);

  // Fechar com ESC
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isLoading) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isLoading, onClose]);

  // ─────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-4 border-b">
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-bold text-gray-800">Enviar lead para Campanhas</h2>
            <p className="text-xs text-gray-500 mt-1 truncate">
              <span className="font-medium">{leadNome}</span>
              {' '}— Vertical: <span className="font-medium">{leadVertical}</span>
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={isLoading}
            className="text-gray-400 hover:text-gray-600 text-2xl leading-none ml-3 disabled:opacity-40 disabled:cursor-not-allowed"
            aria-label="Fechar"
          >
            &times;
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-4 overflow-y-auto flex-1">
          {/* Opção 1 — Apenas CRM (sempre disponível, default) */}
          <label
            className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
              escolha === 'crm'
                ? 'border-indigo-400 bg-indigo-50'
                : 'border-gray-200 hover:bg-gray-50'
            }`}
          >
            <input
              type="radio"
              name="escolha"
              checked={escolha === 'crm'}
              onChange={() => setEscolha('crm')}
              disabled={isLoading}
              className="mt-1 accent-indigo-600"
            />
            <div className="flex-1">
              <div className="text-sm font-medium text-gray-800">Apenas para o CRM (sem campanha)</div>
              <div className="text-xs text-gray-500 mt-0.5">
                Lead vai para o CRM marcado como apto a campanhas. Vincule a uma campanha depois pelo Wizard.
              </div>
            </div>
          </label>

          {/* Separador */}
          <div className="flex items-center gap-3 my-4">
            <span className="flex-1 h-px bg-gray-200" />
            <span className="text-[11px] uppercase tracking-wider text-gray-400 font-semibold">
              Ou vincular a campanha
            </span>
            <span className="flex-1 h-px bg-gray-200" />
          </div>

          {/* Lista de campanhas — Loading */}
          {carregando && (
            <div className="text-center py-6">
              <i className="fa-solid fa-spinner fa-spin text-indigo-500 text-2xl"></i>
              <p className="text-xs text-gray-500 mt-2">Buscando campanhas elegíveis…</p>
            </div>
          )}

          {/* Lista de campanhas — Erro */}
          {!carregando && erroCarregar && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
              <p className="text-sm text-red-700">
                <i className="fa-solid fa-circle-exclamation mr-2"></i>
                {erroCarregar}
              </p>
              <button
                onClick={carregarCampanhasElegiveis}
                className="text-xs text-red-700 underline hover:text-red-900 mt-2"
              >
                Tentar novamente
              </button>
            </div>
          )}

          {/* Lista de campanhas — Vazia (com motivo do backend) */}
          {!carregando && !erroCarregar && campanhas.length === 0 && (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-center">
              <i className="fa-solid fa-inbox text-gray-400 text-2xl mb-2"></i>
              <p className="text-sm text-gray-600">
                {motivoVazio || 'Nenhuma campanha elegível encontrada.'}
              </p>
              <p className="text-xs text-gray-400 mt-2">
                Você pode prosseguir apenas com o CRM acima.
              </p>
            </div>
          )}

          {/* Lista de campanhas — Itens */}
          {!carregando && !erroCarregar && campanhas.length > 0 && (
            <div className="space-y-2">
              {campanhas.map((c) => {
                const enc = corEncerramento(c.data_encerramento);
                const selecionada = escolha === c.id;
                return (
                  <label
                    key={c.id}
                    className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                      selecionada
                        ? 'border-indigo-400 bg-indigo-50'
                        : 'border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="escolha"
                      checked={selecionada}
                      onChange={() => setEscolha(c.id)}
                      disabled={isLoading}
                      className="mt-1 accent-indigo-600"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-gray-800 truncate">{c.nome}</span>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase tracking-wide ${badgeClassesPorStatus(c.status)}`}>
                          {c.status}
                        </span>
                        {enc && (
                          <span className={`text-[10px] px-2 py-0.5 rounded-full ${enc.classe}`}>
                            <i className="fa-solid fa-clock mr-1"></i>
                            {enc.texto}
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-gray-500 mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                        {c.unidade && <span><i className="fa-solid fa-building mr-1"></i>{c.unidade}</span>}
                        <span><i className="fa-solid fa-users mr-1"></i>{c.total_destinatarios || 0} destinatários</span>
                        {c.inicio_envio && (
                          <span>
                            <i className="fa-solid fa-paper-plane mr-1"></i>
                            Em curso desde {formatarData(c.inicio_envio)}
                          </span>
                        )}
                        {!c.inicio_envio && c.status === 'agendada' && (
                          <span className="text-blue-600">
                            <i className="fa-solid fa-hourglass-start mr-1"></i>
                            Aguardando ativação
                          </span>
                        )}
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>
          )}

          {/* Nota técnica — só quando há campanhas com inicio_envio */}
          {!carregando && !erroCarregar && campanhas.some((c) => !!c.inicio_envio) && escolha !== 'crm' && (
            <div className="mt-4 bg-indigo-50 border border-indigo-200 rounded-lg p-3">
              <p className="text-[11px] text-indigo-700 leading-relaxed">
                <i className="fa-solid fa-circle-info mr-1"></i>
                Para campanhas <strong>em curso</strong>, o lead entra na fila com os próximos
                envios já agendados a partir de agora (delays acumulados dos steps).
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-3 border-t bg-gray-50 rounded-b-xl">
          <button
            onClick={onClose}
            disabled={isLoading}
            className="text-sm px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Cancelar
          </button>
          <button
            onClick={handleConfirmar}
            disabled={isLoading || carregando}
            className="text-sm px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-2 font-medium"
          >
            {isLoading ? (
              <>
                <i className="fa-solid fa-spinner fa-spin"></i>
                Processando…
              </>
            ) : escolha === 'crm' ? (
              <>
                <i className="fa-solid fa-check"></i>
                Enviar ao CRM
              </>
            ) : (
              <>
                <i className="fa-solid fa-paper-plane"></i>
                Enviar ao CRM + Campanha
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SelecionarCampanhaModal;
