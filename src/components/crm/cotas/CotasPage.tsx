/**
 * src/components/crm/cotas/CotasPage.tsx
 *
 * Caminho: src/components/crm/cotas/CotasPage.tsx
 * Versão:  1.1 (23/06/2026 — FIX RBAC tipo→tipo_usuario + CurrentUserLite)
 *
 * 🆕 v1.1 (23/06/2026 — FIX 2 bugs descobertos no smoke):
 *   1. Campo RBAC errado: a interface inline `tipo: string` foi substituída
 *      pela interface canônica `CurrentUserLite` (de '../types/crm.types'),
 *      consistente com todos os demais componentes do módulo CRM
 *      (CampanhasPage, CopysPage, ConfiguracoesPage, AcompanhamentoPage,
 *      BaseLeadsPage). O campo correto do tipo de perfil em todo o
 *      codebase é `tipo_usuario` (não `tipo`). Confirmado por grep:
 *      zero ocorrências de `currentUser.tipo` no projeto inteiro;
 *      100% das ocorrências usam `currentUser.tipo_usuario`.
 *   2. Container correto: este componente é renderizado por
 *      ConfiguracoesPage v1.2 (Configurações CRM → aba "Cotas"), NÃO
 *      pelo CRMLayout (que foi revertido v1.6 → v1.7). Decisão Messias
 *      23/06/2026: o lugar certo para parametrizações administrativas
 *      é a view 'crm_config' do menu lateral, ao lado de "Tipos de
 *      Campanha" e "Domínios de Envio".
 *
 *   Mudanças cirúrgicas (2 pontos):
 *     - Interface `CotasPageProps`: agora `currentUser: CurrentUserLite`.
 *     - Guard de RBAC defensivo: `currentUser.tipo` → `currentUser.tipo_usuario`.
 *
 *   Demais comportamentos (useCotas, tabela editável, validação, toasts,
 *   agrupamento por tipo) permanecem idênticos à v1.0.
 *
 * v1.0 (23/06/2026 — Aba "Cotas" — parametrização Messias):
 *   Página da aba "Cotas". Lista usuários ativos com tipo Administrador,
 *   Gestão Comercial ou SDR e permite ao Admin editar a coluna
 *   `app_users.cota_revalidacao_diaria` por linha.
 *
 * Acesso (RBAC):
 *   - Renderização da aba: ConfiguracoesPage v1.2 só monta este
 *     componente se currentUser.tipo_usuario === 'Administrador'
 *     (TABS_FILTRADAS).
 *   - Defesa em profundidade: backend faz o mesmo lock server-side
 *     (api/crm-cotas.ts exigirAdmin), então mesmo que o frontend
 *     vaze para outro tipo de usuário, nenhuma mutação acontece.
 *
 * UX:
 *   - Tabela com 4 colunas: Nome / Tipo / Cota (input editável) / Ação.
 *   - Botão "Salvar" só fica habilitado quando o valor digitado
 *     diverge do salvo no banco.
 *   - Toast de sucesso/erro em cima.
 *   - Loading skeleton enquanto carrega.
 *   - Validação client-side de range (0–500) com mensagem clara.
 *
 * Estilo: consistente com paleta indigo do badge "Cota Revalidação hoje"
 * da aba "Leads Importados" (LeadsImportadosTab v1.4).
 */

import React, { useState, useMemo } from 'react';
import type { CurrentUserLite } from '../types/crm.types';
import { useCotas, type CotaUsuario } from '../shared/hooks/useCotas';

interface CotasPageProps {
  currentUser: CurrentUserLite;
}

interface ToastMsg {
  tipo:  'ok' | 'erro';
  texto: string;
}

const CotasPage: React.FC<CotasPageProps> = ({ currentUser }) => {
  const {
    cotas,
    cotaMin,
    cotaMax,
    cotaDefault,
    loading,
    saving,
    erro,
    salvar,
  } = useCotas(currentUser.id);

  // Estado por linha do que está sendo editado (não-salvo ainda)
  // Chave: user_id; valor: string (para permitir digitação vazia transitória)
  const [edits, setEdits] = useState<Record<number, string>>({});
  const [toast, setToast] = useState<ToastMsg | null>(null);

  // ── Helpers ───────────────────────────────────────────────────────

  const valorEditado = (c: CotaUsuario): string => {
    return edits[c.id] !== undefined
      ? edits[c.id]
      : String(c.cota_revalidacao_diaria);
  };

  const valorMudou = (c: CotaUsuario): boolean => {
    const e = edits[c.id];
    if (e === undefined) return false;
    const num = Number(e);
    if (isNaN(num)) return false;
    return num !== c.cota_revalidacao_diaria;
  };

  const valorValido = (c: CotaUsuario): boolean => {
    const e = edits[c.id];
    if (e === undefined) return true;
    const num = Number(e);
    if (isNaN(num) || !Number.isInteger(num)) return false;
    return num >= cotaMin && num <= cotaMax;
  };

  const showToast = (tipo: 'ok' | 'erro', texto: string) => {
    setToast({ tipo, texto });
    setTimeout(() => setToast(null), 4000);
  };

  // ── Handlers ──────────────────────────────────────────────────────

  const handleChange = (user_id: number, novoValor: string) => {
    // Aceita só dígitos (e string vazia transitória)
    if (novoValor === '' || /^\d+$/.test(novoValor)) {
      setEdits(prev => ({ ...prev, [user_id]: novoValor }));
    }
  };

  const handleSalvar = async (c: CotaUsuario) => {
    const num = Number(edits[c.id]);
    if (!valorValido(c)) {
      showToast('erro', `Valor deve ser inteiro entre ${cotaMin} e ${cotaMax}.`);
      return;
    }
    const r = await salvar(c.id, num);
    if (r.ok) {
      showToast('ok', r.mensagem || `Cota atualizada.`);
      // Limpa o edit local (estado do hook já foi atualizado)
      setEdits(prev => {
        const next = { ...prev };
        delete next[c.id];
        return next;
      });
    } else {
      showToast('erro', r.mensagem || 'Falha ao salvar.');
    }
  };

  const handleResetar = (c: CotaUsuario) => {
    setEdits(prev => ({ ...prev, [c.id]: String(cotaDefault) }));
  };

  const handleCancelar = (c: CotaUsuario) => {
    setEdits(prev => {
      const next = { ...prev };
      delete next[c.id];
      return next;
    });
  };

  // ── Agrupamento por tipo (estilo visual de seções) ────────────────
  const cotasPorTipo = useMemo(() => {
    const grupos: Record<string, CotaUsuario[]> = {
      'Administrador':    [],
      'Gestão Comercial': [],
      'SDR':              [],
    };
    cotas.forEach(c => {
      if (grupos[c.tipo]) grupos[c.tipo].push(c);
    });
    return grupos;
  }, [cotas]);

  // ── Guard de RBAC client-side (defesa em camadas) ────────────────
  // 🆕 v1.1 (23/06/2026) — Campo corrigido: `tipo_usuario` (padrão real
  //   do codebase), não `tipo` (que não existe na interface User).
  if (currentUser.tipo_usuario !== 'Administrador') {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
          <i className="fa-solid fa-lock mr-2"></i>
          Acesso restrito: apenas Administradores podem gerenciar cotas.
        </div>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────
  return (
    <div className="p-4 space-y-4">
      {/* Toast */}
      {toast && (
        <div
          className={`fixed top-20 right-4 z-50 px-4 py-2 rounded-lg shadow-lg text-sm font-medium ${
            toast.tipo === 'ok'
              ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
              : 'bg-red-100 text-red-800 border border-red-300'
          }`}
        >
          <i
            className={`fa-solid mr-2 ${
              toast.tipo === 'ok' ? 'fa-circle-check' : 'fa-circle-exclamation'
            }`}
          ></i>
          {toast.texto}
        </div>
      )}

      {/* Cabeçalho */}
      <div className="flex flex-col gap-2">
        <h2 className="text-xl font-semibold text-gray-800 flex items-center gap-2">
          <i className="fa-solid fa-gauge text-indigo-600"></i>
          Cotas Diárias de Revalidação
        </h2>
        <p className="text-sm text-gray-600">
          Limite diário de revalidações Gemini permitidas para cada Gestor Comercial,
          SDR ou Administrador na aba <strong>Leads Importados</strong>.
          Range permitido: <strong>{cotaMin} a {cotaMax}</strong> leads/dia.
          Default para novos usuários: <strong>{cotaDefault}</strong>.
        </p>
      </div>

      {/* Erro de carga */}
      {erro && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
          <i className="fa-solid fa-circle-exclamation mr-2"></i>
          Erro ao carregar cotas: {erro}
        </div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-6 text-center text-gray-500">
          <i className="fa-solid fa-spinner fa-spin mr-2"></i>
          Carregando cotas...
        </div>
      )}

      {/* Tabela por tipo */}
      {!loading && !erro && cotas.length > 0 && (
        <div className="space-y-6">
          {(['Administrador', 'Gestão Comercial', 'SDR'] as const).map(tipo => {
            const grupo = cotasPorTipo[tipo];
            if (grupo.length === 0) return null;
            return (
              <div key={tipo} className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                <div className="bg-gray-50 px-4 py-2 border-b border-gray-200 text-sm font-semibold text-gray-700">
                  {tipo} ({grupo.length})
                </div>
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200 text-xs uppercase text-gray-600">
                    <tr>
                      <th className="px-4 py-2 text-left">Nome</th>
                      <th className="px-4 py-2 text-center w-44">Cota Diária</th>
                      <th className="px-4 py-2 text-right w-72">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {grupo.map(c => {
                      const mudou      = valorMudou(c);
                      const valido     = valorValido(c);
                      const emSaving   = saving.has(c.id);
                      const ehEuMesmo  = c.id === currentUser.id;

                      return (
                        <tr key={c.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3">
                            <div className="font-medium text-gray-800">
                              {c.nome_usuario}
                              {ehEuMesmo && (
                                <span className="ml-2 text-xs text-indigo-600 font-normal">(você)</span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <input
                              type="text"
                              inputMode="numeric"
                              pattern="\d*"
                              value={valorEditado(c)}
                              onChange={e => handleChange(c.id, e.target.value)}
                              disabled={emSaving}
                              className={`w-24 px-2 py-1 text-center border rounded-lg text-sm ${
                                !valido
                                  ? 'border-red-400 bg-red-50 text-red-700'
                                  : mudou
                                    ? 'border-amber-400 bg-amber-50 text-amber-800'
                                    : 'border-gray-300 bg-white text-gray-700'
                              } ${emSaving ? 'opacity-50 cursor-not-allowed' : ''}`}
                              aria-label={`Cota diária de ${c.nome_usuario}`}
                            />
                            <span className="ml-2 text-xs text-gray-500">/ dia</span>
                            {!valido && (
                              <div className="text-xs text-red-600 mt-1">
                                Range {cotaMin}–{cotaMax}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right space-x-2">
                            <button
                              onClick={() => handleResetar(c)}
                              disabled={emSaving}
                              className="px-2.5 py-1.5 bg-white border border-gray-300 text-gray-700 rounded-lg text-xs font-medium hover:bg-gray-50 disabled:opacity-50"
                              title={`Resetar para o default (${cotaDefault})`}
                            >
                              <i className="fa-solid fa-rotate-left mr-1"></i>
                              Resetar
                            </button>
                            {mudou && (
                              <button
                                onClick={() => handleCancelar(c)}
                                disabled={emSaving}
                                className="px-2.5 py-1.5 bg-white border border-gray-300 text-gray-700 rounded-lg text-xs font-medium hover:bg-gray-50 disabled:opacity-50"
                                title="Cancelar edição"
                              >
                                <i className="fa-solid fa-xmark mr-1"></i>
                                Cancelar
                              </button>
                            )}
                            <button
                              onClick={() => handleSalvar(c)}
                              disabled={!mudou || !valido || emSaving}
                              className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-medium hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
                              title={
                                !mudou
                                  ? 'Sem alterações'
                                  : !valido
                                    ? `Valor fora do range (${cotaMin}–${cotaMax})`
                                    : 'Salvar nova cota'
                              }
                            >
                              {emSaving ? (
                                <>
                                  <i className="fa-solid fa-spinner fa-spin mr-1"></i>
                                  Salvando...
                                </>
                              ) : (
                                <>
                                  <i className="fa-solid fa-floppy-disk mr-1"></i>
                                  Salvar
                                </>
                              )}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            );
          })}
        </div>
      )}

      {!loading && !erro && cotas.length === 0 && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-6 text-center text-gray-500">
          <i className="fa-solid fa-users-slash mr-2"></i>
          Nenhum usuário Admin / Gestão Comercial / SDR ativo encontrado.
        </div>
      )}
    </div>
  );
};

export default CotasPage;
