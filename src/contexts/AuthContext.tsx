/**
 * AuthContext - Contexto de Autenticação
 * 
 * Fornece acesso ao usuário logado em qualquer componente da aplicação
 * sem necessidade de passar props manualmente.
 * 
 * Versão: 1.0
 * Data: 28/12/2024
 */

import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { User } from '@/types';

// ============================================
// TIPOS
// ============================================

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  login: (user: User) => void;
  logout: () => void;
  updateUser: (user: User) => void;
}

interface AuthProviderProps {
  children: ReactNode;
  initialUser?: User | null;
}

// ============================================
// CONTEXTO
// ============================================

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// ============================================
// PROVIDER
// ============================================

export function AuthProvider({ children, initialUser = null }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(initialUser);

  const login = useCallback((newUser: User) => {
    setUser(newUser);
    console.log('✅ AuthContext: Usuário logado:', newUser.nome_usuario);
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    console.log('🚪 AuthContext: Usuário deslogado');
  }, []);

  const updateUser = useCallback((updatedUser: User) => {
    setUser(updatedUser);
  }, []);

  const value: AuthContextType = {
    user,
    isAuthenticated: user !== null,
    login,
    logout,
    updateUser
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

// ============================================
// HOOK
// ============================================

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  
  if (context === undefined) {
    throw new Error('useAuth deve ser usado dentro de um AuthProvider');
  }
  
  return context;
}

// ============================================
// EXPORT DEFAULT
// ============================================

export default AuthContext;
