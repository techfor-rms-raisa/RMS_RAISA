/**
 * Sidebar.tsx - Menu Lateral com Controle de Permissões
 * 
 * 🆕 v57.0: Matriz de Permissões Implementada
 * - Controle granular por perfil de usuário
 * - Separação RMS vs RAISA
 * - Config. Priorização apenas para Admin
 * 
 * 🆕 v58.0: Reordenação Menu RAISA
 * - Nova sequência: Vagas > Análise CV > LinkedIn > Banco Talentos > Candidaturas > Entrevista > Pipeline > Controle Envios
 * 
 * Data: 25/02/2026
 */

import React, { useState, useEffect } from 'react';
import { View, User } from '@/types';
import SidebarSection from './SidebarSection';
import SidebarToggle from './SidebarToggle';
import { APP_TITLE } from '../../constants';

interface SidebarProps {
    currentUser: User;
    currentView: View;
    onNavigate: (view: View) => void;
}

// ============================================
// CONSTANTES DE PERMISSÕES
// ============================================

// Perfis com acesso TOTAL ao RMS
const RMS_TOTAL = ['Administrador', 'Gestão de R&S', 'Gestão de Pessoas', 'Gestão Comercial'];

// Perfis com acesso TOTAL ao RAISA
const RAISA_TOTAL = ['Administrador', 'Gestão de R&S', 'Analista de R&S'];

// Perfis com acesso READ-ONLY ao RAISA
const RAISA_READONLY = ['Gestão Comercial'];

// Perfis que podem ver Config. Priorização
const CONFIG_PRIORIZACAO = ['Administrador'];

// Perfis que podem gerenciar usuários
const GERENCIAR_USUARIOS = ['Administrador', 'Gestão de R&S'];

const Sidebar: React.FC<SidebarProps> = ({ currentUser, currentView, onNavigate }) => {
    const [isCollapsed, setIsCollapsed] = useState(() => {
        return localStorage.getItem('orbit_sidebar_collapsed') === 'true';
    });

    useEffect(() => {
        localStorage.setItem('orbit_sidebar_collapsed', String(isCollapsed));
    }, [isCollapsed]);

    // ============================================
    // ITENS DO MENU RMS
    // ============================================
    
    const rmsItems = [
        // Dashboard - Todos exceto Cliente (que tem view especial)
        { 
            view: 'dashboard', 
            label: 'Dashboard', 
            icon: 'fa-solid fa-gauge-high', 
            roles: ['Administrador', 'Gestão de R&S', 'Gestão Comercial', 'Gestão de Pessoas', 'Analista de R&S', 'Consulta', 'Cliente'] 
        },
        // Quarentena - RMS Total + Analista (read-only) + Consulta (read-only)
        { 
            view: 'quarantine', 
            label: 'Quarentena', 
            icon: 'fa-solid fa-triangle-exclamation', 
            roles: ['Administrador', 'Gestão de R&S', 'Gestão Comercial', 'Gestão de Pessoas', 'Analista de R&S', 'Consulta'] 
        },
        // Recomendações - RMS Total + Cliente (só próprios dados)
        { 
            view: 'recommendations', 
            label: 'Recomendações', 
            icon: 'fa-regular fa-lightbulb', 
            roles: ['Administrador', 'Gestão de R&S', 'Gestão Comercial', 'Gestão de Pessoas', 'Cliente'] 
        },
        // Consultores - RMS Total + Analista (read-only) + Consulta (read-only)
        { 
            view: 'consultants', 
            label: 'Consultores', 
            icon: 'fa-solid fa-users', 
            roles: ['Administrador', 'Gestão de R&S', 'Gestão de Pessoas', 'Gestão Comercial', 'Analista de R&S', 'Consulta'] 
        },
        // Clientes - RMS Total + Analista (read-only) + Consulta (read-only)
        { 
            view: 'clients', 
            label: 'Clientes', 
            icon: 'fa-solid fa-building', 
            roles: ['Administrador', 'Gestão de R&S', 'Gestão Comercial', 'Gestão de Pessoas', 'Analista de R&S', 'Consulta'] 
        },
        // Analytics - RMS Total + Consulta (read-only)
        { 
            view: 'analytics', 
            label: 'Analytics', 
            icon: 'fa-solid fa-chart-line', 
            roles: ['Administrador', 'Gestão de R&S', 'Gestão Comercial', 'Gestão de Pessoas', 'Consulta'] 
        },
        // Movimentações - RMS Total
        { 
            view: 'movimentacoes', 
            label: 'Movimentações', 
            icon: 'fa-solid fa-arrow-right-arrow-left', 
            roles: ['Administrador', 'Gestão de R&S', 'Gestão Comercial', 'Gestão de Pessoas'] 
        },
        // Posição Comercial - RMS Total
        { 
            view: 'posicao_comercial', 
            label: 'Posição Comercial', 
            icon: 'fa-solid fa-chart-bar', 
            roles: ['Administrador', 'Gestão de R&S', 'Gestão Comercial', 'Gestão de Pessoas'] 
        },
        // Compliance - RMS Total
        { 
            view: 'compliance_dashboard', 
            label: 'Compliance', 
            icon: 'fa-solid fa-clipboard-check', 
            roles: ['Administrador', 'Gestão de R&S', 'Gestão de Pessoas', 'Gestão Comercial'] 
        },
        // Templates - RMS Total + Consulta (read-only)
        { 
            view: 'templates', 
            label: 'Templates', 
            icon: 'fa-regular fa-envelope', 
            roles: ['Administrador', 'Gestão de R&S', 'Gestão de Pessoas', 'Gestão Comercial', 'Consulta'] 
        },
        // Campanhas - RMS Total + Consulta (read-only)
        { 
            view: 'campaigns', 
            label: 'Campanhas', 
            icon: 'fa-solid fa-bullhorn', 
            roles: ['Administrador', 'Gestão de R&S', 'Gestão de Pessoas', 'Gestão Comercial', 'Consulta'] 
        },
        // Usuários - Todos os perfis (cada um vê conforme sua permissão)
        // 🆕 v57.1: Analista, Gestão de Pessoas, Gestão Comercial e Consulta veem só próprio perfil
        { 
            view: 'users', 
            label: 'Usuários', 
            icon: 'fa-solid fa-user-gear', 
            roles: ['Administrador', 'Gestão de R&S', 'Analista de R&S', 'Gestão de Pessoas', 'Gestão Comercial', 'Consulta'] 
        },
        // Exportação - RMS Total
        { 
            view: 'export', 
            label: 'Exportação', 
            icon: 'fa-solid fa-file-export', 
            roles: ['Administrador', 'Gestão de R&S', 'Gestão Comercial', 'Gestão de Pessoas'] 
        },
        // Importação - Apenas Admin e Gestão de R&S
        { 
            view: 'import', 
            label: 'Importação', 
            icon: 'fa-solid fa-file-import', 
            roles: ['Administrador', 'Gestão de R&S', 'Gestão de Pessoas'] 
        },
    ] as any;

    // ============================================
    // ITENS DO MENU ATIVIDADES
    // ============================================
    
    const atividadesItems = [
        { 
            view: 'atividades_inserir', 
            label: 'Inserir', 
            icon: 'fa-solid fa-pen-to-square', 
            roles: ['Administrador', 'Gestão de R&S', 'Gestão Comercial', 'Gestão de Pessoas'] 
        },
        { 
            view: 'atividades_consultar', 
            label: 'Consultar', 
            icon: 'fa-solid fa-magnifying-glass', 
            roles: ['Administrador', 'Gestão de R&S', 'Gestão Comercial', 'Gestão de Pessoas', 'Consulta'] 
        },
        { 
            view: 'atividades_exportar', 
            label: 'Exportar', 
            icon: 'fa-solid fa-download', 
            roles: ['Administrador', 'Gestão de R&S', 'Gestão Comercial', 'Gestão de Pessoas'] 
        },
    ] as any;

    // ============================================
    // ITENS DO MENU RAISA
    // ============================================
    
    const raisaItems = [
        // 1) Vagas - RAISA Total + Gestão Comercial (pode inserir vagas)
        { 
            view: 'vagas', 
            label: 'Vagas', 
            icon: 'fa-solid fa-briefcase', 
            roles: ['Administrador', 'Gestão de R&S', 'Analista de R&S', 'Gestão Comercial'] 
        },
        // 2) Análise de Currículo - RAISA Total + Gestão Comercial (read-only)
        { 
            view: 'analise_risco', 
            label: 'Análise de Currículo (AI)', 
            icon: 'fa-solid fa-magnifying-glass', 
            roles: ['Administrador', 'Gestão de R&S', 'Analista de R&S', 'Gestão Comercial'] 
        },
        // 3) Candidaturas - RAISA Total + Gestão Comercial (read-only)
        { 
            view: 'candidaturas', 
            label: 'Candidaturas', 
            icon: 'fa-solid fa-id-card', 
            roles: ['Administrador', 'Gestão de R&S', 'Analista de R&S', 'Gestão Comercial'] 
        },
        // 4) Entrevista Técnica - RAISA Total + Gestão Comercial (read-only)
        { 
            view: 'entrevista_tecnica', 
            label: 'Entrevista Técnica', 
            icon: 'fa-solid fa-headset', 
            roles: ['Administrador', 'Gestão de R&S', 'Analista de R&S', 'Gestão Comercial'] 
        },
        // 5) Banco de Talentos - RAISA Total + Gestão Comercial (read-only)
        { 
            view: 'talentos', 
            label: 'Banco de Talentos', 
            icon: 'fa-solid fa-user-graduate', 
            roles: ['Administrador', 'Gestão de R&S', 'Analista de R&S', 'Gestão Comercial'] 
        },
        // 6) Importar LinkedIn - Apenas RAISA Total (Gestão Comercial NÃO pode)
        { 
            view: 'linkedin_import', 
            label: 'Importar LinkedIn', 
            icon: 'fa-brands fa-linkedin', 
            roles: ['Administrador', 'Gestão de R&S', 'Analista de R&S'] 
        },
        // 7) Pipeline - RAISA Total + Gestão Comercial (read-only)
        { 
            view: 'pipeline', 
            label: 'Pipeline', 
            icon: 'fa-solid fa-filter', 
            roles: ['Administrador', 'Gestão de R&S', 'Analista de R&S', 'Gestão Comercial'] 
        },
        // 8) Controle de Envios - RAISA Total + Gestão Comercial (read-only)
        { 
            view: 'controle_envios', 
            label: 'Controle de Envios', 
            icon: 'fa-solid fa-paper-plane', 
            roles: ['Administrador', 'Gestão de R&S', 'Analista de R&S', 'Gestão Comercial'] 
        },
        // --- Restante mantém ordem ---
        // Distribuição IA - RAISA Total + Gestão Comercial (read-only)
        { 
            view: 'distribuicao_ia', 
            label: 'Distribuição IA', 
            icon: 'fa-solid fa-wand-magic-sparkles', 
            roles: ['Administrador', 'Gestão de R&S', 'Analista de R&S', 'Gestão Comercial'] 
        },
        // Config. Priorização - APENAS Administrador
        { 
            view: 'configuracao_priorizacao', 
            label: 'Config. Priorização', 
            icon: 'fa-solid fa-sliders', 
            roles: ['Administrador'] 
        },
        // Dashboards RAISA - RAISA Total + Gestão Comercial (read-only)
        { 
            view: 'dashboard_funil', 
            label: 'Funil de Conversão', 
            icon: 'fa-solid fa-chart-simple', 
            roles: ['Administrador', 'Gestão de R&S', 'Analista de R&S', 'Gestão Comercial'] 
        },
        { 
            view: 'dashboard_aprovacao', 
            label: 'Aprovação/Reprovação', 
            icon: 'fa-solid fa-check-double', 
            roles: ['Administrador', 'Gestão de R&S', 'Analista de R&S', 'Gestão Comercial'] 
        },
        { 
            view: 'dashboard_analistas', 
            label: 'Performance Analistas', 
            icon: 'fa-solid fa-ranking-star', 
            roles: ['Administrador', 'Gestão de R&S'] 
        },
        { 
            view: 'dashboard_indicacoes', 
            label: 'Indicações Cliente', 
            icon: 'fa-solid fa-user-plus', 
            roles: ['Administrador', 'Gestão de R&S'] 
        },
        { 
            view: 'dashboard_geral', 
            label: 'Performance Geral', 
            icon: 'fa-solid fa-chart-pie', 
            roles: ['Administrador', 'Gestão de R&S', 'Analista de R&S', 'Gestão Comercial'] 
        },
        { 
            view: 'dashboard_clientes', 
            label: 'Performance Clientes', 
            icon: 'fa-solid fa-building-user', 
            roles: ['Administrador', 'Gestão de R&S', 'Gestão Comercial'] 
        },
        { 
            view: 'dashboard_tempo', 
            label: 'Análise de Tempo', 
            icon: 'fa-solid fa-clock', 
            roles: ['Administrador', 'Gestão de R&S', 'Analista de R&S', 'Gestão Comercial'] 
        },
        { 
            view: 'dashboard_ml', 
            label: 'Aprendizado IA', 
            icon: 'fa-solid fa-brain', 
            roles: ['Administrador', 'Gestão de R&S'] 
        },
        { 
            view: 'dashboard_performance_ia', 
            label: 'Performance IA', 
            icon: 'fa-solid fa-robot', 
            roles: ['Administrador', 'Gestão de R&S'] 
        },
        { 
            view: 'dashboard_raisa_metrics', 
            label: 'Métricas RAISA', 
            icon: 'fa-solid fa-chart-area', 
            roles: ['Administrador', 'Gestão de R&S'] 
        },
    ] as any;

    // ============================================
    // ITENS DO MENU PROSPECT
    // ============================================
    
    const prospectItems = [
        { 
            view: 'prospect_search', 
            label: 'Buscar Leads', 
            icon: 'fa-solid fa-magnifying-glass-dollar', 
            roles: ['Administrador', 'Gestão Comercial'] 
        },
        { 
            view: 'prospect_list', 
            label: 'Meus Prospects', 
            icon: 'fa-solid fa-address-book', 
            roles: ['Administrador', 'Gestão Comercial', 'Gestão de R&S'] 
        },
        { 
            view: 'prospect_credits', 
            label: 'Consumo Créditos', 
            icon: 'fa-solid fa-chart-column', 
            roles: ['Administrador', 'Gestão Comercial'] 
        },
    ] as any;

    // ============================================
    // VERIFICAR SE USUÁRIO TEM ACESSO AO RAISA
    // ============================================
    
    const temAcessoRAISA = ['Administrador', 'Gestão de R&S', 'Analista de R&S', 'Gestão Comercial']
        .includes(currentUser.tipo_usuario);

    // ============================================
    // VERIFICAR SE USUÁRIO TEM ACESSO A ATIVIDADES
    // ============================================
    
    const temAcessoAtividades = ['Administrador', 'Gestão de R&S', 'Gestão Comercial', 'Gestão de Pessoas', 'Consulta']
        .includes(currentUser.tipo_usuario);

    const temAcessoPROSPECT = ['Administrador', 'Gestão Comercial', 'Gestão de R&S']
        .includes(currentUser.tipo_usuario);

    return (
        <aside 
            className={`
                bg-[#2D2D2D] text-gray-300 flex flex-col transition-all duration-300
                ${isCollapsed ? 'w-[60px]' : 'w-[240px]'}
                hidden md:flex
            `}
            style={{ height: 'calc(100vh - 64px)' }} 
        >
            <div className={`p-4 flex items-center justify-center border-b border-gray-700 ${isCollapsed ? 'h-16' : 'h-16'}`}>
                 {isCollapsed ? (
                     <span className="text-xl">⭕</span>
                 ) : (
                     <div className="font-bold text-white tracking-widest text-center">
                         <span className="text-orange-500 mr-1">⭕</span>
                         {APP_TITLE}
                     </div>
                 )}
            </div>

            <div className="flex-1 overflow-y-auto overflow-x-hidden py-4 custom-scrollbar">
                <SidebarSection 
                    title="RMS"
                    subtitle="Risk Management Systems"
                    items={rmsItems}
                    currentUserRole={currentUser.tipo_usuario}
                    currentView={currentView}
                    isCollapsed={isCollapsed}
                    onNavigate={onNavigate}
                />
                
                {/* Atividades - Oculto para Cliente */}
                {temAcessoAtividades && (
                    <SidebarSection 
                        title="Atividades"
                        items={atividadesItems}
                        currentUserRole={currentUser.tipo_usuario}
                        currentView={currentView}
                        isCollapsed={isCollapsed}
                        onNavigate={onNavigate}
                        isSubmenu={true}
                        icon="fa-solid fa-tasks"
                    />
                )}
                
                {/* RAISA - Oculto para Gestão de Pessoas, Consulta e Cliente */}
                {temAcessoRAISA && (
                    <>
                        <div className="my-2 border-t border-gray-700 mx-4 opacity-50"></div>

                        <SidebarSection 
                            title="RAISA"
                            subtitle="Recruitment AI System Assistant"
                            items={raisaItems}
                            currentUserRole={currentUser.tipo_usuario}
                            currentView={currentView}
                            isCollapsed={isCollapsed}
                            onNavigate={onNavigate}
                        />
                    </>
                )}

                {/* PROSPECT - Prospecção B2B */}
                {temAcessoPROSPECT && (
                    <>
                        <div className="my-2 border-t border-gray-700 mx-4 opacity-50"></div>

                        <SidebarSection 
                            title="PROSPECT"
                            subtitle="B2B Lead Intelligence"
                            items={prospectItems}
                            currentUserRole={currentUser.tipo_usuario}
                            currentView={currentView}
                            isCollapsed={isCollapsed}
                            onNavigate={onNavigate}
                        />
                    </>
                )}
            </div>

            <SidebarToggle 
                isCollapsed={isCollapsed} 
                onToggle={() => setIsCollapsed(!isCollapsed)} 
            />
        </aside>
    );
};

export default Sidebar;
