import React from 'react';
import { APP_TITLE, APP_SUBTITLE, APP_VERSION, AI_MODEL_NAME, COMPANY_NAME } from '../constants';
import { User } from '@/types';

interface HeaderProps {
    currentUser: User;
    onLogout: () => void;
}

const Header: React.FC<HeaderProps> = ({ currentUser, onLogout }) => {
  return (
    <header style={{ backgroundColor: '#533738' }} className="text-white shadow-lg z-50 relative h-20">
      <div className="container mx-auto px-4 md:px-8 h-full flex items-center justify-between relative">
        
        {/* LADO ESQUERDO: Logo + Título + Powered By */}
        <div className="flex items-center z-10">
          {/* <img src={LOGO_BASE64} alt="Logo" className="h-10 mr-4 hidden sm:block" /> */}
          <div className="flex flex-col">
              <div className="flex items-center">
                  <h1 className="text-xl md:text-2xl font-bold tracking-wider leading-none flex items-center">
                    <span className="mr-2 text-orange-400">⭕</span>
                    {COMPANY_NAME}
                  </h1>
              </div>
              <span className="text-[10px] md:text-xs font-normal text-gray-300 tracking-wide mt-1">
                  Powered by {AI_MODEL_NAME}
              </span>
          </div>
        </div>

        {/* CENTRO ABSOLUTO: Subtítulo e Versão */}
        <div className="absolute left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2 hidden md:block whitespace-nowrap z-0">
            <span className="text-lg md:text-xl font-bold text-gray-100 tracking-wide drop-shadow-md">
                {APP_SUBTITLE} • {APP_VERSION}
            </span>
        </div>

        {/* LADO DIREITO: Usuário + Logout */}
        <div className="flex items-center space-x-4 z-10">
          <div className="text-right hidden sm:block">
            <p className="font-semibold text-sm">{currentUser.nome_usuario}</p>
            <p className="text-xs opacity-80">{currentUser.tipo_usuario}</p>
          </div>
          <button onClick={onLogout} className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-md transition-colors duration-300 flex items-center text-sm shadow-sm">
            <span className="mr-2">🚪</span>
            <span className="hidden sm:inline">Sair</span>
          </button>
        </div>

      </div>
    </header>
  );
};

export default Header;