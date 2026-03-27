// src/components/atividades/AtividadesInserir.tsx
// 🔧 v2.9: Notificação filtrada por cliente — Gestão Comercial e Gestão Pessoas associados ao cliente selecionado
//          Gestão R&S: todos os usuários do perfil (sem filtro por cliente)
//          email_usuario normalizado via getEmailUsuario()
import React, { useState, useMemo, useEffect } from 'react';
import { Client, Consultant, UsuarioCliente, CoordenadorCliente, ConsultantReport } from '@/types';
import { User, Phone, Mail, Briefcase, Clock, Calendar, Bell, CheckCircle } from 'lucide-react';
import HistoricoAtividadesModal from '../HistoricoAtividadesModal';

// Tipo mínimo do usuário interno (app_users)
// 🔧 v2.9: email_usuario é o campo real na tabela app_users; email mantido por compatibilidade
interface AppUser {
    id: number;
    nome_usuario: string;
    email_usuario?: string; // campo real em app_users
    email?: string;         // alias de compatibilidade
    tipo_usuario: string;
}

// Helper: retorna o email do usuário independente do nome do campo
const getEmailUsuario = (u: AppUser): string | undefined =>
    u.email_usuario || u.email || undefined;

interface AtividadesInserirProps {
    clients: Client[];
    consultants: Consultant[];
    usuariosCliente: UsuarioCliente[];
    coordenadoresCliente?: CoordenadorCliente[];
    allReports?: ConsultantReport[];
    loadConsultantReports?: (consultantId: number) => Promise<ConsultantReport[]>;
    onManualReport: (text: string, gestorName?: string, extractedMonth?: number, extractedYear?: number, selectedConsultantName?: string) => Promise<void>;
    preSelectedClient?: string;
    preSelectedConsultant?: string;
    // 🆕 v2.7: Usuários internos RMS para notificação
    usuariosRMS?: AppUser[];
}

// ✅ FUNÇÃO PARA EXTRAIR DATA DO RELATÓRIO - CORREÇÃO DO BUG
const extractDateFromReport = (text: string): { month: number | null; year: number | null; dateRange: string | null } => {
    console.log('🔍 Iniciando extração de data do relatório...');
    
    // Mapeamento de meses em português
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
        'dezembro': 12, 'dez': 12
    };

    let month: number | null = null;
    let year: number | null = null;
    let dateRange: string | null = null;

    // Padrão 1: "Período de DD.MM.YYYY a DD.MM.YYYY" ou "Período de DD/MM/YYYY a DD/MM/YYYY"
    const periodoRegex = /Período\s+de\s+(\d{1,2})[.\/](\d{1,2})[.\/](\d{4})\s+a\s+(\d{1,2})[.\/](\d{1,2})[.\/](\d{4})/i;
    let match = text.match(periodoRegex);
    
    if (match) {
        month = parseInt(match[2], 10);
        year = parseInt(match[3], 10);
        dateRange = `${match[1]}/${match[2]}/${match[3]} a ${match[4]}/${match[5]}/${match[6]}`;
        console.log(`✅ Padrão 1 encontrado: Período ${dateRange} → Mês ${month}, Ano ${year}`);
        return { month, year, dateRange };
    }

    // Padrão 2: "DD/MM/YYYY a DD/MM/YYYY" (sem "Período de")
    const rangeRegex = /(\d{1,2})[.\/](\d{1,2})[.\/](\d{4})\s+a\s+(\d{1,2})[.\/](\d{1,2})[.\/](\d{4})/i;
    match = text.match(rangeRegex);
    
    if (match) {
        month = parseInt(match[2], 10);
        year = parseInt(match[3], 10);
        dateRange = `${match[1]}/${match[2]}/${match[3]} a ${match[4]}/${match[5]}/${match[6]}`;
        console.log(`✅ Padrão 2 encontrado: ${dateRange} → Mês ${month}, Ano ${year}`);
        return { month, year, dateRange };
    }

    // Padrão 3: "RELATÓRIO DE ATIVIDADES - OUTUBRO/2025" ou "Outubro/2025"
    const monthYearRegex = /(?:RELATÓRIO[S]?\s+(?:DE\s+)?ATIVIDADES?\s*[-–]\s*)?([A-Za-záàâãéèêíïóôõöúç]+)\s*[\/\-]\s*(\d{4})/i;
    match = text.match(monthYearRegex);
    
    if (match) {
        const monthName = match[1].toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        if (monthNames[monthName]) {
            month = monthNames[monthName];
            year = parseInt(match[2], 10);
            dateRange = `${match[1]}/${match[2]}`;
            console.log(`✅ Padrão 3 encontrado: ${dateRange} → Mês ${month}, Ano ${year}`);
            return { month, year, dateRange };
        }
    }

    // Padrão 4: "Mês de Outubro de 2025" ou "mês: outubro 2025"
    const monthTextRegex = /(?:mês\s*(?:de|:)?\s*)([A-Za-záàâãéèêíïóôõöúç]+)(?:\s+de)?\s+(\d{4})/i;
    match = text.match(monthTextRegex);
    
    if (match) {
        const monthName = match[1].toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        if (monthNames[monthName]) {
            month = monthNames[monthName];
            year = parseInt(match[2], 10);
            dateRange = `${match[1]} de ${match[2]}`;
            console.log(`✅ Padrão 4 encontrado: ${dateRange} → Mês ${month}, Ano ${year}`);
            return { month, year, dateRange };
        }
    }

    // Padrão 5: Apenas data no formato DD/MM/YYYY (pega a primeira ocorrência)
    const singleDateRegex = /(\d{1,2})[.\/](\d{1,2})[.\/](\d{4})/;
    match = text.match(singleDateRegex);
    
    if (match) {
        month = parseInt(match[2], 10);
        year = parseInt(match[3], 10);
        dateRange = `${match[1]}/${match[2]}/${match[3]}`;
        console.log(`✅ Padrão 5 encontrado: ${dateRange} → Mês ${month}, Ano ${year}`);
        return { month, year, dateRange };
    }

    // Padrão 6: Nome do mês solto no texto (última tentativa)
    for (const [name, num] of Object.entries(monthNames)) {
        const regex = new RegExp(`\\b${name}\\b`, 'i');
        if (regex.test(text)) {
            month = num;
            // Tenta encontrar o ano próximo ao nome do mês
            const yearMatch = text.match(new RegExp(`${name}\\s*(?:de\\s*)?(\\d{4})`, 'i'));
            if (yearMatch) {
                year = parseInt(yearMatch[1], 10);
            } else {
                year = new Date().getFullYear();
            }
            dateRange = `${name} ${year}`;
            console.log(`✅ Padrão 6 encontrado: ${dateRange} → Mês ${month}, Ano ${year}`);
            return { month, year, dateRange };
        }
    }

    console.warn('⚠️ Nenhum padrão de data encontrado no relatório');
    return { month: null, year: null, dateRange: null };
};

const AtividadesInserir: React.FC<AtividadesInserirProps> = ({
    clients,
    consultants,
    usuariosCliente,
    coordenadoresCliente = [],
    allReports = [],
    loadConsultantReports,
    onManualReport,
    preSelectedClient = '',
    preSelectedConsultant = '',
    usuariosRMS = []
}) => {
    // Estados do formulário manual
    const [selectedClient, setSelectedClient] = useState<string>('');
    const [selectedConsultant, setSelectedConsultant] = useState<string>('');
    const [month, setMonth] = useState<number>(new Date().getMonth() + 1);
    const [activities, setActivities] = useState<string>('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    
    // Estados de upload
    const [mode, setMode] = useState<'manual' | 'import'>('manual');
    const [uploadedFile, setUploadedFile] = useState<File | null>(null);
    const [extractedText, setExtractedText] = useState<string>('');
    const [isExtracting, setIsExtracting] = useState(false);

    // ✅ NOVO: Estados para data extraída do arquivo importado
    const [extractedMonth, setExtractedMonth] = useState<number | null>(null);
    const [extractedYear, setExtractedYear] = useState<number | null>(null);
    const [extractedDateRange, setExtractedDateRange] = useState<string | null>(null);

    // Estado para modal de histórico
    const [showHistoricoModal, setShowHistoricoModal] = useState(false);
    const [consultantReports, setConsultantReports] = useState<ConsultantReport[]>([]);
    const [loadingReports, setLoadingReports] = useState(false);

    // 🆕 v2.7: Estados de notificação
    const [notifComercial, setNotifComercial] = useState(false);
    const [notifRS, setNotifRS]               = useState(false);
    const [notifPessoas, setNotifPessoas]     = useState(false);
    const [enviandoEmails, setEnviandoEmails] = useState(false);

    // Navegação contextual
    useEffect(() => {
        if (preSelectedClient) {
            setSelectedClient(preSelectedClient);
        }
    }, [preSelectedClient]);

    useEffect(() => {
        if (preSelectedConsultant && preSelectedClient) {
            setSelectedConsultant(preSelectedConsultant);
        }
    }, [preSelectedConsultant, preSelectedClient]);

    // Filtrar consultores pelo cliente selecionado
    // ✅ v2.4: Adiciona constante do ano atual para filtros
    const currentYear = new Date().getFullYear();

    const filteredConsultants = useMemo(() => {
        if (!selectedClient) return [];
        const client = clients.find(c => c.razao_social_cliente === selectedClient);
        if (!client) return [];
        const clientManagers = usuariosCliente.filter(u => u.id_cliente === client.id);
        const managerIds = clientManagers.map(m => m.id);
        return consultants.filter(c => 
            c.status === 'Ativo' && 
            c.gestor_imediato_id && 
            managerIds.includes(c.gestor_imediato_id) &&
            (c.ano_vigencia === currentYear || c.ano_vigencia === null || c.ano_vigencia === undefined) // ✅ v2.4: Filtrar pelo ano atual (tratando NULL)
        ).sort((a, b) => a.nome_consultores.localeCompare(b.nome_consultores));
    }, [selectedClient, clients, consultants, usuariosCliente, currentYear]);

    // Obter dados do consultor selecionado (também considera ano, tratando NULL)
    const selectedConsultantData = useMemo(() => {
        if (!selectedConsultant) return null;
        // ✅ v2.4: Prioriza consultor do ano atual (tratando NULL)
        return consultants.find(c => 
            c.nome_consultores === selectedConsultant && 
            (c.ano_vigencia === currentYear || c.ano_vigencia === null || c.ano_vigencia === undefined)
        ) || consultants.find(c => c.nome_consultores === selectedConsultant) || null;
    }, [selectedConsultant, consultants, currentYear]);

    // Obter dados do gestor/coordenador associado
    const managerData = useMemo(() => {
        if (!selectedConsultantData) return null;
        
        const manager = usuariosCliente.find(u => u.id === selectedConsultantData.gestor_imediato_id);
        
        if (manager) {
            return {
                nome: manager.nome_gestor_cliente,
                cargo: manager.cargo_gestor,
                email: manager.email_gestor || `gestor${manager.id}@cliente.com`,
                celular: manager.celular || 'Não informado',
                tipo: 'Gestor'
            };
        }
        
        if (selectedConsultantData.coordenador_id) {
            const coordenador = coordenadoresCliente.find(c => c.id === selectedConsultantData.coordenador_id);
            if (coordenador) {
                return {
                    nome: coordenador.nome_coordenador_cliente,
                    cargo: coordenador.cargo_coordenador_cliente,
                    email: coordenador.email_coordenador || `coordenador${coordenador.id}@cliente.com`,
                    celular: coordenador.celular || 'Não informado',
                    tipo: 'Coordenador'
                };
            }
        }
        
        return null;
    }, [selectedConsultantData, usuariosCliente, coordenadoresCliente]);

    // 🔧 v2.9: Destinatários de notificação filtrados pelo cliente selecionado
    // Gestão Comercial e Gestão Pessoas: apenas o usuário associado ao cliente (id_gestao_comercial / id_gestao_de_pessoas)
    // Gestão R&S: todos os usuários do perfil (sem filtro por cliente — são transversais)
    const destinatariosDoCliente = useMemo(() => {
        const clienteAtual = clients.find(c => c.razao_social_cliente === selectedClient);
        if (!clienteAtual) return { comercial: [] as AppUser[], pessoas: [] as AppUser[], rs: [] as AppUser[] };

        // Gestão Comercial: apenas o usuário com id === id_gestao_comercial do cliente
        const comercial = clienteAtual.id_gestao_comercial
            ? usuariosRMS.filter(u => u.id === clienteAtual.id_gestao_comercial && getEmailUsuario(u))
            : [];

        // Gestão Pessoas: apenas o usuário com id === id_gestao_de_pessoas do cliente
        const pessoas = clienteAtual.id_gestao_de_pessoas
            ? usuariosRMS.filter(u => u.id === clienteAtual.id_gestao_de_pessoas && getEmailUsuario(u))
            : [];

        // Gestão R&S: todos do perfil com email (transversal, não filtrado por cliente)
        const rs = usuariosRMS.filter(u => u.tipo_usuario === 'Gestão de R&S' && getEmailUsuario(u));

        return { comercial, pessoas, rs };
    }, [selectedClient, clients, usuariosRMS]);

    // Handler para abrir histórico
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

    // ✅ Handler para upload de arquivo - CORRIGIDO
    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setUploadedFile(file);
        setIsExtracting(true);
        
        // Resetar estados de data extraída
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

            // ✅ CORREÇÃO: Extrair data automaticamente do texto
            const { month, year, dateRange } = extractDateFromReport(fullText);
            
            if (month !== null) {
                setExtractedMonth(month);
                setExtractedYear(year);
                setExtractedDateRange(dateRange);
                console.log(`📅 Data extraída com sucesso: Mês ${month}, Ano ${year}`);
            } else {
                console.warn('⚠️ Não foi possível extrair a data automaticamente');
            }

        } catch (error) {
            console.error('Erro ao extrair texto:', error);
            alert('Erro ao processar arquivo. Tente novamente.');
            setUploadedFile(null);
        } finally {
            setIsExtracting(false);
        }
    };

    // ✅ Handler para importação - CORRIGIDO para passar mês/ano extraídos
    const handleImportSubmit = async () => {
        if (!extractedText) return;
        setIsSubmitting(true);
        try {
            // Passa o mês e ano extraídos para a função de processamento
            await onManualReport(
                extractedText, 
                undefined, 
                extractedMonth || undefined, 
                extractedYear || undefined
            );
            
            // Limpar estados
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

    // 🆕 v2.7: Envia emails de notificação para os perfis selecionados
    const enviarEmailsNotificacao = async (
        reportText: string,
        consultantData: Consultant,
        clientName: string,
        monthName: string
    ) => {
        const destinatarios: { email: string; nome: string; perfil: string }[] = [];

        // 🔧 v2.9: Usar destinatários filtrados por cliente
        // Gestão Comercial e Gestão Pessoas: apenas o associado ao cliente
        // Gestão R&S: todos do perfil
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
        try {
            await Promise.all(
                destinatarios.map(dest =>
                    fetch('/api/send-email', {
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
                            type: 'activity_report' as any,
                        })
                    })
                )
            );
        } catch (err) {
            console.error('Erro ao enviar emails de notificação:', err);
        } finally {
            setEnviandoEmails(false);
        }
    };

    const handleManualSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedConsultant || !activities.trim()) return;

        setIsSubmitting(true);
        try {
            const consultant = consultants.find(c => c.nome_consultores === selectedConsultant);
            const manager = consultant ? usuariosCliente.find(u => u.id === consultant.gestor_imediato_id) : null;
            const client = clients.find(c => c.razao_social_cliente === selectedClient);

            const reportText = activities;
            const gestorName = manager?.nome_gestor_cliente || 'Não especificado';

            // 🔧 v2.6: Passa o nome do consultor selecionado para evitar busca da IA
            await onManualReport(reportText, gestorName, month, new Date().getFullYear(), selectedConsultant);

            // 🆕 v2.7: Envia emails de notificação se algum checkbox estiver marcado
            if ((notifComercial || notifRS || notifPessoas) && consultant) {
                const monthName = months.find(m => m.value === month)?.label || String(month);
                await enviarEmailsNotificacao(reportText, consultant, selectedClient, monthName);
            }

            setActivities('');
            setSelectedConsultant('');
            setNotifComercial(false);
            setNotifRS(false);
            setNotifPessoas(false);
            alert('Relatório de atividades processado com sucesso!');
        } catch (error) {
            console.error('Erro ao enviar relatório:', error);
            alert('Erro ao processar relatório. Tente novamente.');
        } finally {
            setIsSubmitting(false);
        }
    };

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

    const months = Array.from({ length: 12 }, (_, i) => ({ value: i + 1, label: new Date(0, i).toLocaleString('pt-BR', { month: 'long' }) }));

    // ✅ Função para obter nome do mês
    const getMonthName = (monthNum: number): string => {
        return new Date(0, monthNum - 1).toLocaleString('pt-BR', { month: 'long' });
    };

    return (
        <div className="max-w-6xl mx-auto p-4">
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-2xl font-bold text-gray-800">Inserir Relatório de Atividades</h2>
                <button onClick={downloadTemplate} className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition text-sm font-medium">
                    Baixar Template de Exemplo
                </button>
            </div>

            <div className="flex gap-2 mb-4 border-b border-gray-200">
                <button onClick={() => setMode('manual')} className={`px-6 py-2 font-medium transition text-sm ${mode === 'manual' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-600 hover:text-gray-800'}`}>
                    Digitação Manual
                </button>
                <button onClick={() => setMode('import')} className={`px-6 py-2 font-medium transition text-sm ${mode === 'import' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-600 hover:text-gray-800'}`}>
                    Importar Arquivo
                </button>
            </div>

            {mode === 'manual' ? (
                <form onSubmit={handleManualSubmit} className="space-y-4">
                    {/* Dropdowns Cliente e Consultor em Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Cliente</label>
                            <select 
                                value={selectedClient} 
                                onChange={(e) => { setSelectedClient(e.target.value); setSelectedConsultant(''); }} 
                                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            >
                                <option value="">Selecione um cliente...</option>
                                {clients.map(c => <option key={c.id} value={c.razao_social_cliente}>{c.razao_social_cliente}</option>)}
                            </select>
                        </div>

                        {selectedClient && (
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Consultor</label>
                                <select 
                                    value={selectedConsultant} 
                                    onChange={(e) => setSelectedConsultant(e.target.value)} 
                                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                >
                                    <option value="">Selecione um consultor...</option>
                                    {filteredConsultants.map(c => <option key={c.id} value={c.nome_consultores}>{c.nome_consultores}</option>)}
                                </select>
                            </div>
                        )}
                    </div>

                    {/* Cards de Informação - Layout Compacto */}
                    {selectedConsultantData && (
                        <div className="bg-gradient-to-r from-blue-50 to-purple-50 border border-gray-200 rounded-lg p-3">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                {/* Card Consultor - Compacto */}
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
                                                <p className="text-xs font-semibold text-gray-800 truncate">{selectedConsultantData.nome_consultores}</p>
                                            </div>
                                        </div>
                                        <div className="flex items-start gap-2">
                                            <Mail className="w-3 h-3 text-gray-500 mt-0.5 flex-shrink-0" />
                                            <div className="min-w-0">
                                                <p className="text-xs text-gray-600">E-mail</p>
                                                <p className="text-xs text-gray-800 truncate">{selectedConsultantData.email_consultor || 'Não informado'}</p>
                                            </div>
                                        </div>
                                        <div className="flex items-start gap-2">
                                            <Phone className="w-3 h-3 text-gray-500 mt-0.5 flex-shrink-0" />
                                            <div className="min-w-0">
                                                <p className="text-xs text-gray-600">Celular</p>
                                                <p className="text-xs text-gray-800">{selectedConsultantData.celular || 'Não informado'}</p>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Card Gestor - Compacto */}
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

                                {/* Botão Histórico - Integrado nos Cards */}
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

                    {/* Mês - Compacto */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Mês</label>
                            <select 
                                value={month} 
                                onChange={(e) => setMonth(parseInt(e.target.value))} 
                                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            >
                                {months.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                            </select>
                        </div>
                    </div>

                    {/* Atividades */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Atividades e Observações</label>
                        <textarea 
                            value={activities} 
                            onChange={(e) => setActivities(e.target.value)} 
                            placeholder="Descreva as atividades, desempenho e observações sobre o consultor..." 
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent" 
                            rows={8} 
                        />
                    </div>

                    {/* 🆕 v2.7: Frame Notificar */}
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                        <div className="flex items-center gap-2 mb-3">
                            <Bell className="w-4 h-4 text-amber-600" />
                            <h3 className="text-sm font-semibold text-amber-900">Notificar</h3>
                            <span className="text-xs text-amber-600 ml-1">— Enviar cópia deste relatório por e-mail</span>
                        </div>
                        <div className="flex flex-wrap gap-4">
                            {/* Gestão Comercial */}
                            <label className="flex items-center gap-2 cursor-pointer group">
                                <input
                                    type="checkbox"
                                    checked={notifComercial}
                                    onChange={(e) => setNotifComercial(e.target.checked)}
                                    className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                />
                                <span className="text-sm text-gray-700 group-hover:text-gray-900 font-medium">Gestão Comercial</span>
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
                                    onChange={(e) => setNotifRS(e.target.checked)}
                                    className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                />
                                <span className="text-sm text-gray-700 group-hover:text-gray-900 font-medium">Gestão R&S</span>
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
                                    onChange={(e) => setNotifPessoas(e.target.checked)}
                                    className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                />
                                <span className="text-sm text-gray-700 group-hover:text-gray-900 font-medium">Gestão Pessoas</span>
                                {notifPessoas && (
                                    <span className="text-xs text-blue-600 font-medium">
                                        ({destinatariosDoCliente.pessoas.length} destinatário(s))
                                    </span>
                                )}
                            </label>
                        </div>

                        {/* Aviso quando nenhum usuário do perfil tem email */}
                        {(notifComercial && destinatariosDoCliente.comercial.length === 0) && (
                            <p className="text-xs text-red-500 mt-2">⚠️ Nenhum usuário de Gestão Comercial associado a este cliente com e-mail cadastrado.</p>
                        )}
                        {(notifRS && destinatariosDoCliente.rs.length === 0) && (
                            <p className="text-xs text-red-500 mt-2">⚠️ Nenhum usuário de Gestão R&S com e-mail cadastrado.</p>
                        )}
                        {(notifPessoas && destinatariosDoCliente.pessoas.length === 0) && (
                            <p className="text-xs text-red-500 mt-2">⚠️ Nenhum usuário de Gestão de Pessoas associado a este cliente com e-mail cadastrado.</p>
                        )}

                        {enviandoEmails && (
                            <p className="text-xs text-blue-600 mt-2 flex items-center gap-1">
                                <span className="animate-spin">⏳</span> Enviando notificações...
                            </p>
                        )}
                    </div>

                    {/* Botões */}
                    <div className="flex justify-end gap-3">
                        <button 
                            type="button" 
                            onClick={() => { setSelectedClient(''); setSelectedConsultant(''); setMonth(new Date().getMonth() + 1); setActivities(''); setNotifComercial(false); setNotifRS(false); setNotifPessoas(false); }} 
                            className="px-5 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition text-sm font-medium"
                        >
                            Limpar
                        </button>
                        <button 
                            type="submit" 
                            disabled={isSubmitting || !selectedConsultant} 
                            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:bg-gray-400 text-sm font-medium"
                        >
                            {isSubmitting ? 'Processando...' : 'Enviar Relatório'}
                        </button>
                    </div>
                </form>
            ) : (
                <div className="space-y-4">
                    <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
                        <input type="file" accept=".pdf,.txt" onChange={handleFileUpload} className="hidden" id="file-upload" />
                        <label htmlFor="file-upload" className="cursor-pointer inline-block px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition text-sm font-medium">
                            Selecionar PDF ou TXT
                        </label>
                        {uploadedFile && <div className="mt-3 text-sm text-gray-600"><p><strong>Arquivo:</strong> {uploadedFile.name}</p></div>}
                        {isExtracting && <p className="mt-3 text-blue-600 text-sm">Extraindo texto...</p>}
                    </div>

                    {/* ✅ NOVO: Card mostrando a data extraída */}
                    {extractedText && (
                        <div className="bg-gradient-to-r from-green-50 to-blue-50 border border-green-200 rounded-lg p-4">
                            <div className="flex items-center gap-3">
                                <Calendar className="w-5 h-5 text-green-600" />
                                <div>
                                    <h4 className="text-sm font-semibold text-green-800">Data do Relatório</h4>
                                    {extractedMonth !== null ? (
                                        <p className="text-sm text-green-700">
                                            <strong>Período detectado:</strong> {extractedDateRange || `${getMonthName(extractedMonth)} de ${extractedYear}`}
                                            <span className="ml-2 px-2 py-0.5 bg-green-100 text-green-800 rounded text-xs font-medium">
                                                Mês {extractedMonth} / {extractedYear}
                                            </span>
                                        </p>
                                    ) : (
                                        <p className="text-sm text-amber-600">
                                            ⚠️ Não foi possível detectar a data automaticamente. O mês atual será usado.
                                        </p>
                                    )}
                                </div>
                            </div>
                            
                            {/* ✅ Seletor manual caso a detecção falhe ou esteja incorreta */}
                            <div className="mt-3 flex items-center gap-4">
                                <span className="text-xs text-gray-600">Corrigir mês manualmente:</span>
                                <select 
                                    value={extractedMonth || new Date().getMonth() + 1} 
                                    onChange={(e) => setExtractedMonth(parseInt(e.target.value))}
                                    className="border border-gray-300 rounded px-2 py-1 text-sm"
                                >
                                    {months.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                                </select>
                                <input 
                                    type="number" 
                                    value={extractedYear || new Date().getFullYear()} 
                                    onChange={(e) => setExtractedYear(parseInt(e.target.value))}
                                    min="2020" 
                                    max="2030"
                                    className="border border-gray-300 rounded px-2 py-1 text-sm w-20"
                                />
                            </div>
                        </div>
                    )}

                    {extractedText && (
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Texto Extraído</label>
                            <textarea 
                                value={extractedText} 
                                onChange={(e) => setExtractedText(e.target.value)} 
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

