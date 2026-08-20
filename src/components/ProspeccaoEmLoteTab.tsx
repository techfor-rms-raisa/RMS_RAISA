/**
 * ProspeccaoEmLoteTab.tsx — Aba "Prospecção em Lote" do Prospect Engine
 *
 * Fluxo (aprovado no mockup 20/08/2026):
 *   1. Importar lista de empresas (.xlsx) — lida no navegador com SheetJS.
 *   2. Escolher departamentos / senioridade / "Apenas Brasil".
 *   3. Buscar decisores no Apollo em lotes (grátis) via /api/prospect-linkedin-lote.
 *   4. Curar: selecionar, opcionalmente enriquecer e-mail (/api/prospect-linkedin-enrich),
 *      e salvar em Meus Prospects (/api/prospect-save, motor='apollo').
 *
 * Acesso restrito (fase de validação): Admin e Messias Vieira (id=2). O gate
 * real está no ProspectSearchPage (visibilidade da aba) e nos endpoints (RBAC).
 *
 * Caminho: mesma pasta de ProspectSearchPage.tsx
 * Versão: 1.0
 * Data:   20/08/2026
 */

import React, { useCallback, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';

// ── Tipos ────────────────────────────────────────────────────────────────────
interface CurrentUser { id?: number; nome_usuario?: string; tipo_usuario?: string; }

interface Props {
  currentUser: CurrentUser | null | undefined;
  onSalvou?: () => void;
}

interface EmpresaInput { nome: string; dominio?: string | null; }

interface Decisor {
  apollo_id?: string;
  nome_completo: string;
  primeiro_nome: string;
  ultimo_nome: string;
  cargo: string;
  email: string | null;
  email_status: string | null;
  linkedin_url: string | null;
  foto_url: string | null;
  empresa_nome: string;
  empresa_dominio?: string | null;
  empresa_setor: string | null;
  empresa_porte: number | null;
  empresa_linkedin: string | null;
  empresa_website: string | null;
  cidade: string | null;
  estado: string | null;
  pais: string | null;
  senioridade: string | null;
  departamentos: string[];
  fonte: string;
  enriquecido: boolean;
}

interface DiagLinha {
  nome: string; dominio: string | null;
  encontrados: number; novos: number;
  status: 'ok' | 'sem_dominio' | 'sem_resultado' | 'erro';
  detalhe?: string;
}

// ── Constantes de filtro ─────────────────────────────────────────────────────
const DEPARTAMENTOS: Array<{ key: string; label: string; default: boolean }> = [
  { key: 'ti_tecnologia',        label: 'TI / Tecnologia',        default: true  },
  { key: 'compras_procurement',  label: 'Compras / Suprimentos',  default: true  },
  { key: 'governanca_compliance',label: 'Governança / Compliance',default: true  },
  { key: 'infraestrutura',       label: 'Infraestrutura',         default: false },
  { key: 'diretoria_clevel',     label: 'C-Level / Diretoria',    default: false },
];

const SENIORIDADES: Array<{ key: string; label: string }> = [
  { key: 'c_level', label: 'C-Level' },
  { key: 'vp',      label: 'VP' },
  { key: 'diretor', label: 'Diretor' },
  { key: 'gerente', label: 'Gerente' },
];

const MAX_EMPRESAS_LOTE = 20; // deve casar com o cap do endpoint

// Chave estável de um decisor (para seleção/dedupe no cliente).
const keyOf = (d: Decisor) => d.linkedin_url || `${d.nome_completo}|${d.empresa_nome}`;

// ── Parse do .xlsx (SheetJS) ─────────────────────────────────────────────────
function extrairEmpresas(rows: Record<string, any>[]): EmpresaInput[] {
  if (rows.length === 0) return [];
  const chaves = Object.keys(rows[0]);
  const achaCol = (re: RegExp) => chaves.find(k => re.test(k));
  const colNome = achaCol(/empresa|raz[aã]o|company|nome|cliente/i) || chaves[0];
  const colDom  = achaCol(/dom[ií]nio|domain|site|website|url/i);

  const out: EmpresaInput[] = [];
  for (const r of rows) {
    const nome = String(r[colNome] ?? '').trim();
    if (!nome) continue;
    const dominio = colDom ? String(r[colDom] ?? '').trim().toLowerCase() : '';
    out.push({ nome, dominio: dominio || null });
  }
  // dedupe por nome
  const vistos = new Set<string>();
  return out.filter(e => {
    const k = e.nome.toLowerCase();
    if (vistos.has(k)) return false;
    vistos.add(k); return true;
  });
}

// ════════════════════════════════════════════════════════════════════════════
const ProspeccaoEmLoteTab: React.FC<Props> = ({ currentUser, onSalvou }) => {
  const fileRef = useRef<HTMLInputElement>(null);

  const [empresas, setEmpresas]   = useState<EmpresaInput[]>([]);
  const [nomeArquivo, setNomeArq] = useState('');

  const [depts, setDepts] = useState<string[]>(DEPARTAMENTOS.filter(d => d.default).map(d => d.key));
  const [seniors, setSeniors] = useState<string[]>(SENIORIDADES.map(s => s.key));
  const [filtrarBrasil, setFiltrarBrasil] = useState(true);
  const [maxPorEmpresa, setMaxPorEmpresa] = useState(25);

  const [buscando, setBuscando]   = useState(false);
  const [progresso, setProgresso] = useState<{ lote: number; total: number } | null>(null);

  const [resultados, setResultados] = useState<Decisor[]>([]);
  const [jaNaBase, setJaNaBase]     = useState<Decisor[]>([]);
  const [diagnostico, setDiag]      = useState<DiagLinha[]>([]);
  const [selecionados, setSel]      = useState<Set<string>>(new Set());

  const [enriquecendo, setEnriquecendo] = useState(false);
  const [salvando, setSalvando]         = useState(false);
  const [toast, setToast] = useState<{ tipo: 'ok' | 'erro' | 'info'; msg: string } | null>(null);

  const flash = (tipo: 'ok' | 'erro' | 'info', msg: string) => {
    setToast({ tipo, msg });
    window.setTimeout(() => setToast(null), 5000);
  };

  // ── Upload ─────────────────────────────────────────────────────────────────
  const onArquivo = useCallback(async (file: File) => {
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, any>>(ws, { defval: '' });
      const emp = extrairEmpresas(rows);
      if (emp.length === 0) {
        flash('erro', 'Não encontrei empresas na planilha. Confira se há uma coluna de nome/empresa.');
        return;
      }
      setEmpresas(emp);
      setNomeArq(file.name);
      setResultados([]); setJaNaBase([]); setDiag([]); setSel(new Set());
      flash('ok', `${emp.length} empresas detectadas em ${file.name}.`);
    } catch (e: any) {
      flash('erro', `Falha ao ler a planilha: ${e?.message || 'arquivo inválido'}`);
    }
  }, []);

  // ── Buscar (em lotes) ────────────────────────────────────────────────────────
  const buscar = useCallback(async () => {
    if (!currentUser?.id) { flash('erro', 'Usuário não identificado.'); return; }
    if (empresas.length === 0) { flash('erro', 'Importe uma lista de empresas primeiro.'); return; }
    if (depts.length === 0) { flash('erro', 'Selecione ao menos um departamento.'); return; }

    setBuscando(true);
    setResultados([]); setJaNaBase([]); setDiag([]); setSel(new Set());

    const acumNovos: Decisor[] = [];
    const acumBase: Decisor[]  = [];
    const acumDiag: DiagLinha[] = [];
    const vistosNovos = new Set<string>();

    const totalLotes = Math.ceil(empresas.length / MAX_EMPRESAS_LOTE);

    try {
      for (let i = 0; i < empresas.length; i += MAX_EMPRESAS_LOTE) {
        const fatia = empresas.slice(i, i + MAX_EMPRESAS_LOTE);
        setProgresso({ lote: Math.floor(i / MAX_EMPRESAS_LOTE) + 1, total: totalLotes });

        const resp = await fetch('/api/prospect-linkedin-lote', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_id: currentUser.id,
            empresas: fatia,
            departamentos: depts,
            senioridades: seniors,
            filtrar_brasil: filtrarBrasil,
            max_resultados: maxPorEmpresa,
          }),
        });
        const data = await resp.json();
        if (!resp.ok || !data.success) {
          flash('erro', data?.error || `Erro no lote ${Math.floor(i / MAX_EMPRESAS_LOTE) + 1}.`);
          continue;
        }

        for (const d of (data.resultados || []) as Decisor[]) {
          const k = keyOf(d);
          if (vistosNovos.has(k)) continue;
          vistosNovos.add(k);
          acumNovos.push(d);
        }
        acumBase.push(...((data.ja_na_base || []) as Decisor[]));
        acumDiag.push(...((data.diagnostico || []) as DiagLinha[]));

        // Atualiza incremental para o usuário ver o progresso preenchendo
        setResultados([...acumNovos]);
        setJaNaBase([...acumBase]);
        setDiag([...acumDiag]);
      }

      // Pré-seleciona todos os novos com LinkedIn
      setSel(new Set(acumNovos.filter(d => d.linkedin_url).map(keyOf)));
      flash('ok', `${acumNovos.length} novos decisores encontrados (${acumBase.length} já na base).`);
    } catch (e: any) {
      flash('erro', `Erro na busca: ${e?.message || 'desconhecido'}`);
    } finally {
      setBuscando(false);
      setProgresso(null);
    }
  }, [currentUser, empresas, depts, seniors, filtrarBrasil, maxPorEmpresa]);

  // ── Seleção ──────────────────────────────────────────────────────────────────
  const toggle = (d: Decisor) => setSel(prev => {
    const n = new Set(prev); const k = keyOf(d);
    n.has(k) ? n.delete(k) : n.add(k); return n;
  });
  const todosSelecionados = resultados.length > 0 && selecionados.size === resultados.length;
  const toggleTodos = () => setSel(prev =>
    prev.size === resultados.length ? new Set() : new Set(resultados.map(keyOf)));

  const selecionadosArr = useMemo(
    () => resultados.filter(d => selecionados.has(keyOf(d))),
    [resultados, selecionados]);

  // ── Enriquecer e-mail ────────────────────────────────────────────────────────
  const enriquecer = useCallback(async () => {
    if (!currentUser?.id || selecionadosArr.length === 0) return;
    setEnriquecendo(true);
    try {
      const resp = await fetch('/api/prospect-linkedin-enrich', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: currentUser.id,
          pessoas: selecionadosArr.map(d => ({
            primeiro_nome: d.primeiro_nome, ultimo_nome: d.ultimo_nome,
            nome_completo: d.nome_completo, linkedin_url: d.linkedin_url,
            empresa_dominio: d.empresa_dominio, empresa_nome: d.empresa_nome,
          })),
        }),
      });
      const data = await resp.json();
      if (!resp.ok || !data.success) { flash('erro', data?.error || 'Erro ao enriquecer.'); return; }

      const porUrl = new Map<string, any>();
      for (const e of data.enriquecidos || []) if (e.linkedin_url) porUrl.set(e.linkedin_url, e);

      setResultados(prev => prev.map(d => {
        const e = d.linkedin_url ? porUrl.get(d.linkedin_url) : null;
        if (e && e.encontrado) return { ...d, email: e.email, email_status: e.email_status, apollo_id: e.apollo_id || d.apollo_id, enriquecido: true };
        return d;
      }));

      let msg = `${data.creditos_consumidos} e-mail(s) encontrado(s).`;
      if (data.cap_atingido) msg += ' Cap diário Apollo atingido.';
      if (data.nao_processados > 0) msg += ` ${data.nao_processados} não processado(s) (limite de ${data.limite_por_clique} por vez).`;
      flash(data.creditos_consumidos > 0 ? 'ok' : 'info', msg);
    } catch (e: any) {
      flash('erro', `Erro ao enriquecer: ${e?.message || 'desconhecido'}`);
    } finally {
      setEnriquecendo(false);
    }
  }, [currentUser, selecionadosArr]);

  // ── Salvar em Meus Prospects ─────────────────────────────────────────────────
  const salvar = useCallback(async () => {
    if (!currentUser?.id || selecionadosArr.length === 0) return;
    setSalvando(true);
    try {
      const prospects = selecionadosArr.map(d => ({
        apollo_id: d.apollo_id || null,
        nome_completo: d.nome_completo,
        primeiro_nome: d.primeiro_nome,
        ultimo_nome: d.ultimo_nome,
        cargo: d.cargo,
        email: d.email,
        email_status: d.email_status,
        linkedin_url: d.linkedin_url,
        foto_url: d.foto_url,
        empresa_nome: d.empresa_nome,
        empresa_dominio: d.empresa_dominio || '',
        empresa_setor: d.empresa_setor,
        empresa_porte: d.empresa_porte,
        empresa_linkedin: d.empresa_linkedin,
        empresa_website: d.empresa_website,
        cidade: d.cidade, estado: d.estado, pais: d.pais,
        senioridade: d.senioridade,
        departamentos: d.departamentos,
        fonte: 'apollo' as const,
        enriquecido: d.enriquecido,
      }));

      const resp = await fetch('/api/prospect-save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prospects,
          user_id: currentUser.id,
          reservado_por: currentUser.id,
          filtros_busca: { origem: 'prospeccao_lote', departamentos: depts, senioridades: seniors, filtrar_brasil: filtrarBrasil },
        }),
      });
      const data = await resp.json();
      if (!resp.ok || !data.success) { flash('erro', data?.error || 'Erro ao salvar.'); return; }

      // Remove os salvos da lista de resultados
      const salvosKeys = new Set(selecionadosArr.map(keyOf));
      setResultados(prev => prev.filter(d => !salvosKeys.has(keyOf(d))));
      setSel(new Set());
      flash('ok', `${data.salvos} prospect(s) salvo(s) em Meus Prospects.`);
      onSalvou?.();
    } catch (e: any) {
      flash('erro', `Erro ao salvar: ${e?.message || 'desconhecido'}`);
    } finally {
      setSalvando(false);
    }
  }, [currentUser, selecionadosArr, depts, seniors, filtrarBrasil, onSalvou]);

  // ── Render ───────────────────────────────────────────────────────────────────
  const semResultado = diagnostico.filter(d => d.status === 'sem_resultado' || d.status === 'sem_dominio');

  return (
    <div className="space-y-4">
      {/* Aviso RBAC */}
      <div className="inline-flex items-center gap-2 bg-amber-50 text-amber-800 border border-amber-300 rounded-full px-3 py-1 text-xs">
        <i className="fa-solid fa-lock"></i> Acesso restrito · Administrador e Messias Vieira (em validação)
      </div>

      {/* Toast */}
      {toast && (
        <div className={`px-4 py-2 rounded-lg text-sm border ${
          toast.tipo === 'ok'   ? 'bg-green-50 border-green-300 text-green-800'
          : toast.tipo === 'erro'? 'bg-red-50 border-red-300 text-red-800'
                                 : 'bg-blue-50 border-blue-300 text-blue-800'}`}>
          {toast.msg}
        </div>
      )}

      {/* STEP 1 — Upload */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <div className="flex items-center gap-2 mb-3">
          <span className="w-6 h-6 rounded-full bg-slate-800 text-white text-xs font-bold flex items-center justify-center">1</span>
          <h3 className="font-semibold text-gray-800">Importar lista de empresas</h3>
        </div>
        <div
          className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center bg-gray-50 cursor-pointer hover:border-blue-400 transition-colors"
          onClick={() => fileRef.current?.click()}
          onDragOver={e => e.preventDefault()}
          onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) onArquivo(f); }}
        >
          <i className="fa-solid fa-file-excel text-3xl text-gray-400"></i>
          <p className="text-gray-500 text-xs mt-2 mb-1">Arraste a planilha <b>.xlsx</b> aqui, ou clique para selecionar</p>
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden"
                 onChange={e => { const f = e.target.files?.[0]; if (f) onArquivo(f); }} />
        </div>
        {empresas.length > 0 && (
          <div className="mt-3 inline-flex items-center gap-2 bg-green-50 text-green-800 border border-green-200 rounded-lg px-3 py-2 text-xs font-semibold">
            <i className="fa-solid fa-circle-check"></i>
            {empresas.length} empresas detectadas em <b>{nomeArquivo}</b>
          </div>
        )}
        <p className="text-gray-400 text-[11px] mt-2">A planilha é lida no seu navegador (SheetJS). Nenhum arquivo é enviado — só a lista de nomes/domínios segue para a busca.</p>
      </div>

      {/* STEP 2 — Filtros */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <span className="w-6 h-6 rounded-full bg-slate-800 text-white text-xs font-bold flex items-center justify-center">2</span>
          <h3 className="font-semibold text-gray-800">Quem procurar</h3>
        </div>
        <div className="flex flex-wrap gap-8">
          {/* Departamentos */}
          <div>
            <div className="text-[11px] uppercase tracking-wide text-gray-400 mb-2">Departamentos</div>
            {DEPARTAMENTOS.map(d => (
              <label key={d.key} className="flex items-center gap-2 py-1 text-sm cursor-pointer">
                <input type="checkbox" className="accent-blue-600 w-4 h-4"
                  checked={depts.includes(d.key)}
                  onChange={() => setDepts(prev => prev.includes(d.key) ? prev.filter(x => x !== d.key) : [...prev, d.key])} />
                {d.label}
              </label>
            ))}
          </div>
          {/* Senioridade */}
          <div>
            <div className="text-[11px] uppercase tracking-wide text-gray-400 mb-2">Senioridade</div>
            <div className="flex flex-wrap gap-2">
              {SENIORIDADES.map(s => {
                const on = seniors.includes(s.key);
                return (
                  <button key={s.key} type="button"
                    onClick={() => setSeniors(prev => prev.includes(s.key) ? prev.filter(x => x !== s.key) : [...prev, s.key])}
                    className={`rounded-full px-3 py-1.5 text-xs border ${on ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-gray-500 border-gray-200'}`}>
                    {s.label}
                  </button>
                );
              })}
            </div>
            <div className="text-[11px] uppercase tracking-wide text-gray-400 mt-5 mb-2">Localização</div>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" className="accent-green-600 w-4 h-4" checked={filtrarBrasil} onChange={e => setFiltrarBrasil(e.target.checked)} />
              Apenas Brasil <span className="text-gray-400 text-xs">(filtro nativo Apollo)</span>
            </label>
          </div>
          {/* Por empresa */}
          <div className="max-w-xs">
            <div className="text-[11px] uppercase tracking-wide text-gray-400 mb-2">Por empresa</div>
            <label className="flex items-center gap-2 text-sm">
              Até
              <input type="number" min={1} max={100} value={maxPorEmpresa}
                onChange={e => setMaxPorEmpresa(Math.min(100, Math.max(1, Number(e.target.value) || 25)))}
                className="w-16 px-2 py-1 border border-gray-200 rounded" />
              decisores
            </label>
            <div className="mt-3 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-xs text-blue-800">
              💡 A <b>busca é gratuita</b> (0 créditos). O e-mail só é enriquecido — e só aí consome crédito — nos selecionados.
            </div>
          </div>
        </div>
        <div className="flex justify-end mt-4">
          <button onClick={buscar} disabled={buscando || empresas.length === 0}
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold rounded-lg px-4 py-2 text-sm">
            <i className={`fa-solid ${buscando ? 'fa-spinner fa-spin' : 'fa-magnifying-glass'} mr-2`}></i>
            {buscando ? 'Buscando…' : 'Buscar decisores'}
          </button>
        </div>
      </div>

      {/* Progresso */}
      {progresso && (
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="text-xs text-gray-500 mb-2">
            Processando em lotes de {MAX_EMPRESAS_LOTE} empresas — <b>lote {progresso.lote} de {progresso.total}</b>…
          </div>
          <div className="h-2 rounded-full bg-gray-200 overflow-hidden">
            <div className="h-full bg-blue-600 transition-all" style={{ width: `${(progresso.lote / progresso.total) * 100}%` }} />
          </div>
        </div>
      )}

      {/* STEP 3 — Resultados */}
      {(resultados.length > 0 || jaNaBase.length > 0) && (
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <span className="w-6 h-6 rounded-full bg-slate-800 text-white text-xs font-bold flex items-center justify-center">3</span>
            <h3 className="font-semibold text-gray-800">Decisores encontrados</h3>
          </div>

          <div className="flex flex-wrap items-center gap-6 mb-4">
            <div className="flex flex-col"><b className="text-xl text-slate-800">{resultados.length + jaNaBase.length}</b><span className="text-[11px] uppercase tracking-wide text-gray-400">Encontrados</span></div>
            <div className="flex flex-col"><b className="text-xl text-blue-600">{resultados.length}</b><span className="text-[11px] uppercase tracking-wide text-gray-400">Novos</span></div>
            <div className="flex flex-col"><b className="text-xl text-gray-400">{jaNaBase.length}</b><span className="text-[11px] uppercase tracking-wide text-gray-400">Já na base</span></div>
          </div>

          {/* Diagnóstico de empresas sem resultado */}
          {semResultado.length > 0 && (
            <div className="text-xs bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3 text-amber-800">
              <b>{semResultado.length} empresa(s) sem resultado:</b>{' '}
              {semResultado.slice(0, 8).map(d => d.nome).join(' · ')}
              {semResultado.length > 8 ? ' …' : ''}
              <span className="text-amber-600"> (revisar domínio ou tentar Snov.io)</span>
            </div>
          )}

          {/* Tabela */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-gray-400 border-b border-gray-200">
                  <th className="p-2 w-8"><input type="checkbox" checked={todosSelecionados} onChange={toggleTodos} /></th>
                  <th className="p-2">Nome</th><th className="p-2">Cargo</th><th className="p-2">Empresa</th>
                  <th className="p-2">Local</th><th className="p-2">E-mail</th><th className="p-2 w-16">LinkedIn</th>
                </tr>
              </thead>
              <tbody>
                {resultados.map(d => {
                  const k = keyOf(d);
                  return (
                    <tr key={k} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="p-2"><input type="checkbox" checked={selecionados.has(k)} onChange={() => toggle(d)} /></td>
                      <td className="p-2 font-medium text-gray-800">{d.nome_completo}</td>
                      <td className="p-2 text-gray-600">{d.cargo || '—'}</td>
                      <td className="p-2 text-gray-600">{d.empresa_nome || '—'}</td>
                      <td className="p-2 text-gray-500">{[d.cidade, d.estado].filter(Boolean).join(', ') || '—'}</td>
                      <td className="p-2">{d.email
                        ? <span className="text-green-700">{d.email}</span>
                        : <span className="text-gray-300">—</span>}</td>
                      <td className="p-2">{d.linkedin_url
                        ? <a href={d.linkedin_url} target="_blank" rel="noreferrer"
                             className="inline-flex w-6 h-6 rounded items-center justify-center text-white font-bold text-[11px]"
                             style={{ background: '#0A66C2' }}>in</a>
                        : <span className="text-gray-300">—</span>}</td>
                    </tr>
                  );
                })}
                {jaNaBase.map(d => (
                  <tr key={'dup-' + keyOf(d)} className="border-b border-gray-50 opacity-50 bg-gray-50/50">
                    <td className="p-2"><input type="checkbox" disabled /></td>
                    <td className="p-2 text-gray-600">{d.nome_completo}</td>
                    <td className="p-2 text-gray-500">{d.cargo || '—'}</td>
                    <td className="p-2 text-gray-500">{d.empresa_nome || '—'}</td>
                    <td className="p-2 text-gray-400">{[d.cidade, d.estado].filter(Boolean).join(', ') || '—'}</td>
                    <td className="p-2"><span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-200 text-gray-500">já na base</span></td>
                    <td className="p-2">{d.linkedin_url ? <span className="text-gray-300">in</span> : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Barra de ação */}
          <div className="flex justify-between items-center mt-4 bg-gray-50 border border-gray-200 rounded-lg px-4 py-3">
            <span className="text-sm text-gray-700"><b>{selecionadosArr.length}</b> decisores selecionados</span>
            <div className="flex gap-2">
              <button onClick={enriquecer} disabled={enriquecendo || selecionadosArr.length === 0}
                className="bg-white border border-gray-200 hover:bg-gray-50 disabled:opacity-50 text-gray-700 rounded-lg px-4 py-2 text-sm font-semibold">
                <i className={`fa-solid ${enriquecendo ? 'fa-spinner fa-spin' : 'fa-envelope'} mr-2`}></i>
                {enriquecendo ? 'Enriquecendo…' : 'Enriquecer e-mail (Apollo)'}
              </button>
              <button onClick={salvar} disabled={salvando || selecionadosArr.length === 0}
                className="bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white rounded-lg px-4 py-2 text-sm font-semibold">
                <i className={`fa-solid ${salvando ? 'fa-spinner fa-spin' : 'fa-floppy-disk'} mr-2`}></i>
                {salvando ? 'Salvando…' : 'Salvar em Meus Prospects'}
              </button>
            </div>
          </div>
          <p className="text-gray-400 text-[11px] mt-2">
            O enriquecimento respeita o limite Apollo (até {25} por clique). Itens salvos entram em <b>prospect_leads</b> com <b>motor = apollo</b> e aparecem em <b>Meus Prospects Salvos</b>.
          </p>
        </div>
      )}
    </div>
  );
};

export default ProspeccaoEmLoteTab;
