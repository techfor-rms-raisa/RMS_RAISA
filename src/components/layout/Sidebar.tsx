
import React, { useState, useEffect } from 'react';
import { View, User } from '../../src/components/types';
import SidebarSection from './SidebarSection';
import SidebarToggle from './SidebarToggle';
import { APP_TITLE } from '../../constants';

interface SidebarProps {
    currentUser: User;
    currentView: View;
    onNavigate: (view: View) => void;
}

const Sidebar: React.FC<SidebarProps> = ({ currentUser, currentView, onNavigate }) => {
    const [isCollapsed, setIsCollapsed] = useState(() => {
        return localStorage.getItem('orbit_sidebar_collapsed') === 'true';
    });

    useEffect(() => {
        localStorage.setItem('orbit_sidebar_collapsed', String(isCollapsed));
    }, [isCollapsed]);

    // RMS Icons mapped to FontAwesome classes
    const rmsItems = [
        { view: 'dashboard', label: 'Dashboard', icon: 'fa-solid fa-gauge-high', roles: ['Administrador', 'Gestão Comercial', 'Gestão de Pessoas', 'Analista de R&S', 'Consulta', 'Cliente'] },
        { view: 'quarantine', label: 'Quarentena', icon: 'fa-solid fa-triangle-exclamation', roles: ['Administrador', 'Gestão Comercial', 'Gestão de Pessoas'] },
        { view: 'recommendations', label: 'Recomendações', icon: 'fa-regular fa-lightbulb', roles: ['Administrador', 'Gestão Comercial', 'Gestão de Pessoas'] },
        { view: 'consultants', label: 'Consultores', icon: 'fa-solid fa-users', roles: ['Administrador', 'Gestão de Pessoas'] },
        { view: 'clients', label: 'Clientes', icon: 'fa-solid fa-building', roles: ['Administrador', 'Gestão Comercial'] },
        { view: 'analytics', label: 'Analytics', icon: 'fa-solid fa-chart-line', roles: ['Administrador', 'Gestão Comercial', 'Gestão de Pessoas'] },
        { view: 'compliance_dashboard', label: 'Compliance', icon: 'fa-solid fa-clipboard-check', roles: ['Administrador', 'Gestão de Pessoas', 'Gestão Comercial'] },
        { view: 'templates', label: 'Templates', icon: 'fa-regular fa-envelope', roles: ['Administrador', 'Gestão de Pessoas'] },
        { view: 'campaigns', label: 'Campanhas', icon: 'fa-solid fa-bullhorn', roles: ['Administrador'] },
        { view: 'users', label: 'Usuários', icon: 'fa-solid fa-user-gear', roles: ['Administrador'] },
        { view: 'export', label: 'Exportação', icon: 'fa-solid fa-file-export', roles: ['Administrador', 'Gestão Comercial', 'Gestão de Pessoas'] },
        { view: 'import', label: 'Importação', icon: 'fa-solid fa-file-import', roles: ['Administrador'] },
    ] as any;

    // Atividades Items (submenu)
    const atividadesItems = [
        { view: 'atividades_inserir', label: 'Inserir', icon: 'fa-solid fa-pen-to-square', roles: ['Administrador', 'Gestão Comercial', 'Gestão de Pessoas'] },
        { view: 'atividades_consultar', label: 'Consultar', icon: 'fa-solid fa-magnifying-glass', roles: ['Administrador', 'Gestão Comercial', 'Gestão de Pessoas'] },
        { view: 'atividades_exportar', label: 'Exportar', icon: 'fa-solid fa-download', roles: ['Administrador', 'Gestão Comercial', 'Gestão de Pessoas'] },
    ] as any;

    // RAISA Icons mapped to FontAwesome classes
    const raisaItems = [
        { view: 'vagas', label: 'Vagas', icon: 'fa-solid fa-briefcase', roles: ['Administrador', 'Analista de R&S'] },
        { view: 'candidaturas', label: 'Candidaturas', icon: 'fa-solid fa-id-card', roles: ['Administrador', 'Analista de R&S'] },
        { view: 'entrevista_tecnica', label: 'Entrevista Técnica', icon: 'fa-solid fa-headset', roles: ['Administrador', 'Analista de R&S'] },
        { view: 'controle_envios', label: 'Controle de Envios', icon: 'fa-solid fa-paper-plane', roles: ['Administrador', 'Analista de R&S', 'Gestão Comercial'] },
        { view: 'analise_risco', label: 'Análise de Risco', icon: 'fa-solid fa-magnifying-glass', roles: ['Administrador', 'Analista de R&S'] },
        { view: 'pipeline', label: 'Pipeline', icon: 'fa-solid fa-filter', roles: ['Administrador', 'Gestão de Pessoas', 'Analista de R&S'] },
        { view: 'talentos', label: 'Banco de Talentos', icon: 'fa-solid fa-user-graduate', roles: ['Administrador', 'Analista de R&S'] },
        { view: 'dashboard_funil', label: 'Funil de Conversão', icon: 'fa-solid fa-chart-simple', roles: ['Administrador', 'Gestão de Pessoas', 'Analista de R&S'] },
        { view: 'dashboard_aprovacao', label: 'Aprovação/Reprovação', icon: 'fa-solid fa-check-double', roles: ['Administrador', 'Gestão de Pessoas', 'Analista de R&S'] },
        { view: 'dashboard_analistas', label: 'Performance Analistas', icon: 'fa-solid fa-ranking-star', roles: ['Administrador', 'Gestão de Pessoas'] },
        { view: 'dashboard_geral', label: 'Performance Geral', icon: 'fa-solid fa-chart-pie', roles: ['Administrador', 'Gestão de Pessoas', 'Analista de R&S'] },
        { view: 'dashboard_clientes', label: 'Performance Clientes', icon: 'fa-solid fa-building-user', roles: ['Administrador', 'Gestão de Pessoas', 'Gestão Comercial'] },
        { view: 'dashboard_tempo', label: 'Análise de Tempo', icon: 'fa-solid fa-clock', roles: ['Administrador', 'Gestão de Pessoas', 'Analista de R&S'] },
    ] as any;

    return (
        <aside 
            className={`
                bg-[#2D2D2D] text-gray-300 flex flex-col transition-all duration-300
                ${isCollapsed ? 'w-[60px]' : 'w-[240px]'}
                hidden md:flex
            `}
            style={{ height: 'calc(100vh - 64px)' }} 
        >
            {/* Logo Area in Sidebar */}
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
                    subtitle="Risk Management Systems" // ✅ NOVO: Descrição
                    items={rmsItems}
                    currentUserRole={currentUser.tipo_usuario}
                    currentView={currentView}
                    isCollapsed={isCollapsed}
                    onNavigate={onNavigate}
                />
                
                {/* Visual Separator */}
                <div className="my-2 border-t border-gray-700 mx-4 opacity-50"></div>

                <SidebarSection 
                    title="Atividades"
                    items={atividadesItems}
                    currentUserRole={currentUser.tipo_usuario}
                    currentView={currentView}
                    isCollapsed={isCollapsed}
                    onNavigate={onNavigate}
                    isSubmenu={true}
                    showIcon={true}
                />
                
                {/* Visual Separator */}
                <div className="my-2 border-t border-gray-700 mx-4 opacity-50"></div>

                <SidebarSection 
                    title="RAISA"
                    subtitle="Recruitment And Intelligent Staff Allocation" // ✅ NOVO: Descrição
                    items={raisaItems}
                    currentUserRole={currentUser.tipo_usuario}
                    currentView={currentView}
                    isCollapsed={isCollapsed}
                    onNavigate={onNavigate}
                />
            </div>

            <SidebarToggle 
                isCollapsed={isCollapsed} 
                onToggle={() => setIsCollapsed(!isCollapsed)} 
            />
        </aside>
    );
};

export default Sidebar;
