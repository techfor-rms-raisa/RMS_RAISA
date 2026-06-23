/**
 * CRMLayout.tsx — Container do Módulo CRM & Campanhas
 *
 * Caminho: src/components/crm/CRMLayout.tsx
 * Versão: 1.6 (Aba "Cotas" — parametrização de revalidação — 23/06/2026)
 *
 * Histórico:
 *  - v1.0 (Fase 1A): Esqueleto com placeholders nas 6 sub-páginas.
 *  - v1.1 (Fase 1C): Aba "Base de Leads" ligada ao BaseLeadsPage.
 *  - v1.2 (Fase 1D): Aba "Campanhas" ligada ao CampanhasPage.
 *  - v1.3 (Fase 4B): Aba "Biblioteca de Copys" ligada ao CopysPage.
 *  - v1.4 (30/05/2026): Sub-páginas "Base de Leads", "Acompanhamento"
 *    e "Configurações" promovidas a views próprias do menu lateral.
 *    CRMLayout agora exibe apenas 3 abas: Campanhas, Copys e Assinaturas.
 *  - v1.5 (01/06/2026 - Fase D): Aba "Assinaturas" ligada ao AssinaturasPage
 *    (gestão pelo Admin, leitura para os demais). Placeholder removido.
 *  - v1.6 (23/06/2026): Aba "Cotas" adicionada (NOVA). RBAC RESTRITO:
 *    visível APENAS para tipo='Administrador'. Decisão Messias 23/06/2026:
 *    Admin parametriza a cota diária de revalidação Gemini de cada
 *    GC/SDR/Admin na coluna app_users.cota_revalidacao_diaria (range 0–500,
 *    default 50). Backend (api/crm-cotas.ts) faz lock duro de Admin
 *    server-side; este filtro client-side só evita que a aba apareça.
 *    Refator cirúrgico interno: o render condicional ternário aninhado
 *    da v1.5 (3 abas) virou switch (4 abas) para legibilidade, sem
 *    alteração visual ou comportamental.
 *
 * Status das sub-páginas (que ainda estão aqui):
 *  - Campanhas      → ✅ implementado (Fase 1D)
 *  - Copys          → ✅ implementado (Fase 4B)
 *  - Assinaturas    → ✅ implementado (Fase D)
 *  - Cotas          → ✅ implementado (v1.6 — RBAC Admin)
 */

import React, { useState } from 'react';
import { User } from '@/types';
import CampanhasPage from './campanhas/CampanhasPage';
import CopysPage from './copys/CopysPage';
import AssinaturasPage from './assinaturas/AssinaturasPage';
// 🆕 v1.6 (23/06/2026) — Aba Cotas (RBAC Admin)
import CotasPage from './cotas/CotasPage';

// ════════════════════════════════════════════════════════════
// TIPOS
// ════════════════════════════════════════════════════════════

type CRMTab = 'campanhas' | 'copys' | 'assinaturas' | 'cotas';

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
  // 🆕 v1.6 (23/06/2026) — Cotas (RBAC Admin via filtro em tabsVisiveis)
  {
    id: 'cotas',
    label: 'Cotas',
    icon: 'fa-solid fa-gauge',
    descricao: 'Limite diário de revalidação por GC/SDR/Admin (parametrizável)',
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
  //
  // 🆕 v1.6 (23/06/2026) — Aba "Cotas" é EXCEÇÃO: só Administrador vê.
  //   Defesa em camadas: este filtro client-side só esconde a entrada do
  //   menu. O backend api/crm-cotas.ts faz o lock duro server-side
  //   (exigirAdmin) — se algum usuário não-Admin vazasse para a aba via
  //   manipulação direta do estado, nenhuma mutação seria possível.
  const tabsVisiveis = TABS.filter((tab) => {
    if (tab.id === 'cotas') return currentUser.tipo === 'Administrador';
    return true;
  });

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
          {/*
            🆕 v1.6 (23/06/2026) — Render condicional convertido em switch
            para acomodar 4 abas sem ternários aninhados. Comportamento e
            estilo idênticos à v1.5; apenas estrutura interna mais legível.
            CotasPage renderiza somente quando a aba estiver visível
            (tabsVisiveis já filtrou pelo tipo='Administrador').
          */}
          {(() => {
            switch (tabAtual.id) {
              case 'campanhas':
                return <CampanhasPage currentUser={currentUser} />;
              case 'copys':
                return <CopysPage currentUser={currentUser} />;
              case 'assinaturas':
                return <AssinaturasPage currentUser={currentUser} />;
              case 'cotas':
                return <CotasPage currentUser={currentUser} />;
              default:
                return null;
            }
          })()}
        </div>
      </div>
    </div>
  );
};

// ════════════════════════════════════════════════════════════
// (PlaceholderConteudo removido na v1.5 — não há mais aba em backlog)
// ════════════════════════════════════════════════════════════

export default CRMLayout;
