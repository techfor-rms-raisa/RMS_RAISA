/**
 * EditarLeadImportadoModal.tsx — Modal de edição de lead importado
 *
 * Caminho: src/components/crm/base-leads/EditarLeadImportadoModal.tsx
 * Versão: 1.0 (Sub-fase 3.D — 17/06/2026)
 *
 * Abre sob a aba "Leads Importados" do BaseLeadsPage quando o usuário
 * clica no botão "Editar" (ícone lápis) em qualquer linha da tabela.
 *
 * Campos editáveis (mapeados 1:1 com o PATCH do backend):
 *   • Pessoa: nome_completo, primeiro_nome, ultimo_nome, cargo, email,
 *             linkedin_url
 *   • Empresa: empresa_nome, empresa_dominio
 *   • Classificação: vertical, tier_pipeline
 *   • Localização: cidade, estado
 *   • Atribuição: reservado_por (somente Administrador)
 *
 * Validação client-side básica:
 *   • email com regex simples
 *   • empresa_dominio com ponto
 *   • CRECI bidirectional na vertical (mensagem amigável antes de
 *     enviar — backend faz a validação final)
 *
 * Backend retorna o lead atualizado, e o hook useLeadsImportados
 * substitui o item no array localmente (sem precisar recarregar).
 */

import React, { useEffect, useMemo, useState } from 'react';
import type { CurrentUserLite, ResponsavelLite } from '../types/crm.types';
import type { LeadImportado } from '../shared/hooks/useLeadsImportados';

// ════════════════════════════════════════════════════════════
// PROPS
// ════════════════════════════════════════════════════════════

export interface EditarLeadImportadoModalProps {
  aberto: boolean;
  lead: LeadImportado | null;
  currentUser: CurrentUserLite;
  responsaveis: ResponsavelLite[];
  verticaisDisponiveis: string[]; // do useTiposCampanha
  /** Submete os campos editados. Lança erro com mensagem amigável quando falha. */
  onSalvar: (
    lead_id: number,
    novos_dados: Partial<LeadImportado>
  ) => Promise<LeadImportado>;
  onFechar: () => void;
}

// ════════════════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════════════════

function validarEmailLocal(email: string): boolean {
  if (!email) return true; // permite vazio (vira null)
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validarDominio(d: string): boolean {
  if (!d) return true;
  return d.includes('.') && !d.includes(' ');
}

/** Campos do form (espelham os editáveis do backend). */
interface FormState {
  nome_completo:   string;
  primeiro_nome:   string;
  ultimo_nome:     string;
  cargo:           string;
  email:           string;
  linkedin_url:    string;
  empresa_nome:    string;
  empresa_dominio: string;
  vertical:        string;
  tier_pipeline:   string;
  cidade:          string;
  estado:          string;
  reservado_por:   number | null;
}

function leadParaForm(l: LeadImportado): FormState {
  return {
    nome_completo:   l.nome_completo ?? '',
    primeiro_nome:   l.primeiro_nome ?? '',
    ultimo_nome:     l.ultimo_nome ?? '',
    cargo:           l.cargo ?? '',
    email:           l.email ?? '',
    linkedin_url:    l.linkedin_url ?? '',
    empresa_nome:    l.empresa_nome ?? '',
    empresa_dominio: l.empresa_dominio ?? '',
    vertical:        l.vertical ?? '',
    tier_pipeline:   l.tier_pipeline ?? 'cold',
    cidade:          l.cidade ?? '',
    estado:          l.estado ?? '',
    reservado_por:   l.reservado_por ?? null,
  };
}

/** Calcula apenas os campos alterados em relação ao lead original. */
function diff(original: FormState, atual: FormState): Partial<FormState> {
  const out: Partial<FormState> = {};
  (Object.keys(atual) as (keyof FormState)[]).forEach(k => {
    const a = atual[k];
    const o = original[k];
    if (a !== o) {
      (out as any)[k] = a;
    }
  });
  return out;
}

// ════════════════════════════════════════════════════════════
// COMPONENTE
// ════════════════════════════════════════════════════════════

const TIERS = ['cold', 'warm', 'hot'] as const;

const EditarLeadImportadoModal: React.FC<EditarLeadImportadoModalProps> = ({
  aberto, lead, currentUser, responsaveis, verticaisDisponiveis,
  onSalvar, onFechar,
}) => {
  const isAdmin = currentUser.tipo_usuario === 'Administrador';

  // Estado original (reset ao trocar de lead)
  const [original, setOriginal] = useState<FormState | null>(null);
  const [form, setForm]         = useState<FormState | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro]         = useState<string | null>(null);

  useEffect(() => {
    if (lead) {
      const f = leadParaForm(lead);
      setOriginal(f);
      setForm(f);
      setErro(null);
    } else {
      setOriginal(null);
      setForm(null);
    }
  }, [lead?.id]);

  // ── Validação client-side ─────────────────────────────
  const errosForm = useMemo<Partial<Record<keyof FormState, string>>>(() => {
    if (!form) return {};
    const e: Partial<Record<keyof FormState, string>> = {};
    if (!form.nome_completo.trim()) e.nome_completo = 'Obrigatório';
    if (form.email && !validarEmailLocal(form.email)) e.email = 'E-mail inválido';
    if (form.empresa_dominio && !validarDominio(form.empresa_dominio)) {
      e.empresa_dominio = 'Domínio sem ponto ou com espaço';
    }
    // CRECI bidirectional — mensagem antecipada antes do submit
    if (lead) {
      const ehCreciAtual = (lead.vertical ?? '').toUpperCase() === 'CRECI';
      const ehCreciNovo  = (form.vertical ?? '').toUpperCase() === 'CRECI';
      if (ehCreciAtual && !ehCreciNovo) {
        e.vertical = 'Lead CRECI não pode mudar de vertical (regra LGPD/contratual)';
      } else if (!ehCreciAtual && ehCreciNovo) {
        e.vertical = 'Lead não-CRECI não pode virar CRECI (regra LGPD/contratual)';
      }
    }
    return e;
  }, [form, lead]);

  const camposAlterados = useMemo(() => {
    if (!original || !form) return {};
    return diff(original, form);
  }, [original, form]);

  const totalAlterados = Object.keys(camposAlterados).length;
  const podeSalvar = totalAlterados > 0 && Object.keys(errosForm).length === 0;

  // ── Handlers ──────────────────────────────────────────
  const onChange = <K extends keyof FormState>(campo: K, valor: FormState[K]) => {
    setForm(prev => prev ? { ...prev, [campo]: valor } : prev);
  };

  const handleSalvar = async () => {
    if (!lead || !form || !podeSalvar) return;
    setSalvando(true);
    setErro(null);
    try {
      // Mapeia FormState → Partial<LeadImportado> (mesmos nomes)
      const payload: Partial<LeadImportado> = {};
      (Object.keys(camposAlterados) as (keyof FormState)[]).forEach(k => {
        const v = camposAlterados[k];
        // Strings vazias serão convertidas em null no backend (lá tem o trim).
        (payload as any)[k] = (typeof v === 'string' && v.trim() === '') ? null : v;
      });
      await onSalvar(lead.id, payload);
      onFechar();
    } catch (err: any) {
      setErro(err?.message || 'Falha ao salvar');
    } finally {
      setSalvando(false);
    }
  };

  // ════════════════════════════════════════════════════════
  if (!aberto || !lead || !form) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col">

        {/* ════════ HEADER ════════ */}
        <div className="bg-gradient-to-r from-amber-500 to-amber-600 text-white px-6 py-4 flex items-center justify-between">
          <h3 className="text-lg font-bold flex items-center gap-2">
            <i className="fa-solid fa-pen-to-square"></i>
            Editar Lead Importado
          </h3>
          <div className="flex items-center gap-3">
            <span className="text-xs bg-white/20 px-2 py-0.5 rounded">
              ID #{lead.id}
            </span>
            <button
              onClick={onFechar}
              disabled={salvando}
              className="text-white/80 hover:text-white text-xl disabled:opacity-30"
              aria-label="Fechar"
            >
              <i className="fa-solid fa-xmark"></i>
            </button>
          </div>
        </div>

        {/* ════════ CORPO ════════ */}
        <div className="px-6 py-5 overflow-y-auto flex-1 space-y-5">

          {/* Aviso opt-out */}
          {(lead as any).opt_out && (
            <div className="p-2 bg-rose-50 border border-rose-200 rounded text-xs text-rose-700 flex items-start gap-2">
              <i className="fa-solid fa-ban mt-0.5"></i>
              <span>
                Este lead está em <strong>opt-out LGPD</strong>. Edições serão
                gravadas, mas o lead não poderá ser promovido para o CRM.
              </span>
            </div>
          )}

          {/* ── Pessoa ─────────────────────────────────── */}
          <section>
            <div className="text-xs font-semibold text-gray-500 uppercase mb-2 flex items-center gap-1.5">
              <i className="fa-solid fa-user text-amber-600"></i> Pessoa
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="Nome completo *" erro={errosForm.nome_completo}>
                <input
                  type="text"
                  value={form.nome_completo}
                  onChange={e => onChange('nome_completo', e.target.value)}
                  className={inputClass(!!errosForm.nome_completo)}
                />
              </Field>
              <Field label="Cargo">
                <input
                  type="text"
                  value={form.cargo}
                  onChange={e => onChange('cargo', e.target.value)}
                  className={inputClass(false)}
                />
              </Field>
              <Field label="Primeiro nome">
                <input
                  type="text"
                  value={form.primeiro_nome}
                  onChange={e => onChange('primeiro_nome', e.target.value)}
                  className={inputClass(false)}
                />
              </Field>
              <Field label="Sobrenome">
                <input
                  type="text"
                  value={form.ultimo_nome}
                  onChange={e => onChange('ultimo_nome', e.target.value)}
                  className={inputClass(false)}
                />
              </Field>
              <Field label="E-mail" erro={errosForm.email}>
                <input
                  type="email"
                  value={form.email}
                  onChange={e => onChange('email', e.target.value)}
                  className={inputClass(!!errosForm.email)}
                />
              </Field>
              <Field label="LinkedIn URL">
                <input
                  type="url"
                  value={form.linkedin_url}
                  onChange={e => onChange('linkedin_url', e.target.value)}
                  className={inputClass(false)}
                  placeholder="https://linkedin.com/in/..."
                />
              </Field>
            </div>
          </section>

          {/* ── Empresa ────────────────────────────────── */}
          <section>
            <div className="text-xs font-semibold text-gray-500 uppercase mb-2 flex items-center gap-1.5">
              <i className="fa-solid fa-building text-amber-600"></i> Empresa
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="Nome da empresa">
                <input
                  type="text"
                  value={form.empresa_nome}
                  onChange={e => onChange('empresa_nome', e.target.value)}
                  className={inputClass(false)}
                />
              </Field>
              <Field label="Domínio" erro={errosForm.empresa_dominio}>
                <input
                  type="text"
                  value={form.empresa_dominio}
                  onChange={e => onChange('empresa_dominio', e.target.value)}
                  className={inputClass(!!errosForm.empresa_dominio)}
                  placeholder="empresa.com.br"
                />
              </Field>
            </div>
          </section>

          {/* ── Classificação ──────────────────────────── */}
          <section>
            <div className="text-xs font-semibold text-gray-500 uppercase mb-2 flex items-center gap-1.5">
              <i className="fa-solid fa-tag text-amber-600"></i> Classificação
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="Vertical" erro={errosForm.vertical}>
                {verticaisDisponiveis.length > 0 ? (
                  <select
                    value={form.vertical}
                    onChange={e => onChange('vertical', e.target.value)}
                    className={inputClass(!!errosForm.vertical)}
                  >
                    <option value="">—</option>
                    {verticaisDisponiveis.map(v => (
                      <option key={v} value={v}>{v}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={form.vertical}
                    onChange={e => onChange('vertical', e.target.value)}
                    className={inputClass(!!errosForm.vertical)}
                  />
                )}
              </Field>
              <Field label="Tier do pipeline">
                <select
                  value={form.tier_pipeline}
                  onChange={e => onChange('tier_pipeline', e.target.value)}
                  className={inputClass(false)}
                >
                  {TIERS.map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </Field>
            </div>
          </section>

          {/* ── Localização ────────────────────────────── */}
          <section>
            <div className="text-xs font-semibold text-gray-500 uppercase mb-2 flex items-center gap-1.5">
              <i className="fa-solid fa-location-dot text-amber-600"></i> Localização
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Field label="Cidade">
                <input
                  type="text"
                  value={form.cidade}
                  onChange={e => onChange('cidade', e.target.value)}
                  className={inputClass(false)}
                />
              </Field>
              <Field label="Estado (UF)">
                <input
                  type="text"
                  value={form.estado}
                  maxLength={2}
                  onChange={e => onChange('estado', e.target.value.toUpperCase())}
                  className={inputClass(false)}
                  placeholder="SP"
                />
              </Field>
            </div>
          </section>

          {/* ── Atribuição (apenas Admin) ──────────────── */}
          {isAdmin && (
            <section>
              <div className="text-xs font-semibold text-gray-500 uppercase mb-2 flex items-center gap-1.5">
                <i className="fa-solid fa-user-tag text-amber-600"></i>
                Atribuição <span className="text-rose-500 font-normal">(apenas Administrador)</span>
              </div>
              <Field label="Reservado para">
                <select
                  value={form.reservado_por ?? ''}
                  onChange={e => onChange('reservado_por', e.target.value ? Number(e.target.value) : null)}
                  className={inputClass(false)}
                >
                  <option value="">— Sem responsável —</option>
                  {responsaveis.map(r => (
                    <option key={r.id} value={r.id}>
                      {r.nome_usuario} ({r.tipo_usuario})
                    </option>
                  ))}
                </select>
              </Field>
            </section>
          )}

          {/* ── Erro de submit ──────────────────────────── */}
          {erro && (
            <div className="p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700 flex items-start gap-2">
              <i className="fa-solid fa-triangle-exclamation mt-0.5"></i>
              <span>{erro}</span>
            </div>
          )}
        </div>

        {/* ════════ FOOTER ════════ */}
        <div className="border-t border-gray-200 px-6 py-3 flex items-center justify-between bg-gray-50">
          <div className="text-xs text-gray-500">
            {totalAlterados > 0 ? (
              <>
                <i className="fa-solid fa-circle text-amber-500 text-[8px]"></i>{' '}
                {totalAlterados} campo{totalAlterados > 1 ? 's' : ''} alterado{totalAlterados > 1 ? 's' : ''}
              </>
            ) : (
              <span className="text-gray-400">Nenhuma alteração</span>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={onFechar}
              disabled={salvando}
              className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg font-medium disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              onClick={handleSalvar}
              disabled={!podeSalvar || salvando}
              className="px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700 disabled:bg-gray-300 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
            >
              {salvando ? (
                <>
                  <i className="fa-solid fa-spinner fa-spin"></i> Salvando…
                </>
              ) : (
                <>
                  <i className="fa-solid fa-floppy-disk"></i> Salvar alterações
                </>
              )}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};

// ════════════════════════════════════════════════════════════
// SUB-COMPONENTES
// ════════════════════════════════════════════════════════════

function inputClass(temErro: boolean): string {
  const base = 'w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500';
  return temErro
    ? `${base} border-red-400 bg-red-50/50`
    : `${base} border-gray-300 bg-white`;
}

interface FieldProps {
  label: string;
  erro?: string;
  children: React.ReactNode;
}
const Field: React.FC<FieldProps> = ({ label, erro, children }) => (
  <div>
    <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
    {children}
    {erro && (
      <div className="mt-1 text-xs text-red-600 flex items-center gap-1">
        <i className="fa-solid fa-circle-exclamation"></i> {erro}
      </div>
    )}
  </div>
);

export default EditarLeadImportadoModal;
