/**
 * ArquivarLeadModal.tsx — Confirmação de arquivamento de lead (soft-delete)
 *
 * Caminho: src/components/crm/base-leads/ArquivarLeadModal.tsx
 * Versão: 1.0 (Arquivamento de leads — 10/08/2026)
 *
 * Disparado pelo botão 📦 da coluna AÇÕES da LeadsTab v1.3.
 *
 * CONTEXTO DE PRODUTO
 * ───────────────────
 * A Base de Leads não tinha como remover um cadastro feito por engano.
 * A única saída era o Opt-Out — semanticamente errado: opt-out é
 * manifestação de vontade do TITULAR (LGPD), não faxina de cadastro.
 *
 * Decisão (Messias, 10/08/2026): soft-delete IRREVERSÍVEL pela interface.
 * O registro permanece em `email_leads`, e é justamente isso que faz a
 * deduplicação por e-mail da rotina de Importação continuar bloqueando a
 * reentrada do mesmo endereço.
 *
 * DOIS ESTADOS
 * ────────────
 *  (A) 'confirmar' — estado inicial. Explicita as três consequências e
 *      exige um motivo de whitelist fechada.
 *
 *  (B) 'bloqueado' — o backend recusou porque o lead tem envios pendentes
 *      em campanha ativa/pausada/agendada. Mostra QUAIS campanhas e
 *      quantos envios, e aponta o caminho correto (Opt-Out).
 *
 * Por que o bloqueio é verificado no SUBMIT e não na abertura do modal:
 *   • Evita um round-trip extra em toda abertura, inclusive nas que o
 *     usuário vai cancelar.
 *   • Elimina TOCTOU — entre um pré-check e a confirmação, uma campanha
 *     pode ser ativada por outro operador. A verificação acontece na
 *     mesma transação lógica da gravação, então não existe janela.
 *
 * Motivo obrigatório e fechado de propósito: texto livre viraria lixo
 * não-agregável, e "por que N leads foram arquivados neste mês?" precisa
 * ter resposta. A whitelist espelha a CHECK constraint do banco
 * (sql/2026-08-10_email_leads_arquivamento.sql) e a validação do backend.
 */

import React, { useEffect, useState } from 'react';
import type { Lead } from '../types/crm.types';
import type {
  ArquivarLeadResult,
  CampanhaBloqueanteArquivamento,
} from '../shared/hooks/useLeads';

// ════════════════════════════════════════════════════════════
// CONSTANTES
// ════════════════════════════════════════════════════════════

/**
 * Whitelist de motivos. DEVE permanecer alinhada com:
 *   • a CHECK constraint de email_leads.arquivado_motivo
 *   • o objeto MOTIVOS_ARQUIVAMENTO da action `arquivar_lead`
 * Alterar em um lugar só produz erro 400 (backend) ou 23514 (banco).
 */
const MOTIVOS_ARQUIVAMENTO: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'duplicado', label: 'Duplicado' },
  { value: 'fora_icp', label: 'Fora do perfil (ICP)' },
  { value: 'dados_incorretos', label: 'Dados incorretos' },
  { value: 'saiu_da_empresa', label: 'Saiu da empresa' },
  { value: 'outro', label: 'Outro' },
];

const LABEL_STATUS_CAMPANHA: Record<string, string> = {
  ativa: 'ativa',
  pausada: 'pausada',
  agendada: 'agendada',
};

// ════════════════════════════════════════════════════════════
// PROPS
// ════════════════════════════════════════════════════════════

export interface ArquivarLeadModalProps {
  /** Lead a arquivar. `null` mantém o modal fechado. */
  lead: Lead | null;
  /** Loading do hook (desabilita os botões durante a chamada). */
  loading: boolean;
  /**
   * Executa o arquivamento. O container repassa `leadsH.arquivar`
   * já com o usuário corrente aplicado.
   */
  onConfirmar: (motivo: string) => Promise<ArquivarLeadResult>;
  /** Fecha o modal (o container zera o lead selecionado). */
  onFechar: () => void;
  /**
   * Opcional — abre o formulário do lead a partir do estado bloqueado,
   * para que o operador chegue ao botão Opt-Out sem procurar a linha
   * de novo na tabela.
   */
  onAbrirLead?: (lead: Lead) => void;
}

// ════════════════════════════════════════════════════════════
// COMPONENTE
// ════════════════════════════════════════════════════════════

const ArquivarLeadModal: React.FC<ArquivarLeadModalProps> = ({
  lead,
  loading,
  onConfirmar,
  onFechar,
  onAbrirLead,
}) => {
  const [motivo, setMotivo] = useState('');
  const [estado, setEstado] = useState<'confirmar' | 'bloqueado'>('confirmar');
  const [campanhas, setCampanhas] = useState<CampanhaBloqueanteArquivamento[]>([]);
  const [totalPendentes, setTotalPendentes] = useState(0);
  const [erro, setErro] = useState<string | null>(null);

  // Reset a cada abertura. Sem isso, o modal reabriria com o motivo e o
  // estado de bloqueio do lead ANTERIOR — bug clássico de modal reusado.
  useEffect(() => {
    if (lead) {
      setMotivo('');
      setEstado('confirmar');
      setCampanhas([]);
      setTotalPendentes(0);
      setErro(null);
    }
  }, [lead?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!lead) return null;

  const empresaNome = lead.email_empresas?.nome || null;

  const handleConfirmar = async () => {
    if (!motivo) {
      setErro('Selecione o motivo do arquivamento.');
      return;
    }
    setErro(null);

    const resultado = await onConfirmar(motivo);

    if (resultado.bloqueado) {
      setCampanhas(resultado.campanhas);
      setTotalPendentes(resultado.total_pendentes);
      setEstado('bloqueado');
      return;
    }

    if (!resultado.ok) {
      setErro(resultado.erro || 'Não foi possível arquivar o lead.');
      return;
    }

    // Sucesso (inclusive ja_arquivado): quem fecha e recarrega é o
    // container, que também exibe o feedback pós-ação.
    onFechar();
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-lg w-full max-w-md overflow-hidden">
        {estado === 'confirmar' ? (
          <>
            {/* ── Header ───────────────────────────────── */}
            <div className="px-6 py-4 border-b flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-amber-50 flex items-center justify-center shrink-0">
                <i className="fa-solid fa-box-archive text-amber-600"></i>
              </div>
              <div>
                <h3 className="font-bold text-gray-800">Arquivar lead</h3>
                <p className="text-xs text-gray-500">
                  Esta ação não pode ser desfeita pela interface.
                </p>
              </div>
            </div>

            {/* ── Corpo ────────────────────────────────── */}
            <div className="px-6 py-4 space-y-4">
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="font-medium text-gray-800 text-sm">{lead.nome}</p>
                <p className="text-xs text-gray-500">
                  {lead.email}
                  {empresaNome ? ` — ${empresaNome}` : ''}
                </p>
              </div>

              <ul className="text-sm text-gray-600 space-y-2">
                <li className="flex gap-2">
                  <i className="fa-solid fa-eye-slash text-gray-400 mt-0.5 w-4 shrink-0"></i>
                  <span>
                    Sai da aba Meus Leads, dos contadores e da seleção de campanhas.
                  </span>
                </li>
                <li className="flex gap-2">
                  <i className="fa-solid fa-shield-halved text-gray-400 mt-0.5 w-4 shrink-0"></i>
                  <span>
                    O e-mail continua na base: uma nova importação com este
                    endereço será bloqueada como duplicada.
                  </span>
                </li>
                <li className="flex gap-2">
                  <i className="fa-solid fa-clock-rotate-left text-gray-400 mt-0.5 w-4 shrink-0"></i>
                  <span>Restaurar exige intervenção do Administrador no banco.</span>
                </li>
              </ul>

              <div>
                <label
                  htmlFor="arquivar-motivo"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Motivo <span className="text-red-500">*</span>
                </label>
                <select
                  id="arquivar-motivo"
                  value={motivo}
                  onChange={(e) => {
                    setMotivo(e.target.value);
                    if (erro) setErro(null);
                  }}
                  disabled={loading}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500 disabled:bg-gray-100"
                >
                  <option value="">Selecione o motivo...</option>
                  {MOTIVOS_ARQUIVAMENTO.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-400 mt-1">
                  Fica registrado no histórico do lead para auditoria.
                </p>
              </div>

              {erro && (
                <div className="bg-red-50 border border-red-100 rounded-lg p-3 text-sm text-red-800">
                  {erro}
                </div>
              )}
            </div>

            {/* ── Rodapé ───────────────────────────────── */}
            <div className="px-6 py-4 bg-gray-50 flex justify-end gap-3">
              <button
                onClick={onFechar}
                disabled={loading}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmar}
                disabled={loading || !motivo}
                className="px-4 py-2 text-sm font-medium text-white bg-amber-600 hover:bg-amber-700 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <>
                    <i className="fa-solid fa-spinner fa-spin mr-1"></i> Arquivando...
                  </>
                ) : (
                  <>
                    <i className="fa-solid fa-box-archive mr-1"></i> Arquivar lead
                  </>
                )}
              </button>
            </div>
          </>
        ) : (
          <>
            {/* ══ ESTADO B — BLOQUEADO ═══════════════════ */}
            <div className="px-6 py-4 border-b flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center shrink-0">
                <i className="fa-solid fa-ban text-red-600"></i>
              </div>
              <div>
                <h3 className="font-bold text-gray-800">Não é possível arquivar</h3>
                <p className="text-xs text-gray-500">O lead tem envios pendentes.</p>
              </div>
            </div>

            <div className="px-6 py-4 space-y-4">
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="font-medium text-gray-800 text-sm">{lead.nome}</p>
                <p className="text-xs text-gray-500">
                  {lead.email}
                  {empresaNome ? ` — ${empresaNome}` : ''}
                </p>
              </div>

              <div className="bg-red-50 border border-red-100 rounded-lg p-3 text-sm text-red-800 space-y-1">
                {campanhas.map((c) => (
                  <div key={c.id}>
                    <strong>{c.nome}</strong> ({LABEL_STATUS_CAMPANHA[c.status] || c.status})
                    {' — '}
                    {c.pendentes} envio{c.pendentes === 1 ? '' : 's'} pendente
                    {c.pendentes === 1 ? '' : 's'}
                  </div>
                ))}
                {campanhas.length === 0 && (
                  <div>
                    {totalPendentes} envio{totalPendentes === 1 ? '' : 's'} pendente
                    {totalPendentes === 1 ? '' : 's'} em campanha ativa.
                  </div>
                )}
              </div>

              <p className="text-sm text-gray-600">
                Para interromper os envios agora, use <strong>Opt-Out</strong> no
                formulário do lead — ele cancela a fila em todas as campanhas. Para
                apenas limpar a base, aguarde o encerramento da campanha e arquive
                depois.
              </p>
            </div>

            <div className="px-6 py-4 bg-gray-50 flex justify-end gap-3">
              <button
                onClick={onFechar}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
              >
                Fechar
              </button>
              {onAbrirLead && (
                <button
                  onClick={() => onAbrirLead(lead)}
                  className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg"
                >
                  Abrir lead
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default ArquivarLeadModal;
