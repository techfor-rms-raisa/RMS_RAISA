/**
 * LeadFormModal.tsx — Modal de criar/editar lead
 *
 * Caminho: src/components/crm/base-leads/LeadFormModal.tsx
 * Versão: 1.1 (Lead RBAC fix — 05/06/2026)
 *
 * v1.1 (05/06/2026 — Lead RBAC fix): adicionados 3 campos no form
 *   para garantir que leads criados manualmente apareçam corretamente
 *   no seletor de vínculo das campanhas:
 *     - **Vertical** (obrigatório, select de tipos_campanha)
 *     - **Apto para campanhas** (checkbox, default true)
 *     - **Reservado para** (responsável):
 *         · Admin → seletor entre GC/SDR (obrigatório escolher)
 *         · GC/SDR → travado em si mesmo (texto fixo, não editável)
 *   Decisões registradas em sessão de 05/06/2026.
 *
 * v1.0 (Fase 1C — 29/05/2026): decomposto de EmpresasLeadsCRM.tsx
 *   (linhas 799-859).
 */

import React, { useEffect } from 'react';
import type {
  Empresa,
  Lead,
  CurrentUserLite,
  ResponsavelLite,
  TipoCampanha,
} from '../types/crm.types';

// ════════════════════════════════════════════════════════════
// PROPS
// ════════════════════════════════════════════════════════════

export interface LeadFormModalProps {
  modo: 'criar' | 'editar' | null;
  form: Partial<Lead>;
  loading: boolean;
  /** Lista de empresas para o select (vem do hook useEmpresas). */
  empresas: Empresa[];
  /** 🆕 v1.1 — Lista de verticais (vem do hook useTiposCampanha). */
  verticais: TipoCampanha[];
  /** 🆕 v1.1 — Usuário logado (id para reservado_por; tipo para RBAC). */
  currentUser: CurrentUserLite;
  /** 🆕 v1.1 — Lista de GC/SDR (só Admin precisa; vazio para outros perfis). */
  responsaveis: ResponsavelLite[];
  onChange: (next: Partial<Lead>) => void;
  onSalvar: () => void;
  onFechar: () => void;
}

// ════════════════════════════════════════════════════════════
// COMPONENTE
// ════════════════════════════════════════════════════════════

const LeadFormModal: React.FC<LeadFormModalProps> = ({
  modo,
  form,
  loading,
  empresas,
  verticais,
  currentUser,
  responsaveis,
  onChange,
  onSalvar,
  onFechar,
}) => {
  // ────────────────────────────────────────────────────────
  // 🆕 v1.1 — defaults na entrada do modal "criar"
  //   Garante que apto_campanha entre como true e reservado_por
  //   seja preenchido com o id de quem pode reservar:
  //     - Admin: só preenche se o Admin não tiver escolhido (deixa vazio
  //              p/ forçar escolha consciente do GC/SDR responsável).
  //     - GC/SDR: trava em si mesmo automaticamente.
  // ────────────────────────────────────────────────────────
  useEffect(() => {
    if (modo !== 'criar') return;
    const next: Partial<Lead> = { ...form };
    let mudou = false;
    if (next.apto_campanha === undefined) {
      next.apto_campanha = true;
      mudou = true;
    }
    if (currentUser.tipo_usuario !== 'Administrador' && next.reservado_por == null) {
      next.reservado_por = currentUser.id;
      mudou = true;
    }
    if (mudou) onChange(next);
    // Disparo só quando o modal abre em modo criar — change explícito é
    // tratado pelos handlers normais (setField).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modo]);

  if (!modo) return null;

  const setField = <K extends keyof Lead>(key: K, value: Lead[K]) => {
    onChange({ ...form, [key]: value });
  };

  // 🆕 v1.1 — Verticais "ativas" (filtra inativos se o backend retornar todos)
  const verticaisAtivas = verticais.filter((v) => (v as any).ativo !== false);

  // 🆕 v1.1 — Detecta se o Admin pode editar o seletor de responsável
  const isAdmin = currentUser.tipo_usuario === 'Administrador';

  // 🆕 v1.1 — Validação para habilitar o botão Salvar
  const verticalOk = !!(form.vertical && String(form.vertical).trim());
  const responsavelOk = !!form.reservado_por;
  const podeSalvar =
    !!form.nome && !!form.email && verticalOk && responsavelOk && !loading;

  // 🆕 v1.1 — Texto informativo do responsável travado (não-admin)
  const nomeResponsavelTravado = !isAdmin ? currentUser.nome_usuario : null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-bold text-gray-800">
            {modo === 'criar' ? 'Novo Lead' : 'Editar Lead'}
          </h2>
          <button
            onClick={onFechar}
            className="text-gray-400 hover:text-gray-600 text-xl"
            aria-label="Fechar"
          >
            &times;
          </button>
        </div>

        {/* Form */}
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nome *</label>
            <input
              value={form.nome || ''}
              onChange={(e) => setField('nome', e.target.value)}
              className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-indigo-400 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
            <input
              type="email"
              value={form.email || ''}
              onChange={(e) => setField('email', e.target.value)}
              className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-indigo-400 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Cargo</label>
              <input
                value={form.cargo || ''}
                onChange={(e) => setField('cargo', e.target.value)}
                className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-indigo-400 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Telefone</label>
              <input
                value={form.telefone || ''}
                onChange={(e) => setField('telefone', e.target.value)}
                className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-indigo-400 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Empresa</label>
            <select
              value={form.empresa_id ?? ''}
              onChange={(e) =>
                setField('empresa_id', e.target.value ? Number(e.target.value) : null)
              }
              className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-indigo-400 focus:outline-none"
            >
              <option value="">Sem empresa</option>
              {empresas.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nome}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">LinkedIn</label>
            <input
              value={form.linkedin_url || ''}
              onChange={(e) => setField('linkedin_url', e.target.value)}
              placeholder="https://linkedin.com/in/..."
              className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-indigo-400 focus:outline-none"
            />
          </div>

          {/* ══════════════════════════════════════════════════════════ */}
          {/* 🆕 v1.1 — BLOCO RBAC: Vertical + Apto + Responsável        */}
          {/* ══════════════════════════════════════════════════════════ */}
          <div className="bg-indigo-50/40 border border-indigo-100 rounded-lg p-3 space-y-3">
            {/* Vertical */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Vertical *
              </label>
              <select
                value={form.vertical || ''}
                onChange={(e) => setField('vertical', e.target.value || null)}
                className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-indigo-400 focus:outline-none bg-white"
              >
                <option value="">Selecione...</option>
                {verticaisAtivas.map((v) => (
                  <option key={v.id} value={v.nome}>
                    {v.nome}
                  </option>
                ))}
              </select>
              {!verticalOk && (
                <p className="text-xs text-gray-500 mt-1">
                  Sem vertical o lead não aparece como elegível para campanhas.
                </p>
              )}
            </div>

            {/* Apto para campanhas */}
            <div>
              <label className="inline-flex items-center gap-2 text-sm text-gray-700 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={form.apto_campanha !== false}
                  onChange={(e) => setField('apto_campanha', e.target.checked)}
                  className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-400"
                />
                <span className="font-medium">Apto para campanhas</span>
              </label>
              <p className="text-xs text-gray-500 mt-1 pl-6">
                Marque para que o lead possa ser vinculado a uma campanha.
              </p>
            </div>

            {/* Responsável (reservado_por) */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Reservado para *
              </label>
              {isAdmin ? (
                // Admin: seletor (obrigatório escolher entre GC/SDR)
                <select
                  value={form.reservado_por ?? ''}
                  onChange={(e) =>
                    setField(
                      'reservado_por',
                      e.target.value ? Number(e.target.value) : null
                    )
                  }
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-indigo-400 focus:outline-none bg-white"
                >
                  <option value="">Selecione...</option>
                  {responsaveis.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.nome_usuario} ({r.tipo_usuario})
                    </option>
                  ))}
                </select>
              ) : (
                // GC/SDR: texto fixo travado em si mesmo
                <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-700">
                  <i className="fa-solid fa-user-lock text-gray-400"></i>
                  <span>
                    <span className="font-medium">{nomeResponsavelTravado}</span>{' '}
                    <span className="text-xs text-gray-500">
                      ({currentUser.tipo_usuario})
                    </span>
                  </span>
                </div>
              )}
              {isAdmin && responsaveis.length === 0 && (
                <p className="text-xs text-amber-600 mt-1">
                  ⚠️ Nenhum usuário GC/SDR disponível para responsabilizar.
                </p>
              )}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notas</label>
            <textarea
              value={form.notas || ''}
              onChange={(e) => setField('notas', e.target.value)}
              rows={2}
              className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-indigo-400 focus:outline-none"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-6 py-4 border-t bg-gray-50">
          <button
            onClick={onFechar}
            className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
          >
            Cancelar
          </button>
          <button
            onClick={onSalvar}
            disabled={!podeSalvar}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
          >
            {loading ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default LeadFormModal;
