/**
 * PromoverLeadModal.tsx — Modal de confirmação para "Promover Lead" manual
 *
 * Caminho: src/components/crm/base-leads/PromoverLeadModal.tsx
 * Versão: 1.0 (Sub-fase 3.D refino — 18/06/2026 — Promover Lead manual)
 *
 * Modal de confirmação para o botão "Promover" da aba "Leads Importados".
 * Caso de uso: lead caiu em `nao_localizado` no cascade automatizado
 * (Hunter+Apollo+Gemini+Snov.io falharam), mas o GC/SDR sabe ou desconfia
 * que o email/empresa está correto e quer promover manualmente para
 * tentar a campanha. Se o email der bounce, o fluxo natural do sistema
 * (`crm-webhook` v1.15.1) move o lead para a aba "E-mails Inválidos".
 *
 * Fluxo UX:
 *   1. Usuário clica no botão "Promover" purple da linha do lead.
 *   2. Modal abre mostrando dados read-only do lead + aviso amarelo.
 *   3. Usuário clica "Confirmar Promoção".
 *   4. Chama callback `onConfirmar(lead_id)` → hook → backend.
 *   5. Backend retorna `{ promovido, motivo, email_lead_id, ... }`.
 *   6. Modal mostra resultado:
 *        - 'ok'              → toast verde "Lead promovido" + fecha
 *        - 'lead_ja_existia' → toast azul "Lead já estava no CRM" + fecha
 *        - 'opt_out_lgpd'    → banner amarelo + mantém aberto
 *        - 'sem_email'       → banner amarelo "Edite o lead antes" + mantém
 *        - 'erro_*'          → banner vermelho + mantém
 *
 * Props:
 *   • aberto       — se o modal está visível
 *   • lead         — lead atual (LeadImportado)
 *   • onConfirmar  — callback que executa a promoção (recebe lead_id)
 *   • onFechar     — fecha o modal
 *
 * Após confirmação bem-sucedida, o caller deve chamar `carregar()` do
 * hook ou já receber o lead removido via array local (v1.3 do hook faz isso).
 *
 * Visual: segue padrão dos modais do projeto (overlay escurecido + card
 * branco + header com ícone). Cor primária purple-600 (combina com a
 * semântica "Promover" e diferencia do amber do Editar / teal do Validar).
 */

import React, { useState, useEffect } from 'react';
import type {
  LeadImportado,
  ResultadoPromocaoManual,
} from '../shared/hooks/useLeadsImportados';

// ════════════════════════════════════════════════════════════
// PROPS
// ════════════════════════════════════════════════════════════

export interface PromoverLeadModalProps {
  aberto:      boolean;
  lead:        LeadImportado | null;
  onConfirmar: (lead_id: number) => Promise<ResultadoPromocaoManual>;
  onFechar:    () => void;
}

// ════════════════════════════════════════════════════════════
// HELPERS DE EXIBIÇÃO DE RESULTADO
// ════════════════════════════════════════════════════════════

interface MensagemResultado {
  tipo:  'sucesso' | 'info' | 'aviso' | 'erro';
  icone: string;
  titulo: string;
  texto: string;
}

function mensagemDoMotivo(r: ResultadoPromocaoManual): MensagemResultado {
  // Sucesso pleno
  if (r.success && r.promovido && r.motivo === 'ok') {
    return {
      tipo: 'sucesso',
      icone: 'fa-circle-check',
      titulo: 'Lead promovido com sucesso',
      texto:
        `O lead foi movido para "Meus Leads" com origem importacao_manual. ` +
        `Use "Vincular em Lote" para associá-lo a uma campanha.`,
    };
  }

  // Lead já existia em email_leads (helper deletou o prospect)
  if (r.success && r.motivo === 'lead_ja_existia') {
    return {
      tipo: 'info',
      icone: 'fa-circle-info',
      titulo: 'Lead já estava no CRM',
      texto:
        `Este lead já existia em "Meus Leads" com o mesmo e-mail. ` +
        `O registro da aba "Leads Importados" foi removido (sem duplicar).`,
    };
  }

  // Opt-out LGPD bloqueou
  if (r.success && r.motivo === 'opt_out_lgpd') {
    return {
      tipo: 'aviso',
      icone: 'fa-ban',
      titulo: 'Promoção bloqueada por LGPD',
      texto:
        `Este e-mail está marcado como opt-out na base. ` +
        `Por respeito à LGPD não é possível promovê-lo para campanhas. ` +
        `O lead permanece na aba para revisão manual.`,
    };
  }

  // Sem email no prospect
  if (r.success && r.motivo === 'sem_email') {
    return {
      tipo: 'aviso',
      icone: 'fa-envelope-circle-check',
      titulo: 'Lead sem e-mail',
      texto:
        `Não há e-mail cadastrado neste lead. Use o botão "Editar" ` +
        `para informar um e-mail antes de promover.`,
    };
  }

  // Erros técnicos
  return {
    tipo: 'erro',
    icone: 'fa-circle-exclamation',
    titulo: 'Falha ao promover',
    texto:
      r.error ||
      r.motivo ||
      `Erro técnico ao promover o lead. Tente novamente em alguns instantes ` +
      `ou revise os dados via Editar.`,
  };
}

const ESTILOS_RESULTADO: Record<MensagemResultado['tipo'], { bg: string; texto: string; borda: string }> = {
  sucesso: { bg: 'bg-emerald-50',  texto: 'text-emerald-800', borda: 'border-emerald-300' },
  info:    { bg: 'bg-blue-50',     texto: 'text-blue-800',    borda: 'border-blue-300'    },
  aviso:   { bg: 'bg-amber-50',    texto: 'text-amber-800',   borda: 'border-amber-300'   },
  erro:    { bg: 'bg-red-50',      texto: 'text-red-800',     borda: 'border-red-300'     },
};

// ════════════════════════════════════════════════════════════
// COMPONENTE
// ════════════════════════════════════════════════════════════

const PromoverLeadModal: React.FC<PromoverLeadModalProps> = ({
  aberto,
  lead,
  onConfirmar,
  onFechar,
}) => {
  const [submetendo, setSubmetendo]   = useState(false);
  const [resultado, setResultado]     = useState<ResultadoPromocaoManual | null>(null);

  // Reset state quando modal abre ou troca de lead
  useEffect(() => {
    if (aberto) {
      setSubmetendo(false);
      setResultado(null);
    }
  }, [aberto, lead?.id]);

  if (!aberto || !lead) return null;

  const handleConfirmar = async () => {
    if (submetendo) return;
    setSubmetendo(true);
    try {
      const r = await onConfirmar(lead.id);
      setResultado(r);
      // Se foi sucesso pleno OU "já existia" (ambos os casos
      // o lead some da aba), fecha após 1.5s automaticamente.
      if (r.success && (r.promovido || r.motivo === 'lead_ja_existia')) {
        setTimeout(() => onFechar(), 1500);
      }
    } catch (err: any) {
      // O hook já trata try/catch — defensivo.
      setResultado({
        success:   false,
        promovido: false,
        motivo:    err?.message || 'erro_inesperado',
        error:     err?.message || 'Erro inesperado',
      });
    } finally {
      setSubmetendo(false);
    }
  };

  // Quando resultado é sucesso/info, o botão Confirmar some;
  // só o botão Fechar permanece (e o autoclose já está agendado).
  const mostrarBotaoConfirmar =
    !resultado ||
    resultado.success === false ||
    (!resultado.promovido && resultado.motivo !== 'lead_ja_existia');

  const msgRes = resultado ? mensagemDoMotivo(resultado) : null;
  const estilosRes = msgRes ? ESTILOS_RESULTADO[msgRes.tipo] : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={(e) => {
        // Fecha ao clicar no backdrop, mas só se não estiver submetendo
        if (e.target === e.currentTarget && !submetendo) onFechar();
      }}
    >
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">

        {/* ── Header ────────────────────────────────────── */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
              <i className="fa-solid fa-rocket text-purple-600 text-lg"></i>
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">
                Promover Lead manualmente
              </h2>
              <p className="text-xs text-gray-500">
                Mover para o CRM ({'>'}Meus Leads) com origem importacao_manual
              </p>
            </div>
          </div>
          <button
            onClick={onFechar}
            disabled={submetendo}
            className="text-gray-400 hover:text-gray-600 disabled:opacity-30"
            title="Fechar"
          >
            <i className="fa-solid fa-xmark text-xl"></i>
          </button>
        </div>

        {/* ── Corpo ─────────────────────────────────────── */}
        <div className="p-6 space-y-4">

          {/* Aviso amarelo (sempre presente até promover) */}
          {!resultado && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3">
              <div className="flex items-start gap-3">
                <i className="fa-solid fa-triangle-exclamation text-amber-600 mt-0.5"></i>
                <div className="text-sm text-amber-900 flex-1">
                  <strong className="block mb-1">
                    Este lead NÃO foi validado automaticamente.
                  </strong>
                  Hunter, Apollo, Gemini e Snov.io não conseguiram confirmar o e-mail
                  ou a pessoa nesta empresa. Ao promover manualmente, você assume o
                  risco de bounce. Se o e-mail estiver errado, o lead irá automaticamente
                  para a aba <strong>E-mails Inválidos</strong> após o primeiro envio.
                </div>
              </div>
            </div>
          )}

          {/* Banner de resultado (após confirmar) */}
          {resultado && msgRes && estilosRes && (
            <div className={`rounded-lg border ${estilosRes.borda} ${estilosRes.bg} px-4 py-3`}>
              <div className="flex items-start gap-3">
                <i className={`fa-solid ${msgRes.icone} ${estilosRes.texto} mt-0.5`}></i>
                <div className={`text-sm ${estilosRes.texto} flex-1`}>
                  <strong className="block mb-1">{msgRes.titulo}</strong>
                  {msgRes.texto}
                </div>
              </div>
            </div>
          )}

          {/* Dados do lead (read-only) */}
          <div className="rounded-lg border border-gray-200 bg-gray-50">
            <div className="px-4 py-2 bg-gray-100 border-b border-gray-200 text-xs uppercase font-semibold text-gray-600">
              Dados do lead
            </div>
            <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <Campo label="Nome"     valor={lead.nome_completo}   />
              <Campo label="E-mail"   valor={lead.email}            mono />
              <Campo label="Empresa"  valor={lead.empresa_nome}    />
              <Campo label="Domínio"  valor={lead.empresa_dominio}  mono />
              <Campo label="Cargo"    valor={lead.cargo}           />
              <Campo label="Vertical" valor={lead.vertical}        />
            </div>
          </div>

          {/* Texto explicativo (só antes de promover) */}
          {!resultado && (
            <div className="text-sm text-gray-600 space-y-1">
              <p>
                <i className="fa-solid fa-circle-info text-gray-400 mr-1"></i>
                Após promover, o lead será removido da aba <strong>Leads Importados</strong> e
                aparecerá em <strong>Meus Leads</strong>.
              </p>
              <p className="pl-5">
                Use a aba <strong>Vincular em Lote</strong> para associá-lo a uma campanha
                ativa quando estiver pronto.
              </p>
            </div>
          )}

        </div>

        {/* ── Footer ────────────────────────────────────── */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-gray-200 bg-gray-50">
          <button
            onClick={onFechar}
            disabled={submetendo}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {resultado && !mostrarBotaoConfirmar ? 'Fechar' : 'Cancelar'}
          </button>
          {mostrarBotaoConfirmar && (
            <button
              onClick={handleConfirmar}
              disabled={submetendo}
              className="px-4 py-2 text-sm font-medium text-white bg-purple-600 rounded-lg hover:bg-purple-700 disabled:bg-purple-300 disabled:cursor-not-allowed inline-flex items-center gap-2"
            >
              {submetendo ? (
                <>
                  <i className="fa-solid fa-spinner fa-spin"></i>
                  Promovendo…
                </>
              ) : (
                <>
                  <i className="fa-solid fa-rocket"></i>
                  {resultado ? 'Tentar novamente' : 'Confirmar Promoção'}
                </>
              )}
            </button>
          )}
        </div>

      </div>
    </div>
  );
};

// ════════════════════════════════════════════════════════════
// SUB-COMPONENTE: Campo read-only
// ════════════════════════════════════════════════════════════

interface CampoProps {
  label: string;
  valor: string | null | undefined;
  mono?: boolean;
}

const Campo: React.FC<CampoProps> = ({ label, valor, mono }) => (
  <div>
    <div className="text-xs uppercase text-gray-500 font-medium mb-0.5">{label}</div>
    <div className={`text-gray-900 ${mono ? 'font-mono text-xs' : 'text-sm'}`}>
      {valor && valor.trim() ? valor : <span className="text-gray-400 italic">—</span>}
    </div>
  </div>
);

export default PromoverLeadModal;
