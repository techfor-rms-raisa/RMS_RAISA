/**
 * EmpresaDetailDrawer.tsx — Drawer de detalhe da empresa
 *
 * Caminho: src/components/crm/base-leads/EmpresaDetailDrawer.tsx
 * Versão: 1.0 (Fase 1C — 29/05/2026)
 *
 * Decomposto de EmpresasLeadsCRM.tsx (linhas 864-921).
 * Mostra dados da empresa + lista de leads vinculados.
 */

import React from 'react';
import FunilBadge from '../shared/components/FunilBadge';

// ════════════════════════════════════════════════════════════
// TIPOS
// ════════════════════════════════════════════════════════════

interface LeadDaEmpresa {
  id: number;
  nome: string;
  cargo: string | null;
  email: string;
  funil_status: string;
}

interface EmpresaDetalhe {
  empresa: {
    id: number;
    nome: string;
    dominio: string | null;
    setor: string | null;
    cidade: string | null;
    uf: string | null;
    porte: string | null;
    cnpj: string | null;
    website: string | null;
    observacoes: string | null;
  };
  leads: LeadDaEmpresa[];
  total_leads: number;
}

export interface EmpresaDetailDrawerProps {
  detalhe: EmpresaDetalhe | null;
  onFechar: () => void;
  /** Quando o usuário clica em um lead listado dentro do drawer. */
  onAbrirLead: (leadId: number) => void;
}

// ════════════════════════════════════════════════════════════
// COMPONENTE
// ════════════════════════════════════════════════════════════

const EmpresaDetailDrawer: React.FC<EmpresaDetailDrawerProps> = ({
  detalhe,
  onFechar,
  onAbrirLead,
}) => {
  if (!detalhe) return null;
  const { empresa, leads, total_leads } = detalhe;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex justify-end">
      <div className="bg-white w-full max-w-2xl h-full overflow-y-auto shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b bg-indigo-50 sticky top-0 z-10">
          <div>
            <h2 className="text-lg font-bold text-gray-800">{empresa.nome}</h2>
            <p className="text-sm text-gray-500">
              {empresa.dominio || 'Sem domínio'} — {empresa.setor || 'Sem setor'}
            </p>
          </div>
          <button
            onClick={onFechar}
            className="text-gray-400 hover:text-gray-600 text-2xl"
            aria-label="Fechar"
          >
            &times;
          </button>
        </div>

        {/* Dados da empresa */}
        <div className="p-6 border-b">
          <div className="grid grid-cols-2 gap-3 text-sm">
            {empresa.cidade && (
              <div>
                <span className="text-gray-500">Local:</span> {empresa.cidade}/{empresa.uf}
              </div>
            )}
            {empresa.porte && (
              <div>
                <span className="text-gray-500">Porte:</span> {empresa.porte}
              </div>
            )}
            {empresa.cnpj && (
              <div>
                <span className="text-gray-500">CNPJ:</span> {empresa.cnpj}
              </div>
            )}
            {empresa.website && (
              <div>
                <span className="text-gray-500">Site:</span>{' '}
                <a
                  href={empresa.website}
                  target="_blank"
                  rel="noreferrer"
                  className="text-indigo-600 hover:underline"
                >
                  {empresa.website}
                </a>
              </div>
            )}
          </div>
          {empresa.observacoes && (
            <p className="text-sm text-gray-600 mt-3 bg-gray-50 p-2 rounded">
              {empresa.observacoes}
            </p>
          )}
        </div>

        {/* Leads da empresa */}
        <div className="p-6">
          <h3 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2">
            <i className="fa-solid fa-users text-indigo-500"></i>
            Leads ({total_leads})
          </h3>
          {leads.length === 0 ? (
            <p className="text-sm text-gray-400 py-4 text-center">Nenhum lead nesta empresa</p>
          ) : (
            <div className="space-y-2">
              {leads.map((lead) => (
                <div
                  key={lead.id}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 cursor-pointer transition-colors"
                  onClick={() => onAbrirLead(lead.id)}
                >
                  <div>
                    <p className="text-sm font-medium text-gray-800">{lead.nome}</p>
                    <p className="text-xs text-gray-500">
                      {lead.cargo || '—'} — {lead.email}
                    </p>
                  </div>
                  <FunilBadge status={lead.funil_status} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default EmpresaDetailDrawer;
