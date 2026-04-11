// src/components/atividades/AtividadesInserir.tsx
// 🔧 v3.0 — 11/04/2026
//   - Mês fixado no mês corrente (inserção restrita)
//   - Flag "Confidencial" (checkbox) entre Mês e Atividades
//   - Régua de Risco do Analista (slider 1-5) com labels
//   - Fluxo bifásico: "Enviar Relatório" → análise IA (consultiva) → "Salvar Atividade"
//   - onDirectSave: salva com risco do analista sobrescrevendo o da IA
//   - Notificações mantidas via enviarEmailsNotificacao

import React, { useState, useMemo, useEffect } from 'react';
import { Client, Consultant, UsuarioCliente, CoordenadorCliente, ConsultantReport } from '@/types';
import {
  User, Phone, Mail, Briefcase, Clock, Calendar, Bell, CheckCircle,
  Lock, Bot, ShieldCheck,
} from 'lucide-react';
import HistoricoAtividadesModal from '../HistoricoAtividadesModal';

// ---------------------------------------------------------------------------
// Tipos internos
// ---------------------------------------------------------------------------

interface AppUser {
  id: number;
  nome_usuario: string;
  email_usuario?: string;
  email?: string;
  tipo_usuario: string;
}

const getEmailUsuario = (u: AppUser): string | undefined =>
  u.email_usuario || u.email || undefined;

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface AtividadesInserirProps {
  clients: Client[];
  consultants: Consultant[];
  usuariosCliente: UsuarioCliente[];
  coordenadoresCliente?: CoordenadorCliente[];
  allReports?: ConsultantReport[];
  loadConsultantReports?: (consultantId: number) => Promise<ConsultantReport[]>;
  onManualReport: (
    text: string,
    gestorName?: string,
    extractedMonth?: number,
    extractedYear?: number,
    selectedConsultantName?: string
  ) => Promise<void>;
  /** v3.0 — Salva diretamente com resultado da IA já calculado + risco do analista */
  onDirectSave: (
    aiResult: Record<string, any>,
    rawText: string,
    confidencial: boolean,
    riscoAnalista: number,
    consultantName: string,
    gestorName: string,
    month: number,
    year: number
  ) => Promise<void>;
  preSelectedClient?: string;
  preSelectedConsultant?: string;
  usuariosRMS?: AppUser[];
  currentUserName?: string;
}

// ---------------------------------------------------------------------------
// Helpers de risco
// ---------------------------------------------------------------------------

const RISCO_LABELS: Record<number, string> = {
  1: 'Mínimo',
  2: 'Baixo',
  3: 'Moderado',
  4: 'Alto',
  5: 'Crítico',
};

const RISCO_COLORS: Record<number, string> = {
  1: 'bg-blue-500',
  2: 'bg-green-500',
  3: 'bg-yellow-500',
  4: 'bg-orange-500',
  5: 'bg-red-600',
};

const RISCO_TEXT_COLORS: Record<number, string> = {
  1: 'text-blue-700',
  2: 'text-green-700',
  3: 'text-yellow-700',
  4: 'text-orange-600',
  5: 'text-red-700',
};

const RISCO_BORDER_COLORS: Record<number, string> = {
  1: 'border-blue-300',
  2: 'border-green-300',
  3: 'border-yellow-300',
  4: 'border-orange-300',
  5: 'border-red-300',
};

const getRiskLabel = (score: number) => RISCO_LABELS[score] ?? 'N/A';
const getRiskBg = (score: number) => RISCO_COLORS[score] ?? 'bg-gray-400';
const getRiskText = (score: number) => RISCO_TEXT_COLORS[score] ?? 'text-gray-600';
const getRiskBorder = (score: number) => RISCO_BORDER_COLORS[score] ?? 'border-gray-300';

// ---------------------------------------------------------------------------
// Extração de data de relatório importado
// ---------------------------------------------------------------------------

const extractDateFromReport = (
  text: string
): { month: number | null; year: number | null; dateRange: string | null } => {
  console.log('🔍 Iniciando extração de data do relatório...');

  const monthNames: { [key: string]: number } = {
    'janeiro': 1, 'jan': 1,
    'fevereiro': 2, 'fev': 2,
    'março': 3, 'marco': 3, 'mar': 3,
    'abril': 4, 'abr': 4,
    'maio': 5, 'mai': 5,
    'junho': 6, 'jun': 6,
    'julho': 7, 'jul': 7,
    'agosto': 8, 'ago': 8,
    'setembro': 9, 'set': 9,
    'outubro': 10, 'out': 10,
    'novembro': 11, 'nov': 11,
    'dezembro': 12, 'dez': 12,
  };

  let month: number | null = null;
  let year: number | null = null;
  let dateRange: string | null = null;

  const periodoRegex =
    /Período\s+de\s+(\d{1,2})[.\/](\d{1,2})[.\/](\d{4})\s+a\s+(\d{1,2})[.\/](\d{1,2})[.\/](\d{4})/i;
  let match = text.match(periodoRegex);
  if (match) {
    month = parseInt(match[2], 10);
    year = parseInt(match[3], 10);
    dateRange = `${match[1]}/${match[2]}/${match[3]} a ${match[4]}/${match[5]}/${match[6]}`;
    return { month, year, dateRange };
  }

  const rangeRegex =
    /(\d{1,2})[.\/](\d{1,2})[.\/](\d{4})\s+a\s+(\d{1,2})[.\/](\d{1,2})[.\/](\d{4})/i;
  match = text.match(rangeRegex);
  if (match) {
    month = parseInt(match[2], 10);
    year = parseInt(match[3], 10);
    dateRange = `${match[1]}/${match[2]}/${match[3]} a ${match[4]}/${match[5]}/${match[6]}`;
    return { month, year, dateRange };
  }

  const monthYearRegex =
    /(?:RELATÓRIO[S]?\s+(?:DE\s+)?ATIVIDADES?\s*[-–]\s*)?([A-Za-záàâãéèêíïóôõöúç]+)\s*[\/\-]\s*(\d{4})/i;
  match = text.match(monthYearRegex);
  if (match) {
    const monthName = match[1].toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (monthNames[monthName]) {
      month = monthNames[monthName];
      year = parseInt(match[2], 10);
      dateRange = `${match[1]}/${match[2]}`;
      return { month, year, dateRange };
    }
  }

  const monthTextRegex =
    /(?:mês\s*(?:de|:)?\s*)([A-Za-záàâãéèêíïóôõöúç]+)(?:\s+de)?\s+(\d{4})/i;
  match = text.match(monthTextRegex);
  if (match) {
    const monthName = match[1].toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (monthNames[monthName]) {
      month = monthNames[monthName];
      year = parseInt(match[2], 10);
      dateRange = `${match[1]} de ${match[2]}`;
      return { month, year, dateRange };
    }
  }

  const singleDateRegex = /(\d{1,2})[.\/](\d{1,2})[.\/](\d{4})/;
  match = text.match(singleDateRegex);
  if (match) {
    month = parseInt(match[2], 10);
    year = parseInt(match[3], 10);
    dateRange = `${match[1]}/${match[2]}/${match[3]}`;
    return { month, year, dateRange };
  }

  for (const [name, num] of Object.entries(monthNames)) {
    const regex = new RegExp(`\\b${name}\\b`, 'i');
    if (regex.test(text)) {
      month = num;
      const yearMatch = text.match(new RegExp(`${name}\\s*(?:de\\s*)?(\\d{4})`, 'i'));
      year = yearMatch ? parseInt(yearMatch[1], 10) : new Date().getFullYear();
      dateRange = `${name} ${year}`;
      return { month, year, dateRange };
    }
  }

  console.warn('⚠️ Nenhum padrão de data encontrado no relatório');
  return { month: null, year: null, dateRange: null };
};

// ---------------------------------------------------------------------------
// Componente Principal
// ---------------------------------------------------------------------------

const AtividadesInserir: React.FC<AtividadesInserirProps> = ({
  clients,
  consultants,
  usuariosCliente,
  coordenadoresCliente = [],
  allReports = [],
  loadConsultantReports,
  onManualReport,
  onDirectSave,
  preSelectedClient = '',
  preSelectedConsultant = '',
  usuariosRMS = [],
  currentUserName,
}) => {
  // ── Form states ────────────────────────────────────────────────────────────
  const [selectedClient, setSelectedClient] = useState<string>('');
  const [selectedConsultant, setSelectedConsultant] = useState<string>('');

  // v3.0 — Mês fixado no mês corrente (não é mais editável)
  const currentMonth = new Date().getMonth() + 1;
  const currentYear = new Date().getFullYear();

  const [activities, setActivities] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // v3.0 — Novos campos
  const [confidencial, setConfidencial] = useState(false);
  const [riscoAnalista, setRiscoAnalista] = useState<number>(3);

  // v3.0 — Fluxo bifásico
  const [phaseReview, setPhaseReview] = useState(false);
  const [aiResult, setAiResult] = useState<Record<string, any> | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // ── Import states ──────────────────────────────────────────────────────────
  const [mode, setMode] = useState<'manual' | 'import'>('manual');
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [extractedText, setExtractedText] = useState<string>('');
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractedMonth, setExtractedMonth] = useState<number | null>(null);
  const [extractedYear, setExtractedYear] = useState<number | null>(null);
  const [extractedDateRange, setExtractedDateRange] = useState<string | null>(null);

  // ── Histórico modal ────────────────────────────────────────────────────────
  const [showHistoricoModal, setShowHistoricoModal] = useState(false);
  const [consultantReports, setConsultantReports] = useState<ConsultantReport[]>([]);
  const [loadingReports, setLoadingReports] = useState(false);

  // ── Notificação ────────────────────────────────────────────────────────────
  const [notifComercial, setNotifComercial] = useState(false);
  const [notifRS, setNotifRS] = useState(false);
  const [notifPessoas, setNotifPessoas] = useState(false);
  const [enviandoEmails, setEnviandoEmails] = useState(false);

  // ── Pré-seleção contextual ────────────────────────────────────────────────
  useEffect(() => {
    if (preSelectedClient) setSelectedClient(preSelectedClient);
  }, [preSelectedClient]);

  useEffect(() => {
    if (preSelectedConsultant && preSelectedClient)
      setSelectedConsultant(preSelectedConsultant);
  }, [preSelectedConsultant, preSelectedClient]);

  // ── Filtros ───────────────────────────────────────────────────────────────

  const filteredConsultants = useMemo(() => {
    if (!selectedClient) return [];
    const client = clients.find(c => c.razao_social_cliente === selectedClient);
    if (!client) return [];
    const clientManagers = usuariosCliente.filter(u => u.id_cliente === client.id);
    const managerIds = clientManagers.map(m => m.id);
    return consultants
      .filter(
        c =>
          c.status === 'Ativo' &&
          c.gestor_imediato_id &&
          managerIds.includes(c.gestor_imediato_id) &&
          (c.ano_vigencia === currentYear || c.ano_vigencia === null || c.ano_vigencia === undefined)
      )
      .sort((a, b) => a.nome_consultores.localeCompare(b.nome_consultores));
  }, [selectedClient, clients, consultants, usuariosCliente, currentYear]);

  const selectedConsultantData = useMemo(() => {
    if (!selectedConsultant) return null;
    return (
      consultants.find(
        c =>
          c.nome_consultores === selectedConsultant &&
          (c.ano_vigencia === currentYear || c.ano_vigencia === null || c.ano_vigencia === undefined)
      ) || consultants.find(c => c.nome_consultores === selectedConsultant) || null
    );
  }, [selectedConsultant, consultants, currentYear]);

  const managerData = useMemo(() => {
    if (!selectedConsultantData) return null;
    const manager = usuariosCliente.find(u => u.id === selectedConsultantData.gestor_imediato_id);
    if (manager) {
      return {
        nome: manager.nome_gestor_cliente,
        cargo: manager.cargo_gestor,
        email: manager.email_gestor || `gestor${manager.id}@cliente.com`,
        celular: manager.celular || 'Não informado',
        tipo: 'Gestor',
      };
    }
    if (selectedConsultantData.coordenador_id) {
      const coordenador = coordenadoresCliente.find(
        c => c.id === selectedConsultantData.coordenador_id
      );
      if (coordenador) {
        return {
          nome: coordenador.nome_coordenador_cliente,
          cargo: coordenador.cargo_coordenador_cliente,
          email: coordenador.email_coordenador || `coordenador${coordenador.id}@cliente.com`,
          celular: coordenador.celular || 'Não informado',
          tipo: 'Coordenador',
        };
      }
    }
    return null;
  }, [selectedConsultantData, usuariosCliente, coordenadoresCliente]);

  // 🔧 v2.9: Destinatários filtrados por cliente
  const destinatariosDoCliente = useMemo(() => {
    const clienteAtual = clients.find(c => c.razao_social_cliente === selectedClient);
    if (!clienteAtual)
      return { comercial: [] as AppUser[], pessoas: [] as AppUser[], rs: [] as AppUser[] };

    const comercial = clienteAtual.id_gestao_comercial
      ? usuariosRMS.filter(u => u.id === clienteAtual.id_gestao_comercial && getEmailUsuario(u))
      : [];
    const pessoas = clienteAtual.id_gestao_de_pessoas
      ? usuariosRMS.filter(u => u.id === clienteAtual.id_gestao_de_pessoas && getEmailUsuario(u))
      : [];
    const rs = usuariosRMS.filter(u => u.tipo_usuario === 'Gestão de R&S' && getEmailUsuario(u));

    return { comercial, pessoas, rs };
  }, [selectedClient, clients, usuariosRMS]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleOpenHistorico = async () => {
    if (!selectedConsultantData || !loadConsultantReports) return;
    setLoadingReports(true);
    try {
      const reports = await loadConsultantReports(selectedConsultantData.id);
      setConsultantReports(reports);
      setShowHistoricoModal(true);
    } catch (error) {
      console.error('Erro ao carregar relatórios:', error);
      alert('Erro ao carregar histórico de atividades.');
    } finally {
      setLoadingReports(false);
    }
  };

  // ── Upload (import mode) ──────────────────────────────────────────────────

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadedFile(file);
    setIsExtracting(true);
    setExtractedMonth(null);
    setExtractedYear(null);
    setExtractedDateRange(null);

    try {
      let fullText = '';

      if (file.type === 'application/pdf') {
        const arrayBuffer = await file.arrayBuffer();
        const pdfjsLib = await import('pdfjs-dist');
        pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const textContent = await page.getTextContent();
          fullText += textContent.items.map((item: any) => item.str).join(' ') + '\n';
        }
      } else if (file.type === 'text/plain') {
        fullText = await file.text();
      } else {
        alert('Por favor, selecione um arquivo PDF ou TXT.');
        setUploadedFile(null);
        setIsExtracting(false);
        return;
      }

      setExtractedText(fullText);

      // v3.0 — Para import, sempre usar mês corrente conforme regra de negócio
      setExtractedMonth(currentMonth);
      setExtractedYear(currentYear);
      setExtractedDateRange(null);
      console.log(`📅 Import: mês fixado no corrente ${currentMonth}/${currentYear}`);
    } catch (error) {
      console.error('Erro ao extrair texto:', error);
      alert('Erro ao processar arquivo. Tente novamente.');
      setUploadedFile(null);
    } finally {
      setIsExtracting(false);
    }
  };

  const handleImportSubmit = async () => {
    if (!extractedText) return;
    setIsSubmitting(true);
    try {
      // Import mode usa onManualReport (fluxo existente), mês sempre corrente
      await onManualReport(extractedText, undefined, currentMonth, currentYear);
      setExtractedText('');
      setUploadedFile(null);
      setExtractedMonth(null);
      setExtractedYear(null);
      setExtractedDateRange(null);
      alert('Relatório importado e processado com sucesso!');
    } catch (error) {
      console.error('Erro ao processar relatório:', error);
      alert('Erro ao processar relatório. Tente novamente.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Notificações ──────────────────────────────────────────────────────────

  const enviarEmailsNotificacao = async (
    reportText: string,
    consultantData: Consultant,
    clientName: string,
    monthName: string
  ) => {
    const destinatarios: { email: string; nome: string; perfil: string }[] = [];

    if (notifComercial) {
      destinatariosDoCliente.comercial.forEach(u =>
        destinatarios.push({ email: getEmailUsuario(u)!, nome: u.nome_usuario, perfil: 'Gestão Comercial' })
      );
    }
    if (notifRS) {
      destinatariosDoCliente.rs.forEach(u =>
        destinatarios.push({ email: getEmailUsuario(u)!, nome: u.nome_usuario, perfil: 'Gestão de R&S' })
      );
    }
    if (notifPessoas) {
      destinatariosDoCliente.pessoas.forEach(u =>
        destinatarios.push({ email: getEmailUsuario(u)!, nome: u.nome_usuario, perfil: 'Gestão de Pessoas' })
      );
    }

    if (destinatarios.length === 0) return;

    setEnviandoEmails(true);
    const erros: string[] = [];

    try {
      await Promise.all(
        destinatarios.map(async dest => {
          try {
            const response = await fetch('/api/send-email', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                to: dest.email,
                toName: dest.nome,
                subject: `Relatório de Atividade — ${consultantData.nome_consultores} | ${clientName} — ${monthName}`,
                consultantName: consultantData.nome_consultores,
                consultantCargo: consultantData.cargo_consultores || '',
                clientName,
                inclusionDate: new Date().toLocaleDateString('pt-BR'),
                summary: reportText,
                type: 'activity_report' as const,
              }),
            });

            if (!response.ok) {
              const errorBody = await response.json().catch(() => ({ details: 'Sem detalhes' }));
              const msg = `[${dest.perfil}] ${dest.email} → HTTP ${response.status}: ${
                errorBody.details || errorBody.error || 'Erro desconhecido'
              }`;
              erros.push(msg);
            } else {
              const okBody = await response.json().catch(() => ({}));
              console.log(`[notificacao] ✅ Email enviado para ${dest.email} — ID: ${okBody.messageId || 'n/a'}`);
            }
          } catch (fetchErr: any) {
            erros.push(`[${dest.perfil}] ${dest.email} → Falha de rede: ${fetchErr.message}`);
          }
        })
      );

      if (erros.length > 0) {
        alert(
          `⚠️ Relatório salvo, mas ${erros.length} notificação(ões) falharam:\n\n${erros.join('\n')}\n\nConsulte o console para detalhes.`
        );
      }
    } catch (err: any) {
      console.error('[notificacao] Erro inesperado:', err);
    } finally {
      setEnviandoEmails(false);
    }
  };

  // ── v3.0 — FASE 1: Analisar com IA ───────────────────────────────────────

  const handleAnalyzeReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedConsultant || !activities.trim()) return;

    setIsAnalyzing(true);
    try {
      const consultant = consultants.find(c => c.nome_consultores === selectedConsultant);
      const manager = consultant
        ? usuariosCliente.find(u => u.id === consultant.gestor_imediato_id)
        : null;
      const gestorName = manager?.nome_gestor_cliente || 'Não especificado';

      console.log(`🤖 [Fase 1] Enviando para análise IA — Consultor: ${selectedConsultant}`);

      const response = await fetch('/api/analyze-activity-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reportText: activities,
          gestorName,
          extractedMonth: currentMonth,
          extractedYear: currentYear,
          selectedConsultantName: selectedConsultant,
        }),
      });

      if (!response.ok) {
        throw new Error(`Erro na análise: HTTP ${response.status}`);
      }

      const data = await response.json();
      const results: any[] = data.results || [];

      const aiRes =
        results.length > 0
          ? results[0]
          : {
              consultantName: selectedConsultant,
              managerName: gestorName,
              reportMonth: currentMonth,
              reportYear: currentYear,
              riskScore: 3,
              summary: `Análise manual: ${activities.substring(0, 150)}${activities.length > 150 ? '...' : ''}`,
              negativePattern: null,
              predictiveAlert: null,
              recommendations: [],
            };

      console.log(`✅ [Fase 1] Risco IA: ${aiRes.riskScore} — ${getRiskLabel(aiRes.riskScore)}`);

      setAiResult(aiRes);
      setPhaseReview(true);
    } catch (error) {
      console.error('[Fase 1] Erro na análise:', error);
      alert('Erro ao analisar relatório com IA. Verifique o texto e tente novamente.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  // ── v3.0 — FASE 2: Salvar com risco do analista ───────────────────────────

  const handleSaveActivity = async () => {
    if (!aiResult || !selectedConsultant) return;

    setIsSubmitting(true);
    try {
      const consultant = consultants.find(c => c.nome_consultores === selectedConsultant);
      const manager = consultant
        ? usuariosCliente.find(u => u.id === consultant.gestor_imediato_id)
        : null;
      const gestorName = manager?.nome_gestor_cliente || 'Não especificado';

      console.log(
        `💾 [Fase 2] Salvando — Consultor: ${selectedConsultant} | RiscoAnalista: ${riscoAnalista} | Confidencial: ${confidencial}`
      );

      await onDirectSave(
        aiResult,
        activities,
        confidencial,
        riscoAnalista,
        selectedConsultant,
        gestorName,
        currentMonth,
        currentYear
      );

      // Enviar notificações por e-mail se algum checkbox estiver marcado
      if ((notifComercial || notifRS || notifPessoas) && consultant) {
        const monthName =
          new Date(currentYear, currentMonth - 1, 1).toLocaleString('pt-BR', { month: 'long' });
        await enviarEmailsNotificacao(activities, consultant, selectedClient, monthName);
      }

      // Reset completo
      setActivities('');
      setSelectedConsultant('');
      setConfidencial(false);
      setRiscoAnalista(3);
      setPhaseReview(false);
      setAiResult(null);
      setNotifComercial(false);
      setNotifRS(false);
      setNotifPessoas(false);

      alert('✅ Atividade salva com sucesso!');
    } catch (error) {
      console.error('[Fase 2] Erro ao salvar:', error);
      alert('Erro ao salvar atividade. Tente novamente.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Utilitários UI ────────────────────────────────────────────────────────

  const downloadTemplate = () => {
    const template = `INSTRUÇÕES - Relatório de Atividades (Análise com IA Gemini)\n\nFormato: Texto livre - A IA identifica automaticamente consultores e calcula riscos\n\nEstrutura:\n- Cada consultor começa com ◆ (losango)\n- Formato: ◆ NOME DO CONSULTOR | NOME DO CLIENTE\n- Escreva livremente sobre as atividades, desempenho e observações\n- A IA Gemini fará a análise completa e atribuirá o score de risco\n\n================================================================================\nRELATÓRIO DE ATIVIDADES - DEZEMBRO/2025\n================================================================================\n\n◆ João Silva | AUTO AVALIAR\nEstá bastante satisfeito com a equipe, com o projeto e com a empresa. Tem conseguido entregar as demandas dentro do prazo e com qualidade. Recebeu feedback positivo do cliente sobre suas entregas. Demonstra proatividade e boa comunicação.\n\n◆ Pedro Oliveira | CLIENTE ABC\nO CAC me acionou informando que o cliente relatou 2 faltas não justificadas no mês. Conversei com o consultor que informou estar passando por problemas pessoais. Orientei sobre a importância de comunicar ausências previamente. Cliente demonstrou insatisfação.\n\n◆ Maria Santos | CLIENTE XYZ\nApresentou excelente desempenho no mês. Participou ativamente das reuniões, entregou todas as tarefas no prazo e recebeu elogios do cliente pela qualidade técnica. Demonstra proatividade e boa comunicação com a equipe. Sugerida para promoção.`;
    const blob = new Blob([template], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'template_relatorios_atividades.txt';
    a.click();
    URL.revokeObjectURL(url);
  };

  const months = Array.from({ length: 12 }, (_, i) => ({
    value: i + 1,
    label: new Date(0, i).toLocaleString('pt-BR', { month: 'long' }),
  }));

  const currentMonthLabel =
    new Date(currentYear, currentMonth - 1, 1).toLocaleString('pt-BR', { month: 'long' });

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-6xl mx-auto p-4">
      {/* Cabeçalho */}
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-2xl font-bold text-gray-800">Inserir Relatório de Atividades</h2>
        <button
          onClick={downloadTemplate}
          className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition text-sm font-medium"
        >
          Baixar Template de Exemplo
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-4 border-b border-gray-200">
        <button
          onClick={() => setMode('manual')}
          className={`px-6 py-2 font-medium transition text-sm ${
            mode === 'manual'
              ? 'border-b-2 border-blue-600 text-blue-600'
              : 'text-gray-600 hover:text-gray-800'
          }`}
        >
          Digitação Manual
        </button>
        <button
          onClick={() => setMode('import')}
          className={`px-6 py-2 font-medium transition text-sm ${
            mode === 'import'
              ? 'border-b-2 border-blue-600 text-blue-600'
              : 'text-gray-600 hover:text-gray-800'
          }`}
        >
          Importar Arquivo
        </button>
      </div>

      {/* ═══════════════════════ MODO MANUAL ═══════════════════════ */}
      {mode === 'manual' ? (
        <form onSubmit={handleAnalyzeReport} className="space-y-4">

          {/* Cliente + Consultor */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Cliente</label>
              <select
                value={selectedClient}
                onChange={e => {
                  setSelectedClient(e.target.value);
                  setSelectedConsultant('');
                  setPhaseReview(false);
                  setAiResult(null);
                }}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">Selecione um cliente...</option>
                {clients.map(c => (
                  <option key={c.id} value={c.razao_social_cliente}>
                    {c.razao_social_cliente}
                  </option>
                ))}
              </select>
            </div>

            {selectedClient && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Consultor</label>
                <select
                  value={selectedConsultant}
                  onChange={e => {
                    setSelectedConsultant(e.target.value);
                    setPhaseReview(false);
                    setAiResult(null);
                  }}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">Selecione um consultor...</option>
                  {filteredConsultants.map(c => (
                    <option key={c.id} value={c.nome_consultores}>
                      {c.nome_consultores}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Cards Consultor / Gestor */}
          {selectedConsultantData && (
            <div className="bg-gradient-to-r from-blue-50 to-purple-50 border border-gray-200 rounded-lg p-3">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Card Consultor */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2 mb-2">
                    <User className="w-4 h-4 text-blue-600" />
                    <h3 className="text-sm font-semibold text-blue-900">Consultor</h3>
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex items-start gap-2">
                      <User className="w-3 h-3 text-gray-500 mt-0.5 flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="text-xs text-gray-600">Nome</p>
                        <p className="text-xs font-semibold text-gray-800 truncate">
                          {selectedConsultantData.nome_consultores}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-start gap-2">
                      <Mail className="w-3 h-3 text-gray-500 mt-0.5 flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="text-xs text-gray-600">E-mail</p>
                        <p className="text-xs text-gray-800 truncate">
                          {selectedConsultantData.email_consultor || 'Não informado'}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-start gap-2">
                      <Phone className="w-3 h-3 text-gray-500 mt-0.5 flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="text-xs text-gray-600">Celular</p>
                        <p className="text-xs text-gray-800">
                          {selectedConsultantData.celular || 'Não informado'}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Card Gestor */}
                {managerData && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 mb-2">
                      <Briefcase className="w-4 h-4 text-purple-600" />
                      <h3 className="text-sm font-semibold text-purple-900">{managerData.tipo}</h3>
                    </div>
                    <div className="space-y-1.5">
                      <div className="flex items-start gap-2">
                        <User className="w-3 h-3 text-gray-500 mt-0.5 flex-shrink-0" />
                        <div className="min-w-0">
                          <p className="text-xs text-gray-600">Nome</p>
                          <p className="text-xs font-semibold text-gray-800 truncate">{managerData.nome}</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-2">
                        <Briefcase className="w-3 h-3 text-gray-500 mt-0.5 flex-shrink-0" />
                        <div className="min-w-0">
                          <p className="text-xs text-gray-600">Cargo</p>
                          <p className="text-xs text-gray-800 truncate">{managerData.cargo}</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-2">
                        <Mail className="w-3 h-3 text-gray-500 mt-0.5 flex-shrink-0" />
                        <div className="min-w-0">
                          <p className="text-xs text-gray-600">E-mail</p>
                          <p className="text-xs text-gray-800 truncate">{managerData.email}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Botão Histórico */}
                {loadConsultantReports && (
                  <div className="flex items-center justify-center">
                    <button
                      type="button"
                      onClick={handleOpenHistorico}
                      disabled={loadingReports}
                      className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition text-xs font-medium disabled:bg-gray-400 h-fit"
                    >
                      <Clock className="w-4 h-4" />
                      {loadingReports ? 'Carregando...' : 'Histórico (90 dias)'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Mês (fixo, read-only) ─────────────────────────────────────── */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Mês de Referência
                <span className="ml-2 text-xs text-blue-600 font-normal">(mês corrente)</span>
              </label>
              <div className="flex items-center gap-2 w-full border border-gray-200 bg-gray-50 rounded-lg px-3 py-2 text-sm text-gray-700 font-medium">
                <Lock className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                <span className="capitalize">{currentMonthLabel} / {currentYear}</span>
              </div>
              <p className="text-xs text-gray-400 mt-1">Inserção restrita ao mês corrente</p>
            </div>
          </div>

          {/* ── Confidencial ─────────────────────────────────────────────── */}
          <div>
            <label
              className={`inline-flex items-center gap-2.5 cursor-pointer px-4 py-2.5 rounded-lg border transition ${
                confidencial
                  ? 'bg-red-50 border-red-300 shadow-sm'
                  : 'bg-gray-50 border-gray-200 hover:bg-red-50 hover:border-red-200'
              }`}
            >
              <input
                type="checkbox"
                checked={confidencial}
                onChange={e => setConfidencial(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-red-600 focus:ring-red-500"
              />
              <Lock className={`w-4 h-4 ${confidencial ? 'text-red-600' : 'text-gray-400'}`} />
              <span
                className={`text-sm font-semibold ${confidencial ? 'text-red-800' : 'text-gray-600'}`}
              >
                Confidencial
              </span>
              <span className={`text-xs ${confidencial ? 'text-red-600' : 'text-gray-400'}`}>
                — oculto para perfis Consulta e Cliente
              </span>
            </label>
          </div>

          {/* ── Régua de Risco do Analista ───────────────────────────────── */}
          <div className={`rounded-xl border p-4 transition-all ${getRiskBorder(riscoAnalista)} bg-white`}>
            <p className="text-sm font-semibold text-gray-800 mb-4">
              📊 Percepção de Risco de Gestão de Pessoas
            </p>

            {/* Slider com trilha e thumb visíveis */}
            <div className="relative pt-1 pb-2">
              <input
                type="range"
                min={1}
                max={5}
                step={1}
                value={riscoAnalista}
                onChange={e => setRiscoAnalista(parseInt(e.target.value))}
                className="w-full cursor-pointer"
                style={{
                  accentColor:
                    riscoAnalista === 1 ? '#2563eb'
                    : riscoAnalista === 2 ? '#16a34a'
                    : riscoAnalista === 3 ? '#ca8a04'
                    : riscoAnalista === 4 ? '#ea580c'
                    : '#dc2626',
                  height: '6px',
                  WebkitAppearance: 'auto',
                  appearance: 'auto',
                }}
              />
            </div>

            {/* Labels dos marcadores */}
            <div className="flex justify-between mt-3">
              {[
                { val: 1, label: 'Mínimo', tc: 'text-blue-600' },
                { val: 2, label: 'Baixo', tc: 'text-green-600' },
                { val: 3, label: 'Moderado', tc: 'text-yellow-600' },
                { val: 4, label: 'Alto', tc: 'text-orange-600' },
                { val: 5, label: 'Crítico', tc: 'text-red-700' },
              ].map(item => (
                <div
                  key={item.val}
                  className="flex flex-col items-center"
                  style={{ width: '20%' }}
                >
                  <span
                    className={`text-xs font-mono ${item.tc} ${
                      riscoAnalista === item.val ? 'font-bold text-sm' : 'opacity-70'
                    }`}
                  >
                    {String(item.val).padStart(2, '0')}
                  </span>
                  <span
                    className={`text-xs mt-0.5 ${item.tc} ${
                      riscoAnalista === item.val ? 'font-bold' : 'opacity-60'
                    }`}
                  >
                    {item.label}
                  </span>
                </div>
              ))}
            </div>

            {/* Badge do risco selecionado */}
            <div className="mt-3 flex items-center gap-2">
              <span className="text-xs text-gray-500">Risco selecionado:</span>
              <span
                className={`px-3 py-0.5 rounded-full text-white text-xs font-bold ${getRiskBg(riscoAnalista)}`}
              >
                {riscoAnalista} — {getRiskLabel(riscoAnalista)}
              </span>
            </div>
          </div>

          {/* ── Atividades ────────────────────────────────────────────────── */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Atividades e Observações
            </label>
            <textarea
              value={activities}
              onChange={e => {
                setActivities(e.target.value);
                // Se o analista editar o texto depois da análise, volta à fase 1
                if (phaseReview) {
                  setPhaseReview(false);
                  setAiResult(null);
                }
              }}
              placeholder="Descreva as atividades, desempenho e observações sobre o consultor..."
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              rows={8}
              disabled={phaseReview}
            />
            {phaseReview && (
              <p className="text-xs text-gray-400 mt-1">
                Para alterar o texto, clique em "← Corrigir Texto".
              </p>
            )}
          </div>

          {/* ── Painel de Resultado da IA (Fase 2) ───────────────────────── */}
          {phaseReview && aiResult && (
            <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border-2 border-blue-200 rounded-xl p-5">
              <div className="flex items-center gap-2 mb-4">
                <Bot className="w-5 h-5 text-blue-600" />
                <h3 className="text-sm font-bold text-blue-900">
                  Análise da IA — Resultado Consultivo
                </h3>
                <span className="text-xs text-blue-500 ml-1 italic">
                  (apenas informativo — o risco salvo é o da régua acima)
                </span>
              </div>

              {/* Risco da IA */}
              <div className="flex items-center gap-3 mb-4">
                <span className="text-sm text-gray-700 font-medium">Risco identificado pela IA:</span>
                <span
                  className={`px-3 py-1 rounded-full text-white text-sm font-bold ${getRiskBg(
                    aiResult.riskScore ?? 3
                  )}`}
                >
                  {aiResult.riskScore ?? '?'} — {getRiskLabel(aiResult.riskScore ?? 3)}
                </span>
              </div>

              {/* Resumo da IA */}
              {aiResult.summary && (
                <div className="bg-white/80 border border-blue-100 rounded-lg p-3 mb-3">
                  <p className="text-xs font-semibold text-blue-700 mb-1">Resumo da IA:</p>
                  <p className="text-sm text-gray-700 leading-relaxed">{aiResult.summary}</p>
                </div>
              )}

              {/* Padrão negativo */}
              {aiResult.negativePattern && aiResult.negativePattern !== 'Nenhum' && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-3">
                  <p className="text-xs font-semibold text-amber-700 mb-1">⚠️ Padrão identificado:</p>
                  <p className="text-sm text-amber-800">{aiResult.negativePattern}</p>
                </div>
              )}

              {/* Alerta preditivo */}
              {aiResult.predictiveAlert && aiResult.predictiveAlert !== 'Nenhum' && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-3">
                  <p className="text-xs font-semibold text-red-700 mb-1">🔮 Alerta preditivo:</p>
                  <p className="text-sm text-red-800">{aiResult.predictiveAlert}</p>
                </div>
              )}

              {/* Confirmação do risco do analista */}
              <div className="flex items-center gap-2 mt-3 pt-3 border-t border-blue-200">
                <ShieldCheck className="w-4 h-4 text-green-600" />
                <span className="text-xs text-gray-600">
                  Risco a ser salvo (eleito pelo analista):
                </span>
                <span
                  className={`px-3 py-0.5 rounded-full text-white text-xs font-bold ${getRiskBg(
                    riscoAnalista
                  )}`}
                >
                  {riscoAnalista} — {getRiskLabel(riscoAnalista)}
                </span>
                {confidencial && (
                  <span className="ml-2 flex items-center gap-1 px-2 py-0.5 bg-red-100 text-red-700 text-xs font-medium rounded-full border border-red-200">
                    <Lock className="w-3 h-3" />
                    Confidencial
                  </span>
                )}
              </div>
            </div>
          )}

          {/* ── Notificar ─────────────────────────────────────────────────── */}
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-3">
              <Bell className="w-4 h-4 text-amber-600" />
              <h3 className="text-sm font-semibold text-amber-900">Notificar</h3>
              <span className="text-xs text-amber-600 ml-1">
                — Enviar cópia deste relatório por e-mail
              </span>
            </div>
            <div className="flex flex-wrap gap-4">
              {/* Gestão Comercial */}
              <label className="flex items-center gap-2 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={notifComercial}
                  onChange={e => setNotifComercial(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700 group-hover:text-gray-900 font-medium">
                  Gestão Comercial
                </span>
                {notifComercial && (
                  <span className="text-xs text-blue-600 font-medium">
                    ({destinatariosDoCliente.comercial.length} destinatário(s))
                  </span>
                )}
              </label>

              {/* Gestão R&S */}
              <label className="flex items-center gap-2 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={notifRS}
                  onChange={e => setNotifRS(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700 group-hover:text-gray-900 font-medium">
                  Gestão R&S
                </span>
                {notifRS && (
                  <span className="text-xs text-blue-600 font-medium">
                    ({destinatariosDoCliente.rs.length} destinatário(s))
                  </span>
                )}
              </label>

              {/* Gestão de Pessoas */}
              <label className="flex items-center gap-2 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={notifPessoas}
                  onChange={e => setNotifPessoas(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700 group-hover:text-gray-900 font-medium">
                  Gestão Pessoas
                </span>
                {notifPessoas && (
                  <span className="text-xs text-blue-600 font-medium">
                    ({destinatariosDoCliente.pessoas.length} destinatário(s))
                  </span>
                )}
              </label>
            </div>

            {notifComercial && destinatariosDoCliente.comercial.length === 0 && (
              <p className="text-xs text-red-500 mt-2">
                ⚠️ Nenhum usuário de Gestão Comercial associado a este cliente com e-mail cadastrado.
              </p>
            )}
            {notifRS && destinatariosDoCliente.rs.length === 0 && (
              <p className="text-xs text-red-500 mt-2">
                ⚠️ Nenhum usuário de Gestão R&S com e-mail cadastrado.
              </p>
            )}
            {notifPessoas && destinatariosDoCliente.pessoas.length === 0 && (
              <p className="text-xs text-red-500 mt-2">
                ⚠️ Nenhum usuário de Gestão de Pessoas associado a este cliente com e-mail cadastrado.
              </p>
            )}

            {enviandoEmails && (
              <p className="text-xs text-blue-600 mt-2 flex items-center gap-1">
                <span className="animate-spin">⏳</span> Enviando notificações...
              </p>
            )}
          </div>

          {/* ── Botões ────────────────────────────────────────────────────── */}
          <div className="flex justify-end gap-3 flex-wrap">
            {/* Limpar */}
            <button
              type="button"
              onClick={() => {
                setSelectedClient('');
                setSelectedConsultant('');
                setActivities('');
                setConfidencial(false);
                setRiscoAnalista(3);
                setPhaseReview(false);
                setAiResult(null);
                setNotifComercial(false);
                setNotifRS(false);
                setNotifPessoas(false);
              }}
              className="px-5 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition text-sm font-medium"
            >
              Limpar
            </button>

            {/* Corrigir Texto (visível apenas na Fase 2) */}
            {phaseReview && (
              <button
                type="button"
                onClick={() => {
                  setPhaseReview(false);
                  setAiResult(null);
                }}
                className="px-5 py-2 border border-indigo-300 rounded-lg text-indigo-700 hover:bg-indigo-50 transition text-sm font-medium"
              >
                ← Corrigir Texto
              </button>
            )}

            {/* Enviar Relatório (Fase 1) — oculto quando já analisado */}
            {!phaseReview && (
              <button
                type="submit"
                disabled={isAnalyzing || !selectedConsultant || !activities.trim()}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:bg-gray-400 text-sm font-medium"
              >
                {isAnalyzing ? '🤖 Analisando...' : 'Enviar Relatório'}
              </button>
            )}

            {/* Salvar Atividade (Fase 2) */}
            {phaseReview && (
              <button
                type="button"
                onClick={handleSaveActivity}
                disabled={isSubmitting}
                className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition disabled:bg-gray-400 text-sm font-medium"
              >
                {isSubmitting ? '💾 Salvando...' : '✅ Salvar Atividade'}
              </button>
            )}
          </div>
        </form>
      ) : (
        /* ═══════════════════════ MODO IMPORTAR ═══════════════════════ */
        <div className="space-y-4">
          <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
            <input
              type="file"
              accept=".pdf,.txt"
              onChange={handleFileUpload}
              className="hidden"
              id="file-upload"
            />
            <label
              htmlFor="file-upload"
              className="cursor-pointer inline-block px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition text-sm font-medium"
            >
              Selecionar PDF ou TXT
            </label>
            {uploadedFile && (
              <div className="mt-3 text-sm text-gray-600">
                <p>
                  <strong>Arquivo:</strong> {uploadedFile.name}
                </p>
              </div>
            )}
            {isExtracting && <p className="mt-3 text-blue-600 text-sm">Extraindo texto...</p>}
          </div>

          {/* Info de mês fixo no import */}
          {uploadedFile && !isExtracting && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-center gap-3">
              <Lock className="w-4 h-4 text-blue-500 flex-shrink-0" />
              <div>
                <p className="text-sm font-semibold text-blue-800">
                  Mês de referência: <span className="capitalize">{currentMonthLabel} / {currentYear}</span>
                </p>
                <p className="text-xs text-blue-600 mt-0.5">
                  A importação sempre registra no mês corrente.
                </p>
              </div>
            </div>
          )}

          {extractedText && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Texto Extraído
              </label>
              <textarea
                value={extractedText}
                onChange={e => setExtractedText(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                rows={12}
              />
            </div>
          )}
          <div className="flex justify-end">
            <button
              onClick={handleImportSubmit}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:bg-gray-400 text-sm font-medium"
              disabled={isSubmitting || !extractedText}
            >
              {isSubmitting ? 'Processando...' : 'Importar e Processar'}
            </button>
          </div>
        </div>
      )}

      {/* Modal de Histórico */}
      {showHistoricoModal && selectedConsultantData && (
        <HistoricoAtividadesModal
          consultant={selectedConsultantData}
          allReports={consultantReports}
          onClose={() => setShowHistoricoModal(false)}
        />
      )}
    </div>
  );
};

export default AtividadesInserir;
