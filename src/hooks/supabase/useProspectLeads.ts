/**
 * src/hooks/supabase/useProspectLeads.ts
 *
 * Hook para consultar, filtrar e atualizar prospect_leads
 *
 * Versão: 1.0
 * Data: 04/03/2026
 */

import { useState, useCallback } from 'react';
import { supabase } from '../../config/supabase';

// ─── TIPOS ────────────────────────────────────────────────
export interface ProspectLead {
    id:               number;
    buscado_por:      number;
    buscado_por_nome?: string;       // join com app_users
    motor:            'apollo' | 'snovio' | 'ambos';
    fonte_id_apollo?: string | null;
    fonte_id_snovio?: string | null;
    nome_completo:    string;
    primeiro_nome?:   string | null;
    ultimo_nome?:     string | null;
    cargo?:           string | null;
    email?:           string | null;
    email_status?:    string | null;
    linkedin_url?:    string | null;
    foto_url?:        string | null;
    empresa_nome?:    string | null;
    empresa_dominio?: string | null;
    empresa_setor?:   string | null;
    empresa_porte?:   number | null;
    empresa_linkedin?: string | null;
    empresa_website?: string | null;
    cidade?:          string | null;
    estado?:          string | null;
    pais?:            string | null;
    senioridade?:     string | null;
    departamentos?:   string[];
    filtros_busca?:   Record<string, unknown>;
    enriquecido?:     boolean;
    status:           'novo' | 'contatado' | 'em_negociacao' | 'convertido' | 'descartado';
    observacoes?:     string | null;
    criado_em:        string;
    atualizado_em:    string;
}

export interface FiltrosConsulta {
    user_id?:          number | 'todos';  // 'todos' → sem filtro de usuário
    empresa_dominio?:  string;            // match parcial (ilike)
    empresa_nome?:     string;            // match parcial (ilike)
    status?:           string;
    motor?:            string;
    com_email?:        boolean;
    data_inicio?:      string;            // ISO date
    data_fim?:         string;
    pagina?:           number;
    por_pagina?:       number;
}

// ─── HOOK ─────────────────────────────────────────────────
export function useProspectLeads() {
    const [leads, setLeads]       = useState<ProspectLead[]>([]);
    const [total, setTotal]       = useState(0);
    const [loading, setLoading]   = useState(false);
    const [saving, setSaving]     = useState(false);
    const [error, setError]       = useState<string | null>(null);

    // ── BUSCAR LEADS ────────────────────────────────────────
    const buscarLeads = useCallback(async (filtros: FiltrosConsulta = {}) => {
        setLoading(true);
        setError(null);

        try {
            const {
                user_id,
                empresa_dominio,
                empresa_nome,
                status,
                motor,
                com_email,
                data_inicio,
                data_fim,
                pagina    = 1,
                por_pagina = 50,
            } = filtros;

            const from = (pagina - 1) * por_pagina;
            const to   = from + por_pagina - 1;

            // Join com app_users para obter nome do usuário
            let query = supabase
                .from('prospect_leads')
                .select(`
                    *,
                    app_users!prospect_leads_buscado_por_fkey(nome_usuario)
                `, { count: 'exact' })
                .order('criado_em', { ascending: false })
                .range(from, to);

            // Filtros
            if (user_id && user_id !== 'todos') {
                query = query.eq('buscado_por', user_id);
            }
            if (empresa_dominio?.trim()) {
                query = query.ilike('empresa_dominio', `%${empresa_dominio.trim()}%`);
            }
            if (empresa_nome?.trim()) {
                query = query.ilike('empresa_nome', `%${empresa_nome.trim()}%`);
            }
            if (status) {
                query = query.eq('status', status);
            }
            if (motor) {
                query = query.eq('motor', motor);
            }
            if (com_email === true) {
                query = query.not('email', 'is', null);
            }
            if (data_inicio) {
                query = query.gte('criado_em', data_inicio);
            }
            if (data_fim) {
                query = query.lte('criado_em', data_fim + 'T23:59:59Z');
            }

            const { data, error: qError, count } = await query;

            if (qError) throw qError;

            // Normalizar: extrair nome_usuario do join
            const normalized: ProspectLead[] = (data || []).map((r: any) => ({
                ...r,
                buscado_por_nome: r.app_users?.nome_usuario || `Usuário #${r.buscado_por}`,
                app_users: undefined,
            }));

            setLeads(normalized);
            setTotal(count ?? 0);
            return { leads: normalized, total: count ?? 0 };

        } catch (err: any) {
            console.error('❌ [useProspectLeads] buscarLeads:', err);
            setError(err.message);
            return { leads: [], total: 0 };
        } finally {
            setLoading(false);
        }
    }, []);

    // ── SALVAR LEADS (via API backend) ──────────────────────
    const salvarLeads = useCallback(async (
        prospects: any[],
        userId: number,
        filtrosBusca: Record<string, unknown> = {}
    ): Promise<{ salvos: number; ids: number[] }> => {
        setSaving(true);
        setError(null);

        try {
            const response = await fetch('/api/prospect-save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    prospects,
                    user_id:      userId,
                    filtros_busca: filtrosBusca,
                }),
            });

            const result = await response.json();

            if (!result.success) {
                throw new Error(result.error || 'Erro ao salvar');
            }

            console.log(`✅ [useProspectLeads] ${result.salvos} leads salvos`);
            return { salvos: result.salvos, ids: result.ids };

        } catch (err: any) {
            console.error('❌ [useProspectLeads] salvarLeads:', err);
            setError(err.message);
            return { salvos: 0, ids: [] };
        } finally {
            setSaving(false);
        }
    }, []);

    // ── ATUALIZAR STATUS ────────────────────────────────────
    const atualizarStatus = useCallback(async (
        id: number,
        novoStatus: ProspectLead['status'],
        observacoes?: string
    ): Promise<boolean> => {
        try {
            const update: Partial<ProspectLead> = { status: novoStatus };
            if (observacoes !== undefined) update.observacoes = observacoes;

            const { error: uError } = await supabase
                .from('prospect_leads')
                .update(update)
                .eq('id', id);

            if (uError) throw uError;

            // Atualizar localmente
            setLeads(prev => prev.map(l =>
                l.id === id ? { ...l, ...update } : l
            ));
            return true;

        } catch (err: any) {
            console.error('❌ [useProspectLeads] atualizarStatus:', err);
            setError(err.message);
            return false;
        }
    }, []);

    // ── EXCLUIR LEAD ────────────────────────────────────────
    const excluirLead = useCallback(async (id: number): Promise<boolean> => {
        try {
            const { error: dError } = await supabase
                .from('prospect_leads')
                .delete()
                .eq('id', id);

            if (dError) throw dError;

            setLeads(prev => prev.filter(l => l.id !== id));
            setTotal(prev => prev - 1);
            return true;

        } catch (err: any) {
            console.error('❌ [useProspectLeads] excluirLead:', err);
            setError(err.message);
            return false;
        }
    }, []);

    return {
        leads,
        total,
        loading,
        saving,
        error,
        buscarLeads,
        salvarLeads,
        atualizarStatus,
        excluirLead,
    };
}
