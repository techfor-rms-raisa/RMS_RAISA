/**
 * EmpresaCombobox.tsx — Seletor de empresa com busca server-side e criação inline
 *
 * Caminho: src/components/crm/base-leads/EmpresaCombobox.tsx
 * Versão: 1.0 (07/08/2026)
 *
 * PROBLEMA QUE RESOLVE (reportado por Messias em 07/08/2026):
 *   O campo "Empresa" do LeadFormModal era um <select> alimentado pela prop
 *   `empresas`, que vem do hook useEmpresas — PAGINADO (limit=20). O dropdown
 *   portanto listava apenas a página atualmente carregada na aba Empresas,
 *   dando a impressão de "lista parcial". Além disso, não havia caminho para
 *   cadastrar uma empresa nova sem abandonar o formulário do lead — o que
 *   produzia leads órfãos (`empresa_id = null`) mesmo com e-mail corporativo
 *   válido, quebrando qualquer cruzamento por empresa (ex.: módulo Espionagem).
 *
 * SOLUÇÃO (definitiva — Regras 13/14):
 *   1. Busca server-side com debounce de 300ms via GET listar_empresas
 *      (parâmetros `busca` + `limit`), independente da paginação da listagem.
 *      O backend já pesquisa por nome OU domínio (crm-leads.ts v1.x, linha
 *      ~1591: `.or('nome.ilike.%X%,dominio.ilike.%X%')`).
 *   2. Criação inline via POST criar_empresa, com o DOMÍNIO PRÉ-PREENCHIDO
 *      a partir do e-mail do lead — garante que `dominio` nasça correto.
 *   3. Resolução do rótulo por `detalhe_empresa&id=X` quando a empresa
 *      vinculada não está no cache local (caso clássico do bug original).
 *
 * Contratos do backend (verificados em api/crm-leads.ts antes de codificar):
 *   GET  ?action=listar_empresas&busca=X&limit=N  → { success, empresas[], total }
 *   GET  ?action=detalhe_empresa&id=X             → { success, empresa }
 *   POST  action=criar_empresa                    → 201 { success, empresa }
 *         body: { nome*, dominio, setor, criado_por* }  (409 se domínio duplicado,
 *         retornando `empresa_existente` — tratado aqui com vínculo automático)
 *
 * Não altera o contrato do LeadFormModal: continua recebendo/emitindo
 * `empresa_id: number | null`.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useCrmApi } from '../shared/hooks/useCrmApi';
import { SETORES } from '../types/crm.constants';
import type { Empresa } from '../types/crm.types';

// ════════════════════════════════════════════════════════════
// PROPS
// ════════════════════════════════════════════════════════════

export interface EmpresaComboboxProps {
  /** Empresa atualmente vinculada (null = "Sem empresa"). */
  value: number | null;
  /** Emite o novo empresa_id (null ao limpar). */
  onChange: (empresaId: number | null) => void;
  /**
   * Cache local de empresas já carregadas (prop `empresas` do LeadFormModal).
   * Usado apenas para resolver o rótulo sem ida ao servidor quando possível.
   */
  empresasCache?: Empresa[];
  /**
   * E-mail do lead em edição. Usado para pré-preencher o domínio ao criar
   * uma empresa nova (ex.: roberto@cvccorp.com.br → cvccorp.com.br).
   */
  emailLead?: string;
  /** Nome do usuário logado — vai em `criado_por` (padrão do BaseLeadsPage). */
  criadoPor: string;
  disabled?: boolean;
}

// ════════════════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════════════════

/** Extrai o domínio de um e-mail, ignorando provedores públicos. */
function dominioDoEmail(email?: string): string {
  if (!email || !email.includes('@')) return '';
  const dom = email.split('@')[1]?.toLowerCase().trim() || '';
  const PUBLICOS = [
    'gmail.com', 'hotmail.com', 'outlook.com', 'yahoo.com', 'yahoo.com.br',
    'live.com', 'icloud.com', 'bol.com.br', 'uol.com.br', 'terra.com.br',
    'globo.com', 'me.com', 'msn.com', 'protonmail.com',
  ];
  return PUBLICOS.includes(dom) ? '' : dom;
}

// ════════════════════════════════════════════════════════════
// COMPONENTE
// ════════════════════════════════════════════════════════════

const EmpresaCombobox: React.FC<EmpresaComboboxProps> = ({
  value,
  onChange,
  empresasCache = [],
  emailLead,
  criadoPor,
  disabled = false,
}) => {
  const api = useCrmApi('/api/crm-leads');

  const [aberto, setAberto] = useState(false);
  const [termo, setTermo] = useState('');
  const [resultados, setResultados] = useState<Empresa[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [selecionada, setSelecionada] = useState<Empresa | null>(null);

  // Criação inline
  const [criando, setCriando] = useState(false);
  const [novoNome, setNovoNome] = useState('');
  const [novoDominio, setNovoDominio] = useState('');
  const [novoSetor, setNovoSetor] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const wrapRef = useRef<HTMLDivElement | null>(null);
  const debounceRef = useRef<number | null>(null);

  const dominioSugerido = useMemo(() => dominioDoEmail(emailLead), [emailLead]);

  // ── Resolve o rótulo da empresa vinculada ────────────────
  useEffect(() => {
    let cancelado = false;

    if (value == null) { setSelecionada(null); return; }
    if (selecionada?.id === value) return;

    const noCache = empresasCache.find(e => e.id === value);
    if (noCache) { setSelecionada(noCache); return; }

    // Não está no cache (o bug original): busca no servidor.
    (async () => {
      const r = await api.get<{ success: boolean; empresa: Empresa }>(
        'detalhe_empresa', { id: value }
      );
      if (!cancelado && r.ok && r.data?.empresa) setSelecionada(r.data.empresa);
    })();

    return () => { cancelado = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, empresasCache]);

  // ── Busca server-side com debounce ───────────────────────
  const buscar = useCallback(async (q: string) => {
    setBuscando(true);
    const r = await api.get<{ success: boolean; empresas: Empresa[] }>(
      'listar_empresas', { busca: q || undefined, limit: 50, page: 1 }
    );
    setBuscando(false);
    if (r.ok && r.data?.empresas) setResultados(r.data.empresas);
    else setResultados([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!aberto) return;
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => buscar(termo.trim()), 300);
    return () => { if (debounceRef.current) window.clearTimeout(debounceRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [termo, aberto]);

  // ── Fecha ao clicar fora ─────────────────────────────────
  useEffect(() => {
    const onDocClick = (ev: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(ev.target as Node)) {
        setAberto(false);
        if (!salvando) setCriando(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [salvando]);

  // ── Ações ────────────────────────────────────────────────
  const abrirBusca = () => {
    if (disabled) return;
    setAberto(true);
    setTermo('');
    setErro(null);
    buscar('');
  };

  const escolher = (e: Empresa) => {
    setSelecionada(e);
    onChange(e.id);
    setAberto(false);
    setCriando(false);
  };

  const limpar = () => {
    setSelecionada(null);
    onChange(null);
    setErro(null);
  };

  const abrirCriacao = () => {
    setNovoNome(termo.trim());
    setNovoDominio(dominioSugerido);
    setNovoSetor('');
    setErro(null);
    setCriando(true);
    setAberto(false);
  };

  const criarEVincular = async () => {
    const nome = novoNome.trim();
    if (!nome) { setErro('Nome da empresa é obrigatório'); return; }

    const dom = novoDominio.trim().toLowerCase()
      .replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
    if (dom && (!dom.includes('.') || dom.includes(' '))) {
      setErro('Domínio inválido (use o formato empresa.com.br)');
      return;
    }

    setSalvando(true);
    setErro(null);
    const r = await api.post<{
      success: boolean; empresa?: Empresa;
      error?: string; empresa_existente?: { id: number; nome: string };
    }>('criar_empresa', {
      nome,
      dominio: dom || null,
      setor: novoSetor || null,
      origem: 'lead_form',
      criado_por: criadoPor,
    });
    setSalvando(false);

    // 409 — domínio já cadastrado: vincula à existente (não força retrabalho)
    if (r.status === 409 && r.data?.empresa_existente) {
      const ex = r.data.empresa_existente;
      setSelecionada({ id: ex.id, nome: ex.nome } as Empresa);
      onChange(ex.id);
      setCriando(false);
      setErro(null);
      return;
    }

    if (!r.ok || !r.data?.empresa) {
      setErro(r.data?.error || r.error || 'Falha ao criar empresa');
      return;
    }

    escolher(r.data.empresa);
    setCriando(false);
  };

  // ════════════════════════════════════════════════════════
  // RENDER
  // ════════════════════════════════════════════════════════
  return (
    <div ref={wrapRef} className="relative">
      {/* ── Estado fechado ── */}
      {!aberto && !criando && (
        selecionada ? (
          <div className="w-full px-3 py-2 border rounded-lg text-sm bg-gray-50 flex items-center gap-2">
            <span className="font-medium text-gray-800">{selecionada.nome}</span>
            {selecionada.dominio && (
              <span className="text-xs text-gray-500">{selecionada.dominio}</span>
            )}
            {!disabled && (
              <div className="ml-auto flex items-center gap-2">
                <button type="button" onClick={abrirBusca}
                  className="text-xs text-indigo-600 hover:text-indigo-800">trocar</button>
                <button type="button" onClick={limpar} title="Remover empresa"
                  className="text-gray-400 hover:text-red-600">✕</button>
              </div>
            )}
          </div>
        ) : (
          <button type="button" onClick={abrirBusca} disabled={disabled}
            className="w-full px-3 py-2 border rounded-lg text-sm text-left text-gray-400 hover:border-indigo-400 disabled:bg-gray-100">
            <i className="fa-solid fa-magnifying-glass mr-2 text-gray-300" />
            Buscar empresa…
          </button>
        )
      )}

      {/* ── Busca aberta ── */}
      {aberto && (
        <div className="relative">
          <input
            autoFocus
            value={termo}
            onChange={(e) => setTermo(e.target.value)}
            placeholder="Digite o nome ou domínio da empresa…"
            className="w-full px-3 py-2 border rounded-t-lg text-sm focus:ring-2 focus:ring-indigo-400 focus:outline-none"
          />
          <div className="absolute z-20 left-0 right-0 border border-t-0 rounded-b-lg bg-white shadow-lg max-h-56 overflow-auto">
            {buscando && (
              <div className="px-3 py-2 text-xs text-gray-500">
                <i className="fa-solid fa-spinner fa-spin mr-2" />Buscando na base…
              </div>
            )}

            {!buscando && resultados.length === 0 && (
              <div className="px-3 py-2 text-xs text-gray-400 italic">
                Nenhuma empresa encontrada
              </div>
            )}

            {!buscando && resultados.map((e) => (
              <button
                key={e.id}
                type="button"
                onClick={() => escolher(e)}
                className="w-full text-left px-3 py-2 text-sm border-b hover:bg-indigo-50"
              >
                <span className="font-medium text-gray-800">{e.nome}</span>
                <span className="block text-xs text-gray-500">
                  {[e.dominio, e.setor].filter(Boolean).join(' · ') || '—'}
                </span>
              </button>
            ))}

            <button
              type="button"
              onClick={abrirCriacao}
              className="w-full text-left px-3 py-2 text-sm font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100"
            >
              ＋ Cadastrar nova empresa{termo.trim() ? ` “${termo.trim()}”` : ''}
            </button>
          </div>
        </div>
      )}

      {/* ── Criação inline ── */}
      {criando && (
        <div className="border-2 border-indigo-400 rounded-lg p-3 bg-indigo-50 space-y-2">
          <h4 className="text-xs font-bold text-indigo-800">＋ Nova empresa</h4>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Nome *</label>
            <input
              autoFocus
              value={novoNome}
              onChange={(e) => setNovoNome(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-indigo-400 focus:outline-none"
              placeholder="Ex.: CVC Corp"
            />
          </div>

          <div className="flex gap-2">
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-700 mb-1">Domínio</label>
              <input
                value={novoDominio}
                onChange={(e) => setNovoDominio(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-indigo-400 focus:outline-none"
                placeholder="empresa.com.br"
              />
              {dominioSugerido && novoDominio === dominioSugerido && (
                <p className="text-[10px] text-green-700 mt-0.5">
                  ✓ pré-preenchido pelo e-mail do lead
                </p>
              )}
            </div>
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-700 mb-1">Setor</label>
              <select
                value={novoSetor}
                onChange={(e) => setNovoSetor(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-indigo-400 focus:outline-none"
              >
                <option value="">— selecione —</option>
                {SETORES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>

          {erro && <p className="text-xs text-red-600">{erro}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={() => { setCriando(false); setErro(null); }}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg border bg-white text-gray-600 hover:bg-gray-50">
              Cancelar
            </button>
            <button type="button" onClick={criarEVincular} disabled={salvando}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50">
              {salvando ? 'Criando…' : 'Criar e vincular'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default EmpresaCombobox;
