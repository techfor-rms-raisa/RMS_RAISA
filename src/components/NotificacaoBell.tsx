/**
 * COMPONENTE: NOTIFICAÇÃO BELL
 * Sino de notificações no header com dropdown
 */

import React, { useState, useEffect } from 'react';
import { Bell, X, Check, CheckCheck } from 'lucide-react';
import { notificacaoService, Notificacao } from '../services/notificacaoService';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';

export function NotificacaoBell() {
  const { user } = useAuth();
  const navigate = useNavigate();
  
  const [notificacoes, setNotificacoes] = useState<Notificacao[]>([]);
  const [naoLidas, setNaoLidas] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  // Carregar notificações
  useEffect(() => {
    if (user) {
      carregarNotificacoes();
      // Atualizar a cada 30 segundos
      const interval = setInterval(carregarNotificacoes, 30000);
      return () => clearInterval(interval);
    }
  }, [user]);

  const carregarNotificacoes = async () => {
    if (!user) return;
    
    try {
      const [todasNotificacoes, countNaoLidas] = await Promise.all([
        notificacaoService.buscarPorUsuario(user.id, false),
        notificacaoService.contarNaoLidas(user.id)
      ]);
      
      setNotificacoes(todasNotificacoes);
      setNaoLidas(countNaoLidas);
    } catch (error) {
      console.error('Erro ao carregar notificações:', error);
    }
  };

  const handleMarcarComoLida = async (notificacaoId: number) => {
    try {
      await notificacaoService.marcarComoLida(notificacaoId);
      await carregarNotificacoes();
    } catch (error) {
      console.error('Erro ao marcar como lida:', error);
    }
  };

  const handleMarcarTodasComoLidas = async () => {
    if (!user) return;
    
    setLoading(true);
    try {
      await notificacaoService.marcarTodasComoLidas(user.id);
      await carregarNotificacoes();
    } catch (error) {
      console.error('Erro ao marcar todas como lidas:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleClickNotificacao = async (notificacao: Notificacao) => {
    // Marcar como lida
    if (!notificacao.lida) {
      await handleMarcarComoLida(notificacao.id);
    }
    
    // Navegar para o link relacionado
    if (notificacao.link_relacionado) {
      navigate(notificacao.link_relacionado);
      setIsOpen(false);
    }
  };

  const getIconeNotificacao = (tipo: string) => {
    switch (tipo) {
      case 'nova_vaga':
        return '📋';
      case 'descricao_pronta':
        return '✨';
      case 'priorizacao_pronta':
        return '🎯';
      case 'sugestao_repriorizacao':
        return '🔄';
      case 'vaga_redistribuida':
        return '📬';
      default:
        return '🔔';
    }
  };

  const formatarData = (data: string) => {
    const agora = new Date();
    const dataNotificacao = new Date(data);
    const diffMs = agora.getTime() - dataNotificacao.getTime();
    const diffMinutos = Math.floor(diffMs / 60000);
    const diffHoras = Math.floor(diffMs / 3600000);
    const diffDias = Math.floor(diffMs / 86400000);

    if (diffMinutos < 1) return 'Agora';
    if (diffMinutos < 60) return `${diffMinutos}m atrás`;
    if (diffHoras < 24) return `${diffHoras}h atrás`;
    if (diffDias === 1) return 'Ontem';
    if (diffDias < 7) return `${diffDias}d atrás`;
    
    return dataNotificacao.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit'
    });
  };

  return (
    <div className="relative">
      {/* Botão do Sino */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
        aria-label="Notificações"
      >
        <Bell className="w-6 h-6" />
        {naoLidas > 0 && (
          <span className="absolute top-1 right-1 flex items-center justify-center w-5 h-5 text-xs font-bold text-white bg-red-500 rounded-full">
            {naoLidas > 9 ? '9+' : naoLidas}
          </span>
        )}
      </button>

      {/* Dropdown de Notificações */}
      {isOpen && (
        <>
          {/* Overlay */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />
          
          {/* Panel */}
          <div className="absolute right-0 mt-2 w-96 bg-white rounded-lg shadow-xl border border-gray-200 z-50 max-h-[600px] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">
                Notificações
                {naoLidas > 0 && (
                  <span className="ml-2 text-sm font-normal text-gray-500">
                    ({naoLidas} {naoLidas === 1 ? 'nova' : 'novas'})
                  </span>
                )}
              </h3>
              
              <div className="flex items-center gap-2">
                {naoLidas > 0 && (
                  <button
                    onClick={handleMarcarTodasComoLidas}
                    disabled={loading}
                    className="text-sm text-blue-600 hover:text-blue-700 font-medium disabled:opacity-50"
                    title="Marcar todas como lidas"
                  >
                    <CheckCheck className="w-5 h-5" />
                  </button>
                )}
                <button
                  onClick={() => setIsOpen(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Lista de Notificações */}
            <div className="overflow-y-auto flex-1">
              {notificacoes.length === 0 ? (
                <div className="p-8 text-center text-gray-500">
                  <Bell className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                  <p>Nenhuma notificação</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {notificacoes.map((notificacao) => (
                    <div
                      key={notificacao.id}
                      onClick={() => handleClickNotificacao(notificacao)}
                      className={`
                        p-4 cursor-pointer transition-colors
                        ${notificacao.lida 
                          ? 'bg-white hover:bg-gray-50' 
                          : 'bg-blue-50 hover:bg-blue-100'
                        }
                      `}
                    >
                      <div className="flex items-start gap-3">
                        {/* Ícone */}
                        <div className="text-2xl flex-shrink-0">
                          {getIconeNotificacao(notificacao.tipo_notificacao)}
                        </div>
                        
                        {/* Conteúdo */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <h4 className={`
                              text-sm font-medium
                              ${notificacao.lida ? 'text-gray-900' : 'text-gray-900 font-semibold'}
                            `}>
                              {notificacao.titulo}
                            </h4>
                            {!notificacao.lida && (
                              <div className="w-2 h-2 bg-blue-600 rounded-full flex-shrink-0 mt-1" />
                            )}
                          </div>
                          
                          <p className="text-sm text-gray-600 mt-1 line-clamp-2">
                            {notificacao.mensagem}
                          </p>
                          
                          <div className="flex items-center justify-between mt-2">
                            <span className="text-xs text-gray-500">
                              {formatarData(notificacao.criado_em)}
                            </span>
                            
                            {!notificacao.lida && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleMarcarComoLida(notificacao.id);
                                }}
                                className="text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
                              >
                                <Check className="w-3 h-3" />
                                Marcar como lida
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
