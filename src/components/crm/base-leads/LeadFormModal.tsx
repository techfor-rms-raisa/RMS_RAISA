/**
 * LeadFormModal.tsx — Modal de criar/editar lead
 *
 * Caminho: src/components/crm/base-leads/LeadFormModal.tsx
 * Versão: 1.3 (UX LinkedIn affordance — 19/06/2026)
 *
 * v1.3 (19/06/2026 — UX LinkedIn): o campo "LinkedIn" agora exibe um ícone
 *   azul oficial do LinkedIn (#0A66C2) à direita do input, posicionado em
 *   absolute, que abre o perfil em nova aba (target=_blank, rel=noreferrer)
 *   quando clicado. O ícone só aparece quando há URL preenchida (decisão
 *   minimalista — não polui a UI quando vazio). Mudança PURAMENTE visual,
 *   sem alteração no schema, no contrato de dados, ou nos handlers. Demais
 *   campos do form (Cargo, Telefone, etc.) inalterados.
 *
 * v1.2.1 (11/06/2026 — HOTFIX JSX): adicionado `</div>` faltante para fechar
 *   o overlay externo `<div className="fixed inset-0...">` do modal principal
 *   (aberto na linha 182, antes não tinha fechamento). Sintoma do bug:
 *   "Unexpected end of file before a closing fragment tag" no build do Vite
 *   em Preview/Production. Causa: durante a v1.2 anterior, o wrapping em
 *   React Fragment `<>...</>` foi adicionado para acomodar o modal de
 *   confirmação ao lado do modal principal, mas a árvore JSX ficou
 *   desbalanceada (27 `<div>` abertos vs. 26 `</div>` fechados).
 *
 * v1.2 (11/06/2026 — Opt-out manual / Bloco 4 do plano OPT-OUT 100%):
 *   Adicionado botão vermelho "Opt-Out" no rodapé do modal de EDIÇÃO,
 *   com modal de confirmação dupla obrigatório.
 *   - Disparado por gestor/SDR quando o lead solicita descadastro por
 *     canal informal (resposta em texto, ligação, contato direto).
 *   - Visível apenas em modo='editar' E para tipos de usuário com
 *     permissão (Administrador, Gestão Comercial, SDR — decisão Messias
 *     11/06/2026; R&S e Consulta não acionam opt-out).
 *   - Se o lead já está em opt-out, o botão é substituído por um
 *     indicador cinza desabilitado "Em opt-out" (sem ação possível —
 *     LGPD irreversível, conforme P2.1).
 *   - O modal de confirmação dupla traz: aviso explícito de
 *     irreversibilidade, lista do que acontece em cascata, e campo
 *     opcional de motivo (texto livre — auditoria em
 *     email_lead_historico).
 *   - Ao confirmar, dispara a prop `onDesabilitar(motivo)` que o
 *     container (BaseLeadsPage) implementa chamando o hook useLeads.
 *   - Reaproveita a prop `loading` existente para desabilitar o botão
 *     "Confirmar Opt-Out" durante a requisição. Botão Salvar também
 *     fica desabilitado nesse intervalo (consistência).
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

import React, { useEffect, useState } from 'react';
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
  /**
   * 🆕 v1.2 — Callback chamado quando o usuário confirma o opt-out
   * manual no modal de confirmação dupla. Recebe o motivo digitado
   * (ou null se o campo ficou vazio). O componente pai (BaseLeadsPage)
   * implementa chamando `useLeads.desabilitar()`. Se omitido, o botão
   * "Opt-Out" não é renderizado — preserva compat com chamadas legacy.
   */
  onDesabilitar?: (motivo: string | null) => Promise<void>;
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
  onDesabilitar,
}) => {
  // 🆕 v1.2 — States do fluxo de opt-out manual (modal de confirmação dupla)
  const [modalConfirmOptOut, setModalConfirmOptOut] = useState(false);
  const [motivoOptOut, setMotivoOptOut] = useState('');
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

  // ────────────────────────────────────────────────────────
  // 🆕 v1.2 — Visibilidade e estado do botão "Opt-Out"
  // ────────────────────────────────────────────────────────
  //
  // Aparece apenas em modo='editar' (criar não tem lead persistido) e
  // se o componente pai forneceu o callback (onDesabilitar).
  //
  // Permissão (decisão Messias 11/06/2026):
  //   - Administrador, Gestão Comercial, SDR → podem acionar
  //   - R&S, Gestão de Pessoas, Consulta, Cliente → não veem o botão
  //
  // Se o lead já está em opt-out (form.opt_out === true), o botão é
  // substituído por um indicador cinza "Em opt-out" — LGPD irreversível
  // (decisão P2.1 do CHECKPOINT_2026-06-10_P1_VALIDADA.md).
  const tiposPermitidosOptOut = ['Administrador', 'Gestão Comercial', 'SDR'];
  const podeMostrarOptOut =
    modo === 'editar' &&
    typeof onDesabilitar === 'function' &&
    tiposPermitidosOptOut.includes(currentUser.tipo_usuario);
  const jaEmOptOut = form.opt_out === true;

  // Confirma e dispara o opt-out. Chamado a partir do modal de
  // confirmação dupla. Após o callback resolver, fecha o modal e
  // limpa o motivo. O fechamento do modal principal (LeadFormModal)
  // é responsabilidade do BaseLeadsPage (após recarregar a lista).
  const confirmarOptOut = async () => {
    if (!onDesabilitar) return;
    const motivoTrim = motivoOptOut.trim();
    await onDesabilitar(motivoTrim || null);
    setModalConfirmOptOut(false);
    setMotivoOptOut('');
  };

  return (
    <>
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
            <div className="relative">
              <input
                value={form.linkedin_url || ''}
                onChange={(e) => setField('linkedin_url', e.target.value)}
                placeholder="https://linkedin.com/in/..."
                className="w-full px-3 py-2 pr-10 border rounded-lg text-sm focus:ring-2 focus:ring-indigo-400 focus:outline-none"
              />
              {/* v1.3 (19/06/2026): ícone azul oficial à direita, abre em nova aba */}
              {form.linkedin_url && form.linkedin_url.trim() && (
                <a
                  href={form.linkedin_url}
                  target="_blank"
                  rel="noreferrer"
                  title="Abrir perfil no LinkedIn em nova aba"
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-[#0A66C2] hover:text-[#004182] inline-flex items-center"
                >
                  <i className="fa-brands fa-linkedin text-lg"></i>
                </a>
              )}
            </div>
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
        {/* 🆕 v1.2 — Footer dividido:                                  */}
        {/*   • Esquerda: botão "Opt-Out" (só em editar + permissão)    */}
        {/*   • Direita:  Cancelar + Salvar                             */}
        <div className="flex items-center px-6 py-4 border-t bg-gray-50">
          {/* ── Lado esquerdo: opt-out ──────────────────────── */}
          {podeMostrarOptOut && (
            jaEmOptOut ? (
              <div
                className="inline-flex items-center gap-1.5 px-3 py-2 bg-gray-100 text-gray-500 rounded-lg text-sm cursor-not-allowed select-none"
                title="Este lead já está na lista de opt-out (LGPD — irreversível)"
              >
                <i className="fa-solid fa-ban"></i>
                <span>Em opt-out</span>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setModalConfirmOptOut(true)}
                disabled={loading}
                className="inline-flex items-center gap-1.5 px-3 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50 transition-colors"
                title="Marcar este lead como opt-out e cancelar envios pendentes em todas as campanhas"
              >
                <i className="fa-solid fa-ban"></i>
                <span>Opt-Out</span>
              </button>
            )
          )}

          {/* ── Lado direito: cancelar + salvar ──────────────── */}
          <div className="flex justify-end gap-2 ml-auto">
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

      {/* ════════════════════════════════════════════════════════════ */}
      {/* 🆕 v1.2 — MODAL: CONFIRMAÇÃO DUPLA DE OPT-OUT                 */}
      {/* ════════════════════════════════════════════════════════════ */}
      {/* Aviso explícito de irreversibilidade (LGPD) + lista do que    */}
      {/* acontece em cascata + campo opcional de motivo. Padrão visual */}
      {/* alinhado ao modal "Alterar Funil" do LeadDetailDrawer.        */}
      {modalConfirmOptOut && (
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
            <div className="px-6 py-4 border-b bg-red-50">
              <h2 className="text-lg font-bold text-red-800 flex items-center gap-2">
                <i className="fa-solid fa-triangle-exclamation"></i>
                Confirmar Opt-Out
              </h2>
              <p className="text-sm text-red-700 mt-1">
                {form.nome} — {form.email}
              </p>
            </div>
            <div className="p-6 space-y-4">
              <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                <p className="text-sm text-red-800 font-semibold mb-2">
                  ⚠️ Esta ação é IRREVERSÍVEL (LGPD)
                </p>
                <p className="text-xs text-red-700 mb-2">
                  Ao confirmar, o sistema executará em cascata:
                </p>
                <ul className="text-xs text-red-700 ml-4 list-disc space-y-1">
                  <li>
                    Adicionar o e-mail à lista permanente de opt-out
                  </li>
                  <li>
                    <strong>Cancelar todos os envios pendentes</strong> em
                    campanhas ativas, pausadas e agendadas
                  </li>
                  <li>
                    Marcar o lead com badge vermelho "Opt-out" na listagem
                  </li>
                  <li>
                    Registrar o evento no histórico do lead para auditoria
                  </li>
                </ul>
                <p className="text-xs text-red-700 mt-2 italic">
                  Não há fluxo de reativação — conforme LGPD, opt-out é
                  permanente.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Motivo (opcional)
                </label>
                <input
                  value={motivoOptOut}
                  onChange={(e) => setMotivoOptOut(e.target.value)}
                  placeholder="Ex.: Lead solicitou descadastro via email do dia 10/06"
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-red-400 focus:outline-none"
                  maxLength={200}
                />
                <p className="text-xs text-gray-500 mt-1">
                  Se deixado em branco, será registrado como "opt_out_manual".
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2 px-6 py-4 border-t bg-gray-50">
              <button
                type="button"
                onClick={() => {
                  setModalConfirmOptOut(false);
                  setMotivoOptOut('');
                }}
                disabled={loading}
                className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmarOptOut}
                disabled={loading}
                className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50"
              >
                {loading ? 'Aplicando...' : 'Confirmar Opt-Out'}
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
    </>
  );
};

export default LeadFormModal;
