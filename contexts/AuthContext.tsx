/**
 * CONTEXTO DE AUTENTICAÇÃO
 * Gerencia o estado de autenticação do usuário em toda a aplicação
 */

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User } from '../components/types';

interface AuthContextType {
  user: User | null;
  setUser: (user: User | null) => void;
  isAuthenticated: boolean;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
  initialUser?: User | null;
}

export function AuthProvider({ children, initialUser = null }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(initialUser);

  useEffect(() => {
    // Tentar recuperar usuário do localStorage ao iniciar
    const storedUser = localStorage.getItem('rms_user');
    if (storedUser) {
      try {
        setUser(JSON.parse(storedUser));
      } catch (error) {
        console.error('Erro ao recuperar usuário do localStorage:', error);
        localStorage.removeItem('rms_user');
      }
    }
  }, []);

  useEffect(() => {
    // Salvar usuário no localStorage quando mudar
    if (user) {
      localStorage.setItem('rms_user', JSON.stringify(user));
    } else {
      localStorage.removeItem('rms_user');
    }
  }, [user]);

  const logout = () => {
    setUser(null);
    localStorage.removeItem('rms_user');
  };

  const value: AuthContextType = {
    user,
    setUser,
    isAuthenticated: !!user,
    logout
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth deve ser usado dentro de um AuthProvider');
  }
  return context;
}

export { AuthContext };
