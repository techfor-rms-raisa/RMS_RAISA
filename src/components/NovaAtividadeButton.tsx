import React from 'react';
import { PlusCircle } from 'lucide-react';

interface NovaAtividadeButtonProps {
  consultantName: string;
  clientName: string;
  onNavigate: (consultantName: string, clientName: string) => void;
  variant?: 'default' | 'small' | 'icon';
  className?: string;
}

const NovaAtividadeButton: React.FC<NovaAtividadeButtonProps> = ({
  consultantName,
  clientName,
  onNavigate,
  variant = 'default',
  className = ''
}) => {
  
  const handleClick = () => {
    onNavigate(consultantName, clientName);
  };

  // Variante padrão - botão completo
  if (variant === 'default') {
    return (
      <button
        onClick={handleClick}
        className={`px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition font-medium flex items-center gap-2 ${className}`}
        title="Registrar nova atividade para este consultor"
      >
        <PlusCircle className="w-4 h-4" />
        Nova Atividade
      </button>
    );
  }

  // Variante pequena - botão compacto
  if (variant === 'small') {
    return (
      <button
        onClick={handleClick}
        className={`px-3 py-1.5 bg-green-600 text-white rounded-md hover:bg-green-700 transition text-sm font-medium flex items-center gap-1.5 ${className}`}
        title="Registrar nova atividade"
      >
        <PlusCircle className="w-3.5 h-3.5" />
        Nova Atividade
      </button>
    );
  }

  // Variante ícone - apenas ícone
  return (
    <button
      onClick={handleClick}
      className={`p-2 bg-green-600 text-white rounded-full hover:bg-green-700 transition ${className}`}
      title="Registrar nova atividade"
      aria-label="Nova Atividade"
    >
      <PlusCircle className="w-4 h-4" />
    </button>
  );
};

export default NovaAtividadeButton;
