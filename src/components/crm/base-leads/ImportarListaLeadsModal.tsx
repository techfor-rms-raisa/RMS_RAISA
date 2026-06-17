/**
 * ImportarListaLeadsModal.tsx — Modal de upload da Sub-fase 3.C
 *
 * Caminho: src/components/crm/base-leads/ImportarListaLeadsModal.tsx
 * Versão: 1.0 (Sub-fase 3.C "Importar Lista de Leads" — 17/06/2026)
 *
 * Fluxo de 4 telas (estado interno):
 *   1. ESCOLHER    — usuário arrasta/seleciona arquivo .xlsx ou .csv
 *   2. PREVIEW     — mostra linhas parseadas com validação (até 50)
 *   3. IMPORTANDO  — barra de progresso (importarLote do hook)
 *   4. RESULTADO   — sumário final + lista de erros (se houver)
 *
 * Dependência runtime: pacote `xlsx` (SheetJS). Instalar com:
 *   npm install xlsx
 *
 * Validação de cada linha (client-side, antes do submit):
 *   • OBRIGATÓRIOS:  responsavel, nome_contato, email, empresa_nome,
 *                    empresa_dominio, vertical
 *   • OPCIONAIS:     cargo, linkedin_url, cnpj, cidade, estado
 *   • responsavel: deve bater (case-insensitive) com `nome_usuario` OU
 *                  `email_usuario` de algum item da lista de responsáveis
 *                  (GC/SDR — do hook useResponsaveis).
 *   • Limite: 50 linhas por upload (excedente é rejeitado com erro).
 *
 * Após submit, chama hook.importarLote(leads, onProgresso).
 */

import React, { useCallback, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import type { ResponsavelLite } from '../types/crm.types';
import type {
  LeadParaImportar,
  ProgressoImportacao,
  ResultadoImportacao,
} from '../shared/hooks/useLeadsImportados';

// ════════════════════════════════════════════════════════════
// PROPS
// ════════════════════════════════════════════════════════════

export interface ImportarListaLeadsModalProps {
  aberto: boolean;
  responsaveis: ResponsavelLite[];
  cotaResidual: number;
  onImportar: (
    leads: LeadParaImportar[],
    onProgresso?: (p: ProgressoImportacao) => void
  ) => Promise<ResultadoImportacao>;
  onConcluido: (resultado: ResultadoImportacao) => void;
  onFechar: () => void;
}

// ════════════════════════════════════════════════════════════
// TIPOS INTERNOS
// ════════════════════════════════════════════════════════════

type Etapa = 'escolher' | 'preview' | 'importando' | 'resultado';

interface LinhaParseada {
  linha: number;                  // número da linha (1-based, sem header)
  bruto: Record<string, string>;  // valores originais como vieram do arquivo
  erros: string[];
  responsavelId: number | null;   // resolvido via lookup
  // Mapeamento normalizado (para passar pro hook quando válida)
  campos?: LeadParaImportar;
}

// ════════════════════════════════════════════════════════════
// CONSTANTES
// ════════════════════════════════════════════════════════════

const LIMITE_LINHAS = 50;

// Headers aceitos por campo (case-insensitive, sem acento)
const ALIAS_HEADERS: Record<string, string[]> = {
  responsavel:     ['responsavel', 'responsavel (gc/sdr)', 'responsavel gc sdr', 'responsável'],
  nome_contato:    ['nome do contato', 'nome contato', 'nome_completo', 'nome', 'contato'],
  email:           ['e-mail', 'email', 'e_mail'],
  empresa_nome:    ['nome da empresa', 'empresa', 'empresa_nome', 'nome_empresa'],
  empresa_dominio: ['dominio', 'domínio', 'empresa_dominio', 'dominio_empresa'],
  vertical:        ['vertical', 'tipo', 'tipo_campanha'],
  cargo:           ['cargo', 'posicao', 'posição'],
  linkedin_url:    ['linkedin', 'linkedin_url', 'link linkedin', 'url linkedin'],
  cnpj:            ['cnpj'],
  cidade:          ['cidade'],
  estado:          ['estado', 'uf'],
};

const OBRIGATORIOS = [
  'responsavel', 'nome_contato', 'email',
  'empresa_nome', 'empresa_dominio', 'vertical',
];

// ════════════════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════════════════

function normalizar(s: string): string {
  return (s || '')
    .toString()
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function detectarCampoPorHeader(header: string): string | null {
  const norm = normalizar(header);
  for (const [campo, aliases] of Object.entries(ALIAS_HEADERS)) {
    if (aliases.some(a => normalizar(a) === norm)) return campo;
  }
  return null;
}

function validarEmail(email: string): boolean {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
}

function resolverResponsavel(
  nomeOuEmail: string,
  responsaveis: ResponsavelLite[]
): number | null {
  const alvo = normalizar(nomeOuEmail);
  if (!alvo) return null;
  for (const r of responsaveis) {
    if (normalizar(r.nome_usuario) === alvo) return r.id;
    if (r.email_usuario && normalizar(r.email_usuario) === alvo) return r.id;
  }
  // Tentativa parcial — começa com (ex: "Tatiana" casa com "Tatiana Silva")
  for (const r of responsaveis) {
    if (normalizar(r.nome_usuario).startsWith(alvo)) return r.id;
  }
  return null;
}

function baixarModeloXlsx() {
  const headers = [
    'Responsavel', 'Nome do Contato', 'E-mail', 'Nome da Empresa',
    'Dominio', 'Vertical', 'Cargo', 'LinkedIn', 'CNPJ', 'Cidade', 'Estado',
  ];
  const exemploLinha = [
    'Tatiana', 'Roberto Silva', 'rsilva@itau.com.br', 'Itau',
    'itau.com.br', 'Financeiro', 'Diretor de TI', 'https://linkedin.com/in/rsilva',
    '', 'Sao Paulo', 'SP',
  ];
  const ws = XLSX.utils.aoa_to_sheet([headers, exemploLinha]);
  ws['!cols'] = headers.map(() => ({ wch: 20 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Modelo');
  XLSX.writeFile(wb, 'modelo_importar_lista_leads.xlsx');
}

// ════════════════════════════════════════════════════════════
// COMPONENTE
// ════════════════════════════════════════════════════════════

const ImportarListaLeadsModal: React.FC<ImportarListaLeadsModalProps> = ({
  aberto,
  responsaveis,
  cotaResidual,
  onImportar,
  onConcluido,
  onFechar,
}) => {
  const [etapa, setEtapa] = useState<Etapa>('escolher');
  const [linhas, setLinhas] = useState<LinhaParseada[]>([]);
  const [erroGeral, setErroGeral] = useState<string | null>(null);
  const [arquivoNome, setArquivoNome] = useState<string>('');
  const [progresso, setProgresso] = useState<ProgressoImportacao | null>(null);
  const [resultado, setResultado] = useState<ResultadoImportacao | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Reset ────────────────────────────────────────────────
  const resetar = useCallback(() => {
    setEtapa('escolher');
    setLinhas([]);
    setErroGeral(null);
    setArquivoNome('');
    setProgresso(null);
    setResultado(null);
  }, []);

  const fechar = useCallback(() => {
    if (etapa === 'importando') return; // bloqueia fechar durante import
    resetar();
    onFechar();
  }, [etapa, onFechar, resetar]);

  // ── Estatísticas do preview ─────────────────────────────
  const stats = useMemo(() => {
    const validas = linhas.filter(l => l.erros.length === 0).length;
    const invalidas = linhas.length - validas;
    return { validas, invalidas, total: linhas.length };
  }, [linhas]);

  // ── Parse do arquivo ─────────────────────────────────────
  const processarArquivo = useCallback(async (file: File) => {
    setErroGeral(null);
    setArquivoNome(file.name);

    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const primeiraAba = wb.SheetNames[0];
      if (!primeiraAba) {
        setErroGeral('Arquivo sem abas legíveis.');
        return;
      }
      const ws = wb.Sheets[primeiraAba];
      const rows = XLSX.utils.sheet_to_json<Record<string, any>>(ws, {
        defval: '',
        raw: false,
      });

      if (rows.length === 0) {
        setErroGeral('Arquivo vazio (sem linhas após o cabeçalho).');
        return;
      }
      if (rows.length > LIMITE_LINHAS) {
        setErroGeral(
          `Limite de ${LIMITE_LINHAS} leads por importação. Seu arquivo tem ${rows.length}. ` +
          `Divida em partes ou reduza para até ${LIMITE_LINHAS} linhas.`
        );
        return;
      }
      if (rows.length > cotaResidual) {
        setErroGeral(
          `Sua cota residual hoje é ${cotaResidual} leads. Seu arquivo tem ${rows.length}. ` +
          `Reduza o arquivo ou tente novamente amanhã às 00:00 BRT.`
        );
        return;
      }

      // Mapeia headers para campos canônicos (case-insensitive)
      const headersBrutos = Object.keys(rows[0]);
      const mapaHeader: Record<string, string> = {}; // header bruto → campo canônico
      for (const h of headersBrutos) {
        const campo = detectarCampoPorHeader(h);
        if (campo) mapaHeader[h] = campo;
      }

      // Verifica presença dos obrigatórios no header
      const camposPresentes = new Set(Object.values(mapaHeader));
      const obrigatoriosFaltando = OBRIGATORIOS.filter(o => !camposPresentes.has(o));
      if (obrigatoriosFaltando.length > 0) {
        setErroGeral(
          `Colunas obrigatórias ausentes no cabeçalho: ${obrigatoriosFaltando.join(', ')}.`
        );
        return;
      }

      // Constrói LinhaParseada por linha
      const parsed: LinhaParseada[] = rows.map((row, idx) => {
        const linhaNum = idx + 1;
        const bruto: Record<string, string> = {};
        const camposNormalizados: Record<string, string> = {};
        for (const [headerBruto, valor] of Object.entries(row)) {
          const campo = mapaHeader[headerBruto];
          const v = (valor ?? '').toString().trim();
          bruto[headerBruto] = v;
          if (campo) camposNormalizados[campo] = v;
        }
        const erros: string[] = [];

        // Obrigatórios
        for (const ob of OBRIGATORIOS) {
          if (!camposNormalizados[ob]) {
            erros.push(`Falta "${ob}"`);
          }
        }

        // Email válido
        if (camposNormalizados.email && !validarEmail(camposNormalizados.email)) {
          erros.push('E-mail inválido');
        }

        // Domínio mínimo (precisa ter pelo menos 1 ponto)
        if (camposNormalizados.empresa_dominio && !camposNormalizados.empresa_dominio.includes('.')) {
          erros.push('Domínio sem ponto');
        }

        // Responsável: resolve para id
        let responsavelId: number | null = null;
        if (camposNormalizados.responsavel) {
          responsavelId = resolverResponsavel(camposNormalizados.responsavel, responsaveis);
          if (responsavelId === null) {
            erros.push(`Responsável "${camposNormalizados.responsavel}" não encontrado em GC/SDR`);
          }
        }

        const campos: LeadParaImportar | undefined =
          erros.length === 0 && responsavelId !== null
            ? {
                reservado_por:   responsavelId,
                nome_completo:   camposNormalizados.nome_contato,
                email:           camposNormalizados.email,
                empresa_nome:    camposNormalizados.empresa_nome,
                empresa_dominio: camposNormalizados.empresa_dominio,
                vertical:        camposNormalizados.vertical,
                cargo:           camposNormalizados.cargo        || undefined,
                linkedin_url:    camposNormalizados.linkedin_url || undefined,
                cnpj:            camposNormalizados.cnpj          || undefined,
                cidade:          camposNormalizados.cidade        || undefined,
                estado:          camposNormalizados.estado        || undefined,
              }
            : undefined;

        return {
          linha:         linhaNum,
          bruto,
          erros,
          responsavelId,
          campos,
        };
      });

      setLinhas(parsed);
      setEtapa('preview');
    } catch (err: any) {
      console.error('[ImportarListaLeadsModal] erro no parse:', err);
      setErroGeral(`Falha ao ler arquivo: ${err?.message || 'erro desconhecido'}`);
    }
  }, [responsaveis, cotaResidual]);

  // ── Handlers de upload ──────────────────────────────────
  const onFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processarArquivo(file);
  }, [processarArquivo]);

  const onDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) processarArquivo(file);
  }, [processarArquivo]);

  const onDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  }, []);

  // ── Submit ──────────────────────────────────────────────
  const submeter = useCallback(async () => {
    const validas = linhas.filter(l => l.campos !== undefined).map(l => l.campos!);
    if (validas.length === 0) return;

    setEtapa('importando');
    setProgresso({
      atual: 0, total: validas.length, sucessos: 0, falhas: 0,
      resumo: { atualizado: 0, promovido: 0, trocou_empresa: 0, nao_localizado: 0, dominio_invalido: 0 },
    });

    const r = await onImportar(validas, p => setProgresso(p));
    setResultado(r);
    setEtapa('resultado');
    onConcluido(r);
  }, [linhas, onImportar, onConcluido]);

  // ════════════════════════════════════════════════════════════
  if (!aberto) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">

        {/* ════════ HEADER ════════ */}
        <div className="bg-gradient-to-r from-teal-600 to-teal-700 text-white px-6 py-4 flex items-center justify-between">
          <h3 className="text-lg font-bold flex items-center gap-2">
            <i className="fa-solid fa-file-import"></i>
            Importar Lista de Leads
          </h3>
          <button
            onClick={fechar}
            disabled={etapa === 'importando'}
            className="text-white/80 hover:text-white text-xl disabled:opacity-30"
            aria-label="Fechar"
          >
            <i className="fa-solid fa-xmark"></i>
          </button>
        </div>

        {/* ════════ CORPO ════════ */}
        <div className="px-6 py-5 overflow-y-auto flex-1">

          {/* ── ETAPA: ESCOLHER ── */}
          {etapa === 'escolher' && (
            <div className="space-y-5">
              {/* Step 1 — colunas */}
              <div>
                <div className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-1.5">
                  <span className="bg-teal-600 text-white w-5 h-5 rounded-full text-xs flex items-center justify-center font-bold">1</span>
                  Colunas esperadas na planilha
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs">
                  {OBRIGATORIOS.map(c => (
                    <div key={c} className="flex items-center gap-1.5 px-2 py-1 bg-red-50 border border-red-200 rounded text-red-700">
                      <i className="fa-solid fa-asterisk text-[8px]"></i> {c.replace(/_/g, ' ')}
                    </div>
                  ))}
                  {['cargo', 'linkedin_url', 'cnpj', 'cidade', 'estado'].map(c => (
                    <div key={c} className="flex items-center gap-1.5 px-2 py-1 bg-gray-50 border border-gray-200 rounded text-gray-600">
                      {c.replace(/_/g, ' ')} (opcional)
                    </div>
                  ))}
                </div>
                <button
                  onClick={baixarModeloXlsx}
                  className="text-teal-700 text-xs font-medium mt-2 hover:underline"
                >
                  <i className="fa-solid fa-download"></i> Baixar modelo de planilha (.xlsx)
                </button>
              </div>

              {/* Step 2 — upload */}
              <div>
                <div className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-1.5">
                  <span className="bg-teal-600 text-white w-5 h-5 rounded-full text-xs flex items-center justify-center font-bold">2</span>
                  Selecione o arquivo
                </div>
                <div
                  onClick={() => fileInputRef.current?.click()}
                  onDrop={onDrop}
                  onDragOver={onDragOver}
                  className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-teal-500 hover:bg-teal-50/30 cursor-pointer transition-colors"
                >
                  <i className="fa-solid fa-cloud-arrow-up text-4xl text-gray-400 mb-2"></i>
                  <p className="text-sm text-gray-600">
                    Arraste o arquivo aqui ou{' '}
                    <span className="text-teal-700 font-medium">clique para selecionar</span>
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    .xlsx ou .csv · até {LIMITE_LINHAS} linhas · cota residual hoje: {cotaResidual}
                  </p>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={onFileChange}
                  className="hidden"
                />
                {erroGeral && (
                  <div className="mt-3 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700 flex items-start gap-2">
                    <i className="fa-solid fa-triangle-exclamation mt-0.5"></i>
                    <span>{erroGeral}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── ETAPA: PREVIEW ── */}
          {etapa === 'preview' && (
            <div className="space-y-3">
              <div className="text-sm font-semibold text-gray-700 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <span className="bg-teal-600 text-white w-5 h-5 rounded-full text-xs flex items-center justify-center font-bold">3</span>
                  Pré-visualização ({arquivoNome}) — <span className="text-teal-700">{stats.validas} válidos</span>
                  {stats.invalidas > 0 && <span className="text-red-600"> · {stats.invalidas} com erro</span>}
                </span>
                <span className="text-xs text-gray-500 font-normal">
                  Cota residual hoje: <strong>{cotaResidual}</strong>
                </span>
              </div>

              <div className="border border-gray-200 rounded-lg overflow-hidden max-h-96 overflow-y-auto">
                <table className="min-w-full text-xs">
                  <thead className="bg-gray-50 text-gray-600 uppercase sticky top-0">
                    <tr>
                      <th className="px-2 py-1.5 text-left">#</th>
                      <th className="px-2 py-1.5 text-left">Resp.</th>
                      <th className="px-2 py-1.5 text-left">Nome</th>
                      <th className="px-2 py-1.5 text-left">E-mail</th>
                      <th className="px-2 py-1.5 text-left">Empresa</th>
                      <th className="px-2 py-1.5 text-left">Domínio</th>
                      <th className="px-2 py-1.5 text-left">Vertical</th>
                      <th className="px-2 py-1.5 text-left">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {linhas.map(l => {
                      const ok = l.erros.length === 0;
                      const cls = ok ? 'hover:bg-gray-50' : 'bg-red-50/50 hover:bg-red-50';
                      return (
                        <tr key={l.linha} className={cls}>
                          <td className="px-2 py-1.5 text-gray-500">{l.linha}</td>
                          <td className="px-2 py-1.5">
                            {Object.entries(l.bruto).find(([h]) => detectarCampoPorHeader(h) === 'responsavel')?.[1] || '—'}
                          </td>
                          <td className="px-2 py-1.5">
                            {Object.entries(l.bruto).find(([h]) => detectarCampoPorHeader(h) === 'nome_contato')?.[1] || '—'}
                          </td>
                          <td className="px-2 py-1.5">
                            {Object.entries(l.bruto).find(([h]) => detectarCampoPorHeader(h) === 'email')?.[1] || '—'}
                          </td>
                          <td className="px-2 py-1.5">
                            {Object.entries(l.bruto).find(([h]) => detectarCampoPorHeader(h) === 'empresa_nome')?.[1] || '—'}
                          </td>
                          <td className="px-2 py-1.5">
                            {Object.entries(l.bruto).find(([h]) => detectarCampoPorHeader(h) === 'empresa_dominio')?.[1] || '—'}
                          </td>
                          <td className="px-2 py-1.5">
                            {Object.entries(l.bruto).find(([h]) => detectarCampoPorHeader(h) === 'vertical')?.[1] || '—'}
                          </td>
                          <td className="px-2 py-1.5">
                            {ok ? (
                              <i className="fa-solid fa-circle-check text-emerald-500" title="OK"></i>
                            ) : (
                              <span className="text-red-600" title={l.erros.join('; ')}>
                                <i className="fa-solid fa-circle-xmark"></i> {l.erros.length} erro(s)
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {stats.invalidas > 0 && (
                <div className="p-2 bg-amber-50 border border-amber-200 rounded text-xs text-amber-800">
                  <i className="fa-solid fa-info-circle"></i>{' '}
                  Linhas com erro serão <strong>ignoradas</strong> no envio. Corrija o arquivo ou continue com {stats.validas} válidas.
                </div>
              )}
            </div>
          )}

          {/* ── ETAPA: IMPORTANDO ── */}
          {etapa === 'importando' && progresso && (
            <div className="py-6 text-center space-y-4">
              <i className="fa-solid fa-spinner fa-spin text-4xl text-teal-600"></i>
              <div>
                <p className="text-lg font-semibold text-gray-800">
                  Importando {progresso.atual} de {progresso.total} leads…
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  Sucessos: {progresso.sucessos} · Falhas: {progresso.falhas}
                </p>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-teal-600 h-full transition-all"
                  style={{ width: `${(progresso.atual / progresso.total) * 100}%` }}
                />
              </div>
              <p className="text-xs text-gray-400 italic">Não feche a janela — processo sequencial, 1 lead por vez.</p>
            </div>
          )}

          {/* ── ETAPA: RESULTADO ── */}
          {etapa === 'resultado' && resultado && (
            <div className="space-y-4">
              <div className="text-center">
                <i className="fa-solid fa-circle-check text-4xl text-emerald-500 mb-2"></i>
                <h4 className="text-lg font-bold text-gray-800">Importação concluída</h4>
                <p className="text-sm text-gray-500">
                  {resultado.sucessos} sucessos · {resultado.falhas} falhas (de {resultado.total_processados})
                </p>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-center text-xs">
                <div className="bg-emerald-50 p-2 rounded">
                  <p className="text-xl font-bold text-emerald-700">{resultado.resumo.atualizado}</p>
                  <p className="text-emerald-600">Atualizado</p>
                </div>
                <div className="bg-indigo-50 p-2 rounded">
                  <p className="text-xl font-bold text-indigo-700">{resultado.resumo.promovido}</p>
                  <p className="text-indigo-600">Promovido</p>
                </div>
                <div className="bg-amber-50 p-2 rounded">
                  <p className="text-xl font-bold text-amber-700">{resultado.resumo.trocou_empresa}</p>
                  <p className="text-amber-600">Trocou empresa</p>
                </div>
                <div className="bg-gray-100 p-2 rounded">
                  <p className="text-xl font-bold text-gray-700">{resultado.resumo.nao_localizado}</p>
                  <p className="text-gray-600">Não localizado</p>
                </div>
                <div className="bg-red-50 p-2 rounded">
                  <p className="text-xl font-bold text-red-700">{resultado.resumo.dominio_invalido}</p>
                  <p className="text-red-600">Domínio inválido</p>
                </div>
              </div>

              {resultado.erros.length > 0 && (
                <div className="border border-red-200 rounded">
                  <p className="px-3 py-2 bg-red-50 text-xs font-semibold text-red-700">
                    Erros ({resultado.erros.length})
                  </p>
                  <ul className="max-h-40 overflow-y-auto text-xs divide-y divide-red-100">
                    {resultado.erros.map((e, i) => (
                      <li key={i} className="px-3 py-1.5">
                        <strong>Linha {e.linha}</strong> ({e.nome}): {e.mensagem}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ════════ FOOTER ════════ */}
        <div className="border-t border-gray-200 px-6 py-3 flex items-center justify-between bg-gray-50">
          <div className="text-xs text-gray-500">
            {etapa === 'preview' && (
              <>
                <i className="fa-solid fa-circle-info"></i>{' '}
                Cada lead consome 1 unidade da cota diária (50/dia por GC/SDR).
              </>
            )}
            {etapa === 'importando' && (
              <span className="text-amber-700">Processando — aguarde…</span>
            )}
          </div>
          <div className="flex gap-2">
            {etapa !== 'importando' && (
              <button
                onClick={fechar}
                className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg font-medium"
              >
                {etapa === 'resultado' ? 'Fechar' : 'Cancelar'}
              </button>
            )}
            {etapa === 'preview' && (
              <button
                onClick={submeter}
                disabled={stats.validas === 0}
                className="px-4 py-2 bg-teal-600 text-white rounded-lg text-sm font-medium hover:bg-teal-700 disabled:bg-gray-300 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
              >
                <i className="fa-solid fa-rocket"></i>
                Importar e Revalidar {stats.validas} lead{stats.validas !== 1 ? 's' : ''}
              </button>
            )}
          </div>
        </div>

      </div>
    </div>
  );
};

export default ImportarListaLeadsModal;
