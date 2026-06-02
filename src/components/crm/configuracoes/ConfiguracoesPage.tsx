/**
 * ConfiguracoesPage.tsx — Página "Configurações CRM"
 *
 * Caminho: src/components/crm/configuracoes/ConfiguracoesPage.tsx
 * Versão: 1.0 (01/06/2026)
 *
 * Container com 5 sub-abas. Acessível por Administrador + Gestão de R&S
 * (RBAC garantido pelo Sidebar; aqui há uma trava defensiva extra).
 *
 * Sub-abas:
 *  - 🏷️  Tipos de Campanha — ✅ funcional (CRUD em api/crm-copys.ts)
 *  - 🚫  Opt-out             — ✅ funcional (CRUD em api/crm-config.ts)
 *  - 🌐  Domínios de Envio   — 🟡 placeholder (lê DOMINIOS_ENVIO; status real
 *                              vem na Fase 5 com a tabela email_dominios)
 *  - 🔁  E-mails Inválidos   — 🟡 placeholder (depende de bounces da Fase 6)
 *  - 📥  Correspondência     — 🟡 placeholder (reply-routing da Fase 7)
 */

import React, { useState } from 'react';
import type { CurrentUserLite } from '../types/crm.types';
import { DOMINIOS_ENVIO } from '../types/crm.constants';
import EmptyState from '../shared/components/EmptyState';
import TiposCampanhaTab from './TiposCampanhaTab';
import OptOutTab from './OptOutTab';

// ════════════════════════════════════════════════════════════
// TIPOS
// ════════════════════════════════════════════════════════════

type ConfigTab = 'tipos' | 'optout' | 'dominios' | 'invalidos' | 'correspondencia';

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
    id: 'optout',
    label: 'Opt-out',
    icon: 'fa-solid fa-ban',
    descricao: 'Lista global de e-mails que não devem receber disparos',
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
  {
    id: 'invalidos',
    label: 'E-mails Inválidos',
    icon: 'fa-solid fa-envelope-circle-check',
    descricao: 'Recovery Pipeline — recuperar e-mails com bounce',
    pronta: false,
    fase: 'Fase 6',
  },
  {
    id: 'correspondencia',
    label: 'Correspondência',
    icon: 'fa-solid fa-reply-all',
    descricao: 'Reply-routing — quem recebe as respostas',
    pronta: false,
    fase: 'Fase 7',
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
              Verticais, opt-out, domínios, recuperação de e-mails e correspondência
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
          {activeTab === 'optout' && <OptOutTab currentUser={currentUser} />}
          {activeTab === 'dominios' && <DominiosPlaceholder />}
          {activeTab === 'invalidos' && (
            <PlaceholderFase
              icon="fa-solid fa-envelope-circle-check"
              titulo="E-mails Inválidos"
              fase="Fase 6"
              descricao="Quando o motor de disparo entrar e começar a receber webhooks de bounce do Resend, esta tela vai listar automaticamente os endereços que precisam ser recuperados (via MX + 30 padrões + Snov.io)."
              referencia="Especificacao_Email_Recovery_Pipeline.md"
            />
          )}
          {activeTab === 'correspondencia' && (
            <PlaceholderFase
              icon="fa-solid fa-reply-all"
              titulo="Correspondência (reply-routing)"
              fase="Fase 7"
              descricao="CRUD para definir quem recebe as respostas das campanhas, por escopo (campanha → analista → domínio → global). Múltiplas caixas postais por entrada. Depende do motor de envio existir para montar o Reply-To."
            />
          )}
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
// PLACEHOLDER GENÉRICO PARA FASES FUTURAS
// ════════════════════════════════════════════════════════════

interface PlaceholderFaseProps {
  icon: string;
  titulo: string;
  fase: string;
  descricao: string;
  referencia?: string;
}

const PlaceholderFase: React.FC<PlaceholderFaseProps> = ({
  icon,
  titulo,
  fase,
  descricao,
  referencia,
}) => (
  <div className="text-center py-10 px-4">
    <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-gray-100 mb-4">
      <i className={`${icon} text-gray-400 text-xl`}></i>
    </div>
    <h2 className="text-lg font-semibold text-gray-700 mb-1">{titulo}</h2>
    <p className="text-sm text-gray-500 mb-5 max-w-xl mx-auto">{descricao}</p>

    <div className="inline-block px-4 py-3 rounded-lg bg-amber-50 border border-amber-100 text-left max-w-md">
      <div className="flex items-center gap-2 mb-1">
        <i className="fa-solid fa-clock-rotate-left text-amber-500 text-sm"></i>
        <span className="text-xs font-semibold text-amber-700 uppercase tracking-wide">
          Entrega prevista — {fase}
        </span>
      </div>
      <p className="text-xs text-amber-900">Depende do motor de disparo da fila de e-mails.</p>
      {referencia && (
        <p className="text-xs text-amber-700 mt-1">
          <i className="fa-solid fa-file-lines mr-1"></i>
          Referência: <code>{referencia}</code>
        </p>
      )}
    </div>
  </div>
);

export default ConfiguracoesPage;
