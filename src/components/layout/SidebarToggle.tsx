import React from 'react';

interface SidebarToggleProps {
    isCollapsed: boolean;
    onToggle: () => void;
}

const SidebarToggle: React.FC<SidebarToggleProps> = ({ isCollapsed, onToggle }) => {
    return (
        <div className="p-4 border-t border-gray-700">
            <button
                onClick={onToggle}
                className="flex items-center justify-center w-full py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded transition-colors"
            >
                <span>{isCollapsed ? '▶' : '◀'}</span>
                {!isCollapsed && <span className="ml-2 text-xs font-bold uppercase">Recolher</span>}
            </button>
        </div>
    );
};

export default SidebarToggle;