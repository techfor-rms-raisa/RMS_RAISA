/**
 * permissions.ts - Sistema Centralizado de Permissões
 * 
 * 🆕 v57.0: Matriz de Permissões Implementada
 * 
 * Data: 11/01/2026
 */

import { UserRole } from '@/types';

// ============================================
// PERFIS QUE CADA PERFIL PODE GERENCIAR
// ============================================

/**
 * Retorna quais tipos de usuário o perfil logado pode VER na lista
 */
export function getPerfisPodeVer(perfilLogado: UserRole): UserRole[] {
  switch (perfilLogado) {
    case 'Administrador':
      return ['Administrador', 'Gestão de R&S', 'Gestão Comercial', 'Gestão de Pessoas', 'Analista de R&S', 'Consulta', 'Cliente'];
    
    case 'Gestão de R&S':
      // Gestão de R&S vê todos EXCETO Admin e Gestão Comercial
      return ['Gestão de R&S', 'Gestão de Pessoas', 'Analista de R&S', 'Consulta', 'Cliente'];
    
    case 'Analista de R&S':
    case 'Gestão de Pessoas':
    case 'Gestão Comercial':
    case 'Consulta':
    case 'Cliente':
      // Esses perfis só veem o próprio perfil (próprio usuário)
      return [perfilLogado];
    
    default:
      return [];
  }
}

/**
 * Retorna quais tipos de usuário o perfil logado pode CRIAR
 */
export function getPerfisPodeCriar(perfilLogado: UserRole): UserRole[] {
  switch (perfilLogado) {
    case 'Administrador':
      return ['Administrador', 'Gestão de R&S', 'Gestão Comercial', 'Gestão de Pessoas', 'Analista de R&S', 'Consulta', 'Cliente'];
    
    case 'Gestão de R&S':
      // Gestão de R&S pode criar todos EXCETO Admin e Gestão Comercial
      return ['Gestão de R&S', 'Gestão de Pessoas', 'Analista de R&S', 'Consulta', 'Cliente'];
    
    default:
      return [];
  }
}

/**
 * Verifica se o usuário logado pode adicionar novos usuários
 */
export function podeAdicionarUsuarios(perfilLogado: UserRole): boolean {
  return ['Administrador', 'Gestão de R&S'].includes(perfilLogado);
}

/**
 * Verifica se o usuário logado pode editar um determinado usuário
 */
export function podeEditarUsuario(perfilLogado: UserRole, perfilAlvo: UserRole, idLogado: number, idAlvo: number): boolean {
  // Sempre pode editar o próprio perfil
  if (idLogado === idAlvo) return true;
  
  // Admin pode editar qualquer um
  if (perfilLogado === 'Administrador') return true;
  
  // Gestão de R&S pode editar exceto Admin e Gestão Comercial
  if (perfilLogado === 'Gestão de R&S') {
    return !['Administrador', 'Gestão Comercial'].includes(perfilAlvo);
  }
  
  return false;
}

/**
 * Verifica se pode alterar o tipo de usuário
 */
export function podeAlterarTipoUsuario(perfilLogado: UserRole, idLogado: number, idAlvo: number): boolean {
  if (idLogado === idAlvo) return false;
  return ['Administrador', 'Gestão de R&S'].includes(perfilLogado);
}

/**
 * Verifica se pode ativar/desativar usuário
 */
export function podeAlterarStatusUsuario(perfilLogado: UserRole, perfilAlvo: UserRole, idLogado: number, idAlvo: number): boolean {
  if (idLogado === idAlvo) return false;
  
  if (perfilLogado === 'Administrador') return true;
  
  if (perfilLogado === 'Gestão de R&S') {
    return !['Administrador', 'Gestão Comercial'].includes(perfilAlvo);
  }
  
  return false;
}

// ============================================
// PERMISSÕES DE MÓDULOS RAISA
// ============================================

export function podeInserirCandidatos(perfilLogado: UserRole): boolean {
  return ['Administrador', 'Gestão de R&S', 'Analista de R&S'].includes(perfilLogado);
}

export function podeUsarLinkedIn(perfilLogado: UserRole): boolean {
  return ['Administrador', 'Gestão de R&S', 'Analista de R&S'].includes(perfilLogado);
}

export function podeInserirVagas(perfilLogado: UserRole): boolean {
  return ['Administrador', 'Gestão de R&S', 'Analista de R&S', 'Gestão Comercial'].includes(perfilLogado);
}

export function podeAcessarConfigPriorizacao(perfilLogado: UserRole): boolean {
  return perfilLogado === 'Administrador';
}

export function temAcessoTotalRAISA(perfilLogado: UserRole): boolean {
  return ['Administrador', 'Gestão de R&S', 'Analista de R&S'].includes(perfilLogado);
}

export function temAcessoReadOnlyRAISA(perfilLogado: UserRole): boolean {
  return perfilLogado === 'Gestão Comercial';
}

export function temAcessoRAISA(perfilLogado: UserRole): boolean {
  return temAcessoTotalRAISA(perfilLogado) || temAcessoReadOnlyRAISA(perfilLogado);
}

// ============================================
// PERMISSÕES DE MÓDULOS RMS
// ============================================

export function temAcessoTotalRMS(perfilLogado: UserRole): boolean {
  return ['Administrador', 'Gestão de R&S', 'Gestão Comercial', 'Gestão de Pessoas'].includes(perfilLogado);
}

export function temAcessoParcialRMS(perfilLogado: UserRole): boolean {
  return ['Analista de R&S', 'Consulta'].includes(perfilLogado);
}

export function getModulosRMSAnalistaRS(): string[] {
  return ['dashboard', 'quarantine', 'clients', 'consultants'];
}

// ============================================
// PERMISSÕES DE EXCLUSIVIDADE
// ============================================

export function podeRenovarExclusividade(perfilLogado: UserRole, idAnalistaResponsavel: number | null, idLogado: number): boolean {
  if (['Administrador', 'Gestão de R&S'].includes(perfilLogado)) return true;
  if (perfilLogado === 'Analista de R&S' && idAnalistaResponsavel === idLogado) return true;
  return false;
}

export function podeLiberar(perfilLogado: UserRole): boolean {
  return ['Administrador', 'Gestão de R&S'].includes(perfilLogado);
}

export function podeTransferirExclusividade(perfilLogado: UserRole): boolean {
  return ['Administrador', 'Gestão de R&S'].includes(perfilLogado);
}

// ============================================
// HELPER: Verificar se é Read-Only
// ============================================

export function isReadOnly(perfilLogado: UserRole, modulo: 'rms' | 'raisa'): boolean {
  if (modulo === 'raisa') {
    return perfilLogado === 'Gestão Comercial';
  }
  
  if (modulo === 'rms') {
    return ['Analista de R&S', 'Consulta', 'Cliente'].includes(perfilLogado);
  }
  
  return false;
}
