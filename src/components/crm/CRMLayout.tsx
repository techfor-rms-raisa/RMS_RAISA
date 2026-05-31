/**
 * CRMLayout.tsx — Container do Módulo CRM & Campanhas
 *
 * Caminho: src/components/crm/CRMLayout.tsx
 * Versão: 1.4 (30/05/2026)
 *
 * Histórico:
 *  - v1.0 (Fase 1A): Esqueleto com placeholders nas 6 sub-páginas.
 *  - v1.1 (Fase 1C): Aba "Base de Leads" ligada ao BaseLeadsPage.
 *  - v1.2 (Fase 1D): Aba "Campanhas" ligada ao CampanhasPage.
 *  - v1.3 (Fase 4B): Aba "Biblioteca de Copys" ligada ao CopysPage.
 *  - v1.4 (30/05/2026): Sub-páginas "Base de Leads", "Acompanhamento"
 *    e "Configurações" promovidas a views próprias do menu lateral.
 *    CRMLayout agora exibe apenas 3 abas: Campanhas, Copys e Assinaturas.
 *
 * Status das sub-páginas (que ainda estão aqui):
 *  - Campanhas      → ✅ implementado (Fase 1D)
 *  - Copys          → ✅ implementado (Fase 4B)
 *  - Assinaturas    → placeholder (Fase 4D futura)
 */

import React, { useState } from 'react';
import { User } from '@/types';
import CampanhasPage from './campanhas/CampanhasPage';
import CopysPage from './copys/CopysPage';

// ════════════════════════════════════════════════════════════
// TIPOS
// ════════════════════════════════════════════════════════════

type CRMTab = 'campanhas' | 'copys' | 'assinaturas';

interface CRMTabDef {
  id: CRMTab;
  label: string;
  icon: string;
  descricao: string;
}

interface CRMLayoutProps {
  currentUser: User;
}

// ════════════════════════════════════════════════════════════
// CONSTANTES — definição das sub-páginas
// ════════════════════════════════════════════════════════════

const TABS: CRMTabDef[] = [
  {
    id: 'campanhas',
    label: 'Campanhas',
    icon: 'fa-solid fa-rocket',
    descricao: 'Sequenciador — criar, editar, ativar e vincular leads',
  },
  {
    id: 'copys',
    label: 'Biblioteca de Copys',
    icon: 'fa-solid fa-pen-fancy',
    descricao: 'Repositório central de copys reutilizáveis',
  },
  {
    id: 'assinaturas',
    label: 'Assinaturas',
    icon: 'fa-solid fa-signature',
    descricao: 'Assinaturas pessoais para campanhas',
  },
];

// ════════════════════════════════════════════════════════════
// COMPONENTE
// ════════════════════════════════════════════════════════════

const CRMLayout: React.FC<CRMLayoutProps> = ({ currentUser }) => {
  // Aba ativa — estado local. Persistência ou deep-link via query string
  // pode ser adicionada em fase posterior se houver demanda.
  const [activeTab, setActiveTab] = useState<CRMTab>('campanhas');

  // Todas as abas atuais são visíveis para todos os perfis com acesso ao módulo.
  // O RBAC fino acontece DENTRO de cada sub-página (ex: CopysPage decide quem
  // pode criar/editar; CampanhasPage idem).
  const tabsVisiveis = TABS;

  const tabAtual: CRMTabDef =
    tabsVisiveis.find((t) => t.id === activeTab) || tabsVisiveis[0];

  // ────────────────────────────────────────────────────────────
  // RENDER — Header + Sub-nav + Content
  // ────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* HEADER do módulo */}
      <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-lg bg-blue-100 flex items-center justify-center">
            <i className="fa-solid fa-paper-plane text-blue-600 text-xl"></i>
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">CRM & Campanhas</h1>
            <p className="text-sm text-gray-500">
              Sequenciador de e-mails, biblioteca de copys e assinaturas
            </p>
          </div>
        </div>
      </div>

      {/* SUB-NAV horizontal */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <nav className="flex flex-wrap border-b border-gray-200" aria-label="Sub-navegação CRM">
          {tabsVisiveis.map((tab) => {
            const ativo = tab.id === tabAtual.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`
                  flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors
                  border-b-2 -mb-px
                  ${ativo
                    ? 'border-blue-600 text-blue-600 bg-blue-50/50'
                    : 'border-transparent text-gray-600 hover:text-gray-900 hover:bg-gray-50'}
                `}
                aria-current={ativo ? 'page' : undefined}
              >
                <i className={tab.icon}></i>
                <span>{tab.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Descrição da aba ativa */}
        <div className="px-4 py-2 bg-gray-50 text-xs text-gray-600 border-b border-gray-200">
          <i className="fa-solid fa-circle-info text-gray-400 mr-2"></i>
          {tabAtual.descricao}
        </div>

        {/* CONTENT */}
        <div className="p-6">
          {tabAtual.id === 'campanhas' ? (
            <CampanhasPage currentUser={currentUser} />
          ) : tabAtual.id === 'copys' ? (
            <CopysPage currentUser={currentUser} />
          ) : (
            <PlaceholderConteudo tab={tabAtual} />
          )}
        </div>
      </div>
    </div>
  );
};

// ════════════════════════════════════════════════════════════
// PLACEHOLDER — Assinaturas (única aba restante em backlog)
// ════════════════════════════════════════════════════════════

interface PlaceholderConteudoProps {
  tab: CRMTabDef;
}

const PlaceholderConteudo: React.FC<PlaceholderConteudoProps> = ({ tab }) => (
  <div className="text-center py-12 px-4">
    <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gray-100 mb-4">
      <i className={`${tab.icon} text-gray-400 text-2xl`}></i>
    </div>
    <h2 className="text-lg font-semibold text-gray-700 mb-1">{tab.label}</h2>
    <p className="text-sm text-gray-500 mb-6 max-w-md mx-auto">{tab.descricao}</p>

    <div className="inline-block px-4 py-3 rounded-lg bg-blue-50 border border-blue-100 text-left max-w-md">
      <div className="flex items-center gap-2 mb-1">
        <i className="fa-solid fa-clock-rotate-left text-blue-500 text-sm"></i>
        <span className="text-xs font-semibold text-blue-700 uppercase tracking-wide">
          Entrega prevista — Fase 4D
        </span>
      </div>
      <p className="text-sm text-blue-900">
        CRUD de assinaturas por usuário, com assinatura padrão
      </p>
    </div>
  </div>
);

export default CRMLayout;
