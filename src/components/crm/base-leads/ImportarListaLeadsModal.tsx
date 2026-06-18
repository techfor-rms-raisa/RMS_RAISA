/**
 * ImportarListaLeadsModal.tsx — Modal de upload da Sub-fase 3.C
 *
 * Caminho: src/components/crm/base-leads/ImportarListaLeadsModal.tsx
 * Versão: 1.1 (Sub-fase 3.D refino — 18/06/2026 — Anti-duplicidade)
 *
 * 🆕 v1.1 (18/06/2026 — Sub-fase 3.D refino: Anti-duplicidade):
 *   Após o parse local do arquivo (e antes de habilitar o botão Importar),
 *   o modal chama o backend `verificarDuplicidade` para classificar cada
 *   email contra `email_leads`, `email_optout` e `prospect_leads`.
 *   Mudanças:
 *
 *   • Nova prop `onVerificarDuplicidade` (callback que recebe a lista
 *     de emails e devolve a classificação por email).
 *   • Cada `LinhaParseada` ganha `status_duplicidade` (StatusDuplicidade).
 *   • Header da etapa Preview ganha indicador "Verificando duplicatas…"
 *     e, ao terminar, os contadores discriminados (Novos / Em CRM /
 *     Opt-out / Em revalidação).
 *   • Coluna Status mostra badge específico para cada caso de duplicidade.
 *   • Linhas duplicadas têm fundo cinza claro (visualmente reconhecidas
 *     como "não importáveis"); linhas inválidas continuam vermelhas.
 *   • Botão Importar conta APENAS os "novos" (válidos sem duplicidade)
 *     e fica desabilitado se 0 novos.
 *
 *   Limitação consciente: a verificação roda em 1 chamada para todos os
 *   emails da preview (até 50, dentro do limite 100 do backend). Caso
 *   futuro >100, vai precisar paginar.
 *
 *   Defesa em profundidade: backend `prospect-revalidate` v1.4 também
 *   verifica duplicidade antes do INSERT preventivo e devolve status
 *   `duplicado_*` sem consumir cota. Isso cobre race condition entre
 *   verificação do modal e o submit.
 *
 * v1.0.1 (17/06/2026 — hotfix): `normalizar()` agora converte `_` e `-`
 *   em espaço (e colapsa múltiplos espaços), tornando o detector de colunas
 *   tolerante a variações como `Nome_contato`, `Nome-contato`, `E_mail`,
 *   `Empresa_dominio`. Sem esta normalização, planilhas legítimas com
 *   underscore no header eram rejeitadas como "obrigatório ausente".
 *   Detectado durante smoke em Preview com upload do Messias (planilha
 *   `Upload.xlsx` com header `Nome_contato`).
 *
 * v1.0 (Sub-fase 3.C — 17/06/2026): primeira versão.
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
  // 🆕 v1.1 — Anti-duplicidade
  StatusDuplicidade,
  ItemVerificacaoDuplicidade,
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
  /** 🆕 v1.1 — Callback de verificação de duplicidade (anti-dup pré-upload). */
  onVerificarDuplicidade: (emails: string[]) => Promise<ItemVerificacaoDuplicidade[]>;
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
  // 🆕 v1.1 — Status de duplicidade ('novo' até verificação rodar; depois
  // assume 'em_email_leads' / 'em_opt_out' / 'em_revalidacao' conforme
  // backend retornar). `null` significa "ainda verificando".
  status_duplicidade?: StatusDuplicidade | null;
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
    .replace(/[\u0300-\u036f]/g, '')   // remove acentos
    .replace(/[_\-]+/g, ' ')            // 🆕 v1.0.1: underscore e hífen → espaço
    .replace(/\s+/g, ' ')               // 🆕 v1.0.1: colapsa múltiplos espaços
    .trim();
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
  onVerificarDuplicidade,
}) => {
  const [etapa, setEtapa] = useState<Etapa>('escolher');
  const [linhas, setLinhas] = useState<LinhaParseada[]>([]);
  const [erroGeral, setErroGeral] = useState<string | null>(null);
  const [arquivoNome, setArquivoNome] = useState<string>('');
  const [progresso, setProgresso] = useState<ProgressoImportacao | null>(null);
  const [resultado, setResultado] = useState<ResultadoImportacao | null>(null);
  // 🆕 v1.1 — Estados da verificação de duplicidade
  const [verificandoDup, setVerificandoDup] = useState<boolean>(false);
  const [erroVerificarDup, setErroVerificarDup] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Reset ────────────────────────────────────────────────
  const resetar = useCallback(() => {
    setEtapa('escolher');
    setLinhas([]);
    setErroGeral(null);
    setArquivoNome('');
    setProgresso(null);
    setResultado(null);
    // 🆕 v1.1
    setVerificandoDup(false);
    setErroVerificarDup(null);
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
    // 🆕 v1.1 — Stats de duplicidade. Considera apenas linhas SEM erros
    // (linhas inválidas já são descartadas e não consultam duplicidade).
    const validasComStatus = linhas.filter(l => l.erros.length === 0);
    const novos = validasComStatus.filter(l => l.status_duplicidade === 'novo').length;
    const emCrm = validasComStatus.filter(l => l.status_duplicidade === 'em_email_leads').length;
    const emOptout = validasComStatus.filter(l => l.status_duplicidade === 'em_opt_out').length;
    const emRevalidacao = validasComStatus.filter(l => l.status_duplicidade === 'em_revalidacao').length;
    return {
      validas, invalidas, total: linhas.length,
      novos, emCrm, emOptout, emRevalidacao,
    };
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

      // 🆕 v1.1 — Após mostrar a preview, dispara verificação de duplicidade
      // em background para emails das linhas SEM erros. UI mostra spinner
      // discreto no header e desabilita botão Importar até terminar.
      const emailsParaVerificar = parsed
        .filter(l => l.erros.length === 0 && l.campos?.email)
        .map(l => l.campos!.email);

      if (emailsParaVerificar.length > 0) {
        setVerificandoDup(true);
        setErroVerificarDup(null);
        try {
          const resultados = await onVerificarDuplicidade(emailsParaVerificar);
          // Indexa por email (normalizado) para lookup eficiente
          const mapaStatus = new Map<string, StatusDuplicidade>();
          for (const r of resultados) {
            mapaStatus.set(r.email.toLowerCase().trim(), r.status);
          }
          // Atualiza linhas com status_duplicidade
          setLinhas(prev => prev.map(l => {
            if (l.erros.length > 0 || !l.campos?.email) return l;
            const emailNorm = l.campos.email.toLowerCase().trim();
            return {
              ...l,
              status_duplicidade: mapaStatus.get(emailNorm) ?? 'novo',
            };
          }));
        } catch (err: any) {
          // Falha não bloqueia preview — apenas avisa o usuário. As linhas
          // permanecem sem status_duplicidade, o que faz o botão Importar
          // ficar disabled (modal exige verificação para liberar submit).
          console.error('[ImportarListaLeadsModal] erro em verificarDuplicidade:', err);
          setErroVerificarDup(err?.message || 'Falha na verificação de duplicidade');
        } finally {
          setVerificandoDup(false);
        }
      }
    } catch (err: any) {
      console.error('[ImportarListaLeadsModal] erro no parse:', err);
      setErroGeral(`Falha ao ler arquivo: ${err?.message || 'erro desconhecido'}`);
    }
  }, [responsaveis, cotaResidual, onVerificarDuplicidade]);

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
    // 🆕 v1.1 — Envia APENAS leads validados E classificados como 'novo'
    // pela verificação de duplicidade. Leads com erros ou duplicidade
    // foram visualmente filtrados; aqui é defesa adicional.
    const validas = linhas
      .filter(l => l.campos !== undefined && l.status_duplicidade === 'novo')
      .map(l => l.campos!);

    if (validas.length === 0) return;

    setEtapa('importando');
    setProgresso({
      atual: 0, total: validas.length, sucessos: 0, falhas: 0,
      resumo: {
        atualizado: 0, promovido: 0, trocou_empresa: 0,
        nao_localizado: 0, dominio_invalido: 0,
        // 🆕 v1.1 — contadores de duplicidade (race condition detectada pelo backend)
        duplicado_em_email_leads: 0,
        duplicado_em_opt_out:     0,
        duplicado_em_revalidacao: 0,
      },
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
              {/* Cabeçalho com contadores discriminados (🆕 v1.1) */}
              <div className="text-sm font-semibold text-gray-700 flex flex-wrap items-center justify-between gap-2">
                <span className="flex items-center gap-1.5">
                  <span className="bg-teal-600 text-white w-5 h-5 rounded-full text-xs flex items-center justify-center font-bold">3</span>
                  Pré-visualização ({arquivoNome})
                </span>
                <span className="text-xs text-gray-500 font-normal">
                  Cota residual hoje: <strong>{cotaResidual}</strong>
                </span>
              </div>

              {/* 🆕 v1.1 — Contadores em pílulas */}
              <div className="flex flex-wrap gap-1.5 text-xs">
                <span className="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 font-medium inline-flex items-center gap-1">
                  <i className="fa-solid fa-circle-plus"></i> {stats.novos} novos
                </span>
                {stats.emCrm > 0 && (
                  <span className="px-2.5 py-1 rounded-full bg-red-100 text-red-800 font-medium inline-flex items-center gap-1">
                    <i className="fa-solid fa-user-check"></i> {stats.emCrm} já no CRM
                  </span>
                )}
                {stats.emOptout > 0 && (
                  <span className="px-2.5 py-1 rounded-full bg-rose-100 text-rose-800 font-medium inline-flex items-center gap-1">
                    <i className="fa-solid fa-ban"></i> {stats.emOptout} em opt-out
                  </span>
                )}
                {stats.emRevalidacao > 0 && (
                  <span className="px-2.5 py-1 rounded-full bg-amber-100 text-amber-800 font-medium inline-flex items-center gap-1">
                    <i className="fa-solid fa-rotate"></i> {stats.emRevalidacao} em revalidação
                  </span>
                )}
                {stats.invalidas > 0 && (
                  <span className="px-2.5 py-1 rounded-full bg-gray-200 text-gray-700 font-medium inline-flex items-center gap-1">
                    <i className="fa-solid fa-circle-xmark"></i> {stats.invalidas} com erro
                  </span>
                )}
                {verificandoDup && (
                  <span className="px-2.5 py-1 rounded-full bg-blue-100 text-blue-800 font-medium inline-flex items-center gap-1">
                    <i className="fa-solid fa-spinner fa-spin"></i> Verificando duplicatas…
                  </span>
                )}
              </div>

              {/* 🆕 v1.1 — Aviso caso a verificação tenha falhado */}
              {erroVerificarDup && (
                <div className="p-2 bg-amber-50 border border-amber-200 rounded text-xs text-amber-800">
                  <i className="fa-solid fa-triangle-exclamation"></i>{' '}
                  Não foi possível verificar duplicatas: <strong>{erroVerificarDup}</strong>.
                  O botão Importar fica bloqueado até a verificação concluir.
                  Você pode fechar e tentar novamente.
                </div>
              )}

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
                      // 🆕 v1.1 — classes condicionais por estado de duplicidade
                      const duplicado = ok && l.status_duplicidade && l.status_duplicidade !== 'novo';
                      const cls = !ok
                        ? 'bg-red-50/50 hover:bg-red-50'
                        : duplicado
                          ? 'bg-gray-50 text-gray-500 hover:bg-gray-100'
                          : 'hover:bg-gray-50';
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
                          {/* 🆕 v1.1 — coluna Status com badge discriminado */}
                          <td className="px-2 py-1.5">
                            {!ok ? (
                              <span className="text-red-600" title={l.erros.join('; ')}>
                                <i className="fa-solid fa-circle-xmark"></i> {l.erros.length} erro(s)
                              </span>
                            ) : l.status_duplicidade === undefined || l.status_duplicidade === null ? (
                              <span className="text-blue-500" title="Verificando…">
                                <i className="fa-solid fa-spinner fa-spin"></i> ...
                              </span>
                            ) : l.status_duplicidade === 'novo' ? (
                              <span className="text-emerald-600 inline-flex items-center gap-1" title="Pronto para importar">
                                <i className="fa-solid fa-circle-check"></i> Novo
                              </span>
                            ) : l.status_duplicidade === 'em_email_leads' ? (
                              <span className="text-red-600 inline-flex items-center gap-1" title="Lead já existe em Meus Leads (CRM)">
                                <i className="fa-solid fa-user-check"></i> Já no CRM
                              </span>
                            ) : l.status_duplicidade === 'em_opt_out' ? (
                              <span className="text-rose-600 inline-flex items-center gap-1" title="Email em opt-out (LGPD)">
                                <i className="fa-solid fa-ban"></i> Opt-out
                              </span>
                            ) : (
                              <span className="text-amber-700 inline-flex items-center gap-1" title="Em revalidação (prospect_leads)">
                                <i className="fa-solid fa-rotate"></i> Em revalidação
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
                  Linhas com erro serão <strong>ignoradas</strong> no envio. Corrija o arquivo ou prossiga sem elas.
                </div>
              )}
              {/* 🆕 v1.1 — Aviso de duplicidade quando há leads bloqueados */}
              {(stats.emCrm + stats.emOptout + stats.emRevalidacao) > 0 && (
                <div className="p-2 bg-amber-50 border border-amber-200 rounded text-xs text-amber-800">
                  <i className="fa-solid fa-shield-halved"></i>{' '}
                  Foram detectadas <strong>{stats.emCrm + stats.emOptout + stats.emRevalidacao} duplicatas</strong>
                  {' '}— elas serão <strong>ignoradas</strong> no envio.
                  {stats.emOptout > 0 && ' Emails em opt-out (LGPD) jamais podem ser reimportados.'}
                  {stats.emCrm > 0 && ' Use Editar em "Meus Leads" para atualizar leads já existentes no CRM.'}
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
                disabled={stats.novos === 0 || verificandoDup}
                className="px-4 py-2 bg-teal-600 text-white rounded-lg text-sm font-medium hover:bg-teal-700 disabled:bg-gray-300 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
                title={
                  verificandoDup
                    ? 'Aguarde a verificação de duplicatas concluir…'
                    : stats.novos === 0
                      ? 'Nenhum lead novo para importar (todos já existem no CRM, em opt-out ou em revalidação)'
                      : `Importar ${stats.novos} lead${stats.novos !== 1 ? 's' : ''} novo${stats.novos !== 1 ? 's' : ''}`
                }
              >
                {verificandoDup ? (
                  <>
                    <i className="fa-solid fa-spinner fa-spin"></i>
                    Verificando…
                  </>
                ) : (
                  <>
                    <i className="fa-solid fa-rocket"></i>
                    Importar e Revalidar {stats.novos} lead{stats.novos !== 1 ? 's' : ''}
                  </>
                )}
              </button>
            )}
          </div>
        </div>

      </div>
    </div>
  );
};

export default ImportarListaLeadsModal;
