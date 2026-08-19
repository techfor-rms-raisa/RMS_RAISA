/**
 * DescartarLeadImportadoModal.tsx — Confirmação de descarte lógico
 *
 * Caminho: src/components/crm/base-leads/DescartarLeadImportadoModal.tsx
 * Versão: 1.0 (19/08/2026)
 *
 * Abre sob a aba "Leads Importados" do BaseLeadsPage quando o usuário
 * clica no botão de lixeira (Descartar) em qualquer linha da tabela.
 *
 * Espelha o comportamento já existente na aba "Meus Prospects Salvos" do
 * Prospect Engine (ProspectSearchPage v4.9): o descarte é LÓGICO —
 * `prospect_leads.status` passa a 'descartado' e o registro sai da
 * listagem ativa, mas nada é apagado do banco.
 *
 * Por que exclusão lógica e não DELETE físico (decisão 03/08/2026,
 * documentada em api/prospect-leads.ts v1.2):
 *   • `email_leads.prospect_lead_id` é ON DELETE SET NULL — um DELETE
 *     apagaria a rastreabilidade do lead promovido ao CRM.
 *   • `prospect_revalidacao_log` é ON DELETE CASCADE — o histórico de
 *     revalidação (e a cota já consumida) sumiria junto.
 *
 * Trava de integridade aplicada NO BACKEND (nunca só aqui): lead com
 * status='no_crm' (já promovido) devolve HTTP 409 e não é descartado —
 * nesse caso o caminho correto é opt-out/arquivamento na Base de Leads.
 * O erro retornado pelo backend é exibido dentro deste modal, mantendo o
 * contexto da ação em vez de jogar o usuário num alert() sem referência.
 *
 * O modal é "burro": não conhece endpoints. Recebe `onConfirmar` do
 * BaseLeadsPage, que delega ao hook useLeadsImportados v1.6.
 */

import React, { useEffect, useState } from 'react';
import type { LeadImportado } from '../shared/hooks/useLeadsImportados';

// ════════════════════════════════════════════════════════════
// PROPS
// ════════════════════════════════════════════════════════════

export interface DescartarLeadImportadoModalProps {
  aberto: boolean;
  lead: LeadImportado | null;
  /**
   * Executa o descarte. Deve devolver `{ ok }` — quando `ok=false`, a
   * mensagem é renderizada dentro do modal e o modal permanece aberto
   * para que o usuário leia o motivo.
   */
  onConfirmar: (lead_id: number) => Promise<{ ok: boolean; error?: string }>;
  onFechar: () => void;
}

// ════════════════════════════════════════════════════════════
// COMPONENTE
// ════════════════════════════════════════════════════════════

const DescartarLeadImportadoModal: React.FC<DescartarLeadImportadoModalProps> = ({
  aberto, lead, onConfirmar, onFechar,
}) => {
  const [descartando, setDescartando] = useState(false);
  const [erro, setErro]               = useState<string | null>(null);

  // Zera o erro sempre que o modal abre para um novo lead — senão a
  // mensagem de uma tentativa anterior reapareceria fora de contexto.
  useEffect(() => {
    if (aberto) {
      setErro(null);
      setDescartando(false);
    }
  }, [aberto, lead?.id]);

  if (!aberto || !lead) return null;

  const handleConfirmar = async () => {
    setDescartando(true);
    setErro(null);
    const r = await onConfirmar(lead.id);
    setDescartando(false);
    if (r.ok) {
      onFechar();
    } else {
      setErro(r.error || 'Não foi possível descartar o lead.');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">

        {/* ── Cabeçalho ─────────────────────────────────────── */}
        <div className="px-6 pt-6 pb-4 flex items-start gap-3">
          <div className="w-11 h-11 rounded-full bg-red-100 text-red-600 flex items-center justify-center shrink-0">
            <i className="fa-solid fa-trash text-lg"></i>
          </div>
          <div className="min-w-0">
            <h3 className="font-semibold text-gray-900">Descartar este lead importado?</h3>
            <p className="text-sm text-gray-600 mt-1.5 break-words">
              <strong>{lead.nome_completo}</strong>
              {lead.email && <> — {lead.email}</>}
            </p>
            {lead.empresa_nome && (
              <p className="text-xs text-gray-500 mt-0.5">{lead.empresa_nome}</p>
            )}
          </div>
        </div>

        {/* ── O que acontece ────────────────────────────────── */}
        <div className="px-6 pb-4">
          <div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 text-xs text-gray-600 space-y-1.5">
            <p>
              <i className="fa-solid fa-database text-gray-400 w-4"></i>{' '}
              Nada é apagado do banco — o registro fica marcado como descartado e sai desta listagem.
            </p>
            <p>
              <i className="fa-solid fa-rotate-left text-gray-400 w-4"></i>{' '}
              Reversível: ligue <strong>Ver descartados</strong> nos filtros e clique em Restaurar.
            </p>
            <p>
              <i className="fa-solid fa-clock-rotate-left text-gray-400 w-4"></i>{' '}
              O histórico de revalidação e a auditoria são preservados.
            </p>
          </div>

          {/* Erro do backend (ex.: HTTP 409 — lead já promovido ao CRM) */}
          {erro && (
            <div className="mt-3 bg-red-50 border border-red-200 rounded-lg px-4 py-2.5 text-xs text-red-700 flex items-start gap-2">
              <i className="fa-solid fa-circle-exclamation mt-0.5"></i>
              <span>{erro}</span>
            </div>
          )}
        </div>

        {/* ── Ações ─────────────────────────────────────────── */}
        <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-2">
          <button
            onClick={onFechar}
            disabled={descartando}
            className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg font-medium disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={handleConfirmar}
            disabled={descartando}
            className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:bg-gray-300 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
          >
            {descartando ? (
              <>
                <i className="fa-solid fa-spinner fa-spin"></i> Descartando…
              </>
            ) : (
              <>
                <i className="fa-solid fa-trash"></i> Descartar lead
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default DescartarLeadImportadoModal;
