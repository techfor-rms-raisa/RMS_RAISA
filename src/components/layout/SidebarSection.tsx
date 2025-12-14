import React from 'react';
import { View, UserRole } from '../../src/components/types';
import SidebarItem from './SidebarItem';

interface ItemConfig {
    view: View;
    label: string;
    icon: string;
    roles: UserRole[];
}

interface SidebarSectionProps {
    title?: string;
    subtitle?: string; // ✅ NOVO: Descrição do acrônimo
    items: ItemConfig[];
    currentUserRole: UserRole;
    currentView: View;
    isCollapsed: boolean;
    onNavigate: (view: View) => void;
    isSubmenu?: boolean; // ✅ NOVO: Ativa comportamento hover/dropdown
    showIcon?: boolean; // ✅ NOVO: Mostrar ícone antes do título
}

const SidebarSection: React.FC<SidebarSectionProps> = ({ title, subtitle, items, currentUserRole, currentView, isCollapsed, onNavigate, isSubmenu = false, showIcon = false }) => {
    const [isHovered, setIsHovered] = React.useState(false);
    const visibleItems = items.filter(item => item.roles.includes(currentUserRole));

    if (visibleItems.length === 0) return null;

    return (
        <div 
            className="mb-4"
            onMouseEnter={() => isSubmenu && setIsHovered(true)}
            onMouseLeave={() => isSubmenu && setIsHovered(false)}
        >
            {!isCollapsed && title && !showIcon && (
                <div className="px-4 mb-2">
                    <h3 className="text-xs font-semibold tracking-wider" style={{ color: '#F0F0F0' }}>
                        {title.toUpperCase()}
                    </h3>
                    {subtitle && (
                        <p className="text-[10px] mt-0.5 leading-tight" style={{ color: '#F0F0F0' }}>
                            {subtitle}
                        </p>
                    )}
                </div>
            )}
            {!isCollapsed && title && showIcon && (
                <div className="px-4 mb-1">
                    <p className="text-sm font-medium" style={{ color: '#F0F0F0' }}>
                        <i className="fa-solid fa-tasks mr-2"></i>
                        {title}
                    </p>
                </div>
            )}
            {visibleItems.map(item => (
                <div 
                    key={item.view}
                    className={`${
                        isSubmenu && !isHovered ? 'hidden' : ''
                    }`}
                >
                    <SidebarItem
                        view={item.view}
                        label={item.label}
                        icon={item.icon}
                        isActive={currentView === item.view}
                        isCollapsed={isCollapsed}
                        onClick={onNavigate}
                    />
                </div>
            ))}
        </div>
    );
};

export default SidebarSection;