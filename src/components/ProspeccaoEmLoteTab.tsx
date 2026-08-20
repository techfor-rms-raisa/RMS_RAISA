/**
 * ProspeccaoEmLoteTab.tsx — Aba "Prospecção em Lote" do Prospect Engine
 *
 * v2.0 (20/08/2026) — TROCA DE MOTOR: Apollo → Gemini (o mesmo do Nova Busca)
 *
 *   Motivo: o Apollo procura a empresa no banco dele por domínio corporativo
 *   e não tem as casas de aposta indexadas pelos domínios de marketing
 *   (.bet.br) → voltava 0. O Nova Busca usa Gemini + Google Search Grounding,
 *   que acha decisores na web pública independentemente do formato do domínio
 *   (validado: Betano/bet365/Superbet retornaram decisores).
 *
 *   Esta aba agora é um ORQUESTRADOR de front-end sobre os endpoints que já
 *   funcionam, chamados uma vez por empresa da planilha:
 *     • /api/prospect-gemini-search   (descobre decisores por domínio)
 *     • /api/prospect-resolve-domain  (resolve domínio quando falta na planilha)
 *     • /api/prospect-hunter-enrich   (e-mail, opcional, mode=email_finder)
 *     • /api/prospect-save            (grava em Meus Prospects, fonte=gemini)
 *
 *   Sem backend novo. Os endpoints Apollo (prospect-linkedin-lote,
 *   lib/apollo-search, prospect-linkedin-enrich) ficam ÓRFÃOS e podem ser
 *   removidos (limpeza pendente de aprovação).
 *
 *   Trade-off honesto: cada empresa leva ~15–30s no Gemini. Listas grandes
 *   levam minutos; roda com concorrência 3 e barra de progresso. Respeita o
 *   cap diário de chamadas Gemini do projeto.
 *
 * Acesso restrito (validação): Admin e Messias Vieira (id=2) — gate na
 * visibilidade da aba (ProspectSearchPage). Os endpoints usados aqui são os
 * mesmos do Nova Busca, já disponíveis ao usuário.
 *
 * Caminho: src/components/ProspeccaoEmLoteTab.tsx
 */

import React, { useCallback, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';

interface CurrentUser { id?: number; nome_usuario?: string; tipo_usuario?: string; }
interface Props { currentUser: CurrentUser | null | undefined; onSalvou?: () => void; }

interface EmpresaInput { nome: string; dominio?: string | null; }

interface Decisor {
  gemini_id?: string | null;
  nome_completo: string;
  primeiro_nome?: string;
  ultimo_nome?: string;
  cargo?: string;
  nivel?: string;
  senioridade?: string;
  email?: string | null;
  email_status?: string | null;
  linkedin_url?: string | null;
  empresa_nome?: string;
  empresa_dominio?: string | null;
  empresa_setor?: string | null;
  cidade?: string | null;
  estado?: string | null;
  pais?: string | null;
  departamentos?: string[];
  fonte?: string;
  enriquecido?: boolean;
  _key?: string;
}

interface DiagLinha {
  nome: string; dominio: string | null; encontrados: number;
  status: 'ok' | 'sem_dominio' | 'sem_resultado' | 'erro';
}

// Mesmas chaves do Nova Busca (prospect-gemini-search)
const DEPARTAMENTOS = [
  { key: 'ti_tecnologia',         label: 'TI / Tecnologia',         default: true  },
  { key: 'compras_procurement',   label: 'Compras / Procurement',   default: true  },
  { key: 'governanca_compliance', label: 'Governança / Compliance', default: true  },
  { key: 'infraestrutura',        label: 'Infraestrutura',          default: false },
  { key: 'diretoria_clevel',      label: 'Diretoria / C-Level',     default: false },
  { key: 'rh_recursos_humanos',   label: 'RH / Recursos Humanos',   default: false },
  { key: 'comercial_vendas',      label: 'Comercial / Vendas',      default: false },
  { key: 'financeiro',            label: 'Financeiro',              default: false },
];
const SENIORIDADES = [
  { key: 'c_level', label: 'C-Level' }, { key: 'vp', label: 'VP' },
  { key: 'diretor', label: 'Diretor' }, { key: 'gerente', label: 'Gerente' },
  { key: 'coordenador', label: 'Coordenador' }, { key: 'superintendente', label: 'Superintendente' },
];

const CONCORRENCIA = 3;
const keyOf = (d: Decisor, empresaFallback: string) =>
  d.linkedin_url || `${d.nome_completo}|${d.empresa_nome || empresaFallback}`;

// Lê o .xlsx no navegador e extrai empresa + domínio (colunas flexíveis)
function extrairEmpresas(rows: Record<string, any>[]): EmpresaInput[] {
  if (rows.length === 0) return [];
  const chaves = Object.keys(rows[0]);
  const acha = (re: RegExp) => chaves.find(k => re.test(k));
  const colNome = acha(/empresa|raz[aã]o|company|nome|cliente/i) || chaves[0];
  const colDom  = acha(/dom[ií]nio|domain|site|website|url/i);
  const out: EmpresaInput[] = [];
  for (const r of rows) {
    const nome = String(r[colNome] ?? '').trim();
    if (!nome) continue;
    const dom = colDom ? String(r[colDom] ?? '').trim().toLowerCase() : '';
    out.push({ nome, dominio: dom || null });
  }
  const vistos = new Set<string>();
  return out.filter(e => { const k = e.nome.toLowerCase(); if (vistos.has(k)) return false; vistos.add(k); return true; });
}

// Pool de concorrência simples
async function runPool<T>(items: T[], worker: (item: T) => Promise<void>, concurrency: number, onTick?: () => void) {
  let idx = 0;
  const run = async () => {
    while (idx < items.length) {
      const cur = idx++;
      try { await worker(items[cur]); } catch { /* isolado por item */ }
      onTick?.();
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, run));
}

const ProspeccaoEmLoteTab: React.FC<Props> = ({ currentUser, onSalvou }) => {
  const fileRef = useRef<HTMLInputElement>(null);

  const [empresas, setEmpresas] = useState<EmpresaInput[]>([]);
  const [nomeArquivo, setNomeArq] = useState('');
  const [depts, setDepts] = useState<string[]>(DEPARTAMENTOS.filter(d => d.default).map(d => d.key));
  const [seniors, setSeniors] = useState<string[]>(['c_level', 'vp', 'diretor', 'gerente']);
  const [maxPorEmpresa, setMaxPorEmpresa] = useState(25);

  const [buscando, setBuscando] = useState(false);
  const [progresso, setProgresso] = useState<{ feitas: number; total: number } | null>(null);
  const [resultados, setResultados] = useState<Decisor[]>([]);
  const [diagnostico, setDiag] = useState<DiagLinha[]>([]);
  const [selecionados, setSel] = useState<Set<string>>(new Set());

  const [enriquecendo, setEnriquecendo] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [toast, setToast] = useState<{ tipo: 'ok' | 'erro' | 'info'; msg: string } | null>(null);
  const flash = (tipo: 'ok' | 'erro' | 'info', msg: string) => { setToast({ tipo, msg }); window.setTimeout(() => setToast(null), 6000); };

  const onArquivo = useCallback(async (file: File) => {
    try {
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const rows = XLSX.utils.sheet_to_json<Record<string, any>>(wb.Sheets[wb.SheetNames[0]], { defval: '' });
      const emp = extrairEmpresas(rows);
      if (emp.length === 0) { flash('erro', 'Não encontrei empresas na planilha (procuro coluna de nome/empresa).'); return; }
      setEmpresas(emp); setNomeArq(file.name);
      setResultados([]); setDiag([]); setSel(new Set());
      flash('ok', `${emp.length} empresas detectadas em ${file.name}.`);
    } catch (e: any) { flash('erro', `Falha ao ler a planilha: ${e?.message || 'arquivo inválido'}`); }
  }, []);

  const buscar = useCallback(async () => {
    if (!currentUser?.id) { flash('erro', 'Usuário não identificado.'); return; }
    if (empresas.length === 0) { flash('erro', 'Importe uma lista de empresas primeiro.'); return; }

    setBuscando(true);
    setResultados([]); setDiag([]); setSel(new Set());
    const acum: Decisor[] = [];
    const vistos = new Set<string>();
    const diag: DiagLinha[] = [];
    let feitas = 0;

    await runPool(empresas, async (emp) => {
      // 1) resolver domínio se faltar na planilha
      let dominio = (emp.dominio || '').trim();
      if (!dominio) {
        try {
          const rd = await fetch('/api/prospect-resolve-domain', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ empresa_nome: emp.nome }),
          });
          const dj = await rd.json();
          dominio = (dj?.dominio || '').trim();
        } catch { /* segue sem domínio */ }
      }
      if (!dominio) { diag.push({ nome: emp.nome, dominio: null, encontrados: 0, status: 'sem_dominio' }); return; }

      // 2) motor que funciona — mesmo payload do Nova Busca
      try {
        const resp = await fetch('/api/prospect-gemini-search', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            domain: dominio, empresa_nome: emp.nome,
            departamentos: depts, senioridades: seniors, max_resultados: maxPorEmpresa,
          }),
        });
        const data = await resp.json();
        const found: Decisor[] = (data?.resultados || []);
        for (const r of found) {
          const key = keyOf(r, emp.nome);
          if (vistos.has(key)) continue;
          vistos.add(key);
          acum.push({ ...r, empresa_dominio: r.empresa_dominio || dominio, empresa_nome: r.empresa_nome || emp.nome, _key: key });
        }
        diag.push({ nome: emp.nome, dominio, encontrados: found.length, status: found.length ? 'ok' : 'sem_resultado' });
      } catch {
        diag.push({ nome: emp.nome, dominio, encontrados: 0, status: 'erro' });
      }
    }, CONCORRENCIA, () => {
      feitas++;
      setProgresso({ feitas, total: empresas.length });
      setResultados([...acum]); setDiag([...diag]);
    });

    // pré-seleciona tudo que foi encontrado
    setSel(new Set(acum.map(d => d._key!)));
    setBuscando(false); setProgresso(null);
    flash('ok', `${acum.length} decisores encontrados em ${empresas.length} empresas.`);
  }, [currentUser, empresas, depts, seniors, maxPorEmpresa]);

  const toggle = (d: Decisor) => setSel(prev => { const n = new Set(prev); const k = d._key!; n.has(k) ? n.delete(k) : n.add(k); return n; });
  const toggleTodos = () => setSel(prev => prev.size === resultados.length ? new Set() : new Set(resultados.map(d => d._key!)));
  const todosSel = resultados.length > 0 && selecionados.size === resultados.length;
  const selecionadosArr = useMemo(() => resultados.filter(d => selecionados.has(d._key!)), [resultados, selecionados]);

  const enriquecer = useCallback(async () => {
    if (!currentUser?.id || selecionadosArr.length === 0) return;
    setEnriquecendo(true);
    let achou = 0;
    await runPool(selecionadosArr, async (d) => {
      const dominio = (d.empresa_dominio || '').trim();
      if (!dominio || d.email) return;
      try {
        const res = await fetch('/api/prospect-hunter-enrich', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode: 'email_finder', domain: dominio, primeiro_nome: d.primeiro_nome, ultimo_nome: d.ultimo_nome }),
        });
        const j = await res.json();
        const email = j?.email || j?.data?.email || null;
        if (email) {
          achou++;
          setResultados(prev => prev.map(x => x._key === d._key ? { ...x, email, email_status: j?.email_status || 'found', enriquecido: true } : x));
        }
      } catch { /* isolado */ }
    }, CONCORRENCIA);
    setEnriquecendo(false);
    flash(achou > 0 ? 'ok' : 'info', `${achou} e-mail(s) encontrado(s) via Hunter.io.`);
  }, [currentUser, selecionadosArr]);

  const salvar = useCallback(async () => {
    if (!currentUser?.id || selecionadosArr.length === 0) return;
    setSalvando(true);
    try {
      const prospects = selecionadosArr.map(p => ({
        gemini_id: p.gemini_id || null, apollo_id: null, snovio_id: null,
        nome_completo: p.nome_completo, primeiro_nome: p.primeiro_nome, ultimo_nome: p.ultimo_nome,
        cargo: p.cargo, email: p.email ?? null, email_status: p.email_status ?? null,
        linkedin_url: p.linkedin_url ?? null, foto_url: null,
        empresa_nome: p.empresa_nome, empresa_dominio: p.empresa_dominio || '',
        empresa_setor: p.empresa_setor ?? null, empresa_porte: null, empresa_linkedin: null, empresa_website: null,
        cidade: p.cidade ?? null, estado: p.estado ?? null, pais: p.pais ?? null,
        senioridade: p.senioridade || p.nivel || null, departamentos: p.departamentos || [],
        fonte: 'gemini' as const, enriquecido: !!p.enriquecido,
      }));
      const resp = await fetch('/api/prospect-save', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prospects, user_id: currentUser.id, reservado_por: currentUser.id,
          filtros_busca: { origem: 'prospeccao_lote', departamentos: depts, senioridades: seniors, motor: 'gemini+hunter' },
        }),
      });
      const data = await resp.json();
      if (!resp.ok || !data.success) { flash('erro', data?.error || 'Erro ao salvar.'); return; }
      const salvosKeys = new Set(selecionadosArr.map(d => d._key));
      setResultados(prev => prev.filter(d => !salvosKeys.has(d._key)));
      setSel(new Set());
      flash('ok', `${data.salvos} prospect(s) salvo(s) em Meus Prospects.`);
      onSalvou?.();
    } catch (e: any) { flash('erro', `Erro ao salvar: ${e?.message || 'desconhecido'}`); }
    finally { setSalvando(false); }
  }, [currentUser, selecionadosArr, depts, seniors, onSalvou]);

  const semResultado = diagnostico.filter(d => d.status === 'sem_resultado' || d.status === 'sem_dominio' || d.status === 'erro');

  return (
    <div className="space-y-4">
      <div className="inline-flex items-center gap-2 bg-amber-50 text-amber-800 border border-amber-300 rounded-full px-3 py-1 text-xs">
        <i className="fa-solid fa-lock"></i> Acesso restrito · Administrador e Messias Vieira (em validação)
      </div>

      {toast && (
        <div className={`px-4 py-2 rounded-lg text-sm border ${
          toast.tipo === 'ok' ? 'bg-green-50 border-green-300 text-green-800'
          : toast.tipo === 'erro' ? 'bg-red-50 border-red-300 text-red-800'
          : 'bg-blue-50 border-blue-300 text-blue-800'}`}>{toast.msg}</div>
      )}

      {/* STEP 1 — Upload */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <div className="flex items-center gap-2 mb-3">
          <span className="w-6 h-6 rounded-full bg-slate-800 text-white text-xs font-bold flex items-center justify-center">1</span>
          <h3 className="font-semibold text-gray-800">Importar lista de empresas</h3>
        </div>
        <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center bg-gray-50 cursor-pointer hover:border-blue-400 transition-colors"
          onClick={() => fileRef.current?.click()}
          onDragOver={e => e.preventDefault()}
          onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) onArquivo(f); }}>
          <i className="fa-solid fa-file-excel text-3xl text-gray-400"></i>
          <p className="text-gray-500 text-xs mt-2 mb-1">Arraste a planilha <b>.xlsx</b> aqui, ou clique para selecionar</p>
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) onArquivo(f); }} />
        </div>
        {empresas.length > 0 && (
          <div className="mt-3 inline-flex items-center gap-2 bg-green-50 text-green-800 border border-green-200 rounded-lg px-3 py-2 text-xs font-semibold">
            <i className="fa-solid fa-circle-check"></i> {empresas.length} empresas detectadas em <b>{nomeArquivo}</b>
          </div>
        )}
        <p className="text-gray-400 text-[11px] mt-2">Planilha lida no navegador (SheetJS). Colunas: <b>empresa</b> e <b>domínio</b> (opcional — se faltar, o domínio é resolvido pelo Gemini).</p>
      </div>

      {/* STEP 2 — Filtros */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <span className="w-6 h-6 rounded-full bg-slate-800 text-white text-xs font-bold flex items-center justify-center">2</span>
          <h3 className="font-semibold text-gray-800">Quem procurar</h3>
        </div>
        <div className="flex flex-wrap gap-8">
          <div>
            <div className="text-[11px] uppercase tracking-wide text-gray-400 mb-2">Departamentos <span className="normal-case">(vazio = todos)</span></div>
            {DEPARTAMENTOS.map(d => (
              <label key={d.key} className="flex items-center gap-2 py-1 text-sm cursor-pointer">
                <input type="checkbox" className="accent-blue-600 w-4 h-4" checked={depts.includes(d.key)}
                  onChange={() => setDepts(prev => prev.includes(d.key) ? prev.filter(x => x !== d.key) : [...prev, d.key])} />
                {d.label}
              </label>
            ))}
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wide text-gray-400 mb-2">Senioridade</div>
            <div className="flex flex-wrap gap-2 max-w-xs">
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
          </div>
          <div className="max-w-sm">
            <div className="text-[11px] uppercase tracking-wide text-gray-400 mb-2">Por empresa</div>
            <label className="flex items-center gap-2 text-sm">
              Até
              <input type="number" min={1} max={50} value={maxPorEmpresa}
                onChange={e => setMaxPorEmpresa(Math.min(50, Math.max(1, Number(e.target.value) || 25)))}
                className="w-16 px-2 py-1 border border-gray-200 rounded" /> decisores
            </label>
            <div className="mt-3 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-xs text-blue-800">
              🔎 Motor <b>Gemini + Google</b> (mesmo do Nova Busca). Cada empresa leva ~15–30s; listas grandes levam alguns minutos.
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
          <div className="text-xs text-gray-500 mb-2">Pesquisando empresas — <b>{progresso.feitas} de {progresso.total}</b> concluídas…</div>
          <div className="h-2 rounded-full bg-gray-200 overflow-hidden">
            <div className="h-full bg-blue-600 transition-all" style={{ width: `${(progresso.feitas / progresso.total) * 100}%` }} />
          </div>
        </div>
      )}

      {/* STEP 3 — Resultados */}
      {resultados.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <span className="w-6 h-6 rounded-full bg-slate-800 text-white text-xs font-bold flex items-center justify-center">3</span>
            <h3 className="font-semibold text-gray-800">Decisores encontrados</h3>
          </div>

          <div className="flex flex-wrap items-center gap-6 mb-4">
            <div className="flex flex-col"><b className="text-xl text-blue-600">{resultados.length}</b><span className="text-[11px] uppercase tracking-wide text-gray-400">Encontrados</span></div>
            <div className="flex flex-col"><b className="text-xl text-slate-800">{selecionadosArr.length}</b><span className="text-[11px] uppercase tracking-wide text-gray-400">Selecionados</span></div>
          </div>

          {semResultado.length > 0 && (
            <div className="text-xs bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3 text-amber-800">
              <b>{semResultado.length} empresa(s) sem resultado:</b> {semResultado.slice(0, 10).map(d => d.nome).join(' · ')}{semResultado.length > 10 ? ' …' : ''}
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-gray-400 border-b border-gray-200">
                  <th className="p-2 w-8"><input type="checkbox" checked={todosSel} onChange={toggleTodos} /></th>
                  <th className="p-2">Nome</th><th className="p-2">Cargo</th><th className="p-2">Empresa</th>
                  <th className="p-2">E-mail</th><th className="p-2 w-16">LinkedIn</th>
                </tr>
              </thead>
              <tbody>
                {resultados.map(d => (
                  <tr key={d._key} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="p-2"><input type="checkbox" checked={selecionados.has(d._key!)} onChange={() => toggle(d)} /></td>
                    <td className="p-2 font-medium text-gray-800">{d.nome_completo}</td>
                    <td className="p-2 text-gray-600">{d.cargo || '—'}</td>
                    <td className="p-2 text-gray-600">{d.empresa_nome || '—'}</td>
                    <td className="p-2">{d.email ? <span className="text-green-700">{d.email}</span> : <span className="text-gray-300">—</span>}</td>
                    <td className="p-2">{d.linkedin_url
                      ? <a href={d.linkedin_url} target="_blank" rel="noreferrer" className="inline-flex w-6 h-6 rounded items-center justify-center text-white font-bold text-[11px]" style={{ background: '#0A66C2' }}>in</a>
                      : <span className="text-gray-300">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex justify-between items-center mt-4 bg-gray-50 border border-gray-200 rounded-lg px-4 py-3">
            <span className="text-sm text-gray-700"><b>{selecionadosArr.length}</b> decisores selecionados</span>
            <div className="flex gap-2">
              <button onClick={enriquecer} disabled={enriquecendo || selecionadosArr.length === 0}
                className="bg-white border border-gray-200 hover:bg-gray-50 disabled:opacity-50 text-gray-700 rounded-lg px-4 py-2 text-sm font-semibold">
                <i className={`fa-solid ${enriquecendo ? 'fa-spinner fa-spin' : 'fa-envelope'} mr-2`}></i>
                {enriquecendo ? 'Buscando e-mails…' : 'Buscar e-mails (Hunter.io)'}
              </button>
              <button onClick={salvar} disabled={salvando || selecionadosArr.length === 0}
                className="bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white rounded-lg px-4 py-2 text-sm font-semibold">
                <i className={`fa-solid ${salvando ? 'fa-spinner fa-spin' : 'fa-floppy-disk'} mr-2`}></i>
                {salvando ? 'Salvando…' : 'Salvar em Meus Prospects'}
              </button>
            </div>
          </div>
          <p className="text-gray-400 text-[11px] mt-2">Buscar e-mails consome créditos Hunter.io. Salvos entram em <b>prospect_leads</b> (fonte <b>gemini</b>) e aparecem em <b>Meus Prospects Salvos</b>.</p>
        </div>
      )}
    </div>
  );
};

export default ProspeccaoEmLoteTab;
