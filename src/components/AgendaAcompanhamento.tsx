// src/components/AgendaAcompanhamento.tsx
// 🆕 v2.0 - Melhorias de UX e novos indicadores
// ✅ [1] "Feito Hoje" → "Realizado"
// ✅ [2] Filtro por status na aba Consultores desktop (Atrasado/Pendente/Realizado/Semanal)
// ✅ [3] Card "Dias Úteis" removido
// ✅ [4] Dashboards menores + 2ª linha com KPIs do mês (Atrasados/Pendentes/Realizados Mês/Realizado Hoje)
// ✅ [5] Filtro de status no form mobile (Todos/Atrasado/Pendente/Realizado/Semanal)
// ✅ [6] Nova aba "Gráfico de Orientação" com Recharts — Previsto × Realizado (Semana/Mês/Ano)

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Consultant, Client, User, UsuarioCliente, CoordenadorCliente, ConsultantReport } from '@/types';
import { Calendar, ChevronLeft, ChevronRight, AlertTriangle, Clock, CheckCircle2, XCircle, Info, BarChart2 } from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';

// ─────────────────────────────────────────────────────────────────────────────
// TYPES INTERNOS
// ─────────────────────────────────────────────────────────────────────────────

type ActivityStatus = 'done' | 'pending' | 'overdue';

interface ScheduledConsultant {
  consultant: Consultant;
  client: Client | undefined;
  scheduledDays: number[];
  isWeekly: boolean;
  lastActivityDate: string | null;
  todayStatus: ActivityStatus;
}

interface DaySchedule {
  day: number;
  date: Date;
  isWeekend: boolean;
  isHoliday: boolean;
  consultants: ScheduledConsultant[];
}

interface AgendaAcompanhamentoProps {
  consultants: Consultant[];
  clients: Client[];
  users: User[];
  usuariosCliente: UsuarioCliente[];
  coordenadoresCliente?: CoordenadorCliente[];
  currentUser: User;
  loadConsultantReports: (consultantId: number) => Promise<ConsultantReport[]>;
  onNavigateToAtividades: (clientName?: string, consultantName?: string) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

const getValidFinalScore = (consultant: Consultant): number | null => {
  const score = consultant.parecer_final_consultor;
  if (score === null || score === undefined || String(score) === '#FFFF') return null;
  const numScore = typeof score === 'string' ? parseInt(score, 10) : score;
  if (isNaN(numScore) || numScore < 1 || numScore > 5) return null;
  return numScore;
};

const isNewConsultant = (consultant: Consultant): boolean => {
  if (!consultant.data_inclusao_consultores) return false;
  try {
    const hire = new Date(consultant.data_inclusao_consultores);
    const diffDays = Math.ceil((Date.now() - hire.getTime()) / (1000 * 60 * 60 * 24));
    return diffDays < 45;
  } catch { return false; }
};

const needsWeeklyTracking = (consultant: Consultant): boolean => {
  const score = getValidFinalScore(consultant);
  const isNew = isNewConsultant(consultant);
  return score !== null && (score === 4 || score === 5) || isNew;
};

const FERIADOS_FIXOS = [
  { month: 1, day: 1 },
  { month: 4, day: 21 },
  { month: 5, day: 1 },
  { month: 9, day: 7 },
  { month: 10, day: 12 },
  { month: 11, day: 2 },
  { month: 11, day: 15 },
  { month: 12, day: 25 },
];

const isHoliday = (date: Date): boolean =>
  FERIADOS_FIXOS.some(h => h.month === date.getMonth() + 1 && h.day === date.getDate());

const isWeekend = (date: Date): boolean => {
  const d = date.getDay();
  return d === 0 || d === 6;
};

const getBusinessDays = (year: number, month: number): number[] => {
  const days: number[] = [];
  const totalDays = new Date(year, month, 0).getDate();
  for (let d = 1; d <= totalDays; d++) {
    const date = new Date(year, month - 1, d);
    if (!isWeekend(date) && !isHoliday(date)) days.push(d);
  }
  return days;
};

const SCORE_LABEL: Record<number, string> = {
  1: 'Mínimo', 2: 'Baixo', 3: 'Moderado', 4: 'Alto', 5: 'Crítico'
};
const SCORE_COLOR: Record<number, string> = {
  1: '#1976d2', 2: '#388e3c', 3: '#fbc02d', 4: '#f57c00', 5: '#d32f2f'
};

const monthNames = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENTE PRINCIPAL
// ─────────────────────────────────────────────────────────────────────────────

const AgendaAcompanhamento: React.FC<AgendaAcompanhamentoProps> = ({
  consultants,
  clients,
  users,
  usuariosCliente,
  currentUser,
  loadConsultantReports,
  onNavigateToAtividades,
}) => {
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth() + 1);
  const [selectedDay, setSelectedDay] = useState<number | null>(today.getDate());
  const [filterManager, setFilterManager] = useState<string>('all');
  const [filterScore, setFilterScore] = useState<string>('all');
  const [filterSearch, setFilterSearch] = useState<string>('');
  const [activityCache, setActivityCache] = useState<Record<number, ConsultantReport[]>>({});
  const [loadingIds, setLoadingIds] = useState<Set<number>>(new Set());
  const [expandedConsultant, setExpandedConsultant] = useState<number | null>(null);

  // ✅ [2] Filtro de status na aba Consultores desktop
  const [consultoresStatusFilter, setConsultoresStatusFilter] = useState<'todos' | 'atrasado' | 'pendente' | 'realizado' | 'semanal'>('todos');

  // Filtro do painel lateral do dia (desktop calendário)
  const [painelDiaFilter, setPainelDiaFilter] = useState<'todos' | 'atrasado' | 'pendente' | 'realizado' | 'semanal'>('todos');

  const isCurrentMonth = viewYear === today.getFullYear() && viewMonth === today.getMonth() + 1;
  const todayDay = today.getDate();

  // ── Detecção de tela mobile
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);
  const [mobileTab, setMobileTab] = useState<'hoje' | 'agenda' | 'lista'>('hoje');
  // ✅ [5] mobileFilter expandido com 'pendente' e 'realizado'
  const [mobileFilter, setMobileFilter] = useState<'todos' | 'semanal' | 'atrasado' | 'pendente' | 'realizado'>('todos');

  // ── Aba desktop: Calendário, Consultores ou Gráfico
  // ✅ [6] Nova aba 'grafico'
  const [desktopTab, setDesktopTab] = useState<'calendario' | 'consultores' | 'grafico'>('calendario');

  // ✅ [6] Controle do gráfico: granularidade e período
  const [graficoGranularidade, setGraficoGranularidade] = useState<'semana' | 'mes' | 'ano'>('mes');
  const [graficoPeriodoOffset, setGraficoPeriodoOffset] = useState<number>(0); // 0 = atual, -1 = anterior, etc.

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // ── Gestores de Pessoas disponíveis para filtro
  const gpManagers = useMemo(() =>
    users.filter(u => u.tipo_usuario === 'Gestão de Pessoas' && u.ativo_usuario)
      .sort((a, b) => a.nome_usuario.localeCompare(b.nome_usuario))
  , [users]);

  // ── Consultores ativos em acompanhamento
  const activeConsultants = useMemo(() => {
    const currentYear = new Date().getFullYear();
    let list = consultants.filter(c =>
      c.status === 'Ativo' &&
      (c.ano_vigencia === currentYear || c.ano_vigencia === null || c.ano_vigencia === undefined)
    );

    if (filterManager !== 'all') {
      const managerId = parseInt(filterManager, 10);
      list = list.filter(c => {
        const gestor = usuariosCliente.find(uc => uc.id === c.gestor_imediato_id);
        if (!gestor) return false;
        const clienteDoConsultor = clients.find(cl => cl.id === gestor.id_cliente);
        return clienteDoConsultor && Number(clienteDoConsultor.id_gestao_de_pessoas) === managerId;
      });
    }

    if (filterScore !== 'all') {
      if (filterScore === 'weekly') {
        list = list.filter(c => needsWeeklyTracking(c));
      } else if (filterScore === 'new') {
        list = list.filter(c => isNewConsultant(c));
      } else {
        const scoreNum = parseInt(filterScore, 10);
        list = list.filter(c => getValidFinalScore(c) === scoreNum);
      }
    }

    if (filterSearch.trim()) {
      const search = filterSearch.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      list = list.filter(c => {
        const nome = (c.nome_consultores || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        return nome.includes(search);
      });
    }

    return list;
  }, [consultants, clients, usuariosCliente, filterManager, filterScore, filterSearch]);

  // ── Carregar atividades do cache ou Supabase
  const loadActivity = useCallback(async (consultantId: number) => {
    if (activityCache[consultantId] !== undefined) return;
    if (loadingIds.has(consultantId)) return;

    setLoadingIds(prev => new Set(prev).add(consultantId));
    try {
      const reports = await loadConsultantReports(consultantId);
      setActivityCache(prev => ({ ...prev, [consultantId]: reports }));
    } catch {
      setActivityCache(prev => ({ ...prev, [consultantId]: [] }));
    } finally {
      setLoadingIds(prev => { const s = new Set(prev); s.delete(consultantId); return s; });
    }
  }, [activityCache, loadingIds, loadConsultantReports]);

  useEffect(() => {
    if (!selectedDay) return;
    activeConsultants.forEach(c => {
      if (activityCache[c.id] === undefined) {
        loadActivity(c.id);
      }
    });
  }, [selectedDay, activeConsultants]); // eslint-disable-line

  // ── Calcular status de atividade do consultor hoje
  const getActivityStatus = useCallback((consultantId: number): ActivityStatus => {
    const reports = activityCache[consultantId];
    if (!reports) return 'pending';

    const todayStr = today.toISOString().split('T')[0];
    const hasToday = reports.some(r => {
      const d = (r.created_at || '').split('T')[0];
      return d === todayStr;
    });
    if (hasToday) return 'done';

    if (reports.length === 0) return 'pending';
    const lastReport = reports.sort((a, b) =>
      new Date(b.created_at || '').getTime() - new Date(a.created_at || '').getTime()
    )[0];
    const lastDate = new Date(lastReport.created_at || '');
    const diffDays = Math.floor((today.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays > 1 && isCurrentMonth) return 'overdue';
    return 'pending';
  }, [activityCache, today, isCurrentMonth]);

  const getLastActivityDate = useCallback((consultantId: number): string | null => {
    const reports = activityCache[consultantId];
    if (!reports || reports.length === 0) return null;
    const sorted = [...reports].sort((a, b) =>
      new Date(b.created_at || '').getTime() - new Date(a.created_at || '').getTime()
    );
    const d = new Date(sorted[0].created_at || '');
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }, [activityCache]);

  // ── Distribuição inteligente no mês
  const schedule = useMemo((): DaySchedule[] => {
    const businessDays = getBusinessDays(viewYear, viewMonth);
    const totalDays = new Date(viewYear, viewMonth, 0).getDate();

    const weeklyConsultants = activeConsultants.filter(c => needsWeeklyTracking(c));
    const monthlyConsultants = activeConsultants.filter(c => !needsWeeklyTracking(c));

    const weekGroups: number[][] = [[], [], [], [], []];
    businessDays.forEach(d => {
      const date = new Date(viewYear, viewMonth - 1, d);
      const weekOfMonth = Math.floor((d + new Date(viewYear, viewMonth - 1, 1).getDay() - 1) / 7);
      const idx = Math.min(weekOfMonth, 4);
      weekGroups[idx].push(d);
    });
    const filledWeeks = weekGroups.filter(w => w.length > 0);

    const dayMap: Record<number, ScheduledConsultant[]> = {};
    businessDays.forEach(d => { dayMap[d] = []; });

    if (monthlyConsultants.length > 0 && businessDays.length > 0) {
      monthlyConsultants.forEach((consultant, idx) => {
        const dayIndex = idx % businessDays.length;
        const day = businessDays[dayIndex];
        const clientInfo = clients.find(cl => {
          const gestor = usuariosCliente.find(uc => uc.id === consultant.gestor_imediato_id);
          return gestor && cl.id === gestor.id_cliente;
        });
        dayMap[day].push({
          consultant,
          client: clientInfo,
          scheduledDays: [day],
          isWeekly: false,
          lastActivityDate: null,
          todayStatus: 'pending',
        });
      });
    }

    if (weeklyConsultants.length > 0 && filledWeeks.length > 0) {
      weeklyConsultants.forEach((consultant, idx) => {
        const clientInfo = clients.find(cl => {
          const gestor = usuariosCliente.find(uc => uc.id === consultant.gestor_imediato_id);
          return gestor && cl.id === gestor.id_cliente;
        });
        const scheduledDays: number[] = [];
        filledWeeks.forEach(week => {
          const dayInWeek = week[idx % week.length];
          scheduledDays.push(dayInWeek);
          dayMap[dayInWeek] = dayMap[dayInWeek] || [];
          dayMap[dayInWeek].push({
            consultant,
            client: clientInfo,
            scheduledDays,
            isWeekly: true,
            lastActivityDate: null,
            todayStatus: 'pending',
          });
        });
      });
    }

    const result: DaySchedule[] = [];
    for (let d = 1; d <= totalDays; d++) {
      const date = new Date(viewYear, viewMonth - 1, d);
      result.push({
        day: d,
        date,
        isWeekend: isWeekend(date),
        isHoliday: isHoliday(date),
        consultants: dayMap[d] || [],
      });
    }
    return result;
  }, [activeConsultants, viewYear, viewMonth, clients, usuariosCliente]);

  const selectedDaySchedule = useMemo(() =>
    schedule.find(d => d.day === selectedDay) || null
  , [schedule, selectedDay]);

  // ── Estatísticas do mês (expandidas para incluir novos KPIs)
  const stats = useMemo(() => {
    const totalConsultants = activeConsultants.length;
    const weeklyCount = activeConsultants.filter(c => needsWeeklyTracking(c)).length;
    const monthlyCount = totalConsultants - weeklyCount;
    const businessDaysCount = getBusinessDays(viewYear, viewMonth).length;

    // Realizado hoje
    const todayStr = today.toISOString().split('T')[0];
    const doneToday = Object.entries(activityCache).filter(([id, reports]) => {
      if (!isCurrentMonth) return false;
      // só contar consultores ativos
      const idNum = parseInt(id, 10);
      if (!activeConsultants.find(c => c.id === idNum)) return false;
      return reports.some(r => (r.created_at || '').split('T')[0] === todayStr);
    }).length;

    // ✅ [4] Novos KPIs do mês corrente
    // Apenas consultores cujos dados já foram carregados no cache
    const loadedConsultants = activeConsultants.filter(c => activityCache[c.id] !== undefined);

    // Realizados no mês (pelo menos 1 relatório com month=viewMonth e year=viewYear)
    const realizadosMes = loadedConsultants.filter(c => {
      const reports = activityCache[c.id] || [];
      return reports.some(r => {
        const rYear = r.year ?? new Date(r.created_at || '').getFullYear();
        const rMonth = r.month ?? (new Date(r.created_at || '').getMonth() + 1);
        return rYear === viewYear && rMonth === viewMonth;
      });
    }).length;

    // Pendentes do mês = ativos sem relatório no mês
    const pendentesMes = loadedConsultants.filter(c => {
      const reports = activityCache[c.id] || [];
      return !reports.some(r => {
        const rYear = r.year ?? new Date(r.created_at || '').getFullYear();
        const rMonth = r.month ?? (new Date(r.created_at || '').getMonth() + 1);
        return rYear === viewYear && rMonth === viewMonth;
      });
    }).length;

    // Atrasados = overdue (status calculado)
    const atrasados = loadedConsultants.filter(c => getActivityStatus(c.id) === 'overdue').length;

    return { totalConsultants, weeklyCount, monthlyCount, businessDaysCount, doneToday, realizadosMes, pendentesMes, atrasados };
  }, [activeConsultants, viewYear, viewMonth, activityCache, isCurrentMonth, today, getActivityStatus]);

  // ── Navegação de mês
  const prevMonth = () => {
    if (viewMonth === 1) { setViewMonth(12); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
    setSelectedDay(null);
  };
  const nextMonth = () => {
    if (viewMonth === 12) { setViewMonth(1); setViewYear(y => y + 1); }
    else setViewMonth(m => m + 1);
    setSelectedDay(null);
  };
  const goToToday = () => {
    setViewYear(today.getFullYear());
    setViewMonth(today.getMonth() + 1);
    setSelectedDay(today.getDate());
  };

  const getStatusStyle = (status: ActivityStatus) => {
    switch (status) {
      case 'done': return 'bg-green-500 border-green-600 text-white';
      case 'overdue': return 'bg-red-500 border-red-600 text-white';
      default: return 'bg-blue-500 border-blue-600 text-white';
    }
  };
  const getStatusIcon = (status: ActivityStatus) => {
    switch (status) {
      case 'done': return <CheckCircle2 size={12} />;
      case 'overdue': return <XCircle size={12} />;
      default: return <Clock size={12} />;
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // ✅ [6] DADOS DO GRÁFICO DE ORIENTAÇÃO
  // Previsto = consultores × frequência distribuídos nos dias
  // Realizado = relatórios com created_at no período
  // ─────────────────────────────────────────────────────────────────────────

  const graficoData = useMemo(() => {
    // Calcula o período de referência com base na granularidade e offset
    const baseDate = new Date(today);

    if (graficoGranularidade === 'semana') {
      // Gerar dados das últimas N semanas (offset muda semana)
      const semanas: { label: string; previsto: number; realizado: number }[] = [];
      const numSemanas = 8;
      for (let i = numSemanas - 1 + graficoPeriodoOffset; i >= graficoPeriodoOffset; i--) {
        const semStart = new Date(today);
        semStart.setDate(today.getDate() - today.getDay() - i * 7); // início da semana
        semStart.setHours(0, 0, 0, 0);
        const semEnd = new Date(semStart);
        semEnd.setDate(semStart.getDate() + 6);
        semEnd.setHours(23, 59, 59, 999);

        // Previsto: consultores agendados nesta semana
        const semYear = semStart.getFullYear();
        const semMonth = semStart.getMonth() + 1;
        const businessDaysInSem = getBusinessDays(semYear, semMonth).filter(d => {
          const dt = new Date(semYear, semMonth - 1, d);
          return dt >= semStart && dt <= semEnd;
        });
        let previstoSem = 0;
        businessDaysInSem.forEach(d => {
          const dayInfo = schedule.find(s => s.day === d);
          if (dayInfo) previstoSem += dayInfo.consultants.length;
        });

        // Realizado: relatórios com created_at na semana
        let realizadoSem = 0;
        Object.values(activityCache).forEach(reports => {
          reports.forEach(r => {
            const rDate = new Date(r.created_at || '');
            if (rDate >= semStart && rDate <= semEnd) realizadoSem++;
          });
        });

        const label = `${semStart.getDate().toString().padStart(2,'0')}/${(semStart.getMonth()+1).toString().padStart(2,'0')}`;
        semanas.push({ label, previsto: previstoSem, realizado: realizadoSem });
      }
      return semanas;
    }

    if (graficoGranularidade === 'mes') {
      // Últimos 6 meses (offset muda bloco de 6 meses)
      const meses: { label: string; previsto: number; realizado: number }[] = [];
      const numMeses = 6;
      for (let i = numMeses - 1 + (graficoPeriodoOffset * numMeses); i >= graficoPeriodoOffset * numMeses; i--) {
        const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
        const yr = d.getFullYear();
        const mo = d.getMonth() + 1;

        // Previsto = dias úteis × média de consultores/dia no mês
        const bizDays = getBusinessDays(yr, mo);
        const totalConsultants = activeConsultants.length;
        const weeklyC = activeConsultants.filter(c => needsWeeklyTracking(c)).length;
        const monthlyC = totalConsultants - weeklyC;
        // Semanal: ~4 contatos/mês por consultor; mensal: 1 contato/mês
        const previsto = weeklyC * 4 + monthlyC;

        // Realizado: relatórios com month=mo e year=yr
        let realizado = 0;
        Object.values(activityCache).forEach(reports => {
          reports.forEach(r => {
            const rYear = r.year ?? new Date(r.created_at || '').getFullYear();
            const rMonth = r.month ?? (new Date(r.created_at || '').getMonth() + 1);
            if (rYear === yr && rMonth === mo) realizado++;
          });
        });

        meses.push({ label: `${monthNames[mo-1].slice(0,3)}/${yr.toString().slice(-2)}`, previsto, realizado });
      }
      return meses;
    }

    if (graficoGranularidade === 'ano') {
      // Anos disponíveis (últimos 3 anos + offset)
      const anos: { label: string; previsto: number; realizado: number }[] = [];
      const numAnos = 3;
      const baseYear = today.getFullYear() + graficoPeriodoOffset;
      for (let yr = baseYear - numAnos + 1; yr <= baseYear; yr++) {
        const totalConsultants = activeConsultants.length;
        const weeklyC = activeConsultants.filter(c => needsWeeklyTracking(c)).length;
        const monthlyC = totalConsultants - weeklyC;
        // 12 meses: semanal 4x/mês × 12 + mensal 1x/mês × 12
        const previsto = (weeklyC * 4 + monthlyC) * 12;

        let realizado = 0;
        Object.values(activityCache).forEach(reports => {
          reports.forEach(r => {
            const rYear = r.year ?? new Date(r.created_at || '').getFullYear();
            if (rYear === yr) realizado++;
          });
        });

        anos.push({ label: String(yr), previsto, realizado });
      }
      return anos;
    }

    return [];
  }, [graficoGranularidade, graficoPeriodoOffset, activeConsultants, activityCache, schedule, today]);

  // Label do período atual para o gráfico
  const graficoPeriodoLabel = useMemo(() => {
    if (graficoGranularidade === 'semana') {
      const offset = graficoPeriodoOffset;
      if (offset === 0) return 'Últimas 8 semanas';
      return offset < 0 ? `${Math.abs(offset * 8)} semanas atrás` : `${offset * 8} semanas à frente`;
    }
    if (graficoGranularidade === 'mes') {
      if (graficoPeriodoOffset === 0) return 'Últimos 6 meses';
      const d = new Date(today.getFullYear(), today.getMonth() - graficoPeriodoOffset * 6, 1);
      return `${monthNames[d.getMonth()]} ${d.getFullYear()} — ${monthNames[(d.getMonth()+5)%12]} ${d.getFullYear() + Math.floor((d.getMonth()+5)/12)}`;
    }
    if (graficoGranularidade === 'ano') {
      const baseYear = today.getFullYear() + graficoPeriodoOffset;
      return `${baseYear - 2} — ${baseYear}`;
    }
    return '';
  }, [graficoGranularidade, graficoPeriodoOffset, today]);

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER MOBILE — 3 abas: Hoje / Agenda / Consultores
  // ─────────────────────────────────────────────────────────────────────────

  const renderConsultantCardMobile = (sc: ScheduledConsultant) => {
    const score = getValidFinalScore(sc.consultant);
    const isNew = isNewConsultant(sc.consultant);
    const status = getActivityStatus(sc.consultant.id);
    const loading = loadingIds.has(sc.consultant.id);
    const lastDate = getLastActivityDate(sc.consultant.id);
    const isExpanded = expandedConsultant === sc.consultant.id;

    return (
      <div
        key={sc.consultant.id}
        className={`rounded-xl border transition ${sc.isWeekly ? 'border-orange-200 bg-orange-50' : 'border-gray-200 bg-white'}`}
      >
        <div className="p-3">
          <div className="flex items-start justify-between gap-2 mb-1.5">
            <div className="flex flex-wrap gap-1">
              {sc.isWeekly && (
                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-orange-100 text-orange-700 text-xs rounded-full font-medium">
                  <AlertTriangle size={9} /> Semanal
                </span>
              )}
              {isNew && (
                <span className="inline-flex px-1.5 py-0.5 bg-purple-100 text-purple-700 text-xs rounded-full font-medium">Novo</span>
              )}
              {score !== null && (
                <span className="inline-flex px-1.5 py-0.5 text-white text-xs rounded-full font-medium"
                  style={{ backgroundColor: SCORE_COLOR[score] }}>
                  {SCORE_LABEL[score]}
                </span>
              )}
            </div>
            <button
              onClick={() => onNavigateToAtividades(sc.client?.razao_social_cliente, sc.consultant.nome_consultores)}
              disabled={loading}
              className={`
                flex items-center gap-1 px-2.5 py-1.5 rounded-lg border-2 text-xs font-bold
                transition-all flex-shrink-0
                ${loading ? 'bg-gray-100 border-gray-200 text-gray-400 cursor-wait' : ''}
                ${!loading && status === 'done' ? 'bg-green-50 border-green-500 text-green-700' : ''}
                ${!loading && status === 'overdue' ? 'bg-red-50 border-red-500 text-red-700 animate-pulse' : ''}
                ${!loading && status === 'pending' ? 'bg-blue-50 border-blue-500 text-blue-700' : ''}
              `}
            >
              {loading ? <Clock size={12} className="animate-spin" /> : getStatusIcon(status)}
              <span>+Atividade</span>
            </button>
          </div>

          <p className="text-sm font-semibold text-gray-800 truncate">{sc.consultant.nome_consultores}</p>
          {sc.client && <p className="text-xs text-gray-500 truncate">{sc.client.razao_social_cliente}</p>}
          {lastDate && <p className="text-xs text-gray-400 mt-0.5">Último: {lastDate}</p>}

          <button
            onClick={() => setExpandedConsultant(isExpanded ? null : sc.consultant.id)}
            className="text-xs text-indigo-500 hover:text-indigo-700 mt-1 transition"
          >
            {isExpanded ? '▲ Ocultar' : '▼ Detalhes'}
          </button>
        </div>

        {isExpanded && (
          <div className="border-t border-gray-100 px-3 pb-3 pt-2 space-y-1.5 bg-gray-50 rounded-b-xl">
            {sc.consultant.cargo_consultores && (
              <p className="text-xs text-gray-600"><span className="font-medium">Cargo:</span> {sc.consultant.cargo_consultores}</p>
            )}
            {sc.consultant.email_consultor && (
              <p className="text-xs text-gray-600">
                <span className="font-medium">E-mail:</span>{' '}
                <a href={`mailto:${sc.consultant.email_consultor}`} className="text-indigo-600">{sc.consultant.email_consultor}</a>
              </p>
            )}
            {sc.consultant.celular && (
              <p className="text-xs text-gray-600">
                <span className="font-medium">Celular:</span>{' '}
                <a href={`tel:${sc.consultant.celular}`} className="text-indigo-600">{sc.consultant.celular}</a>
              </p>
            )}
          </div>
        )}
      </div>
    );
  };

  if (isMobile) {
    const todaySchedule = schedule.find(d => d.day === selectedDay);
    const todayConsultants = todaySchedule?.consultants ?? [];

    // ✅ [5] Filtro mobile expandido
    const filteredListConsultants = activeConsultants.filter(c => {
      if (mobileFilter === 'semanal') return needsWeeklyTracking(c);
      if (mobileFilter === 'atrasado') return getActivityStatus(c.id) === 'overdue';
      if (mobileFilter === 'pendente') return getActivityStatus(c.id) === 'pending';
      if (mobileFilter === 'realizado') return getActivityStatus(c.id) === 'done';
      return true;
    });

    const toScheduledConsultant = (c: Consultant): ScheduledConsultant => {
      const clientInfo = clients.find(cl => {
        const gestor = usuariosCliente.find(uc => uc.id === c.gestor_imediato_id);
        return gestor && cl.id === gestor.id_cliente;
      });
      return {
        consultant: c,
        client: clientInfo,
        scheduledDays: [],
        isWeekly: needsWeeklyTracking(c),
        lastActivityDate: getLastActivityDate(c.id),
        todayStatus: getActivityStatus(c.id),
      };
    };

    return (
      <div className="flex flex-col h-screen bg-gray-50">

        {/* ── TOP BAR MOBILE */}
        <div className="bg-indigo-600 text-white px-4 pt-4 pb-0 flex-shrink-0">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h1 className="text-base font-semibold leading-tight">Agenda de Acompanhamento</h1>
              {/* ✅ [1] "feito(s) hoje" → "realizado(s) hoje" */}
              <p className="text-xs text-indigo-200 mt-0.5">
                {stats.doneToday} realizado(s) hoje · {stats.totalConsultants} consultores
              </p>
            </div>
            <button
              onClick={goToToday}
              className="text-xs bg-white text-indigo-600 font-semibold px-3 py-1.5 rounded-lg"
            >
              Hoje
            </button>
          </div>

          {/* ── Filtros: Gestão de Pessoas + Busca por nome */}
          <div className="flex flex-col gap-1.5 mb-2">
            {gpManagers.length > 0 && (
              <select
                value={filterManager}
                onChange={e => setFilterManager(e.target.value)}
                className="w-full border border-indigo-400 rounded-lg px-3 py-1.5 text-xs bg-indigo-700 text-white focus:ring-2 focus:ring-white focus:border-transparent"
              >
                <option value="all">👥 Todas as gestoras</option>
                {gpManagers.map(u => (
                  <option key={u.id} value={String(u.id)}>{u.nome_usuario}</option>
                ))}
              </select>
            )}
            <div className="relative">
              <input
                type="text"
                value={filterSearch}
                onChange={e => setFilterSearch(e.target.value)}
                placeholder="🔍 Buscar consultor..."
                className="w-full border border-indigo-400 rounded-lg pl-3 pr-7 py-1.5 text-xs bg-indigo-700 text-white placeholder-indigo-300 focus:ring-2 focus:ring-white focus:border-transparent"
              />
              {filterSearch && (
                <button
                  onClick={() => setFilterSearch('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-indigo-300 hover:text-white text-xs font-bold"
                >✕</button>
              )}
            </div>
          </div>

          {/* ── ABAS */}
          <div className="flex gap-1">
            {(['hoje', 'agenda', 'lista'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setMobileTab(tab)}
                className={`flex-1 py-2 text-xs font-semibold rounded-t-lg transition
                  ${mobileTab === tab ? 'bg-white text-indigo-600' : 'text-indigo-200 hover:text-white'}`}
              >
                {tab === 'hoje' && '📋 Hoje'}
                {tab === 'agenda' && '📅 Agenda'}
                {tab === 'lista' && '👥 Consultores'}
              </button>
            ))}
          </div>
        </div>

        {/* ── ABA: HOJE */}
        {mobileTab === 'hoje' && (
          <div className="flex flex-col flex-1 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 bg-white border-b border-gray-100 flex-shrink-0">
              <span className="text-sm font-semibold text-gray-800">
                {todaySchedule
                  ? todaySchedule.date.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })
                  : 'Selecione um dia na aba Agenda'}
              </span>
              <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-medium">
                {todayConsultants.length} agendado(s)
              </span>
            </div>
            <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
              {todayConsultants.length === 0 ? (
                <div className="text-center py-12 text-gray-400">
                  <Calendar size={36} className="mx-auto mb-2 opacity-30" />
                  <p className="text-sm">Nenhum consultor agendado</p>
                  <p className="text-xs mt-1 text-gray-400">Toque em "Agenda" para selecionar um dia</p>
                </div>
              ) : (
                todayConsultants.map(sc => renderConsultantCardMobile(sc))
              )}
            </div>
          </div>
        )}

        {/* ── ABA: AGENDA (Calendário Mensal) */}
        {mobileTab === 'agenda' && (
          <div className="flex-1 overflow-y-auto px-3 py-3">
            <div className="flex items-center justify-between mb-3">
              <button onClick={prevMonth} className="p-2 rounded-lg bg-white border border-gray-200 text-gray-600">
                <ChevronLeft size={18} />
              </button>
              <h2 className="text-sm font-semibold text-gray-800">
                {monthNames[viewMonth - 1]} {viewYear}
              </h2>
              <button onClick={nextMonth} className="p-2 rounded-lg bg-white border border-gray-200 text-gray-600">
                <ChevronRight size={18} />
              </button>
            </div>

            <div className="grid grid-cols-7 gap-1 mb-1">
              {['D','S','T','Q','Q','S','S'].map((d, i) => (
                <div key={i} className="text-center text-xs font-semibold text-gray-400 py-1">{d}</div>
              ))}
            </div>

            {(() => {
              const firstDayOfWeek = new Date(viewYear, viewMonth - 1, 1).getDay();
              const cells: React.ReactNode[] = [];
              for (let i = 0; i < firstDayOfWeek; i++) cells.push(<div key={`e-${i}`} />);

              schedule.forEach(dayInfo => {
                const isToday = isCurrentMonth && dayInfo.day === todayDay;
                const isSelected = dayInfo.day === selectedDay;
                const isOff = dayInfo.isWeekend || dayInfo.isHoliday;
                const weeklyCount = dayInfo.consultants.filter(sc => sc.isWeekly).length;
                const monthlyCount = dayInfo.consultants.length - weeklyCount;

                cells.push(
                  <button
                    key={dayInfo.day}
                    onClick={() => {
                      if (!isOff) {
                        setSelectedDay(dayInfo.day);
                        setMobileTab('hoje');
                      }
                    }}
                    disabled={isOff}
                    className={`
                      relative rounded-xl border p-1 text-center transition min-h-[52px] flex flex-col items-center justify-start
                      ${isOff ? 'bg-gray-50 cursor-not-allowed border-transparent' : 'cursor-pointer hover:border-indigo-300'}
                      ${isSelected ? 'bg-indigo-600 border-indigo-600' : 'border-gray-200 bg-white'}
                      ${isToday && !isSelected ? 'border-indigo-400 ring-2 ring-indigo-200' : ''}
                    `}
                  >
                    <span className={`text-xs font-semibold mt-0.5
                      ${isOff ? 'text-gray-300' : isSelected ? 'text-white' : isToday ? 'text-indigo-600' : 'text-gray-800'}`}>
                      {dayInfo.day}
                    </span>
                    {!isOff && dayInfo.consultants.length > 0 && (
                      <div className="flex gap-0.5 mt-1 flex-wrap justify-center">
                        {weeklyCount > 0 && (
                          <span className={`text-xs rounded-full px-1 font-bold leading-tight
                            ${isSelected ? 'bg-orange-300 text-orange-900' : 'bg-orange-100 text-orange-700'}`}>
                            {weeklyCount}⚡
                          </span>
                        )}
                        {monthlyCount > 0 && (
                          <span className={`text-xs rounded-full px-1 font-bold leading-tight
                            ${isSelected ? 'bg-white/20 text-white' : 'bg-indigo-100 text-indigo-700'}`}>
                            {monthlyCount}
                          </span>
                        )}
                      </div>
                    )}
                  </button>
                );
              });

              const remainder = cells.length % 7;
              if (remainder !== 0) {
                for (let i = 0; i < 7 - remainder; i++) cells.push(<div key={`t-${i}`} />);
              }
              return <div className="grid grid-cols-7 gap-1">{cells}</div>;
            })()}

            <div className="flex flex-wrap gap-3 mt-4 text-xs text-gray-500">
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-orange-400 inline-block"></span> Semanal</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-indigo-400 inline-block"></span> Mensal</span>
              <span className="flex items-center gap-1"><AlertTriangle size={11} className="text-orange-500" /> Toque para ver o dia</span>
            </div>
          </div>
        )}

        {/* ── ABA: CONSULTORES (Lista completa) */}
        {mobileTab === 'lista' && (
          <div className="flex flex-col flex-1 overflow-hidden">

            {/* ✅ [5] Filtros rápidos expandidos */}
            <div className="flex gap-2 px-3 py-2 bg-white border-b border-gray-100 flex-shrink-0 overflow-x-auto">
              {([
                ['todos', 'Todos'],
                ['semanal', '⚡ Semanal'],
                ['atrasado', '🔴 Atrasado'],
                ['pendente', '🔵 Pendente'],
                ['realizado', '🟢 Realizado'],
              ] as const).map(([val, label]) => (
                <button
                  key={val}
                  onClick={() => setMobileFilter(val)}
                  className={`text-xs px-3 py-1.5 rounded-full font-medium whitespace-nowrap transition flex-shrink-0
                    ${mobileFilter === val
                      ? 'bg-indigo-600 text-white'
                      : 'bg-gray-100 text-gray-600 border border-gray-200'}`}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Lista */}
            <div className="flex-1 overflow-y-auto">
              {/* Seção Semanal */}
              {(mobileFilter === 'todos' || mobileFilter === 'semanal') && (() => {
                const weekly = filteredListConsultants.filter(c => needsWeeklyTracking(c));
                if (weekly.length === 0) return null;
                return (
                  <>
                    <div className="px-4 pt-3 pb-1">
                      <span className="text-xs font-semibold text-orange-700 uppercase tracking-wide">
                        ⚡ Acompanhamento Semanal ({weekly.length})
                      </span>
                    </div>
                    <div className="px-3 space-y-2 pb-2">
                      {weekly.map(c => renderConsultantCardMobile(toScheduledConsultant(c)))}
                    </div>
                  </>
                );
              })()}

              {/* Seção Mensal */}
              {(mobileFilter === 'todos') && (() => {
                const monthly = filteredListConsultants.filter(c => !needsWeeklyTracking(c));
                if (monthly.length === 0) return null;
                return (
                  <>
                    <div className="px-4 pt-3 pb-1">
                      <span className="text-xs font-semibold text-indigo-700 uppercase tracking-wide">
                        Acompanhamento Mensal ({monthly.length})
                      </span>
                    </div>
                    <div className="px-3 space-y-2 pb-4">
                      {monthly.map(c => renderConsultantCardMobile(toScheduledConsultant(c)))}
                    </div>
                  </>
                );
              })()}

              {/* Filtros específicos: atrasado / pendente / realizado */}
              {(mobileFilter === 'atrasado' || mobileFilter === 'pendente' || mobileFilter === 'realizado') && (
                <div className="px-3 space-y-2 pt-3 pb-4">
                  {filteredListConsultants.length === 0 ? (
                    <div className="text-center py-10 text-gray-400">
                      <CheckCircle2 size={36} className="mx-auto mb-2 opacity-30 text-green-500" />
                      <p className="text-sm">
                        {mobileFilter === 'atrasado' && 'Nenhum consultor atrasado!'}
                        {mobileFilter === 'pendente' && 'Nenhum consultor pendente!'}
                        {mobileFilter === 'realizado' && 'Nenhum realizado ainda hoje.'}
                      </p>
                    </div>
                  ) : (
                    filteredListConsultants.map(c => renderConsultantCardMobile(toScheduledConsultant(c)))
                  )}
                </div>
              )}
            </div>
          </div>
        )}

      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER DESKTOP
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">

      {/* ── HEADER */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-indigo-100 rounded-xl">
            <Calendar className="text-indigo-600" size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Agenda de Acompanhamento</h1>
            <p className="text-sm text-gray-500">Distribuição mensal de contatos — Gestão de Pessoas</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* ✅ [6] Abas desktop — adicionada aba Gráfico */}
          <div className="flex bg-gray-100 rounded-xl p-1 gap-1">
            <button
              onClick={() => setDesktopTab('calendario')}
              className={`px-4 py-1.5 text-sm font-medium rounded-lg transition
                ${desktopTab === 'calendario'
                  ? 'bg-white text-indigo-700 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'}`}
            >
              📅 Calendário
            </button>
            <button
              onClick={() => setDesktopTab('consultores')}
              className={`px-4 py-1.5 text-sm font-medium rounded-lg transition
                ${desktopTab === 'consultores'
                  ? 'bg-white text-indigo-700 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'}`}
            >
              👥 Consultores
              <span className="ml-1.5 text-xs bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded-full font-semibold">
                {activeConsultants.length}
              </span>
            </button>
            <button
              onClick={() => setDesktopTab('grafico')}
              className={`px-4 py-1.5 text-sm font-medium rounded-lg transition flex items-center gap-1.5
                ${desktopTab === 'grafico'
                  ? 'bg-white text-indigo-700 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'}`}
            >
              <BarChart2 size={14} /> Gráfico de Orientação
            </button>
          </div>
          <button
            onClick={goToToday}
            className="px-4 py-2 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition"
          >
            Hoje
          </button>
        </div>
      </div>

      {/* ── FILTROS */}
      <div className="flex flex-wrap gap-3 p-4 bg-gray-50 rounded-xl border border-gray-200">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Gestão de Pessoas</label>
          <select
            value={filterManager}
            onChange={e => setFilterManager(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-indigo-400 focus:border-transparent"
          >
            <option value="all">Todos</option>
            {gpManagers.map(u => (
              <option key={u.id} value={String(u.id)}>{u.nome_usuario}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Frequência / Score</label>
          <select
            value={filterScore}
            onChange={e => setFilterScore(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-indigo-400 focus:border-transparent"
          >
            <option value="all">Todos</option>
            <option value="weekly">⚡ Semanal (Alto + Crítico + Novo)</option>
            <option value="5">Score 5 — Crítico</option>
            <option value="4">Score 4 — Alto</option>
            <option value="3">Score 3 — Moderado</option>
            <option value="2">Score 2 — Baixo</option>
            <option value="new">Novo Consultor (&lt; 45 dias)</option>
          </select>
        </div>
        <div className="flex-1 min-w-[200px]">
          <label className="block text-xs font-medium text-gray-600 mb-1">Buscar Consultor</label>
          <div className="relative">
            <input
              type="text"
              value={filterSearch}
              onChange={e => setFilterSearch(e.target.value)}
              placeholder="Digite o nome..."
              className="w-full border border-gray-300 rounded-lg pl-8 pr-3 py-1.5 text-sm focus:ring-2 focus:ring-indigo-400 focus:border-transparent"
            />
            <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
            </svg>
            {filterSearch && (
              <button
                onClick={() => setFilterSearch('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs font-bold"
              >✕</button>
            )}
          </div>
        </div>
      </div>

      {/* ✅ [3][4] CARDS TOTALIZADORES — Linha 1: menores (sem Dias Úteis) + Linha 2: KPIs do mês */}
      {/* ── Linha 1: KPIs estruturais (menores) */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-indigo-50 border border-indigo-200 rounded-xl px-4 py-3 text-center">
          <p className="text-xl font-bold text-indigo-700">{stats.totalConsultants}</p>
          <p className="text-xs text-indigo-600 mt-0.5">Total Consultores</p>
        </div>
        <div className="bg-orange-50 border border-orange-200 rounded-xl px-4 py-3 text-center">
          <p className="text-xl font-bold text-orange-700">{stats.weeklyCount}</p>
          <p className="text-xs text-orange-600 mt-0.5">Acomp. Semanal</p>
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-center">
          <p className="text-xl font-bold text-blue-700">{stats.monthlyCount}</p>
          <p className="text-xs text-blue-600 mt-0.5">Acomp. Mensal</p>
        </div>
      </div>

      {/* ── Linha 2: KPIs do mês corrente */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-center">
          <p className="text-2xl font-bold text-red-600">{stats.atrasados}</p>
          <p className="text-xs text-red-500 mt-0.5">Atrasados</p>
        </div>
        <div className="bg-blue-50 border border-blue-300 rounded-xl px-4 py-3 text-center">
          <p className="text-2xl font-bold text-blue-700">{stats.pendentesMes}</p>
          <p className="text-xs text-blue-600 mt-0.5">Pendentes do Mês</p>
        </div>
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-center">
          <p className="text-2xl font-bold text-emerald-600">{stats.realizadosMes}</p>
          {/* ✅ [1] Label "Realizado" */}
          <p className="text-xs text-emerald-600 mt-0.5">Realizado Mês</p>
        </div>
        <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-center">
          <p className="text-2xl font-bold text-green-700">{stats.doneToday}</p>
          {/* ✅ [1] Label "Realizado Hoje" */}
          <p className="text-xs text-green-600 mt-0.5">Realizado Hoje</p>
        </div>
      </div>

      {/* ── LEGENDA */}
      <div className="flex flex-wrap gap-4 text-xs text-gray-600 px-1">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-full bg-blue-500"></span> Pendente
        </span>
        {/* ✅ [1] "Feito hoje" → "Realizado hoje" */}
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-full bg-green-500"></span> Realizado hoje
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-full bg-red-500"></span> Atrasado
        </span>
        <span className="flex items-center gap-1.5">
          <AlertTriangle size={12} className="text-orange-500" /> Acomp. Semanal
        </span>
        <span className="flex items-center gap-1.5">
          <Info size={12} className="text-indigo-400" /> Feriado
        </span>
      </div>

      {/* ── ABA: CALENDÁRIO */}
      {desktopTab === 'calendario' && (
      <div className="flex gap-6 items-start">

        {/* ── CALENDÁRIO */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-4">
            <button onClick={prevMonth} className="p-2 rounded-lg hover:bg-gray-100 transition">
              <ChevronLeft size={20} />
            </button>
            <h2 className="text-lg font-bold text-gray-800">
              {monthNames[viewMonth - 1]} {viewYear}
            </h2>
            <button onClick={nextMonth} className="p-2 rounded-lg hover:bg-gray-100 transition">
              <ChevronRight size={20} />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1 mb-1">
            {['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'].map(d => (
              <div key={d} className="text-center text-xs font-semibold text-gray-400 py-1">{d}</div>
            ))}
          </div>

          {(() => {
            const firstDayOfWeek = new Date(viewYear, viewMonth - 1, 1).getDay();
            const cells: React.ReactNode[] = [];

            for (let i = 0; i < firstDayOfWeek; i++) {
              cells.push(<div key={`empty-${i}`} />);
            }

            schedule.forEach(dayInfo => {
              const isToday = isCurrentMonth && dayInfo.day === todayDay;
              const isSelected = dayInfo.day === selectedDay;
              const isOff = dayInfo.isWeekend || dayInfo.isHoliday;
              const count = dayInfo.consultants.length;
              const weeklyCount = dayInfo.consultants.filter(sc => sc.isWeekly).length;

              cells.push(
                <button
                  key={dayInfo.day}
                  onClick={() => !isOff && setSelectedDay(dayInfo.day)}
                  disabled={isOff}
                  className={`
                    relative rounded-xl border p-1.5 text-center transition min-h-[52px]
                    ${isOff ? 'bg-gray-50 cursor-not-allowed border-gray-100' : 'cursor-pointer hover:border-indigo-300 hover:bg-indigo-50'}
                    ${isSelected ? 'bg-indigo-600 border-indigo-600 shadow-md' : 'border-gray-200 bg-white'}
                    ${isToday && !isSelected ? 'border-indigo-400 ring-2 ring-indigo-200' : ''}
                  `}
                >
                  <span className={`text-sm font-semibold block
                    ${isOff ? 'text-gray-300' : isSelected ? 'text-white' : isToday ? 'text-indigo-600' : 'text-gray-800'}
                  `}>
                    {dayInfo.day}
                  </span>

                  {dayInfo.isHoliday && (
                    <span className="text-xs text-orange-400 block leading-none">feriado</span>
                  )}

                  {count > 0 && (
                    <div className="flex justify-center gap-0.5 mt-1 flex-wrap">
                      {weeklyCount > 0 && (
                        <span className={`text-xs rounded-full px-1 font-bold leading-tight
                          ${isSelected ? 'bg-orange-300 text-orange-900' : 'bg-orange-100 text-orange-700'}
                        `}>
                          {weeklyCount}⚡
                        </span>
                      )}
                      {count - weeklyCount > 0 && (
                        <span className={`text-xs rounded-full px-1 font-bold leading-tight
                          ${isSelected ? 'bg-white/20 text-white' : 'bg-indigo-100 text-indigo-700'}
                        `}>
                          {count - weeklyCount}
                        </span>
                      )}
                    </div>
                  )}
                </button>
              );
            });

            const totalCells = cells.length;
            const remainder = totalCells % 7;
            if (remainder !== 0) {
              for (let i = 0; i < 7 - remainder; i++) {
                cells.push(<div key={`trail-${i}`} />);
              }
            }

            return <div className="grid grid-cols-7 gap-1">{cells}</div>;
          })()}
        </div>

        {/* ── PAINEL DO DIA SELECIONADO */}
        {selectedDaySchedule && !selectedDaySchedule.isWeekend && !selectedDaySchedule.isHoliday ? (
          <div className="w-80 flex-shrink-0">
            <div className="bg-indigo-600 text-white rounded-t-2xl px-4 py-3">
              <p className="font-bold text-base">
                {selectedDaySchedule.date.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}
              </p>
              <p className="text-xs text-indigo-200 mt-0.5">
                {selectedDaySchedule.consultants.length} consultor(es) agendado(s)
              </p>
            </div>

            {/* ── Filtro de status do painel lateral (desktop only) */}
            <div className="bg-white border-x border-t border-indigo-100 px-2 py-2 flex gap-1 flex-wrap">
              {([
                ['todos',     'Todos'],
                ['atrasado',  '🔴 Atrasado'],
                ['pendente',  '🔵 Pendente'],
                ['realizado', '🟢 Realizado'],
                ['semanal',   '⚡ Semanal'],
              ] as const).map(([val, label]) => (
                <button
                  key={val}
                  onClick={() => setPainelDiaFilter(val)}
                  className={`text-xs px-2 py-1 rounded-full font-medium transition whitespace-nowrap
                    ${painelDiaFilter === val
                      ? val === 'atrasado'  ? 'bg-red-500 text-white'
                      : val === 'pendente'  ? 'bg-blue-500 text-white'
                      : val === 'realizado' ? 'bg-green-500 text-white'
                      : val === 'semanal'   ? 'bg-orange-500 text-white'
                      : 'bg-indigo-600 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="bg-white rounded-b-2xl border border-indigo-100 divide-y divide-gray-50 max-h-[480px] overflow-y-auto">
              {selectedDaySchedule.consultants.length === 0 ? (
                <p className="p-4 text-sm text-gray-400 text-center">Nenhum consultor agendado.</p>
              ) : (() => {
                const filteredDayConsultants = selectedDaySchedule.consultants.filter(sc => {
                  if (painelDiaFilter === 'todos')     return true;
                  if (painelDiaFilter === 'semanal')   return sc.isWeekly;
                  if (painelDiaFilter === 'atrasado')  return getActivityStatus(sc.consultant.id) === 'overdue';
                  if (painelDiaFilter === 'pendente')  return getActivityStatus(sc.consultant.id) === 'pending';
                  if (painelDiaFilter === 'realizado') return getActivityStatus(sc.consultant.id) === 'done';
                  return true;
                });
                if (filteredDayConsultants.length === 0) {
                  return (
                    <p className="p-4 text-sm text-gray-400 text-center">
                      Nenhum consultor com este status hoje.
                    </p>
                  );
                }
                return filteredDayConsultants.map(sc => {
                  const score = getValidFinalScore(sc.consultant);
                  const isNew = isNewConsultant(sc.consultant);
                  const status = getActivityStatus(sc.consultant.id);
                  const loading = loadingIds.has(sc.consultant.id);
                  const lastDate = getLastActivityDate(sc.consultant.id);
                  const isExpanded = expandedConsultant === sc.consultant.id;

                  return (
                    <div key={sc.consultant.id} className={`${sc.isWeekly ? 'bg-orange-50' : 'bg-white'}`}>
                      <div className="px-3 py-2.5">
                        {/* Badges */}
                        <div className="flex flex-wrap gap-1 mb-1">
                          {sc.isWeekly && (
                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-orange-100 text-orange-700 text-xs rounded-full font-medium">
                              <AlertTriangle size={9} /> Semanal
                            </span>
                          )}
                          {isNew && (
                            <span className="inline-flex px-1.5 py-0.5 bg-purple-100 text-purple-700 text-xs rounded-full font-medium">Novo</span>
                          )}
                          {score !== null && (
                            <span className="inline-flex px-1.5 py-0.5 text-white text-xs rounded-full font-medium"
                              style={{ backgroundColor: SCORE_COLOR[score] }}>
                              {SCORE_LABEL[score]}
                            </span>
                          )}
                        </div>

                        {/* Nome e cliente */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold text-gray-800 truncate">{sc.consultant.nome_consultores}</p>
                            {sc.client && <p className="text-xs text-gray-500 truncate">{sc.client.razao_social_cliente}</p>}
                            {lastDate && <p className="text-xs text-gray-400 mt-0.5">Último: {lastDate}</p>}
                          </div>

                          {/* Botão +Atividade */}
                          <button
                            onClick={() => onNavigateToAtividades(sc.client?.razao_social_cliente, sc.consultant.nome_consultores)}
                            disabled={loading}
                            className={`
                              flex items-center gap-1 px-2.5 py-1.5 rounded-lg border-2 text-xs font-bold
                              transition-all flex-shrink-0
                              ${loading ? 'bg-gray-100 border-gray-200 text-gray-400 cursor-wait' : ''}
                              ${!loading && status === 'done' ? 'bg-green-50 border-green-500 text-green-700 hover:bg-green-100' : ''}
                              ${!loading && status === 'overdue' ? 'bg-red-50 border-red-500 text-red-700 hover:bg-red-100' : ''}
                              ${!loading && status === 'pending' ? 'bg-blue-50 border-blue-500 text-blue-700 hover:bg-blue-100' : ''}
                            `}
                          >
                            {loading ? <Clock size={12} className="animate-spin" /> : getStatusIcon(status)}
                            +Atividade
                          </button>
                        </div>

                        <button
                          onClick={() => setExpandedConsultant(isExpanded ? null : sc.consultant.id)}
                          className="text-xs text-indigo-500 hover:text-indigo-700 mt-1 transition"
                        >
                          {isExpanded ? '▲ Ocultar' : '▼ Detalhes'}
                        </button>
                      </div>

                      {isExpanded && (
                        <div className="border-t border-gray-100 px-3 pb-3 pt-2 space-y-1.5 bg-gray-50 rounded-b-xl">
                          {sc.consultant.cargo_consultores && (
                            <p className="text-xs text-gray-600">
                              <span className="font-medium">Cargo:</span> {sc.consultant.cargo_consultores}
                            </p>
                          )}
                          {sc.consultant.email_consultor && (
                            <p className="text-xs text-gray-600">
                              <span className="font-medium">E-mail:</span>{' '}
                              <a href={`mailto:${sc.consultant.email_consultor}`} className="text-indigo-600 hover:underline">
                                {sc.consultant.email_consultor}
                              </a>
                            </p>
                          )}
                          {sc.consultant.celular && (
                            <p className="text-xs text-gray-600">
                              <span className="font-medium">Celular:</span>{' '}
                              <a href={`tel:${sc.consultant.celular}`} className="text-indigo-600">
                                {sc.consultant.celular}
                              </a>
                            </p>
                          )}
                          <p className="text-xs text-gray-500 pt-1">
                            <span className="font-medium">Agendado em:</span> {sc.scheduledDays.map(d => `dia ${d}`).join(', ')}
                          </p>
                        </div>
                      )}
                    </div>
                  );
                });
              })()}
            </div>
          </div>
        ) : (
          <div className="bg-white border border-dashed border-gray-200 rounded-2xl p-8 text-center text-gray-400 w-80 flex-shrink-0">
            <Calendar size={40} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm font-medium">Selecione um dia útil</p>
            <p className="text-xs mt-1">para ver os consultores agendados</p>
          </div>
        )}
      </div>
      )} {/* fim aba calendário */}

      {/* ── ABA: CONSULTORES */}
      {desktopTab === 'consultores' && (
      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="flex items-center justify-between p-4 border-b border-gray-100 flex-wrap gap-3">
          <h3 className="font-bold text-gray-800">
            Todos os Consultores — {monthNames[viewMonth - 1]} {viewYear}
          </h3>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-500">{activeConsultants.length} consultores</span>
            {/* ✅ [2] Filtro de status na aba Consultores */}
            <div className="flex gap-1.5 flex-wrap">
              {([
                ['todos', 'Todos', 'bg-gray-200 text-gray-700'],
                ['atrasado', '🔴 Atrasado', 'bg-red-100 text-red-700'],
                ['pendente', '🔵 Pendente', 'bg-blue-100 text-blue-700'],
                ['realizado', '🟢 Realizado', 'bg-green-100 text-green-700'],
                ['semanal', '⚡ Semanal', 'bg-orange-100 text-orange-700'],
              ] as const).map(([val, label, activeClass]) => (
                <button
                  key={val}
                  onClick={() => setConsultoresStatusFilter(val)}
                  className={`text-xs px-2.5 py-1 rounded-full font-medium transition
                    ${consultoresStatusFilter === val
                      ? activeClass + ' ring-2 ring-offset-1 ring-current'
                      : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {activeConsultants.length === 0 ? (
          <div className="p-8 text-center text-gray-400 text-sm">
            Nenhum consultor encontrado com os filtros selecionados.
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {activeConsultants
              .filter(consultant => {
                if (consultoresStatusFilter === 'todos') return true;
                if (consultoresStatusFilter === 'semanal') return needsWeeklyTracking(consultant);
                if (consultoresStatusFilter === 'atrasado') return getActivityStatus(consultant.id) === 'overdue';
                if (consultoresStatusFilter === 'pendente') return getActivityStatus(consultant.id) === 'pending';
                if (consultoresStatusFilter === 'realizado') return getActivityStatus(consultant.id) === 'done';
                return true;
              })
              .map(consultant => {
              const score = getValidFinalScore(consultant);
              const isNew = isNewConsultant(consultant);
              const weekly = needsWeeklyTracking(consultant);
              const status = getActivityStatus(consultant.id);
              const loading = loadingIds.has(consultant.id);
              const lastDate = getLastActivityDate(consultant.id);
              const clientInfo = clients.find(cl => {
                const gestor = usuariosCliente.find(uc => uc.id === consultant.gestor_imediato_id);
                return gestor && cl.id === gestor.id_cliente;
              });

              const scheduledDaysForConsultant = schedule
                .flatMap(d => d.consultants.filter(sc => sc.consultant.id === consultant.id).map(() => d.day));

              return (
                <div key={consultant.id} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition">
                  <div
                    className="w-3 h-3 rounded-full flex-shrink-0"
                    style={{ backgroundColor: score ? SCORE_COLOR[score] : '#9e9e9e' }}
                  />

                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-800 truncate">{consultant.nome_consultores}</p>
                    <p className="text-xs text-gray-500 truncate">
                      {clientInfo?.razao_social_cliente || '—'}
                      {score !== null && ` · Score ${score} ${SCORE_LABEL[score]}`}
                      {isNew && ' · Novo'}
                    </p>
                  </div>

                  <div className="hidden md:flex items-center gap-1">
                    {weekly ? (
                      <span className="flex items-center gap-1 text-xs px-2 py-0.5 bg-orange-100 text-orange-700 rounded-full font-medium">
                        <AlertTriangle size={10} /> Semanal
                      </span>
                    ) : (
                      <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full font-medium">
                        Mensal
                      </span>
                    )}
                  </div>

                  <div className="hidden lg:flex gap-1 flex-wrap max-w-[140px]">
                    {scheduledDaysForConsultant.slice(0, 5).map(d => (
                      <button
                        key={d}
                        onClick={() => { setSelectedDay(d); setDesktopTab('calendario'); }}
                        className={`text-xs px-1.5 py-0.5 rounded font-medium transition hover:opacity-80
                          ${d === todayDay && isCurrentMonth
                            ? 'bg-indigo-600 text-white'
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}
                        `}
                      >
                        {d}
                      </button>
                    ))}
                    {scheduledDaysForConsultant.length > 5 && (
                      <span className="text-xs text-gray-400">+{scheduledDaysForConsultant.length - 5}</span>
                    )}
                  </div>

                  <div className="hidden md:block text-xs text-gray-400 w-20 text-right">
                    {lastDate || '—'}
                  </div>

                  <button
                    onClick={() => onNavigateToAtividades(
                      clientInfo?.razao_social_cliente,
                      consultant.nome_consultores
                    )}
                    disabled={loading}
                    className={`
                      flex items-center gap-1 px-2.5 py-1.5 rounded-lg border-2 text-xs font-bold
                      transition-all flex-shrink-0
                      ${loading ? 'bg-gray-100 border-gray-200 text-gray-400 cursor-wait' : ''}
                      ${!loading && status === 'done' ? 'bg-green-50 border-green-500 text-green-700 hover:bg-green-100' : ''}
                      ${!loading && status === 'overdue' ? 'bg-red-50 border-red-500 text-red-700 hover:bg-red-100' : ''}
                      ${!loading && status === 'pending' ? 'bg-blue-50 border-blue-500 text-blue-700 hover:bg-blue-100' : ''}
                    `}
                  >
                    {loading ? <Clock size={12} className="animate-spin" /> : getStatusIcon(status)}
                    <span className={`hidden sm:inline`}>+Atividade</span>
                  </button>
                </div>
              );
            })}
            {/* Mensagem vazia após filtro de status */}
            {activeConsultants.filter(consultant => {
              if (consultoresStatusFilter === 'todos') return true;
              if (consultoresStatusFilter === 'semanal') return needsWeeklyTracking(consultant);
              if (consultoresStatusFilter === 'atrasado') return getActivityStatus(consultant.id) === 'overdue';
              if (consultoresStatusFilter === 'pendente') return getActivityStatus(consultant.id) === 'pending';
              if (consultoresStatusFilter === 'realizado') return getActivityStatus(consultant.id) === 'done';
              return true;
            }).length === 0 && (
              <div className="p-8 text-center text-gray-400 text-sm">
                Nenhum consultor encontrado para este filtro.
              </div>
            )}
          </div>
        )}
      </div>
      )} {/* fim aba consultores */}

      {/* ✅ [6] ABA: GRÁFICO DE ORIENTAÇÃO */}
      {desktopTab === 'grafico' && (
      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
        {/* Header do gráfico */}
        <div className="p-5 border-b border-gray-100">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-bold text-gray-800 text-lg flex items-center gap-2">
                <BarChart2 size={18} className="text-indigo-600" />
                Gráfico de Orientação
              </h3>
              <p className="text-sm text-gray-500 mt-0.5">
                Atividades Previstas × Realizadas — Performance da Gestão de Pessoas
              </p>
            </div>
            {/* Controles: granularidade + navegação */}
            <div className="flex items-center gap-2 flex-wrap">
              {/* Granularidade */}
              <div className="flex bg-gray-100 rounded-lg p-1 gap-1">
                {(['semana', 'mes', 'ano'] as const).map(g => (
                  <button
                    key={g}
                    onClick={() => { setGraficoGranularidade(g); setGraficoPeriodoOffset(0); }}
                    className={`px-3 py-1 text-xs font-semibold rounded-md transition capitalize
                      ${graficoGranularidade === g
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : 'text-gray-500 hover:text-gray-700'}`}
                  >
                    {g === 'mes' ? 'Mês' : g.charAt(0).toUpperCase() + g.slice(1)}
                  </button>
                ))}
              </div>
              {/* Navegação de período */}
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setGraficoPeriodoOffset(o => o - 1)}
                  className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 transition"
                  title="Período anterior"
                >
                  <ChevronLeft size={14} />
                </button>
                <span className="text-xs text-gray-600 font-medium px-2 min-w-[140px] text-center">
                  {graficoPeriodoLabel}
                </span>
                <button
                  onClick={() => setGraficoPeriodoOffset(o => Math.min(o + 1, 0))}
                  className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40 transition"
                  disabled={graficoPeriodoOffset >= 0}
                  title="Período seguinte"
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Corpo do gráfico */}
        <div className="p-5">
          {/* KPIs resumo acima do gráfico */}
          {(() => {
            const totalPrevisto = graficoData.reduce((acc, d) => acc + d.previsto, 0);
            const totalRealizado = graficoData.reduce((acc, d) => acc + d.realizado, 0);
            const taxa = totalPrevisto > 0 ? Math.round((totalRealizado / totalPrevisto) * 100) : 0;
            return (
              <div className="grid grid-cols-3 gap-4 mb-6">
                <div className="bg-indigo-50 rounded-xl p-3 text-center">
                  <p className="text-2xl font-bold text-indigo-700">{totalPrevisto}</p>
                  <p className="text-xs text-indigo-600 mt-0.5">Total Previsto</p>
                </div>
                <div className="bg-emerald-50 rounded-xl p-3 text-center">
                  <p className="text-2xl font-bold text-emerald-600">{totalRealizado}</p>
                  <p className="text-xs text-emerald-600 mt-0.5">Total Realizado</p>
                </div>
                <div className={`rounded-xl p-3 text-center ${
                  taxa >= 80 ? 'bg-green-50' : taxa >= 50 ? 'bg-yellow-50' : 'bg-red-50'
                }`}>
                  <p className={`text-2xl font-bold ${
                    taxa >= 80 ? 'text-green-700' : taxa >= 50 ? 'text-yellow-700' : 'text-red-600'
                  }`}>{taxa}%</p>
                  <p className={`text-xs mt-0.5 ${
                    taxa >= 80 ? 'text-green-600' : taxa >= 50 ? 'text-yellow-600' : 'text-red-500'
                  }`}>Taxa de Execução</p>
                </div>
              </div>
            );
          })()}

          {/* Gráfico de linhas */}
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={graficoData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: '#6b7280' }}
                axisLine={{ stroke: '#e5e7eb' }}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: '#6b7280' }}
                axisLine={false}
                tickLine={false}
                width={35}
              />
              <Tooltip
                contentStyle={{
                  borderRadius: '8px',
                  border: '1px solid #e5e7eb',
                  boxShadow: '0 4px 6px -1px rgba(0,0,0,0.07)',
                  fontSize: '12px',
                }}
                formatter={(value: number, name: string) => [
                  value,
                  name === 'previsto' ? '📋 Previsto' : '✅ Realizado'
                ]}
              />
              <Legend
                formatter={(value) => value === 'previsto' ? '📋 Previsto' : '✅ Realizado'}
                wrapperStyle={{ fontSize: '12px', paddingTop: '12px' }}
              />
              <Line
                type="monotone"
                dataKey="previsto"
                stroke="#6366f1"
                strokeWidth={2.5}
                strokeDasharray="5 4"
                dot={{ fill: '#6366f1', r: 4, strokeWidth: 0 }}
                activeDot={{ r: 6, strokeWidth: 0 }}
              />
              <Line
                type="monotone"
                dataKey="realizado"
                stroke="#10b981"
                strokeWidth={2.5}
                dot={{ fill: '#10b981', r: 4, strokeWidth: 0 }}
                activeDot={{ r: 6, strokeWidth: 0 }}
              />
            </LineChart>
          </ResponsiveContainer>

          {/* Nota de rodapé */}
          <p className="text-xs text-gray-400 mt-4 text-center">
            * Previsto calculado por: consultores semanais × 4 contatos/mês + consultores mensais × 1 contato/mês.
            Realizado baseado nos relatórios registrados no período.
          </p>
        </div>
      </div>
      )} {/* fim aba gráfico */}

    </div>
  );
};

export default AgendaAcompanhamento;
