/**
 * CampaignBuilder.tsx — Construtor de Campanhas de Email
 * 
 * Caminho: src/components/campanhas/CampaignBuilder.tsx
 * 
 * Funcionalidades:
 * - Lista de campanhas com KPIs e filtros
 * - Wizard: Info → Steps (1-5) → Leads → Preview
 * - Editor de copy com variável {{name}} (primeiro nome)
 * - Preview com merge de variáveis + assinatura do remetente
 * - Gerenciador de assinaturas (modal)
 * - Tipos de campanha livres (Outsourcing, BPO, Service Center, Help-Desk, etc.)
 * 
 * v1.0 — 14/05/2026
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import {
  Plus, ArrowLeft, Save, Send, Eye, Edit3, Trash2,
  Search, Filter, ChevronDown, ChevronUp, X, Loader2,
  Mail, Clock, Users, FileText, Sparkles, Settings,
  CheckCircle, PauseCircle, PlayCircle, AlertCircle,
  ChevronRight, UserPlus, UserMinus, Signature, RotateCcw
} from 'lucide-react';

// ════════════════════════════════════════════════════════════════
// TIPOS
// ════════════════════════════════════════════════════════════════

interface Campanha {
  id: number;
  nome: string;
  tipo: string;
  status: string;
  dominio_envio: string;
  email_remetente: string;
  nome_remetente: string;
  horario_inicio: string;
  horario_fim: string;
  total_destinatarios: number;
  total_enviados: number;
  total_abertos: number;
  total_clicados: number;
  total_respondidos: number;
  total_bounces: number;
  taxa_abertura: number;
  taxa_cliques: number;
  criado_por: string;
  criado_em: string;
  atualizado_em: string;
}

interface Step {
  id?: number;
  campanha_id?: number;
  ordem: number;
  assunto: string;
  corpo_html: string;
  corpo_texto: string;
  delay_dias: number;
  condicao: string;
  ativo: boolean;
}

interface LeadCampanha {
  id: number;
  status: string;
  step_atual: number;
  adicionado_em: string;
  email_leads: {
    id: number;
    nome: string;
    email: string;
    cargo: string;
    empresa_id: number;
    funil: string;
    email_empresas: { nome: string } | null;
  };
}

interface LeadDisponivel {
  id: number;
  nome: string;
  email: string;
  cargo: string;
  funil: string;
  email_empresas: { nome: string } | null;
}

interface Assinatura {
  id?: number;
  user_email: string;
  nome_completo: string;
  cargo: string;
  email_assinatura: string;
  telefone_fixo: string;
  telefone_celular: string;
  websites: string[];
  politica_privacidade_url: string;
  optout_texto: string;
}

type WizardTab = 'info' | 'steps' | 'leads' | 'preview';

const API_BASE = '/api/campaign-builder';

// ════════════════════════════════════════════════════════════════
// COMPONENTE PRINCIPAL
// ════════════════════════════════════════════════════════════════

const CampaignBuilder: React.FC = () => {
  const { user } = useAuth();

  // ── Estado principal ────────────────────────────────────────
  const [view, setView] = useState<'list' | 'editor'>('list');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // ── Lista de campanhas ──────────────────────────────────────
  const [campanhas, setCampanhas] = useState<Campanha[]>([]);
  const [totalCampanhas, setTotalCampanhas] = useState(0);
  const [filtroStatus, setFiltroStatus] = useState('');
  const [buscaCampanha, setBuscaCampanha] = useState('');
  const [stats, setStats] = useState({ total: 0, ativas: 0, rascunhos: 0, concluidas: 0 });

  // ── Editor (wizard) ─────────────────────────────────────────
  const [wizardTab, setWizardTab] = useState<WizardTab>('info');
  const [campanhaAtual, setCampanhaAtual] = useState<Partial<Campanha>>({});
  const [steps, setSteps] = useState<Step[]>([]);
  const [stepEditando, setStepEditando] = useState<number | null>(null); // index do step sendo editado

  // ── Leads ───────────────────────────────────────────────────
  const [leadsVinculados, setLeadsVinculados] = useState<LeadCampanha[]>([]);
  const [leadsDisponiveis, setLeadsDisponiveis] = useState<LeadDisponivel[]>([]);
  const [leadsSelecionados, setLeadsSelecionados] = useState<number[]>([]);
  const [buscaLead, setBuscaLead] = useState('');
  const [loadingLeads, setLoadingLeads] = useState(false);

  // ── Preview ─────────────────────────────────────────────────
  const [previewHtml, setPreviewHtml] = useState('');
  const [previewAssunto, setPreviewAssunto] = useState('');
  const [previewStep, setPreviewStep] = useState(1);

  // ── Assinatura ──────────────────────────────────────────────
  const [showAssinaturaModal, setShowAssinaturaModal] = useState(false);
  const [assinatura, setAssinatura] = useState<Partial<Assinatura>>({});
  const [assinaturaCarregada, setAssinaturaCarregada] = useState(false);

  // ── Tipos de campanha ───────────────────────────────────────
  const [tiposDisponiveis, setTiposDisponiveis] = useState<string[]>([]);
  const [tipoCustom, setTipoCustom] = useState('');
  const [showTipoCustom, setShowTipoCustom] = useState(false);

  // ════════════════════════════════════════════════════════════
  // EFEITOS
  // ════════════════════════════════════════════════════════════

  useEffect(() => {
    carregarCampanhas();
    carregarStats();
    carregarTipos();
    carregarMinhaAssinatura();
  }, []);

  useEffect(() => {
    carregarCampanhas();
  }, [filtroStatus, buscaCampanha]);

  useEffect(() => {
    if (message) {
      const timer = setTimeout(() => setMessage(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [message]);

  // ════════════════════════════════════════════════════════════
  // API CALLS
  // ════════════════════════════════════════════════════════════

  const apiCall = useCallback(async (method: string, action: string, body?: any, queryParams?: Record<string, string>) => {
    const params = new URLSearchParams({ action, ...queryParams });
    const url = `${API_BASE}?${params.toString()}`;
    const options: RequestInit = {
      method,
      headers: { 'Content-Type': 'application/json' },
    };
    if (body && method !== 'GET' && method !== 'DELETE') {
      options.body = JSON.stringify({ action, ...body });
    }
    const resp = await fetch(url, options);
    return resp.json();
  }, []);

  const carregarCampanhas = useCallback(async () => {
    setLoading(true);
    const params: Record<string, string> = {};
    if (filtroStatus) params.status = filtroStatus;
    if (buscaCampanha) params.busca = buscaCampanha;
    const data = await apiCall('GET', 'listar_campanhas', undefined, params);
    if (data.success) {
      setCampanhas(data.campanhas || []);
      setTotalCampanhas(data.total || 0);
    }
    setLoading(false);
  }, [filtroStatus, buscaCampanha, apiCall]);

  const carregarStats = useCallback(async () => {
    const data = await apiCall('GET', 'stats');
    if (data.success) setStats(data.stats);
  }, [apiCall]);

  const carregarTipos = useCallback(async () => {
    const data = await apiCall('GET', 'listar_tipos');
    if (data.success) setTiposDisponiveis(data.tipos || []);
  }, [apiCall]);

  const carregarMinhaAssinatura = useCallback(async () => {
    if (!user?.email) return;
    const data = await apiCall('GET', 'minha_assinatura', undefined, { user_email: user.email });
    if (data.success && data.assinatura) {
      setAssinatura(data.assinatura);
      setAssinaturaCarregada(true);
    }
  }, [user, apiCall]);

  const carregarDetalheCampanha = useCallback(async (id: number) => {
    setLoading(true);
    const data = await apiCall('GET', 'detalhe_campanha', undefined, { id: String(id) });
    if (data.success) {
      setCampanhaAtual(data.campanha);
      setSteps(data.steps || []);
    }
    setLoading(false);
  }, [apiCall]);

  const carregarLeadsCampanha = useCallback(async (campanhaId: number) => {
    setLoadingLeads(true);
    const data = await apiCall('GET', 'listar_leads_campanha', undefined, { campanha_id: String(campanhaId) });
    if (data.success) setLeadsVinculados(data.leads || []);
    setLoadingLeads(false);
  }, [apiCall]);

  const carregarLeadsDisponiveis = useCallback(async (campanhaId: number, busca?: string) => {
    const params: Record<string, string> = { campanha_id: String(campanhaId), limit: '100' };
    if (busca) params.busca = busca;
    const data = await apiCall('GET', 'leads_disponiveis', undefined, params);
    if (data.success) setLeadsDisponiveis(data.leads || []);
  }, [apiCall]);

  const carregarPreview = useCallback(async (campanhaId: number, stepOrdem: number) => {
    const params: Record<string, string> = {
      campanha_id: String(campanhaId),
      step_ordem: String(stepOrdem),
    };
    if (user?.email) params.user_email = user.email;
    // Usar primeiro lead vinculado para preview
    if (leadsVinculados.length > 0) {
      params.lead_id = String(leadsVinculados[0].email_leads.id);
    }
    const data = await apiCall('GET', 'preview', undefined, params);
    if (data.success) {
      setPreviewHtml(data.preview.corpo);
      setPreviewAssunto(data.preview.assunto);
    }
  }, [user, leadsVinculados, apiCall]);

  // ════════════════════════════════════════════════════════════
  // AÇÕES
  // ════════════════════════════════════════════════════════════

  const novaCampanha = () => {
    setCampanhaAtual({
      nome: '',
      tipo: 'Outsourcing',
      status: 'rascunho',
      dominio_envio: '',
      email_remetente: user?.email || '',
      nome_remetente: user?.nome || '',
      horario_inicio: '08:00',
      horario_fim: '18:00',
    });
    setSteps([]);
    setLeadsVinculados([]);
    setLeadsSelecionados([]);
    setWizardTab('info');
    setView('editor');
  };

  const editarCampanha = async (c: Campanha) => {
    await carregarDetalheCampanha(c.id);
    await carregarLeadsCampanha(c.id);
    setWizardTab('info');
    setView('editor');
  };

  const salvarCampanha = async () => {
    setSaving(true);
    try {
      let campanhaId = campanhaAtual.id;

      // Criar ou atualizar campanha
      if (!campanhaId) {
        const data = await apiCall('POST', 'criar_campanha', {
          ...campanhaAtual,
          tipo: showTipoCustom ? tipoCustom : campanhaAtual.tipo,
          criado_por: user?.email || 'admin'
        });
        if (!data.success) throw new Error(data.error);
        campanhaId = data.campanha.id;
        setCampanhaAtual(data.campanha);
      } else {
        const data = await apiCall('PATCH', 'atualizar_campanha', {
          id: campanhaId,
          nome: campanhaAtual.nome,
          tipo: showTipoCustom ? tipoCustom : campanhaAtual.tipo,
          dominio_envio: campanhaAtual.dominio_envio,
          email_remetente: campanhaAtual.email_remetente,
          nome_remetente: campanhaAtual.nome_remetente,
          horario_inicio: campanhaAtual.horario_inicio,
          horario_fim: campanhaAtual.horario_fim,
        });
        if (!data.success) throw new Error(data.error);
        setCampanhaAtual(data.campanha);
      }

      // Salvar steps
      for (const step of steps) {
        if (step.id) {
          await apiCall('PATCH', 'atualizar_step', {
            id: step.id,
            assunto: step.assunto,
            corpo_html: step.corpo_html,
            corpo_texto: step.corpo_texto,
            delay_dias: step.delay_dias,
            condicao: step.condicao,
            ordem: step.ordem,
          });
        } else {
          const data = await apiCall('POST', 'criar_step', {
            campanha_id: campanhaId,
            ordem: step.ordem,
            assunto: step.assunto,
            corpo_html: step.corpo_html,
            corpo_texto: step.corpo_texto,
            delay_dias: step.delay_dias,
            condicao: step.condicao,
          });
          if (data.success) step.id = data.step.id;
        }
      }

      setMessage({ type: 'success', text: 'Campanha salva com sucesso!' });
      carregarStats();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Erro ao salvar' });
    }
    setSaving(false);
  };

  const excluirCampanha = async (id: number) => {
    if (!confirm('Excluir esta campanha? Esta ação não pode ser desfeita.')) return;
    const data = await apiCall('DELETE', 'excluir_campanha', undefined, { id: String(id) });
    if (data.success) {
      setMessage({ type: 'success', text: 'Campanha excluída' });
      carregarCampanhas();
      carregarStats();
    } else {
      setMessage({ type: 'error', text: data.error });
    }
  };

  const mudarStatus = async (id: number, novoStatus: string) => {
    const data = await apiCall('PATCH', 'mudar_status', { id, status: novoStatus });
    if (data.success) {
      setMessage({ type: 'success', text: `Status alterado para ${novoStatus}` });
      setCampanhaAtual(data.campanha);
      carregarCampanhas();
      carregarStats();
    } else {
      setMessage({ type: 'error', text: data.error });
    }
  };

  // ── Steps ───────────────────────────────────────────────────

  const adicionarStep = () => {
    if (steps.length >= 5) {
      setMessage({ type: 'error', text: 'Máximo de 5 steps por campanha' });
      return;
    }
    const novoStep: Step = {
      ordem: steps.length + 1,
      assunto: '',
      corpo_html: '',
      corpo_texto: '',
      delay_dias: steps.length === 0 ? 0 : 3,
      condicao: 'sempre',
      ativo: true,
    };
    setSteps([...steps, novoStep]);
    setStepEditando(steps.length);
  };

  const atualizarStep = (index: number, campo: keyof Step, valor: any) => {
    const novos = [...steps];
    (novos[index] as any)[campo] = valor;
    setSteps(novos);
  };

  const excluirStep = async (index: number) => {
    const step = steps[index];
    if (step.id) {
      const data = await apiCall('DELETE', 'excluir_step', undefined, { id: String(step.id) });
      if (!data.success) {
        setMessage({ type: 'error', text: data.error });
        return;
      }
    }
    const novos = steps.filter((_, i) => i !== index).map((s, i) => ({ ...s, ordem: i + 1 }));
    setSteps(novos);
    setStepEditando(null);
    setMessage({ type: 'success', text: 'Step removido' });
  };

  // ── Leads ───────────────────────────────────────────────────

  const vincularLeadsSelecionados = async () => {
    if (!campanhaAtual.id || leadsSelecionados.length === 0) return;
    setSaving(true);
    const data = await apiCall('POST', 'vincular_leads', {
      campanha_id: campanhaAtual.id,
      lead_ids: leadsSelecionados,
    });
    if (data.success) {
      setMessage({ type: 'success', text: `${data.vinculados} leads vinculados${data.optout_ignorados > 0 ? ` (${data.optout_ignorados} em opt-out ignorados)` : ''}` });
      setLeadsSelecionados([]);
      await carregarLeadsCampanha(campanhaAtual.id);
      await carregarLeadsDisponiveis(campanhaAtual.id, buscaLead);
    } else {
      setMessage({ type: 'error', text: data.error });
    }
    setSaving(false);
  };

  const desvincularLeads = async (leadIds: number[]) => {
    if (!campanhaAtual.id) return;
    const data = await apiCall('DELETE', 'desvincular_leads', undefined, {
      campanha_id: String(campanhaAtual.id),
      lead_ids: leadIds.join(',')
    });
    if (data.success) {
      setMessage({ type: 'success', text: `${data.desvinculados} leads removidos` });
      await carregarLeadsCampanha(campanhaAtual.id);
    }
  };

  // ── Assinatura ──────────────────────────────────────────────

  const salvarAssinatura = async () => {
    setSaving(true);
    const data = await apiCall('POST', 'salvar_assinatura', {
      ...assinatura,
      user_email: user?.email,
    });
    if (data.success) {
      setAssinatura(data.assinatura);
      setAssinaturaCarregada(true);
      setShowAssinaturaModal(false);
      setMessage({ type: 'success', text: 'Assinatura salva!' });
    } else {
      setMessage({ type: 'error', text: data.error });
    }
    setSaving(false);
  };

  // ════════════════════════════════════════════════════════════
  // HELPERS
  // ════════════════════════════════════════════════════════════

  const statusBadge = (status: string) => {
    const map: Record<string, { bg: string; text: string; icon: any }> = {
      rascunho: { bg: 'bg-gray-100 text-gray-700', text: 'Rascunho', icon: Edit3 },
      agendada: { bg: 'bg-blue-100 text-blue-700', text: 'Agendada', icon: Clock },
      ativa: { bg: 'bg-green-100 text-green-700', text: 'Ativa', icon: PlayCircle },
      pausada: { bg: 'bg-yellow-100 text-yellow-700', text: 'Pausada', icon: PauseCircle },
      concluida: { bg: 'bg-purple-100 text-purple-700', text: 'Concluída', icon: CheckCircle },
    };
    const s = map[status] || map.rascunho;
    const Icon = s.icon;
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${s.bg}`}>
        <Icon size={12} />
        {s.text}
      </span>
    );
  };

  const formatData = (iso: string) => {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  const labelCondicao: Record<string, string> = {
    sempre: 'Sempre enviar',
    se_nao_abriu: 'Se não abriu o anterior',
    se_nao_respondeu: 'Se não respondeu',
    se_abriu: 'Se abriu o anterior',
  };

  // ════════════════════════════════════════════════════════════
  // RENDER: LISTA DE CAMPANHAS
  // ════════════════════════════════════════════════════════════

  const renderLista = () => (
    <div className="p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Campaign Builder</h1>
          <p className="text-sm text-gray-500 mt-1">Crie e gerencie suas sequências de email</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowAssinaturaModal(true)}
            className="flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50"
          >
            <Settings size={16} />
            Minha Assinatura
          </button>
          <button
            onClick={novaCampanha}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
          >
            <Plus size={16} />
            Nova Campanha
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total', value: stats.total, color: 'text-gray-700', bg: 'bg-gray-50' },
          { label: 'Ativas', value: stats.ativas, color: 'text-green-700', bg: 'bg-green-50' },
          { label: 'Rascunhos', value: stats.rascunhos, color: 'text-yellow-700', bg: 'bg-yellow-50' },
          { label: 'Concluídas', value: stats.concluidas, color: 'text-purple-700', bg: 'bg-purple-50' },
        ].map((kpi) => (
          <div key={kpi.label} className={`${kpi.bg} rounded-lg p-4`}>
            <p className="text-xs text-gray-500 uppercase">{kpi.label}</p>
            <p className={`text-2xl font-bold ${kpi.color}`}>{kpi.value}</p>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div className="flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar campanha..."
            value={buscaCampanha}
            onChange={(e) => setBuscaCampanha(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm"
          />
        </div>
        <select
          value={filtroStatus}
          onChange={(e) => setFiltroStatus(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
        >
          <option value="">Todos os status</option>
          <option value="rascunho">Rascunho</option>
          <option value="agendada">Agendada</option>
          <option value="ativa">Ativa</option>
          <option value="pausada">Pausada</option>
          <option value="concluida">Concluída</option>
        </select>
      </div>

      {/* Tabela de campanhas */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="animate-spin text-blue-500" size={32} />
        </div>
      ) : campanhas.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <Mail size={48} className="mx-auto mb-3 opacity-50" />
          <p className="text-lg font-medium">Nenhuma campanha encontrada</p>
          <p className="text-sm mt-1">Clique em "Nova Campanha" para começar</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Campanha</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Tipo</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-600">Status</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-600">Leads</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-600">Enviados</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-600">Abertos</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Criado em</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-600">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {campanhas.map((c) => (
                  <tr key={c.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => editarCampanha(c)}>
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">{c.nome}</p>
                      <p className="text-xs text-gray-400">{c.nome_remetente || '—'}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-block px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs">{c.tipo}</span>
                    </td>
                    <td className="px-4 py-3 text-center">{statusBadge(c.status)}</td>
                    <td className="px-4 py-3 text-center font-medium">{c.total_destinatarios || 0}</td>
                    <td className="px-4 py-3 text-center">{c.total_enviados || 0}</td>
                    <td className="px-4 py-3 text-center">
                      {c.total_abertos || 0}
                      {c.taxa_abertura > 0 && (
                        <span className="text-xs text-gray-400 ml-1">({c.taxa_abertura}%)</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-500">{formatData(c.criado_em)}</td>
                    <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                      {c.status === 'rascunho' && (
                        <button onClick={() => excluirCampanha(c.id)} className="text-red-400 hover:text-red-600 p-1" title="Excluir">
                          <Trash2 size={16} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );

  // ════════════════════════════════════════════════════════════
  // RENDER: EDITOR (WIZARD)
  // ════════════════════════════════════════════════════════════

  const renderEditor = () => {
    const tabs: { key: WizardTab; label: string; icon: any }[] = [
      { key: 'info', label: 'Campanha', icon: FileText },
      { key: 'steps', label: `Steps (${steps.length})`, icon: Mail },
      { key: 'leads', label: `Leads (${leadsVinculados.length})`, icon: Users },
      { key: 'preview', label: 'Preview', icon: Eye },
    ];

    return (
      <div className="p-4 md:p-6 space-y-4">
        {/* Header do editor */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => { setView('list'); carregarCampanhas(); }} className="text-gray-400 hover:text-gray-600">
              <ArrowLeft size={20} />
            </button>
            <div>
              <h2 className="text-xl font-bold text-gray-900">
                {campanhaAtual.id ? 'Editar Campanha' : 'Nova Campanha'}
              </h2>
              {campanhaAtual.id && (
                <p className="text-xs text-gray-400">ID: {campanhaAtual.id} • {statusBadge(campanhaAtual.status || 'rascunho')}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Botões de status */}
            {campanhaAtual.id && campanhaAtual.status === 'rascunho' && steps.length > 0 && leadsVinculados.length > 0 && (
              <button
                onClick={() => mudarStatus(campanhaAtual.id!, 'agendada')}
                className="flex items-center gap-1 px-3 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
              >
                <Clock size={14} /> Agendar
              </button>
            )}
            {campanhaAtual.id && campanhaAtual.status === 'agendada' && (
              <button
                onClick={() => mudarStatus(campanhaAtual.id!, 'ativa')}
                className="flex items-center gap-1 px-3 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700"
              >
                <PlayCircle size={14} /> Ativar
              </button>
            )}
            {campanhaAtual.id && campanhaAtual.status === 'ativa' && (
              <button
                onClick={() => mudarStatus(campanhaAtual.id!, 'pausada')}
                className="flex items-center gap-1 px-3 py-2 bg-yellow-600 text-white rounded-lg text-sm hover:bg-yellow-700"
              >
                <PauseCircle size={14} /> Pausar
              </button>
            )}
            {campanhaAtual.id && campanhaAtual.status === 'pausada' && (
              <button
                onClick={() => mudarStatus(campanhaAtual.id!, 'ativa')}
                className="flex items-center gap-1 px-3 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700"
              >
                <PlayCircle size={14} /> Reativar
              </button>
            )}
            <button
              onClick={salvarCampanha}
              disabled={saving || !campanhaAtual.nome}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              Salvar
            </button>
          </div>
        </div>

        {/* Tabs do wizard */}
        <div className="flex border-b border-gray-200">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = wizardTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => {
                  setWizardTab(tab.key);
                  if (tab.key === 'leads' && campanhaAtual.id) {
                    carregarLeadsCampanha(campanhaAtual.id);
                    carregarLeadsDisponiveis(campanhaAtual.id);
                  }
                  if (tab.key === 'preview' && campanhaAtual.id) {
                    carregarPreview(campanhaAtual.id, previewStep);
                  }
                }}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                  isActive
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                <Icon size={16} />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Conteúdo do wizard */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          {wizardTab === 'info' && renderTabInfo()}
          {wizardTab === 'steps' && renderTabSteps()}
          {wizardTab === 'leads' && renderTabLeads()}
          {wizardTab === 'preview' && renderTabPreview()}
        </div>
      </div>
    );
  };

  // ════════════════════════════════════════════════════════════
  // TAB: INFO DA CAMPANHA
  // ════════════════════════════════════════════════════════════

  const renderTabInfo = () => (
    <div className="space-y-5 max-w-2xl">
      {/* Nome */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Nome da campanha *</label>
        <input
          type="text"
          value={campanhaAtual.nome || ''}
          onChange={(e) => setCampanhaAtual({ ...campanhaAtual, nome: e.target.value })}
          placeholder="Ex: Outsourcing TI — Abertura Q2 2026"
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
      </div>

      {/* Tipo */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de campanha</label>
        {!showTipoCustom ? (
          <div className="flex gap-2">
            <select
              value={campanhaAtual.tipo || 'Outsourcing'}
              onChange={(e) => {
                if (e.target.value === '__custom__') {
                  setShowTipoCustom(true);
                } else {
                  setCampanhaAtual({ ...campanhaAtual, tipo: e.target.value });
                }
              }}
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
            >
              {tiposDisponiveis.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
              <option value="__custom__">+ Outro tipo...</option>
            </select>
          </div>
        ) : (
          <div className="flex gap-2">
            <input
              type="text"
              value={tipoCustom}
              onChange={(e) => setTipoCustom(e.target.value)}
              placeholder="Digite o novo tipo..."
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
              autoFocus
            />
            <button
              onClick={() => { setShowTipoCustom(false); setTipoCustom(''); }}
              className="px-3 py-2 text-sm text-gray-500 hover:text-gray-700"
            >
              Cancelar
            </button>
          </div>
        )}
      </div>

      {/* Domínio de envio */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Domínio de envio</label>
        <select
          value={campanhaAtual.dominio_envio || ''}
          onChange={(e) => setCampanhaAtual({ ...campanhaAtual, dominio_envio: e.target.value })}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
        >
          <option value="">Selecionar domínio...</option>
          <option value="grupotechfor.com.br">grupotechfor.com.br</option>
          <option value="grupotechforti.com.br">grupotechforti.com.br</option>
          <option value="techcobbpo.com.br">techcobbpo.com.br</option>
        </select>
        <p className="text-xs text-gray-400 mt-1">
          Domínio secundário usado no FROM. A assinatura sempre usa o domínio institucional.
        </p>
      </div>

      {/* Remetente */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Nome do remetente</label>
          <input
            type="text"
            value={campanhaAtual.nome_remetente || ''}
            onChange={(e) => setCampanhaAtual({ ...campanhaAtual, nome_remetente: e.target.value })}
            placeholder="Ex: Tatiana Silva"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Email do remetente (FROM)</label>
          <input
            type="email"
            value={campanhaAtual.email_remetente || ''}
            onChange={(e) => setCampanhaAtual({ ...campanhaAtual, email_remetente: e.target.value })}
            placeholder="Ex: tsilva@grupotechfor.com.br"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
          />
          <p className="text-xs text-gray-400 mt-1">
            Email no domínio secundário (diferente da assinatura)
          </p>
        </div>
      </div>

      {/* Horários */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Horário início envio</label>
          <input
            type="time"
            value={campanhaAtual.horario_inicio || '08:00'}
            onChange={(e) => setCampanhaAtual({ ...campanhaAtual, horario_inicio: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Horário fim envio</label>
          <input
            type="time"
            value={campanhaAtual.horario_fim || '18:00'}
            onChange={(e) => setCampanhaAtual({ ...campanhaAtual, horario_fim: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
          />
        </div>
      </div>

      {/* Aviso de assinatura */}
      {!assinaturaCarregada && (
        <div className="flex items-start gap-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
          <AlertCircle size={18} className="text-yellow-600 mt-0.5 flex-shrink-0" />
          <div className="text-sm">
            <p className="font-medium text-yellow-800">Configure sua assinatura</p>
            <p className="text-yellow-600 mt-0.5">
              Sua assinatura será adicionada automaticamente ao final de cada email.{' '}
              <button onClick={() => setShowAssinaturaModal(true)} className="underline font-medium">
                Configurar agora
              </button>
            </p>
          </div>
        </div>
      )}

      {/* Navegação */}
      <div className="flex justify-end pt-4 border-t">
        <button
          onClick={() => setWizardTab('steps')}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
        >
          Próximo: Steps <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );

  // ════════════════════════════════════════════════════════════
  // TAB: STEPS DA SEQUÊNCIA
  // ════════════════════════════════════════════════════════════

  const renderTabSteps = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Steps da sequência</h3>
          <p className="text-sm text-gray-500">Configure de 1 a 5 emails na sequência. Use {'{{name}}'} para inserir o primeiro nome do lead.</p>
        </div>
        <button
          onClick={adicionarStep}
          disabled={steps.length >= 5}
          className="flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50"
        >
          <Plus size={14} /> Adicionar Step
        </button>
      </div>

      {steps.length === 0 ? (
        <div className="text-center py-12 text-gray-400 border-2 border-dashed border-gray-200 rounded-lg">
          <Mail size={40} className="mx-auto mb-3 opacity-40" />
          <p>Nenhum step adicionado</p>
          <button onClick={adicionarStep} className="mt-3 text-blue-600 text-sm hover:underline">
            + Adicionar primeiro step
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {steps.map((step, index) => (
            <div key={index} className={`border rounded-lg transition-all ${
              stepEditando === index ? 'border-blue-300 shadow-sm' : 'border-gray-200'
            }`}>
              {/* Header do step (sempre visível) */}
              <div
                className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-gray-50"
                onClick={() => setStepEditando(stepEditando === index ? null : index)}
              >
                <div className="flex items-center gap-3">
                  <span className="w-7 h-7 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center">
                    {step.ordem}
                  </span>
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {step.assunto || '(sem assunto)'}
                    </p>
                    <p className="text-xs text-gray-400">
                      {index === 0 ? 'Envio imediato' : `${step.delay_dias} dias após step ${step.ordem - 1}`}
                      {' • '}{labelCondicao[step.condicao] || step.condicao}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={(e) => { e.stopPropagation(); excluirStep(index); }}
                    className="text-red-400 hover:text-red-600 p-1"
                    title="Excluir step"
                  >
                    <Trash2 size={14} />
                  </button>
                  {stepEditando === index ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
                </div>
              </div>

              {/* Editor do step (expandido) */}
              {stepEditando === index && (
                <div className="px-4 pb-4 space-y-4 border-t border-gray-100 pt-4">
                  {/* Assunto */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Assunto do email *</label>
                    <input
                      type="text"
                      value={step.assunto}
                      onChange={(e) => atualizarStep(index, 'assunto', e.target.value)}
                      placeholder="Ex: Sua equipe de TI está no limite — e o problema pode não ser a equipe"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    />
                  </div>

                  {/* Corpo HTML */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Corpo do email (HTML) *
                      <span className="ml-2 text-xs font-normal text-gray-400">
                        Use {'{{name}}'} para o primeiro nome do lead
                      </span>
                    </label>
                    <textarea
                      value={step.corpo_html}
                      onChange={(e) => atualizarStep(index, 'corpo_html', e.target.value)}
                      rows={12}
                      placeholder={`Olá {{name}},\n\nDeixa eu te fazer uma pergunta direta.\n\nHoje, sua equipe de TI está apagando incêndios ou realmente conseguindo focar no que é estratégico?\n\n...`}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono"
                    />
                    <p className="text-xs text-gray-400 mt-1">
                      A assinatura do remetente será adicionada automaticamente ao final.
                    </p>
                  </div>

                  {/* Delay e Condição */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Delay (dias após step anterior)
                      </label>
                      <input
                        type="number"
                        min="0"
                        max="30"
                        value={step.delay_dias}
                        onChange={(e) => atualizarStep(index, 'delay_dias', parseInt(e.target.value) || 0)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                        disabled={index === 0}
                      />
                      {index === 0 && <p className="text-xs text-gray-400 mt-1">Primeiro step: envio imediato</p>}
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Condição de envio</label>
                      <select
                        value={step.condicao}
                        onChange={(e) => atualizarStep(index, 'condicao', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                      >
                        <option value="sempre">Sempre enviar</option>
                        <option value="se_nao_abriu">Se não abriu o anterior</option>
                        <option value="se_nao_respondeu">Se não respondeu</option>
                        <option value="se_abriu">Se abriu o anterior</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Navegação */}
      <div className="flex justify-between pt-4 border-t">
        <button
          onClick={() => setWizardTab('info')}
          className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50"
        >
          <ArrowLeft size={16} /> Voltar
        </button>
        <button
          onClick={() => {
            if (!campanhaAtual.id) {
              setMessage({ type: 'error', text: 'Salve a campanha primeiro antes de vincular leads' });
              return;
            }
            setWizardTab('leads');
            carregarLeadsCampanha(campanhaAtual.id);
            carregarLeadsDisponiveis(campanhaAtual.id);
          }}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
        >
          Próximo: Leads <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );

  // ════════════════════════════════════════════════════════════
  // TAB: LEADS (VINCULAÇÃO)
  // ════════════════════════════════════════════════════════════

  const renderTabLeads = () => (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Coluna esquerda: leads disponíveis */}
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <UserPlus size={16} className="text-green-600" />
            Leads disponíveis
          </h3>

          <div className="flex gap-2 mb-3">
            <div className="relative flex-1">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Buscar lead..."
                value={buscaLead}
                onChange={(e) => {
                  setBuscaLead(e.target.value);
                  if (campanhaAtual.id) carregarLeadsDisponiveis(campanhaAtual.id, e.target.value);
                }}
                className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
            </div>
          </div>

          <div className="border border-gray-200 rounded-lg max-h-80 overflow-y-auto">
            {leadsDisponiveis.length === 0 ? (
              <p className="text-center text-gray-400 py-8 text-sm">Nenhum lead disponível</p>
            ) : (
              <div className="divide-y divide-gray-100">
                {leadsDisponiveis.map((lead) => (
                  <label key={lead.id} className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={leadsSelecionados.includes(lead.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setLeadsSelecionados([...leadsSelecionados, lead.id]);
                        } else {
                          setLeadsSelecionados(leadsSelecionados.filter((id) => id !== lead.id));
                        }
                      }}
                      className="rounded text-blue-600"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{lead.nome}</p>
                      <p className="text-xs text-gray-400 truncate">
                        {lead.email} • {lead.email_empresas?.nome || '—'}
                      </p>
                    </div>
                    <span className={`text-xs px-1.5 py-0.5 rounded ${
                      lead.funil === 'lead' ? 'bg-gray-100 text-gray-600' :
                      lead.funil === 'prospect' ? 'bg-blue-100 text-blue-600' :
                      'bg-green-100 text-green-600'
                    }`}>
                      {lead.funil}
                    </span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {leadsSelecionados.length > 0 && (
            <button
              onClick={vincularLeadsSelecionados}
              disabled={saving}
              className="mt-3 w-full flex items-center justify-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 disabled:opacity-50"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />}
              Vincular {leadsSelecionados.length} lead{leadsSelecionados.length > 1 ? 's' : ''}
            </button>
          )}
        </div>

        {/* Coluna direita: leads vinculados */}
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <Users size={16} className="text-blue-600" />
            Leads na campanha ({leadsVinculados.length})
          </h3>

          <div className="border border-gray-200 rounded-lg max-h-96 overflow-y-auto">
            {loadingLeads ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="animate-spin text-blue-500" size={24} />
              </div>
            ) : leadsVinculados.length === 0 ? (
              <p className="text-center text-gray-400 py-8 text-sm">Nenhum lead vinculado</p>
            ) : (
              <div className="divide-y divide-gray-100">
                {leadsVinculados.map((lc) => (
                  <div key={lc.id} className="flex items-center justify-between px-3 py-2 hover:bg-gray-50">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-900 truncate">{lc.email_leads.nome}</p>
                      <p className="text-xs text-gray-400 truncate">
                        {lc.email_leads.email} • {lc.email_leads.email_empresas?.nome || '—'}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 ml-2">
                      <span className="text-xs text-gray-400">Step {lc.step_atual}</span>
                      <button
                        onClick={() => desvincularLeads([lc.email_leads.id])}
                        className="text-red-400 hover:text-red-600 p-1"
                        title="Remover"
                      >
                        <UserMinus size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Navegação */}
      <div className="flex justify-between pt-4 border-t">
        <button
          onClick={() => setWizardTab('steps')}
          className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50"
        >
          <ArrowLeft size={16} /> Voltar
        </button>
        <button
          onClick={() => {
            setWizardTab('preview');
            if (campanhaAtual.id && steps.length > 0) {
              carregarPreview(campanhaAtual.id, 1);
              setPreviewStep(1);
            }
          }}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
        >
          Próximo: Preview <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );

  // ════════════════════════════════════════════════════════════
  // TAB: PREVIEW
  // ════════════════════════════════════════════════════════════

  const renderTabPreview = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900">Preview do email</h3>
        {steps.length > 1 && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500">Step:</span>
            {steps.map((s) => (
              <button
                key={s.ordem}
                onClick={() => {
                  setPreviewStep(s.ordem);
                  if (campanhaAtual.id) carregarPreview(campanhaAtual.id, s.ordem);
                }}
                className={`w-8 h-8 rounded-full text-xs font-bold ${
                  previewStep === s.ordem
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {s.ordem}
              </button>
            ))}
          </div>
        )}
      </div>

      {steps.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <p>Adicione ao menos um step para ver o preview</p>
        </div>
      ) : (
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          {/* Cabeçalho do email */}
          <div className="bg-gray-50 px-4 py-3 border-b space-y-1">
            <div className="flex items-center gap-2 text-sm">
              <span className="text-gray-500 w-16">De:</span>
              <span className="font-medium">{campanhaAtual.nome_remetente || '—'} &lt;{campanhaAtual.email_remetente || '—'}&gt;</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <span className="text-gray-500 w-16">Para:</span>
              <span>{leadsVinculados.length > 0 ? leadsVinculados[0].email_leads.email : 'lead@empresa.com'}</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <span className="text-gray-500 w-16">Assunto:</span>
              <span className="font-medium">{previewAssunto || steps[previewStep - 1]?.assunto || '—'}</span>
            </div>
          </div>

          {/* Corpo do email */}
          <div className="p-6 bg-white">
            {previewHtml ? (
              <div
                className="prose prose-sm max-w-none"
                dangerouslySetInnerHTML={{ __html: previewHtml.replace(/\n/g, '<br/>') }}
              />
            ) : (
              <div className="whitespace-pre-wrap text-sm text-gray-700">
                {steps[previewStep - 1]?.corpo_html
                  ?.replace(/\{\{name\}\}/gi, leadsVinculados[0]?.email_leads?.nome?.split(' ')[0] || '{{name}}')
                  || 'Sem conteúdo'}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Info resumo */}
      {campanhaAtual.id && (
        <div className="bg-gray-50 rounded-lg p-4 space-y-2 text-sm">
          <p><span className="text-gray-500">Campanha:</span> <span className="font-medium">{campanhaAtual.nome}</span></p>
          <p><span className="text-gray-500">Tipo:</span> {campanhaAtual.tipo}</p>
          <p><span className="text-gray-500">Steps:</span> {steps.length}</p>
          <p><span className="text-gray-500">Leads:</span> {leadsVinculados.length}</p>
          <p><span className="text-gray-500">Domínio de envio:</span> {campanhaAtual.dominio_envio || 'Não definido'}</p>
          <p><span className="text-gray-500">Janela de envio:</span> {campanhaAtual.horario_inicio} — {campanhaAtual.horario_fim}</p>
        </div>
      )}

      {/* Navegação */}
      <div className="flex justify-between pt-4 border-t">
        <button
          onClick={() => setWizardTab('leads')}
          className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50"
        >
          <ArrowLeft size={16} /> Voltar
        </button>
        <button
          onClick={salvarCampanha}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          Salvar campanha
        </button>
      </div>
    </div>
  );

  // ════════════════════════════════════════════════════════════
  // MODAL: ASSINATURA
  // ════════════════════════════════════════════════════════════

  const renderAssinaturaModal = () => {
    if (!showAssinaturaModal) return null;

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
        <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b">
            <h3 className="text-lg font-bold text-gray-900">Minha Assinatura</h3>
            <button onClick={() => setShowAssinaturaModal(false)} className="text-gray-400 hover:text-gray-600">
              <X size={20} />
            </button>
          </div>

          {/* Form */}
          <div className="px-6 py-4 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nome completo *</label>
              <input
                type="text"
                value={assinatura.nome_completo || ''}
                onChange={(e) => setAssinatura({ ...assinatura, nome_completo: e.target.value })}
                placeholder="Ex: Tatiana Santos da Silva Cruz"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Cargo</label>
              <input
                type="text"
                value={assinatura.cargo || ''}
                onChange={(e) => setAssinatura({ ...assinatura, cargo: e.target.value })}
                placeholder="Ex: Gerente de Negócios"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email na assinatura *</label>
              <input
                type="email"
                value={assinatura.email_assinatura || ''}
                onChange={(e) => setAssinatura({ ...assinatura, email_assinatura: e.target.value })}
                placeholder="Ex: tsilva@techforti.com.br"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
              <p className="text-xs text-gray-400 mt-1">Email institucional (não o domínio de envio)</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Telefone fixo</label>
                <input
                  type="text"
                  value={assinatura.telefone_fixo || ''}
                  onChange={(e) => setAssinatura({ ...assinatura, telefone_fixo: e.target.value })}
                  placeholder="+55 (11) 3138-5800"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Celular</label>
                <input
                  type="text"
                  value={assinatura.telefone_celular || ''}
                  onChange={(e) => setAssinatura({ ...assinatura, telefone_celular: e.target.value })}
                  placeholder="+55 (11) 9 9484-4169"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Websites (um por linha)</label>
              <textarea
                value={(assinatura.websites || []).join('\n')}
                onChange={(e) => setAssinatura({ ...assinatura, websites: e.target.value.split('\n').filter(Boolean) })}
                rows={2}
                placeholder="http://www.techforti.com.br&#10;http://www.techcob.com.br"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">URL Política de Privacidade</label>
              <input
                type="url"
                value={assinatura.politica_privacidade_url || ''}
                onChange={(e) => setAssinatura({ ...assinatura, politica_privacidade_url: e.target.value })}
                placeholder="https://outsourcing.techforti.online/privacidade/"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Texto de opt-out</label>
              <input
                type="text"
                value={assinatura.optout_texto || 'Caso não queira receber nossos comunicados, responda SAIR'}
                onChange={(e) => setAssinatura({ ...assinatura, optout_texto: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
            </div>
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-3 px-6 py-4 border-t bg-gray-50">
            <button
              onClick={() => setShowAssinaturaModal(false)}
              className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-100"
            >
              Cancelar
            </button>
            <button
              onClick={salvarAssinatura}
              disabled={saving || !assinatura.nome_completo || !assinatura.email_assinatura}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              Salvar assinatura
            </button>
          </div>
        </div>
      </div>
    );
  };

  // ════════════════════════════════════════════════════════════
  // RENDER PRINCIPAL
  // ════════════════════════════════════════════════════════════

  return (
    <div className="h-full overflow-y-auto bg-gray-50">
      {/* Toast de mensagem */}
      {message && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg text-sm flex items-center gap-2 ${
          message.type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
        }`}>
          {message.type === 'success' ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
          {message.text}
        </div>
      )}

      {/* Conteúdo principal */}
      {view === 'list' ? renderLista() : renderEditor()}

      {/* Modal de assinatura */}
      {renderAssinaturaModal()}
    </div>
  );
};

export default CampaignBuilder;
