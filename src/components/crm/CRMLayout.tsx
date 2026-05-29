/**
 * CRMLayout.tsx — Container do Módulo CRM & Campanhas
 *
 * Caminho: src/components/crm/CRMLayout.tsx
 * Versão: 1.0 (Fase 1A — 29/05/2026)
 *
 * Responsabilidade:
 *  - Orquestrar a sub-navegação interna do módulo CRM (6 sub-páginas).
 *  - Aplicar RBAC nas sub-páginas restritas (aba "Configurações" só
 *    para Administrador + Gestão de R&S — decisão E e §5.3 do
 *    Pre_Projeto_CRM_Campanhas_v3.md).
 *  - Manter UI consistente entre as sub-páginas (header + sub-nav + content).
 *
 * Status das sub-páginas (Fase 1A):
 *  - Todas em PLACEHOLDER. Conteúdo real é entregue nas sub-fases:
 *    • Fase 1C → Base de Leads (decomposição de EmpresasLeadsCRM.tsx)
 *    • Fase 1D → Campanhas (decomposição de CampaignBuilder.tsx)
 *    • Fase 4  → Biblioteca de Copys + Assinaturas
 *    • Fase 8  → Acompanhamento (Dashboard)
 *    • Fases 2/5/6/7 → Sub-páginas de Configurações
 *
 * RBAC do módulo CRM (resumo):
 *  - Acesso ao módulo: Admin, Gestão de R&S, Gestão Comercial,
 *    Analista de R&S, SDR (controlado no Sidebar.tsx).
 *  - Aba "Configurações CRM": Admin + Gestão de R&S apenas.
 */

import React, { useState } from 'react';
import { User } from '@/types';

// ════════════════════════════════════════════════════════════
// TIPOS
// ════════════════════════════════════════════════════════════

type CRMTab =
  | 'base-leads'
  | 'campanhas'
  | 'copys'
  | 'assinaturas'
  | 'acompanhamento'
  | 'config';

interface CRMTabDef {
  id: CRMTab;
  label: string;
  icon: string;
  descricao: string;
  restrita?: boolean;
}

interface CRMLayoutProps {
  currentUser: User;
}

// ════════════════════════════════════════════════════════════
// CONSTANTES — definição das sub-páginas
// ════════════════════════════════════════════════════════════

const TABS: CRMTabDef[] = [
  {
    id: 'base-leads',
    label: 'Base de Leads',
    icon: 'fa-solid fa-building-user',
    descricao: 'Empresas e Leads — CRUD, funil, importação do Prospect Engine',
  },
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
  {
    id: 'acompanhamento',
    label: 'Acompanhamento',
    icon: 'fa-solid fa-chart-line',
    descricao: 'Dashboard analítico de campanhas ativas',
  },
  {
    id: 'config',
    label: 'Configurações',
    icon: 'fa-solid fa-gear',
    descricao: 'Domínios, tipos de campanha, e-mails inválidos, opt-out, correspondência',
    restrita: true,
  },
];

const PERFIS_CONFIG: string[] = ['Administrador', 'Gestão de R&S'];

// ════════════════════════════════════════════════════════════
// COMPONENTE
// ════════════════════════════════════════════════════════════

const CRMLayout: React.FC<CRMLayoutProps> = ({ currentUser }) => {
  // Aba ativa — estado local. Persistência ou deep-link via query string
  // pode ser adicionada em fase posterior se houver demanda.
  const [activeTab, setActiveTab] = useState<CRMTab>('base-leads');

  // RBAC — aba "Configurações" só para perfis autorizados
  const podeAcessarConfig = PERFIS_CONFIG.includes(currentUser.tipo_usuario);
  const tabsVisiveis = TABS.filter((t) => !t.restrita || podeAcessarConfig);

  // Definição da aba ativa (com fallback se o usuário perder permissão)
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
              Gestão integrada de leads, sequenciador de e-mails e acompanhamento de resultados
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

        {/* CONTENT — Placeholder por enquanto (Fase 1A) */}
        <div className="p-6">
          <PlaceholderConteudo tab={tabAtual} />
        </div>
      </div>
    </div>
  );
};

// ════════════════════════════════════════════════════════════
// PLACEHOLDER — sub-páginas serão entregues nas fases seguintes
// ════════════════════════════════════════════════════════════

interface PlaceholderConteudoProps {
  tab: CRMTabDef;
}

const PlaceholderConteudo: React.FC<PlaceholderConteudoProps> = ({ tab }) => {
  // Mapa de roadmap por aba — referência ao Pre_Projeto v3.1
  const ROADMAP: Record<CRMTab, { fase: string; descricao: string }> = {
    'base-leads': {
      fase: 'Fase 1C',
      descricao: 'Decomposição de EmpresasLeadsCRM.tsx em base-leads/*',
    },
    'campanhas': {
      fase: 'Fase 1D',
      descricao: 'Decomposição de CampaignBuilder.tsx em campanhas/*',
    },
    'copys': {
      fase: 'Fase 4',
      descricao: 'Biblioteca central de copys reutilizáveis (Admin: CRUD; demais: visualizar)',
    },
    'assinaturas': {
      fase: 'Fase 4',
      descricao: 'CRUD de assinaturas por usuário, com assinatura padrão',
    },
    'acompanhamento': {
      fase: 'Fase 8',
      descricao: 'Dashboard analítico — taxas, desempenho por copy/analista/domínio',
    },
    'config': {
      fase: 'Fases 2 / 5 / 6 / 7',
      descricao: 'Domínios, tipos de campanha, e-mails inválidos, opt-out, correspondência',
    },
  };

  const info = ROADMAP[tab.id];

  return (
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
            Entrega prevista — {info.fase}
          </span>
        </div>
        <p className="text-sm text-blue-900">{info.descricao}</p>
      </div>

      <p className="text-xs text-gray-400 mt-6">
        Esqueleto criado na Fase 1A (29/05/2026). Sub-páginas decompostas em entregas posteriores.
      </p>
    </div>
  );
};

export default CRMLayout;
