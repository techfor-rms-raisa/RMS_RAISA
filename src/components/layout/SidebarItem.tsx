import React from 'react';
import { View } from '../../src/components/types';

interface SidebarItemProps {
    view: View;
    label: string;
    icon: string;
    isActive: boolean;
    isCollapsed: boolean;
    onClick: (view: View) => void;
}

const SidebarItem: React.FC<SidebarItemProps> = ({ view, label, icon, isActive, isCollapsed, onClick }) => {
    return (
        <button
            onClick={() => onClick(view)}
            className={`
                group flex items-center w-full px-4 py-3 transition-all duration-200 relative
                ${isActive ? 'bg-[#1E3A8A] text-white border-l-4 border-white' : 'text-gray-400 hover:bg-gray-700 hover:text-white border-l-4 border-transparent'}
            `}
            title={isCollapsed ? label : ''}
        >
            <i className={`${icon} text-lg mr-3 w-6 text-center`}></i>
            {!isCollapsed && <span className="text-sm font-medium whitespace-nowrap">{label}</span>}
            
            {/* Tooltip for collapsed state */}
            {isCollapsed && (
                <div className="absolute left-full ml-2 px-2 py-1 bg-gray-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity z-50 whitespace-nowrap">
                    {label}
                </div>
            )}
        </button>
    );
};

export default SidebarItem;