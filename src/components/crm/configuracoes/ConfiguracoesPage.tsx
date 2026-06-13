/**
 * ConfiguracoesPage.tsx — Página "Configurações CRM"
 *
 * Caminho: src/components/crm/configuracoes/ConfiguracoesPage.tsx
 * Versão: 1.1 (13/06/2026)
 *
 * v1.1 (13/06/2026 — Fase 1 da reorganização Prospect/Lead):
 *   Reduzidas as sub-abas de 5 → 2. As 3 abas removidas migraram para
 *   outros locais ou foram absorvidas por funcionalidades já existentes:
 *
 *   - 🚫 Opt-out             → MOVEU para Base de Leads (aba dedicada)
 *                              com RBAC contextual (GC/SDR vê só os seus).
 *   - 🔁 E-mails Inválidos   → MOVEU para Base de Leads (aba "E-mails
 *                              Inválidos"); o motor de recovery é a
 *                              Fase 2 desta reorganização.
 *   - 📥 Correspondência     → REMOVIDA. O reply-routing manual foi
 *                              substituído pelo campo BCC ("CCO") do
 *                              modal de Campanha (entrega de 11/06/2026),
 *                              que é per-campanha — mais granular que
 *                              o roteamento global anterior.
 *
 *   Mantidas (sem mudança):
 *   - 🏷️ Tipos de Campanha   — ✅ funcional (CRUD em api/crm-copys.ts)
 *   - 🌐 Domínios de Envio   — 🟡 placeholder (Fase 5 — motor de disparo)
 *
 *   O arquivo OptOutTab.tsx desta pasta permanece no repositório (sem
 *   import) para preservar histórico Git — a nova versão vive em
 *   src/components/crm/base-leads/OptOutTab.tsx.
 *
 * v1.0 (01/06/2026):
 *   Container com 5 sub-abas. Acessível por Administrador + Gestão de R&S
 *   (RBAC garantido pelo Sidebar; aqui há uma trava defensiva extra).
 */

import React, { useState } from 'react';
import type { CurrentUserLite } from '../types/crm.types';
import { DOMINIOS_ENVIO } from '../types/crm.constants';
import EmptyState from '../shared/components/EmptyState';
import TiposCampanhaTab from './TiposCampanhaTab';
// 🆕 v1.1 (13/06/2026) — OptOutTab MOVIDO para a Base de Leads.
//   O arquivo ./OptOutTab.tsx permanece no repo apenas para histórico
//   Git e não é mais importado aqui.

// ════════════════════════════════════════════════════════════
// TIPOS
// ════════════════════════════════════════════════════════════

// 🆕 v1.1 (13/06/2026) — Sub-abas reduzidas a 'tipos' e 'dominios'.
//   - 'optout' / 'invalidos' / 'correspondencia' removidos (ver cabeçalho).
type ConfigTab = 'tipos' | 'dominios';

interface ConfigTabDef {
  id: ConfigTab;
  label: string;
  icon: string;
  descricao: string;
  /** true = aba pronta; false = placeholder aguardando fase. */
  pronta: boolean;
  fase?: string;
}

interface ConfiguracoesPageProps {
  currentUser: CurrentUserLite;
}

// ════════════════════════════════════════════════════════════
// CONSTANTES
// ════════════════════════════════════════════════════════════

const TABS: ConfigTabDef[] = [
  {
    id: 'tipos',
    label: 'Tipos de Campanha',
    icon: 'fa-solid fa-tag',
    descricao: 'Verticais usadas para classificar leads e campanhas',
    pronta: true,
  },
  {
    id: 'dominios',
    label: 'Domínios de Envio',
    icon: 'fa-solid fa-globe',
    descricao: 'Rodízio entre domínios e status no Resend',
    pronta: false,
    fase: 'Fase 5',
  },
];

const PERFIS_AUTORIZADOS = ['Administrador', 'Gestão de R&S'];

// ════════════════════════════════════════════════════════════
// COMPONENTE
// ════════════════════════════════════════════════════════════

const ConfiguracoesPage: React.FC<ConfiguracoesPageProps> = ({ currentUser }) => {
  const [activeTab, setActiveTab] = useState<ConfigTab>('tipos');

  // Trava defensiva: o Sidebar já bloqueia, mas se alguém chegar aqui por
  // URL/rota, mostramos o aviso.
  if (!PERFIS_AUTORIZADOS.includes(currentUser?.tipo_usuario || '')) {
    return (
      <EmptyState
        icon="fa-solid fa-lock"
        titulo="Sem acesso às Configurações"
        descricao="Esta área é restrita a Administrador e Gestão de R&S."
      />
    );
  }

  const tabAtual = TABS.find((t) => t.id === activeTab) || TABS[0];

  return (
    <div className="space-y-6">
      {/* Cabeçalho do módulo */}
      <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-lg bg-gray-100 flex items-center justify-center">
            <i className="fa-solid fa-gear text-gray-600 text-xl"></i>
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Configurações CRM</h1>
            <p className="text-sm text-gray-500">
              Verticais e domínios de envio
            </p>
          </div>
        </div>
      </div>

      {/* Sub-nav horizontal */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <nav className="flex flex-wrap border-b border-gray-200">
          {TABS.map((tab) => {
            const ativo = tab.id === activeTab;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`
                  flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors
                  border-b-2 -mb-px
                  ${
                    ativo
                      ? 'border-blue-600 text-blue-600 bg-blue-50/50'
                      : 'border-transparent text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                  }
                `}
              >
                <i className={tab.icon}></i>
                <span>{tab.label}</span>
                {!tab.pronta && (
                  <span className="text-[10px] text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">
                    {tab.fase}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Descrição da aba */}
        <div className="px-4 py-2 bg-gray-50 text-xs text-gray-600 border-b border-gray-200">
          <i className="fa-solid fa-circle-info text-gray-400 mr-2"></i>
          {tabAtual.descricao}
        </div>

        {/* Conteúdo */}
        <div className="p-6">
          {activeTab === 'tipos' && <TiposCampanhaTab currentUser={currentUser} />}
          {activeTab === 'dominios' && <DominiosPlaceholder />}
        </div>
      </div>
    </div>
  );
};

// ════════════════════════════════════════════════════════════
// PLACEHOLDER — DOMÍNIOS DE ENVIO (parcialmente útil)
// ════════════════════════════════════════════════════════════

const DominiosPlaceholder: React.FC = () => {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-semibold text-gray-900">Domínios de Envio</h3>
        <p className="text-xs text-gray-500">
          Domínios verificados no Resend (sa-east-1). A gestão completa (rodízio, contadores
          diários, plano de warmup) chega na <strong>Fase 5</strong>, junto com o motor de disparo.
        </p>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs text-gray-500 uppercase tracking-wide">
            <tr>
              <th className="px-4 py-3 font-medium">Domínio</th>
              <th className="px-4 py-3 font-medium">Resend</th>
              <th className="px-4 py-3 font-medium">DNS (Hostinger)</th>
              <th className="px-4 py-3 font-medium text-right">Enviados hoje</th>
              <th className="px-4 py-3 font-medium text-right">Limite/dia</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {DOMINIOS_ENVIO.map((d) => (
              <tr key={d} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-900">{d}</td>
                <td className="px-4 py-3">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-green-100 text-green-700">
                    <i className="fa-solid fa-circle-check"></i> Verified
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-green-100 text-green-700">
                    <i className="fa-solid fa-circle-check"></i> MX + DKIM ok
                  </span>
                </td>
                <td className="px-4 py-3 text-right text-amber-600">
                  <i className="fa-solid fa-clock mr-1"></i> —
                </td>
                <td className="px-4 py-3 text-right text-gray-400">a definir</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="bg-amber-50 border border-amber-100 rounded-lg px-4 py-3 text-xs text-amber-800 flex items-start gap-2">
        <i className="fa-solid fa-clock mt-0.5"></i>
        <div>
          <strong>Aguardando Fase 5:</strong> contadores diários, rotação round-robin e
          kill-switch (pausa automática se bounce &gt; 5%) entram quando o cron de disparo
          estiver no ar. A migração para a tabela <code>email_dominios</code> também acontece nessa
          fase.
        </div>
      </div>
    </div>
  );
};

// ════════════════════════════════════════════════════════════
// PLACEHOLDER GENÉRICO PARA FASES FUTURAS — REMOVIDO em v1.1
// ════════════════════════════════════════════════════════════
//
// 🆕 v1.1 (13/06/2026): o componente `PlaceholderFase` foi removido
//   junto com as 3 abas que o utilizavam (optout, invalidos,
//   correspondencia). Se voltar a ser necessário no futuro, há
//   referência no histórico Git (commit anterior a esta versão).

export default ConfiguracoesPage;
