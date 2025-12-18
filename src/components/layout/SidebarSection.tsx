import React from 'react';
import { View, UserRole } from '../types';
import SidebarItem from './SidebarItem';

interface ItemConfig {
    view: View;
    label: string;
    icon: string;
    roles: UserRole[];
}

interface SidebarSectionProps {
    title?: string;
    subtitle?: string;
    items: ItemConfig[];
    currentUserRole: UserRole;
    currentView: View;
    isCollapsed: boolean;
    onNavigate: (view: View) => void;
    isSubmenu?: boolean;
    icon?: string;
}

const SidebarSection: React.FC<SidebarSectionProps> = ({ 
    title, 
    subtitle, 
    items, 
    currentUserRole, 
    currentView, 
    isCollapsed, 
    onNavigate, 
    isSubmenu = false,
    icon
}) => {
    const [isHovered, setIsHovered] = React.useState(false);
    const visibleItems = items.filter(item => item.roles.includes(currentUserRole));

    if (visibleItems.length === 0) return null;

    // Se é submenu com ícone, renderiza como item normal com submenu hover
    if (isSubmenu && icon) {
        return (
            <div 
                className="mb-4"
                onMouseEnter={() => setIsHovered(true)}
                onMouseLeave={() => setIsHovered(false)}
            >
                {/* Renderizar título como item normal (não como seção) */}
                {!isCollapsed && title && (
                    <button
                        className="group flex items-center w-full px-4 py-3 transition-all duration-200 relative text-gray-400 hover:bg-gray-700 hover:text-white border-l-4 border-transparent"
                        title={isCollapsed ? title : ''}
                    >
                        <i className={`${icon} text-lg mr-3 w-6 text-center`}></i>
                        <span className="text-sm font-medium whitespace-nowrap">{title}</span>
                    </button>
                )}
                
                {/* Submenu items aparecem ao passar o mouse */}
                {isHovered && visibleItems.map(item => (
                    <div 
                        key={item.view}
                        className="pl-4"
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
    }

    // Renderização padrão de seção
    return (
        <div 
            className="mb-4"
            onMouseEnter={() => isSubmenu && setIsHovered(true)}
            onMouseLeave={() => isSubmenu && setIsHovered(false)}
        >
            {!isCollapsed && title && (
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
