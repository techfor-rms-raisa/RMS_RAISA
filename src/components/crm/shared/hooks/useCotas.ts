/**
 * src/components/crm/shared/hooks/useCotas.ts
 *
 * Caminho: src/components/crm/shared/hooks/useCotas.ts
 * Versão:  1.0 (23/06/2026 — Aba "Cotas" — parametrização Messias)
 *
 * Hook orquestrador da aba "Cotas" no menu CRM & Campanhas.
 * Encapsula:
 *   • listar()  — GET  /api/crm-cotas?action=listar_cotas
 *   • salvar()  — POST /api/crm-cotas?action=atualizar_cota
 *
 * RBAC server-side: o backend faz lock duro de Administrador. Este hook
 * NÃO duplica a checagem (o backend é a fonte de verdade), mas espera
 * que o componente que chama já tenha filtrado a renderização pela aba
 * existir só para Admins (CRMLayout v1.6).
 *
 * Naming convention v1.6: prefixo `use-` no frontend, sem colisão de
 * bundle com `api/crm-cotas.ts` que tem prefixo `crm-`.
 */

import { useCallback, useEffect, useState } from 'react';

// ════════════════════════════════════════════════════════════════════
// TIPOS
// ════════════════════════════════════════════════════════════════════

export type TipoUsuarioComCota = 'Administrador' | 'Gestão Comercial' | 'SDR';

export interface CotaUsuario {
  id:                       number;
  nome_usuario:             string;
  tipo:                     TipoUsuarioComCota;
  ativo:                    boolean;
  cota_revalidacao_diaria:  number;
}

export interface ListarCotasResponse {
  success:      boolean;
  cotas:        CotaUsuario[];
  cota_min:     number;
  cota_max:     number;
  cota_default: number;
  error?:       string;
}

export interface AtualizarCotaResponse {
  success:        boolean;
  target_user_id?: number;
  nome_usuario?:  string;
  tipo?:          string;
  cota_diaria?:   number;
  error?:         string;
}

// ════════════════════════════════════════════════════════════════════
// HOOK
// ════════════════════════════════════════════════════════════════════

export function useCotas(adminUserId: number) {
  const [cotas, setCotas]               = useState<CotaUsuario[]>([]);
  const [cotaMin, setCotaMin]           = useState(0);
  const [cotaMax, setCotaMax]           = useState(500);
  const [cotaDefault, setCotaDefault]   = useState(50);
  const [loading, setLoading]           = useState(false);
  const [saving, setSaving]             = useState<Set<number>>(new Set());
  const [erro, setErro]                 = useState<string | null>(null);

  // ── listar() — carrega tabela completa ────────────────────────────
  const listar = useCallback(async (): Promise<void> => {
    if (!adminUserId) return;
    setLoading(true);
    setErro(null);
    try {
      const params = new URLSearchParams({
        action:  'listar_cotas',
        user_id: String(adminUserId),
      });
      const res  = await fetch(`/api/crm-cotas?${params.toString()}`);
      const data = (await res.json()) as ListarCotasResponse;

      if (!data?.success) {
        const msg = data?.error || `HTTP ${res.status}`;
        setErro(msg);
        setCotas([]);
        return;
      }
      setCotas(data.cotas || []);
      setCotaMin(data.cota_min ?? 0);
      setCotaMax(data.cota_max ?? 500);
      setCotaDefault(data.cota_default ?? 50);
    } catch (err: any) {
      const msg = err?.message || 'Erro desconhecido ao listar cotas';
      console.error('[useCotas] listar() falhou:', err);
      setErro(msg);
      setCotas([]);
    } finally {
      setLoading(false);
    }
  }, [adminUserId]);

  // ── salvar() — atualiza cota de UM usuário ────────────────────────
  /**
   * Atualiza no servidor + reflete no estado local (otimismo controlado:
   * só atualiza local se backend confirmar). Retorna { ok, mensagem }
   * para o componente exibir toast.
   */
  const salvar = useCallback(async (
    target_user_id: number,
    cota_diaria:    number,
  ): Promise<{ ok: boolean; mensagem?: string }> => {
    if (!adminUserId) {
      return { ok: false, mensagem: 'admin_user_id não disponível.' };
    }
    if (saving.has(target_user_id)) {
      return { ok: false, mensagem: 'Já em salvamento — aguarde.' };
    }

    setSaving(prev => new Set(prev).add(target_user_id));
    try {
      const res = await fetch('/api/crm-cotas?action=atualizar_cota', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          admin_user_id:  adminUserId,
          target_user_id,
          cota_diaria,
        }),
      });
      const data = (await res.json()) as AtualizarCotaResponse;

      if (!res.ok || !data?.success) {
        const msg = data?.error || `HTTP ${res.status}`;
        return { ok: false, mensagem: msg };
      }

      // Atualiza estado local refletindo o valor confirmado pelo backend
      setCotas(prev => prev.map(c =>
        c.id === target_user_id
          ? { ...c, cota_revalidacao_diaria: data.cota_diaria! }
          : c
      ));
      return { ok: true, mensagem: `Cota de ${data.nome_usuario} atualizada para ${data.cota_diaria}/dia` };
    } catch (err: any) {
      console.error(`[useCotas] salvar(${target_user_id}) falhou:`, err);
      return { ok: false, mensagem: err?.message || 'Erro de rede' };
    } finally {
      setSaving(prev => {
        const next = new Set(prev);
        next.delete(target_user_id);
        return next;
      });
    }
  }, [adminUserId, saving]);

  // ── Auto-load no mount + quando adminUserId muda ──────────────────
  useEffect(() => {
    listar();
  }, [listar]);

  // ── Retorno público ───────────────────────────────────────────────
  return {
    cotas,
    cotaMin,
    cotaMax,
    cotaDefault,
    loading,
    saving,
    erro,
    listar,
    salvar,
  };
}
