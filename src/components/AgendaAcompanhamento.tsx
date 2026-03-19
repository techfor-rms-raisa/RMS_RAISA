// src/components/AgendaAcompanhamento.tsx
// 🆕 v1.1 - Agenda de Acompanhamento Mensal de Consultores
// Distribui consultores nos dias úteis do mês para Gestão de Pessoas
// Consultores em Quarentena / Risco Alto / Altíssimo → acompanhamento semanal
// Botão +Atividade: Azul=pendente | Verde=feito hoje | Vermelho=atrasado
// v1.1: Layout mobile responsivo com 3 abas (Hoje / Agenda / Consultores)
//       Detecção automática via window.innerWidth < 768 + listener resize

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Consultant, Client, User, UsuarioCliente, CoordenadorCliente, ConsultantReport } from '@/types';
import { Calendar, ChevronLeft, ChevronRight, AlertTriangle, Clock, CheckCircle2, XCircle, Info } from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// TYPES INTERNOS
// ─────────────────────────────────────────────────────────────────────────────

type ActivityStatus = 'done' | 'pending' | 'overdue';

interface ScheduledConsultant {
  consultant: Consultant;
  client: Client | undefined;
  scheduledDays: number[];  // dias do mês em que este consultor deve ser contactado
  isWeekly: boolean;        // true = Quarentena / Risco Alto-Altíssimo
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

// Consultor precisa de acompanhamento semanal?
const needsWeeklyTracking = (consultant: Consultant): boolean => {
  const score = getValidFinalScore(consultant);
  const isNew = isNewConsultant(consultant);
  // Score 4 (Alto), 5 (Altíssimo/Crítico) ou Novo → semanal
  // Score 3 (Médio) → mensal normal (incluso na quarentena mas ritmo mensal)
  return score !== null && (score === 4 || score === 5) || isNew;
};

// Dias úteis do mês (sem feriados fixos nacionais)
const FERIADOS_FIXOS = [
  { month: 1, day: 1 },   // Ano Novo
  { month: 4, day: 21 },  // Tiradentes
  { month: 5, day: 1 },   // Trabalho
  { month: 9, day: 7 },   // Independência
  { month: 10, day: 12 }, // N.S. Aparecida
  { month: 11, day: 2 },  // Finados
  { month: 11, day: 15 }, // República
  { month: 12, day: 25 }, // Natal
];

const isHoliday = (date: Date): boolean => {
  return FERIADOS_FIXOS.some(h => h.month === date.getMonth() + 1 && h.day === date.getDate());
};

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
  const [activityCache, setActivityCache] = useState<Record<number, ConsultantReport[]>>({});
  const [loadingIds, setLoadingIds] = useState<Set<number>>(new Set());
  const [expandedConsultant, setExpandedConsultant] = useState<number | null>(null);

  const isCurrentMonth = viewYear === today.getFullYear() && viewMonth === today.getMonth() + 1;
  const todayDay = today.getDate();

  // ── Detecção de tela mobile
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);
  const [mobileTab, setMobileTab] = useState<'hoje' | 'agenda' | 'lista'>('hoje');
  const [mobileFilter, setMobileFilter] = useState<'todos' | 'semanal' | 'atrasado'>('todos');

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

    // Filtro por gestor de pessoas (via cliente)
    if (filterManager !== 'all') {
      const managerId = parseInt(filterManager, 10);
      list = list.filter(c => {
        const gestor = usuariosCliente.find(uc => uc.id === c.gestor_imediato_id);
        if (!gestor) return false;
        const clienteDoConsultor = clients.find(cl => cl.id === gestor.id_cliente);
        return clienteDoConsultor && Number(clienteDoConsultor.id_gestao_de_pessoas) === managerId;
      });
    }

    // Filtro por score
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

    return list;
  }, [consultants, clients, usuariosCliente, filterManager, filterScore]);

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

  // Pré-carregar atividades dos consultores do dia selecionado
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

    // Verificar se ontem havia pendência (para mostrar vermelho)
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    // Buscar o último relatório
    if (reports.length === 0) return 'pending';
    const lastReport = reports.sort((a, b) =>
      new Date(b.created_at || '').getTime() - new Date(a.created_at || '').getTime()
    )[0];
    const lastDate = new Date(lastReport.created_at || '');
    const diffDays = Math.floor((today.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24));

    // Se passou mais de 1 dia útil sem atividade, vermelho
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

    // Separar consultores por frequência
    const weeklyConsultants = activeConsultants.filter(c => needsWeeklyTracking(c));
    const monthlyConsultants = activeConsultants.filter(c => !needsWeeklyTracking(c));

    // Para consultores semanais: distribuir em 4 semanas (1 contato por semana)
    // Para mensais: distribuir uma vez no mês nos dias úteis

    // Agrupar dias úteis por semana do mês
    const weekGroups: number[][] = [[], [], [], [], []];
    businessDays.forEach(d => {
      const date = new Date(viewYear, viewMonth - 1, d);
      const weekOfMonth = Math.floor((d + new Date(viewYear, viewMonth - 1, 1).getDay() - 1) / 7);
      const idx = Math.min(weekOfMonth, 4);
      weekGroups[idx].push(d);
    });
    const filledWeeks = weekGroups.filter(w => w.length > 0);

    // Map: dia → lista de consultores agendados
    const dayMap: Record<number, ScheduledConsultant[]> = {};
    businessDays.forEach(d => { dayMap[d] = []; });

    // Distribuir consultores mensais uniformemente
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

    // Distribuir consultores semanais (1x por semana)
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

    // Montar array de dias do mês
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

  // ── Dia selecionado
  const selectedDaySchedule = useMemo(() =>
    schedule.find(d => d.day === selectedDay) || null
  , [schedule, selectedDay]);

  // ── Estatísticas do mês
  const stats = useMemo(() => {
    const totalConsultants = activeConsultants.length;
    const weeklyCount = activeConsultants.filter(c => needsWeeklyTracking(c)).length;
    const monthlyCount = totalConsultants - weeklyCount;
    const businessDaysCount = getBusinessDays(viewYear, viewMonth).length;
    const doneToday = Object.entries(activityCache).filter(([, reports]) => {
      if (!isCurrentMonth) return false;
      const todayStr = today.toISOString().split('T')[0];
      return reports.some(r => (r.created_at || '').split('T')[0] === todayStr);
    }).length;
    return { totalConsultants, weeklyCount, monthlyCount, businessDaysCount, doneToday };
  }, [activeConsultants, viewYear, viewMonth, activityCache, isCurrentMonth, today]);

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

  const monthNames = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

  // ── Cor do badge de status
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
          {/* Linha superior: badges + botão */}
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

          {/* Nome e cliente */}
          <p className="text-sm font-semibold text-gray-800 truncate">{sc.consultant.nome_consultores}</p>
          {sc.client && <p className="text-xs text-gray-500 truncate">{sc.client.razao_social_cliente}</p>}
          {lastDate && <p className="text-xs text-gray-400 mt-0.5">Último: {lastDate}</p>}

          {/* Toggle detalhes */}
          <button
            onClick={() => setExpandedConsultant(isExpanded ? null : sc.consultant.id)}
            className="text-xs text-indigo-500 hover:text-indigo-700 mt-1 transition"
          >
            {isExpanded ? '▲ Ocultar' : '▼ Detalhes'}
          </button>
        </div>

        {/* Detalhes expandidos */}
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
    // Consultores do dia selecionado
    const todaySchedule = schedule.find(d => d.day === selectedDay);
    const todayConsultants = todaySchedule?.consultants ?? [];

    // Lista completa com filtro mobile
    const filteredListConsultants = activeConsultants.filter(c => {
      if (mobileFilter === 'semanal') return needsWeeklyTracking(c);
      if (mobileFilter === 'atrasado') return getActivityStatus(c.id) === 'overdue';
      return true;
    });

    // Estrutura de ScheduledConsultant para a aba lista
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
              <p className="text-xs text-indigo-200 mt-0.5">
                {stats.doneToday} feito(s) hoje · {stats.totalConsultants} consultores
              </p>
            </div>
            <button
              onClick={goToToday}
              className="text-xs bg-white text-indigo-600 font-semibold px-3 py-1.5 rounded-lg"
            >
              Hoje
            </button>
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
            {/* Sub-header do dia */}
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
            {/* Cards do dia */}
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
            {/* Navegação de mês */}
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

            {/* Grade semanal */}
            <div className="grid grid-cols-7 gap-1 mb-1">
              {['D','S','T','Q','Q','S','S'].map((d, i) => (
                <div key={i} className="text-center text-xs font-semibold text-gray-400 py-1">{d}</div>
              ))}
            </div>

            {/* Dias */}
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
                        setMobileTab('hoje'); // navega para aba Hoje ao tocar no dia
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

            {/* Legenda */}
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
            {/* Filtros rápidos */}
            <div className="flex gap-2 px-3 py-2 bg-white border-b border-gray-100 flex-shrink-0 overflow-x-auto">
              {([
                ['todos', 'Todos'],
                ['semanal', '⚡ Semanal'],
                ['atrasado', '⚠ Atrasados'],
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

              {/* Filtro Atrasados */}
              {mobileFilter === 'atrasado' && (
                <div className="px-3 space-y-2 pt-3 pb-4">
                  {filteredListConsultants.length === 0 ? (
                    <div className="text-center py-10 text-gray-400">
                      <CheckCircle2 size={36} className="mx-auto mb-2 opacity-30 text-green-500" />
                      <p className="text-sm">Nenhum consultor atrasado!</p>
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
  // RENDER DESKTOP (original — sem alterações)
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
        <button
          onClick={goToToday}
          className="px-4 py-2 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition"
        >
          Hoje
        </button>
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
      </div>

      {/* ── CARDS TOTALIZADORES */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-indigo-700">{stats.totalConsultants}</p>
          <p className="text-xs text-indigo-600 mt-1">Total Consultores</p>
        </div>
        <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-orange-700">{stats.weeklyCount}</p>
          <p className="text-xs text-orange-600 mt-1">Acomp. Semanal</p>
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-blue-700">{stats.monthlyCount}</p>
          <p className="text-xs text-blue-600 mt-1">Acomp. Mensal</p>
        </div>
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-gray-700">{stats.businessDaysCount}</p>
          <p className="text-xs text-gray-600 mt-1">Dias Úteis</p>
        </div>
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-green-700">{stats.doneToday}</p>
          <p className="text-xs text-green-600 mt-1">Feitos Hoje</p>
        </div>
      </div>

      {/* ── LEGENDA */}
      <div className="flex flex-wrap gap-4 text-xs text-gray-600 px-1">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-full bg-blue-500"></span> Pendente
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-full bg-green-500"></span> Feito hoje
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

      {/* ── LAYOUT PRINCIPAL: Calendário + Painel lateral */}
      <div className="flex gap-6 items-start">

        {/* ── CALENDÁRIO */}
        <div className="flex-1 min-w-0">
          {/* Navegação do mês */}
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

          {/* Cabeçalho dias da semana */}
          <div className="grid grid-cols-7 gap-1 mb-1">
            {['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'].map(d => (
              <div key={d} className="text-center text-xs font-semibold text-gray-400 py-1">{d}</div>
            ))}
          </div>

          {/* Grade de dias */}
          {(() => {
            const firstDayOfWeek = new Date(viewYear, viewMonth - 1, 1).getDay();
            const cells: React.ReactNode[] = [];

            // Células vazias antes do dia 1
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

            // Completar última linha
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
        <div className="w-80 flex-shrink-0">
          {selectedDaySchedule ? (
            <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
              {/* Cabeçalho do painel */}
              <div className={`p-4 ${selectedDaySchedule.isWeekend || selectedDaySchedule.isHoliday
                ? 'bg-gray-100' : 'bg-indigo-600'}`}>
                <h3 className={`font-bold text-lg ${selectedDaySchedule.isWeekend || selectedDaySchedule.isHoliday
                  ? 'text-gray-500' : 'text-white'}`}>
                  {selectedDaySchedule.date.toLocaleDateString('pt-BR', {
                    weekday: 'long', day: 'numeric', month: 'long'
                  })}
                </h3>
                {selectedDaySchedule.isWeekend && (
                  <p className="text-sm text-gray-400 mt-1">Final de semana</p>
                )}
                {selectedDaySchedule.isHoliday && (
                  <p className="text-sm text-orange-500 mt-1">🎉 Feriado Nacional</p>
                )}
                {!selectedDaySchedule.isWeekend && !selectedDaySchedule.isHoliday && (
                  <p className="text-sm text-indigo-100 mt-1">
                    {selectedDaySchedule.consultants.length} consultor(es) agendado(s)
                  </p>
                )}
              </div>

              {/* Lista de consultores do dia */}
              <div className="p-3 space-y-2 max-h-[480px] overflow-y-auto">
                {selectedDaySchedule.consultants.length === 0 ? (
                  <div className="text-center py-8 text-gray-400">
                    <Calendar size={32} className="mx-auto mb-2 opacity-30" />
                    <p className="text-sm">Nenhum consultor agendado</p>
                  </div>
                ) : (
                  selectedDaySchedule.consultants.map((sc, idx) => {
                    const score = getValidFinalScore(sc.consultant);
                    const isNew = isNewConsultant(sc.consultant);
                    const status = getActivityStatus(sc.consultant.id);
                    const loading = loadingIds.has(sc.consultant.id);
                    const lastDate = getLastActivityDate(sc.consultant.id);
                    const isExpanded = expandedConsultant === sc.consultant.id;

                    return (
                      <div
                        key={`${sc.consultant.id}-${idx}`}
                        className={`rounded-xl border transition
                          ${sc.isWeekly ? 'border-orange-200 bg-orange-50' : 'border-gray-200 bg-white'}
                          ${isExpanded ? 'shadow-md' : ''}
                        `}
                      >
                        {/* Linha principal */}
                        <div className="p-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              {/* Tags */}
                              <div className="flex flex-wrap gap-1 mb-1">
                                {sc.isWeekly && (
                                  <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-orange-100 text-orange-700 text-xs rounded-full font-medium">
                                    <AlertTriangle size={9} /> Semanal
                                  </span>
                                )}
                                {isNew && (
                                  <span className="inline-flex px-1.5 py-0.5 bg-purple-100 text-purple-700 text-xs rounded-full font-medium">
                                    Novo
                                  </span>
                                )}
                                {score !== null && (
                                  <span className="inline-flex px-1.5 py-0.5 text-white text-xs rounded-full font-medium"
                                    style={{ backgroundColor: SCORE_COLOR[score] }}>
                                    {SCORE_LABEL[score]}
                                  </span>
                                )}
                              </div>

                              {/* Nome */}
                              <p className="text-sm font-semibold text-gray-800 truncate">
                                {sc.consultant.nome_consultores}
                              </p>
                              {/* Cliente */}
                              {sc.client && (
                                <p className="text-xs text-gray-500 truncate">{sc.client.razao_social_cliente}</p>
                              )}
                              {/* Último contato */}
                              {lastDate && (
                                <p className="text-xs text-gray-400 mt-0.5">
                                  Último: {lastDate}
                                </p>
                              )}
                            </div>

                            {/* Botão +Atividade */}
                            <button
                              onClick={() => {
                                onNavigateToAtividades(
                                  sc.client?.razao_social_cliente,
                                  sc.consultant.nome_consultores
                                );
                              }}
                              disabled={loading}
                              title={
                                status === 'done' ? 'Atividade registrada hoje' :
                                status === 'overdue' ? 'Atividade atrasada!' :
                                'Registrar atividade'
                              }
                              className={`
                                flex items-center gap-1 px-2.5 py-1.5 rounded-lg border-2 text-xs font-bold
                                transition-all flex-shrink-0
                                ${loading ? 'bg-gray-100 border-gray-200 text-gray-400 cursor-wait' : ''}
                                ${!loading && status === 'done' ? 'bg-green-50 border-green-500 text-green-700 hover:bg-green-100' : ''}
                                ${!loading && status === 'overdue' ? 'bg-red-50 border-red-500 text-red-700 hover:bg-red-100 animate-pulse' : ''}
                                ${!loading && status === 'pending' ? 'bg-blue-50 border-blue-500 text-blue-700 hover:bg-blue-100' : ''}
                              `}
                            >
                              {loading
                                ? <Clock size={12} className="animate-spin" />
                                : getStatusIcon(status)
                              }
                              <span>+Atividade</span>
                            </button>
                          </div>

                          {/* Toggle detalhes */}
                          <button
                            onClick={() => setExpandedConsultant(isExpanded ? null : sc.consultant.id)}
                            className="text-xs text-indigo-500 hover:text-indigo-700 mt-1 transition"
                          >
                            {isExpanded ? '▲ Ocultar' : '▼ Detalhes'}
                          </button>
                        </div>

                        {/* Detalhes expandidos */}
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
                  })
                )}
              </div>
            </div>
          ) : (
            <div className="bg-white border border-dashed border-gray-200 rounded-2xl p-8 text-center text-gray-400">
              <Calendar size={40} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm font-medium">Selecione um dia útil</p>
              <p className="text-xs mt-1">para ver os consultores agendados</p>
            </div>
          )}
        </div>
      </div>

      {/* ── VISÃO GERAL DOS CONSULTORES (lista completa do mês) */}
      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="flex items-center justify-between p-4 border-b border-gray-100">
          <h3 className="font-bold text-gray-800">
            Todos os Consultores — {monthNames[viewMonth - 1]} {viewYear}
          </h3>
          <span className="text-sm text-gray-500">{activeConsultants.length} consultores</span>
        </div>

        {activeConsultants.length === 0 ? (
          <div className="p-8 text-center text-gray-400 text-sm">
            Nenhum consultor encontrado com os filtros selecionados.
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {activeConsultants.map(consultant => {
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

              // Dias agendados para este consultor no mês
              const scheduledDaysForConsultant = schedule
                .flatMap(d => d.consultants.filter(sc => sc.consultant.id === consultant.id).map(() => d.day));

              return (
                <div key={consultant.id} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition">
                  {/* Score dot */}
                  <div
                    className="w-3 h-3 rounded-full flex-shrink-0"
                    style={{ backgroundColor: score ? SCORE_COLOR[score] : '#9e9e9e' }}
                  />

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-800 truncate">{consultant.nome_consultores}</p>
                    <p className="text-xs text-gray-500 truncate">
                      {clientInfo?.razao_social_cliente || '—'}
                      {score !== null && ` · Score ${score} ${SCORE_LABEL[score]}`}
                      {isNew && ' · Novo'}
                    </p>
                  </div>

                  {/* Frequência */}
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

                  {/* Dias agendados */}
                  <div className="hidden lg:flex gap-1 flex-wrap max-w-[140px]">
                    {scheduledDaysForConsultant.slice(0, 5).map(d => (
                      <button
                        key={d}
                        onClick={() => setSelectedDay(d)}
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

                  {/* Último contato */}
                  <div className="hidden md:block text-xs text-gray-400 w-20 text-right">
                    {lastDate || '—'}
                  </div>

                  {/* Botão +Atividade */}
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
          </div>
        )}
      </div>

    </div>
  );
};

export default AgendaAcompanhamento;
