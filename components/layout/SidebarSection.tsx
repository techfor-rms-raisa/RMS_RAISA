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
    items: ItemConfig[];
    currentUserRole: UserRole;
    currentView: View;
    isCollapsed: boolean;
    onNavigate: (view: View) => void;
}

const SidebarSection: React.FC<SidebarSectionProps> = ({ title, items, currentUserRole, currentView, isCollapsed, onNavigate }) => {
    const visibleItems = items.filter(item => item.roles.includes(currentUserRole));

    if (visibleItems.length === 0) return null;

    return (
        <div className="mb-4">
            {!isCollapsed && title && (
                <h3 className="px-4 mb-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    {title}
                </h3>
            )}
            {visibleItems.map(item => (
                <SidebarItem
                    key={item.view}
                    view={item.view}
                    label={item.label}
                    icon={item.icon}
                    isActive={currentView === item.view}
                    isCollapsed={isCollapsed}
                    onClick={onNavigate}
                />
            ))}
        </div>
    );
};

export default SidebarSection;