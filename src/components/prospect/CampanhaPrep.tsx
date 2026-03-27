/**
 * CampanhaPrep.tsx — Preparar Campanha para Leads2B
 * 
 * Wizard de 4 etapas:
 * 1. Selecionar Leads (de "Meus Prospects" ou Upload CSV)
 * 2. Configurar Campanha (Funil + Responsável)
 * 3. Enriquecer + Validar (Gemini + Hunter + Snov.io)
 * 4. Revisar + Exportar CSV
 * 
 * Caminho: src/components/prospect/CampanhaPrep.tsx
 * Versão: 1.1
 * Data: 18/03/2026
 * v1.1:
 * - Administrador e Gestão Comercial veem prospects de todos os usuários
 * - SDR vê apenas seus próprios prospects
 */

import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/config/supabase';

// ============================================
// TIPOS
// ============================================
interface CampanhaPrepProps {
  currentUser: {
    id: number;
    nome_usuario: string;
    email: string;
    tipo_usuario: string;
  };
}

type Etapa = 'selecionar' | 'configurar' | 'enriquecer' | 'exportar';

type FunilType = 'ALOCACAO' | 'SERVICE CENTER' | 'BPO';

type EmailScore = 'verified' | 'probable' | 'risky' | 'invalid' | 'original' | 'pending';

interface LeadRow {
  id?: number;
  nome: string;
  cargo: string;
  empresa: string;
  dominio: string;
  email: string;
  email_original: string;       // email que veio da fonte (pode estar vazio)
  email_inferido: string;       // email gerado por padrão
  email_score: EmailScore;
  departamento: string;
  selecionado: boolean;
  // Dados empresa (preenchidos na etapa 3)
  cnpj: string;
  razao_social: string;
  nome_fantasia: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  estado: string;
  cep: string;
  // Fonte
  fonte: 'prospect' | 'csv';
}

interface EmpresaData {
  cnpj: string;
  razao_social: string;
  nome_fantasia: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  estado: string;
  cep: string;
}

// ============================================
// CONSTANTES
// ============================================
const LIMITE_LEADS = 50;
const FUNIS: { value: FunilType; label: string; desc: string }[] = [
  { value: 'ALOCACAO', label: 'ALOCAÇÃO', desc: 'Outsourcing — TI, Compras, Governança' },
  { value: 'SERVICE CENTER', label: 'SERVICE CENTER', desc: 'Infraestrutura, Administração, Compras' },
  { value: 'BPO', label: 'BPO', desc: 'Administração, Finanças, Compras, Operações' },
];

const SCORE_LABELS: Record<EmailScore, { label: string; color: string; icon: string }> = {
  verified:  { label: 'Verificado',  color: 'bg-green-100 text-green-800',  icon: '✅' },
  probable:  { label: 'Provável',    color: 'bg-blue-100 text-blue-800',    icon: '🔵' },
  risky:     { label: 'Arriscado',   color: 'bg-yellow-100 text-yellow-800',icon: '🟡' },
  invalid:   { label: 'Inválido',    color: 'bg-red-100 text-red-800',      icon: '❌' },
  original:  { label: 'Original',    color: 'bg-gray-100 text-gray-800',    icon: '📧' },
  pending:   { label: 'Pendente',    color: 'bg-gray-50 text-gray-500',     icon: '⏳' },
};

// ============================================
// COMPONENTE PRINCIPAL
// ============================================
const CampanhaPrep: React.FC<CampanhaPrepProps> = ({ currentUser }) => {
  // Estados do wizard
  const [etapa, setEtapa] = useState<Etapa>('selecionar');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progresso, setProgresso] = useState('');

  // Etapa 1: Leads
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [prospectsBanco, setProspectsBanco] = useState<any[]>([]);
  const [loadingProspects, setLoadingProspects] = useState(false);
  const [modoImport, setModoImport] = useState<'prospects' | 'csv' | null>(null);
  const [selectAll, setSelectAll] = useState(false);

  // Etapa 2: Configuração
  const [funil, setFunil] = useState<FunilType>('ALOCACAO');

  // Etapa 3: Enriquecimento
  const [enrichProgress, setEnrichProgress] = useState(0);
  const [enrichTotal, setEnrichTotal] = useState(0);
  const [enrichLog, setEnrichLog] = useState<string[]>([]);

  // ============================================
  // ETAPA 1: Carregar prospects do banco
  // ============================================
  // Carrega apenas leads reservados pelo analista logado (via botão "Prospectar" no Prospect Engine)
  // Não carrega automaticamente — só quando o usuário clicar em "Meus Prospects"

  const carregarProspects = useCallback(async () => {
    setLoadingProspects(true);
    try {
      const { data, error: qErr } = await supabase
        .from('prospect_leads')
        .select('id, nome_completo, cargo, email, email_status, empresa_nome, empresa_dominio, departamentos, cidade, estado, motor')
        .eq('reservado_por', currentUser.id)
        .not('motor', 'like', 'cv_%')   // excluir leads de CV Extract (cv_alocacao, cv_infra, etc.)
        .neq('status', 'exportado')     // excluir leads já exportados
        .order('reservado_em', { ascending: false })
        .limit(200);

      if (qErr) throw qErr;
      setProspectsBanco(data || []);
    } catch (err: any) {
      setError('Erro ao carregar prospects: ' + err.message);
    } finally {
      setLoadingProspects(false);
    }
  }, [currentUser.id]);

  // Converter prospect do banco para LeadRow
  const prospectToLead = (p: any): LeadRow => ({
    id: p.id,
    nome: p.nome_completo || '',
    cargo: p.cargo || '',
    empresa: p.empresa_nome || '',
    dominio: p.empresa_dominio || '',
    email: p.email || '',
    email_original: p.email || '',
    email_inferido: '',
    email_score: p.email ? 'original' : 'pending',
    departamento: Array.isArray(p.departamentos) ? p.departamentos[0] || '' : p.departamentos || '',
    selecionado: false,
    fonte: 'prospect',
    cnpj: '', razao_social: '', nome_fantasia: '',
    logradouro: '', numero: '', complemento: '', bairro: '',
    cidade: p.cidade || '', estado: p.estado || '', cep: '',
  });

  // Toggle seleção individual
  const toggleLead = (index: number) => {
    setLeads(prev => {
      const next = [...prev];
      const totalSelecionados = next.filter(l => l.selecionado).length;
      if (!next[index].selecionado && totalSelecionados >= LIMITE_LEADS) {
        setError(`Limite de ${LIMITE_LEADS} leads por campanha atingido.`);
        return prev;
      }
      next[index] = { ...next[index], selecionado: !next[index].selecionado };
      return next;
    });
    setError(null);
  };

  // Toggle selecionar todos
  const toggleSelectAll = () => {
    const novoValor = !selectAll;
    setSelectAll(novoValor);
    setLeads(prev => prev.map((l, i) => ({
      ...l,
      selecionado: novoValor && i < LIMITE_LEADS
    })));
  };

  // Excluir lead da lista (sem afetar o banco — apenas remove da seleção atual)
  const excluirLead = (index: number) => {
    setLeads(prev => prev.filter((_, i) => i !== index));
  };

  // Importar de prospects do banco — busca leads reservados pelo analista logado
  const importarProspects = async () => {
    await carregarProspects();
    setModoImport('prospects');
  };

  // Aplicar prospectsBanco → leads quando modoImport === 'prospects' e carregamento concluir
  useEffect(() => {
    if (modoImport === 'prospects' && !loadingProspects && prospectsBanco.length >= 0) {
      const converted = prospectsBanco.map(prospectToLead);
      setLeads(converted);
    }
  }, [prospectsBanco, modoImport, loadingProspects]);

  // Upload CSV
  const handleCSVUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const text = ev.target?.result as string;
        const lines = text.split('\n').filter(l => l.trim());
        if (lines.length < 2) { setError('CSV vazio ou sem dados.'); return; }

        const headers = lines[0].split(';').map(h => h.trim().toLowerCase());
        const nomeIdx = headers.findIndex(h => h.includes('nome'));
        const emailIdx = headers.findIndex(h => h.includes('e-mail') || h.includes('email'));
        const empresaIdx = headers.findIndex(h => h.includes('empresa') || h.includes('razão'));
        const dominioIdx = headers.findIndex(h => h.includes('dominio') || h.includes('domínio'));
        const cargoIdx = headers.findIndex(h => h.includes('cargo') || h.includes('título'));
        const dptoIdx = headers.findIndex(h => h.includes('departamento') || h.includes('depto'));

        const csvLeads: LeadRow[] = [];
        for (let i = 1; i < lines.length && csvLeads.length < 200; i++) {
          const cols = lines[i].split(';').map(c => c.trim());
          const nome = nomeIdx >= 0 ? cols[nomeIdx] : '';
          if (!nome) continue;

          const email = emailIdx >= 0 ? cols[emailIdx] : '';
          const dominio = dominioIdx >= 0 ? cols[dominioIdx] : (email ? email.split('@')[1] || '' : '');

          csvLeads.push({
            nome,
            cargo: cargoIdx >= 0 ? cols[cargoIdx] : '',
            empresa: empresaIdx >= 0 ? cols[empresaIdx] : '',
            dominio,
            email,
            email_original: email,
            email_inferido: '',
            email_score: email ? 'original' : 'pending',
            departamento: dptoIdx >= 0 ? cols[dptoIdx] : '',
            selecionado: false,
            fonte: 'csv',
            cnpj: '', razao_social: '', nome_fantasia: '',
            logradouro: '', numero: '', complemento: '', bairro: '',
            cidade: '', estado: '', cep: '',
          });
        }

        setLeads(csvLeads);
        setModoImport('csv');
        setError(null);
      } catch (err: any) {
        setError('Erro ao ler CSV: ' + err.message);
      }
    };
    reader.readAsText(file, 'UTF-8');
  };

  // ============================================
  // ETAPA 3: Enriquecer + Validar
  // ============================================
  const selecionados = leads.filter(l => l.selecionado);

  const iniciarEnriquecimento = async () => {
    if (selecionados.length === 0) return;
    setLoading(true);
    setError(null);
    setEnrichLog([]);
    setEnrichProgress(0);

    const dominiosUnicos = [...new Set(selecionados.map(l => l.dominio).filter(Boolean))];
    setEnrichTotal(dominiosUnicos.length + selecionados.length);

    try {
      // FASE 1: Buscar dados das empresas por domínio (Gemini)
      setProgresso('Buscando dados das empresas...');
      const empresaCache: Record<string, EmpresaData> = {};

      // Processar em lotes de 4
      for (let i = 0; i < dominiosUnicos.length; i += 4) {
        const lote = dominiosUnicos.slice(i, i + 4);
        const promises = lote.map(async (dominio) => {
          try {
            const resp = await fetch('/api/prospect-enrich-company', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ dominio })
            });
            if (resp.ok) {
              const data = await resp.json();
              if (data.empresa) empresaCache[dominio] = data.empresa;
              setEnrichLog(prev => [...prev, `✅ ${dominio}: ${data.empresa?.razao_social || 'dados obtidos'}`]);
            } else {
              setEnrichLog(prev => [...prev, `⚠️ ${dominio}: sem dados`]);
            }
          } catch {
            setEnrichLog(prev => [...prev, `❌ ${dominio}: erro na busca`]);
          }
        });
        await Promise.all(promises);
        setEnrichProgress(prev => prev + lote.length);
      }

      // Aplicar dados empresa aos leads
      setLeads(prev => prev.map(l => {
        if (!l.selecionado || !empresaCache[l.dominio]) return l;
        const emp = empresaCache[l.dominio];
        return { ...l, ...emp };
      }));

      // FASE 2: Inferir emails faltantes
      setProgresso('Inferindo emails faltantes...');
      const leadsSemEmail = selecionados.filter(l => !l.email_original);

      if (leadsSemEmail.length > 0) {
        try {
          const resp = await fetch('/api/prospect-infer-emails', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              leads: leadsSemEmail.map(l => ({
                nome: l.nome,
                dominio: l.dominio,
                email_existente: ''
              })),
              emails_conhecidos: selecionados
                .filter(l => l.email_original)
                .map(l => ({ email: l.email_original, dominio: l.dominio }))
            })
          });

          if (resp.ok) {
            const data = await resp.json();
            const inferidos: Record<string, string> = {};
            (data.inferidos || []).forEach((item: any) => {
              inferidos[`${item.nome}|${item.dominio}`] = item.email_inferido;
            });

            setLeads(prev => prev.map(l => {
              const key = `${l.nome}|${l.dominio}`;
              if (inferidos[key]) {
                return {
                  ...l,
                  email_inferido: inferidos[key],
                  email: inferidos[key],
                  email_score: 'risky'
                };
              }
              return l;
            }));
            setEnrichLog(prev => [...prev, `📧 ${Object.keys(inferidos).length} emails inferidos por padrão`]);
          }
        } catch {
          setEnrichLog(prev => [...prev, '⚠️ Erro ao inferir emails']);
        }
      }

      // FASE 3: Validar emails inferidos/novos via Hunter → Snov.io
      setProgresso('Validando emails...');
      const leadsParaValidar = leads.filter(l =>
        l.selecionado && l.email && (l.email_score === 'risky' || l.email_score === 'pending')
      );

      if (leadsParaValidar.length > 0) {
        for (let i = 0; i < leadsParaValidar.length; i += 4) {
          const lote = leadsParaValidar.slice(i, i + 4);
          const promises = lote.map(async (lead) => {
            try {
              const resp = await fetch('/api/prospect-validate-emails', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: lead.email, nome: lead.nome, dominio: lead.dominio })
              });
              if (resp.ok) {
                const data = await resp.json();
                return { nome: lead.nome, dominio: lead.dominio, score: data.score as EmailScore, email: data.email || lead.email };
              }
            } catch { /* silenciar */ }
            return null;
          });
          const results = await Promise.all(promises);

          setLeads(prev => prev.map(l => {
            const match = results.find(r => r && r.nome === l.nome && r.dominio === l.dominio);
            if (match) {
              return { ...l, email_score: match.score, email: match.email };
            }
            return l;
          }));
          setEnrichProgress(prev => prev + lote.length);
        }
      }

      setProgresso('Concluído!');
      setEtapa('exportar');
    } catch (err: any) {
      setError('Erro no enriquecimento: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // ============================================
  // ETAPA 4: Exportar CSV Leads2B
  // ============================================
  // Formata telefone para o padrão Leads2B: 99-99999-0000
  const formatarTelefone = (tel?: string | null): string => {
    if (!tel) return '';
    // Remove tudo que não for dígito
    const digits = tel.replace(/\D/g, '');
    if (digits.length === 11) {
      // Celular: DDD (2) + 9 dígitos → 99-99999-0000
      return `${digits.slice(0, 2)}-${digits.slice(2, 7)}-${digits.slice(7)}`;
    }
    if (digits.length === 10) {
      // Fixo: DDD (2) + 8 dígitos → 99-9999-0000
      return `${digits.slice(0, 2)}-${digits.slice(2, 6)}-${digits.slice(6)}`;
    }
    // Retorna o valor original se não reconhecer o padrão
    return tel;
  };

  const exportarCSV = async (filtroScore?: EmailScore[]) => {
    const leadsExport = selecionados.filter(l =>
      !filtroScore || filtroScore.includes(l.email_score)
    );

    if (leadsExport.length === 0) { setError('Nenhum lead para exportar.'); return; }

    // Header Leads2B (48 colunas, separador ;)
    const headers = [
      'cnpj','razão social','nome fantasia','título do negócio','telefone da empresa',
      'e-mail da empresa','logradouro','número','complemento','bairro','cidade','estado',
      'país','cep','notas da negociação','valor','id externo','funil','etapa','origem',
      'tag 1','tag 2','tag 3','grupo','responsável (e-mail)',
      'status (ativo, perdido, ganho)','motivo de perda','temperatura',
      'nome contato 1','departamento contato 1',
      'nome contato 2','departamento contato 2','telefone contato 2','e-mail contato 2',
      'nome contato 3','departamento contato 3','telefone contato 3','e-mail contato 3',
      'campo customizado 1','campo customizado 2','campo customizado 3','campo customizado 4',
      'campo customizado 5','campo customizado 6','campo customizado 7','campo customizado 8',
      'campo customizado 9','campo customizado 10'
    ];

    const rows = leadsExport.map(l => [
      l.cnpj || '',                       // 0: cnpj
      l.razao_social || '',               // 1: razão social
      l.nome_fantasia || '',              // 2: nome fantasia
      '',                                 // 3: título do negócio
      formatarTelefone(l.telefone),       // 4: telefone empresa → 99-99999-0000
      l.email || '',                      // 5: e-mail empresa = mesmo valor do responsável (e-mail)
      l.logradouro || '',                 // 6: logradouro
      l.numero || '',                     // 7: número
      l.complemento || '',                // 8: complemento
      l.bairro || '',                     // 9: bairro
      l.cidade || '',                     // 10: cidade
      l.estado || '',                     // 11: estado
      'Brasil',                           // 12: país
      l.cep || '',                        // 13: cep
      '',                                 // 14: notas
      '',                                 // 15: valor
      '',                                 // 16: id externo
      funil,                              // 17: funil (POPUP)
      'Novos Leads',                      // 18: etapa (FIXO)
      'Campanha',                         // 19: origem (FIXO)
      '', '', '', '',                     // 20-23: tags, grupo
      l.email || '',                      // 24: responsável (e-mail) = email do lead
      'ativo',                            // 25: status (FIXO)
      '',                                 // 26: motivo perda
      'Frio',                             // 27: temperatura (FIXO)
      l.nome || '',                       // 28: nome contato 1
      '',                                 // 29: departamento contato 1 (sempre vazio)
      '', '', '', '',                     // 30-33: contato 2
      '', '', '', '',                     // 34-37: contato 3
      '', '', '', '', '', '', '', '', '', '' // 38-47: campos customizados
    ]);

    const BOM = '\uFEFF';
    const csvContent = BOM + headers.join(';') + '\n' + rows.map(r => r.join(';')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `campanha_leads2b_${funil.replace(/\s/g, '_')}_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    // ── Marcar leads exportados como 'exportado' no banco ──────────────
    const idsParaMarcar = leadsExport
      .filter((l: LeadRow) => l.id)
      .map((l: LeadRow) => l.id as number);

    if (idsParaMarcar.length > 0 && currentUser?.id) {
      try {
        await fetch('/api/prospect-leads', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ids:              idsParaMarcar,
            marcar_exportado: true,
            exportado_por:    currentUser.id,
          }),
        });
      } catch (e) {
        console.error('Erro ao marcar leads como exportados:', e);
      }
    }
  };

  // ============================================
  // CONTADORES
  // ============================================
  const totalSelecionados = leads.filter(l => l.selecionado).length;
  const dominiosUnicos = [...new Set(selecionados.map(l => l.dominio).filter(Boolean))];
  const emailsVerificados = selecionados.filter(l => l.email_score === 'verified').length;
  const emailsProvaveis = selecionados.filter(l => l.email_score === 'probable').length;
  const emailsArriscados = selecionados.filter(l => l.email_score === 'risky').length;
  const emailsInvalidos = selecionados.filter(l => l.email_score === 'invalid').length;
  const emailsOriginais = selecionados.filter(l => l.email_score === 'original').length;

  // ============================================
  // RENDER
  // ============================================
  const etapas: { key: Etapa; label: string; num: number }[] = [
    { key: 'selecionar', label: 'Selecionar Leads', num: 1 },
    { key: 'configurar', label: 'Configurar', num: 2 },
    { key: 'enriquecer', label: 'Enriquecer', num: 3 },
    { key: 'exportar', label: 'Exportar', num: 4 },
  ];

  const etapaIndex = etapas.findIndex(e => e.key === etapa);

  return (
    <div className="max-w-7xl mx-auto p-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-indigo-700 to-purple-600 text-white rounded-xl p-6 mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <i className="fa-solid fa-paper-plane" /> Preparar Campanha — Leads2B
        </h1>
        <p className="text-white/70 mt-1">Enriqueça e exporte leads para disparo de campanhas de email</p>

        {/* Progress */}
        <div className="flex gap-2 mt-4">
          {etapas.map((e, i) => (
            <div key={e.key} className="flex items-center">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                etapa === e.key ? 'bg-white text-indigo-700' :
                etapaIndex > i ? 'bg-white/40 text-white' : 'bg-white/20 text-white/50'
              }`}>
                {e.num}
              </div>
              <span className={`ml-2 text-sm hidden md:inline ${
                etapa === e.key ? 'text-white font-bold' : 'text-white/60'
              }`}>{e.label}</span>
              {i < etapas.length - 1 && <div className="w-8 h-0.5 bg-white/30 mx-2" />}
            </div>
          ))}
        </div>
      </div>

      {/* Erro */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4 flex justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-500 hover:text-red-700">✕</button>
        </div>
      )}

      {/* ============================================ */}
      {/* ETAPA 1: Selecionar Leads */}
      {/* ============================================ */}
      {etapa === 'selecionar' && (
        <div className="bg-white rounded-xl shadow-sm border p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-bold text-gray-800">
              Selecionar Leads ({totalSelecionados}/{LIMITE_LEADS})
            </h2>
            <div className="flex gap-3">
              <button
                onClick={importarProspects}
                className={`px-4 py-2 rounded-lg text-sm font-medium ${
                  modoImport === 'prospects' ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                <i className="fa-solid fa-address-book mr-1" /> Meus Prospects
              </button>
              <label className={`px-4 py-2 rounded-lg text-sm font-medium cursor-pointer ${
                modoImport === 'csv' ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}>
                <i className="fa-solid fa-file-csv mr-1" /> Upload CSV
                <input type="file" accept=".csv" onChange={handleCSVUpload} className="hidden" />
              </label>
            </div>
          </div>

          {loadingProspects ? (
            <div className="text-center py-12 text-gray-400">Carregando prospects...</div>
          ) : leads.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <i className="fa-solid fa-inbox text-4xl mb-3 block" />
              Clique em "Meus Prospects" ou faça upload de um CSV para começar
            </div>
          ) : (
            <>
              <div className="flex items-center gap-3 mb-3 text-sm text-gray-500">
                <label className="flex items-center gap-1 cursor-pointer">
                  <input type="checkbox" checked={selectAll} onChange={toggleSelectAll} className="rounded" />
                  Selecionar todos (até {LIMITE_LEADS})
                </label>
                <span>|</span>
                <span>{leads.length} leads disponíveis</span>
              </div>

              <div className="overflow-x-auto max-h-[400px] overflow-y-auto border rounded-lg">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="p-2 w-8"></th>
                      <th className="p-2 text-left">Nome</th>
                      <th className="p-2 text-left">Cargo</th>
                      <th className="p-2 text-left">Empresa</th>
                      <th className="p-2 text-left">Domínio</th>
                      <th className="p-2 text-left">Email</th>
                      <th className="p-2 text-left">Depto</th>
                      <th className="p-2 text-center w-16">Ação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leads.map((lead, i) => (
                      <tr
                        key={i}
                        className={`border-t hover:bg-gray-50 ${lead.selecionado ? 'bg-indigo-50' : ''}`}
                      >
                        <td className="p-2 text-center">
                          <input
                            type="checkbox"
                            checked={lead.selecionado}
                            onChange={() => toggleLead(i)}
                            className="rounded"
                          />
                        </td>
                        <td className="p-2 font-medium text-gray-800">{lead.nome}</td>
                        <td className="p-2 text-gray-600">{lead.cargo || '-'}</td>
                        <td className="p-2 text-gray-600">{lead.empresa || '-'}</td>
                        <td className="p-2 text-gray-500 text-xs">{lead.dominio || '-'}</td>
                        <td className="p-2">
                          {lead.email ? (
                            <span className="text-green-700 text-xs">{lead.email}</span>
                          ) : (
                            <span className="text-red-400 text-xs italic">sem email</span>
                          )}
                        </td>
                        <td className="p-2 text-gray-500 text-xs">{lead.departamento || '-'}</td>
                        <td className="p-2 text-center">
                          <button
                            onClick={() => excluirLead(i)}
                            className="text-[10px] px-2 py-1 rounded border border-dashed border-red-200 text-red-400 hover:bg-red-500 hover:text-white hover:border-red-500 transition-colors"
                            title="Remover este lead da campanha"
                          >
                            <i className="fa-solid fa-trash-can"></i>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* ============================================ */}
      {/* ETAPA 2: Configurar Campanha */}
      {/* ============================================ */}
      {etapa === 'configurar' && (
        <div className="bg-white rounded-xl shadow-sm border p-6">
          <h2 className="text-lg font-bold text-gray-800 mb-6">Configurar Campanha</h2>

          <div className="bg-indigo-50 rounded-lg p-4 mb-6">
            <p className="text-indigo-800 text-sm">
              <strong>{totalSelecionados}</strong> leads selecionados de <strong>{dominiosUnicos.length}</strong> empresas distintas
            </p>
          </div>

          <div className="space-y-6 max-w-lg">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Funil de Destino</label>
              {FUNIS.map(f => (
                <label key={f.value} className={`flex items-start gap-3 p-3 rounded-lg border mb-2 cursor-pointer ${
                  funil === f.value ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200 hover:border-gray-300'
                }`}>
                  <input
                    type="radio" name="funil" value={f.value}
                    checked={funil === f.value}
                    onChange={() => setFunil(f.value)}
                    className="mt-1"
                  />
                  <div>
                    <span className="font-medium text-gray-800">{f.label}</span>
                    <p className="text-xs text-gray-500 mt-0.5">{f.desc}</p>
                  </div>
                </label>
              ))}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Responsável</label>
              <input
                type="text"
                value={`${currentUser.nome_usuario} (${currentUser.email})`}
                disabled
                className="w-full border rounded-lg p-2 bg-gray-50 text-gray-600 text-sm"
              />
            </div>
          </div>
        </div>
      )}

      {/* ============================================ */}
      {/* ETAPA 3: Enriquecer + Validar */}
      {/* ============================================ */}
      {etapa === 'enriquecer' && (
        <div className="bg-white rounded-xl shadow-sm border p-6">
          <h2 className="text-lg font-bold text-gray-800 mb-4">Enriquecer + Validar</h2>

          {!loading && enrichLog.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-600 mb-4">
                Pronto para enriquecer <strong>{totalSelecionados}</strong> leads de <strong>{dominiosUnicos.length}</strong> domínios.
              </p>
              <p className="text-sm text-gray-400 mb-6">
                Serão buscados: dados da empresa (CNPJ, endereço), emails inferidos por padrão e validação de emails novos.
              </p>
              <button
                onClick={iniciarEnriquecimento}
                className="px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium"
              >
                <i className="fa-solid fa-wand-magic-sparkles mr-2" /> Iniciar Enriquecimento
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Progress bar */}
              <div>
                <div className="flex justify-between text-sm text-gray-500 mb-1">
                  <span>{progresso}</span>
                  <span>{enrichProgress}/{enrichTotal}</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-indigo-600 h-2 rounded-full transition-all"
                    style={{ width: `${enrichTotal ? (enrichProgress / enrichTotal) * 100 : 0}%` }}
                  />
                </div>
              </div>

              {/* Log */}
              <div className="bg-gray-50 rounded-lg p-3 max-h-48 overflow-y-auto text-xs font-mono">
                {enrichLog.map((log, i) => (
                  <div key={i} className="py-0.5">{log}</div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ============================================ */}
      {/* ETAPA 4: Revisar + Exportar */}
      {/* ============================================ */}
      {etapa === 'exportar' && (
        <div className="bg-white rounded-xl shadow-sm border p-6">
          <h2 className="text-lg font-bold text-gray-800 mb-4">Revisar + Exportar</h2>

          {/* Resumo de scores */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
            {[
              { label: 'Originais', count: emailsOriginais, color: 'bg-gray-100 text-gray-700' },
              { label: 'Verificados', count: emailsVerificados, color: 'bg-green-100 text-green-700' },
              { label: 'Prováveis', count: emailsProvaveis, color: 'bg-blue-100 text-blue-700' },
              { label: 'Arriscados', count: emailsArriscados, color: 'bg-yellow-100 text-yellow-700' },
              { label: 'Inválidos', count: emailsInvalidos, color: 'bg-red-100 text-red-700' },
            ].map(s => (
              <div key={s.label} className={`${s.color} rounded-lg p-3 text-center`}>
                <div className="text-2xl font-bold">{s.count}</div>
                <div className="text-xs">{s.label}</div>
              </div>
            ))}
          </div>

          {/* Tabela de resultados */}
          <div className="overflow-x-auto max-h-[350px] overflow-y-auto border rounded-lg mb-6">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="p-2 text-left">Nome</th>
                  <th className="p-2 text-left">Empresa</th>
                  <th className="p-2 text-left">CNPJ</th>
                  <th className="p-2 text-left">Email</th>
                  <th className="p-2 text-left">Score</th>
                  <th className="p-2 text-left">Cidade/UF</th>
                </tr>
              </thead>
              <tbody>
                {selecionados.map((lead, i) => (
                  <tr key={i} className="border-t hover:bg-gray-50">
                    <td className="p-2 font-medium text-gray-800">{lead.nome}</td>
                    <td className="p-2 text-gray-600">{lead.razao_social || lead.empresa || '-'}</td>
                    <td className="p-2 text-gray-500 text-xs">{lead.cnpj || '-'}</td>
                    <td className="p-2 text-xs">{lead.email || <span className="text-red-400 italic">vazio</span>}</td>
                    <td className="p-2">
                      <span className={`px-2 py-0.5 rounded-full text-xs ${SCORE_LABELS[lead.email_score].color}`}>
                        {SCORE_LABELS[lead.email_score].icon} {SCORE_LABELS[lead.email_score].label}
                      </span>
                    </td>
                    <td className="p-2 text-gray-500 text-xs">
                      {[lead.cidade, lead.estado].filter(Boolean).join('/') || '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Botões de exportação */}
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => exportarCSV()}
              className="px-5 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium text-sm"
            >
              <i className="fa-solid fa-download mr-1" /> Exportar TODOS ({totalSelecionados})
            </button>
            <button
              onClick={() => exportarCSV(['verified', 'probable', 'original'])}
              className="px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium text-sm"
            >
              <i className="fa-solid fa-shield-check mr-1" /> Exportar Confiáveis ({emailsVerificados + emailsProvaveis + emailsOriginais})
            </button>
            <button
              onClick={() => exportarCSV(['verified', 'probable', 'risky', 'original'])}
              className="px-5 py-2.5 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 font-medium text-sm"
            >
              Excluir Inválidos ({totalSelecionados - emailsInvalidos})
            </button>
          </div>
        </div>
      )}

      {/* ============================================ */}
      {/* FOOTER — Navegação */}
      {/* ============================================ */}
      <div className="flex justify-between mt-6">
        <button
          onClick={() => {
            const idx = etapaIndex;
            if (idx > 0) setEtapa(etapas[idx - 1].key);
          }}
          disabled={etapaIndex === 0}
          className="px-4 py-2 border rounded-lg text-gray-600 hover:bg-gray-50 disabled:opacity-30"
        >
          ← Voltar
        </button>

        {etapa === 'selecionar' && (
          <button
            onClick={() => { if (totalSelecionados > 0) setEtapa('configurar'); else setError('Selecione ao menos 1 lead.'); }}
            className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
            disabled={totalSelecionados === 0}
          >
            Próximo → ({totalSelecionados} leads)
          </button>
        )}
        {etapa === 'configurar' && (
          <button
            onClick={() => setEtapa('enriquecer')}
            className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
          >
            Próximo → Enriquecer
          </button>
        )}
      </div>
    </div>
  );
};

export default CampanhaPrep;

