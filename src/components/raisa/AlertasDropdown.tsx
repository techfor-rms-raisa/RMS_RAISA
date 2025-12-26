/**
 * AlertasDropdown.tsx - Dropdown de Alertas para Header
 * 
 * Funcionalidades:
 * - Exibir contagem de alertas
 * - Dropdown com lista de alertas
 * - Link para dashboard completo
 * 
 * Versão: 1.0
 * Data: 26/12/2024
 */

import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '@/config/supabase';

// ============================================
// TIPOS
// ============================================

interface Alerta {
  tipo_alerta: string;
  severidade: 'critical' | 'warning' | 'info';
  referencia_id: number;
  referencia_tipo: string;
  mensagem: string;
  data_criacao: string;
  analista_id: number;
  analista_nome: string;
}

interface AlertasDropdownProps {
  onNavigate?: (route: string) => void;
}

// ============================================
// COMPONENTE
// ============================================

const AlertasDropdown: React.FC<AlertasDropdownProps> = ({ onNavigate }) => {
  const [open, setOpen] = useState(false);
  const [alertas, setAlertas] = useState<Alerta[]>([]);
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Carregar alertas
  useEffect(() => {
    carregarAlertas();
    
    // Atualizar a cada 5 minutos
    const interval = setInterval(carregarAlertas, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  // Fechar ao clicar fora
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const carregarAlertas = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('vw_alertas_ativos')
        .select('*')
        .limit(10);

      if (!error && data) {
        setAlertas(data);
      }
    } catch (err) {
      console.error('Erro ao carregar alertas:', err);
    } finally {
      setLoading(false);
    }
  };

  const alertasCriticos = alertas.filter(a => a.severidade === 'critical').length;
  const alertasWarning = alertas.filter(a => a.severidade === 'warning').length;
  const totalAlertas = alertas.length;

  const iconeSeveridade = {
    critical: '🚨',
    warning: '⚠️',
    info: 'ℹ️'
  };

  const corSeveridade = {
    critical: 'bg-red-50 border-red-200',
    warning: 'bg-yellow-50 border-yellow-200',
    info: 'bg-blue-50 border-blue-200'
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Botão do Sino */}
      <button
        onClick={() => setOpen(!open)}
        className="relative p-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
      >
        <span className="text-xl">🔔</span>
        
        {/* Badge de contagem */}
        {totalAlertas > 0 && (
          <span className={`absolute -top-1 -right-1 min-w-5 h-5 flex items-center justify-center text-xs font-bold text-white rounded-full ${
            alertasCriticos > 0 ? 'bg-red-500' : 'bg-yellow-500'
          }`}>
            {totalAlertas > 9 ? '9+' : totalAlertas}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute right-0 mt-2 w-80 bg-white rounded-xl shadow-lg border z-50 overflow-hidden">
          {/* Header */}
          <div className="p-3 bg-gray-50 border-b flex items-center justify-between">
            <h3 className="font-medium text-gray-800">Alertas</h3>
            <div className="flex gap-2">
              {alertasCriticos > 0 && (
                <span className="px-2 py-0.5 bg-red-100 text-red-700 text-xs rounded-full">
                  {alertasCriticos} críticos
                </span>
              )}
              {alertasWarning > 0 && (
                <span className="px-2 py-0.5 bg-yellow-100 text-yellow-700 text-xs rounded-full">
                  {alertasWarning} avisos
                </span>
              )}
            </div>
          </div>

          {/* Lista de Alertas */}
          <div className="max-h-80 overflow-y-auto">
            {loading ? (
              <div className="p-4 text-center text-gray-400">
                <span className="animate-spin inline-block">⚙️</span> Carregando...
              </div>
            ) : alertas.length === 0 ? (
              <div className="p-6 text-center">
                <span className="text-3xl">✅</span>
                <p className="text-gray-500 mt-2">Nenhum alerta ativo!</p>
              </div>
            ) : (
              <div className="divide-y">
                {alertas.map((alerta, index) => (
                  <div 
                    key={`${alerta.tipo_alerta}-${alerta.referencia_id}-${index}`}
                    className={`p-3 ${corSeveridade[alerta.severidade]} hover:opacity-80 cursor-pointer transition-opacity`}
                    onClick={() => {
                      setOpen(false);
                      onNavigate?.(`/raisa/vagas/${alerta.referencia_id}`);
                    }}
                  >
                    <div className="flex items-start gap-2">
                      <span>{iconeSeveridade[alerta.severidade]}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-800 line-clamp-2">{alerta.mensagem}</p>
                        <p className="text-xs text-gray-500 mt-1">
                          {alerta.analista_nome || 'Sem analista'}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="p-2 bg-gray-50 border-t">
            <button
              onClick={() => {
                setOpen(false);
                onNavigate?.('/raisa/dashboard');
              }}
              className="w-full text-center text-sm text-blue-600 hover:text-blue-800 py-2 hover:bg-blue-50 rounded transition-colors"
            >
              Ver Dashboard Completo →
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default AlertasDropdown;
