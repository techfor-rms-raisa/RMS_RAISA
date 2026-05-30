/**
 * LeadDetailDrawer.tsx — Drawer de detalhe do lead
 *
 * Caminho: src/components/crm/base-leads/LeadDetailDrawer.tsx
 * Versão: 1.0 (Fase 1C — 29/05/2026)
 *
 * Decomposto de EmpresasLeadsCRM.tsx (linhas 926-1109).
 * Mostra dados do lead + campanhas + respostas + timeline,
 * com modal "Alterar Funil" embutido (sempre invocado a
 * partir daqui no fluxo original).
 */

import React, { useState } from 'react';
import { FUNIL_LABELS } from '../shared/components/FunilBadge';
import { HISTORICO_ICONS, formatDateTime } from '../types/crm.constants';
import type { Lead, HistoricoItem } from '../types/crm.types';

// ════════════════════════════════════════════════════════════
// PROPS
// ════════════════════════════════════════════════════════════

export interface LeadDetailDrawerProps {
  lead: Lead | null;
  timeline: HistoricoItem[];
  campanhas: any[];
  respostas: any[];
  loadingFunil: boolean;
  onFechar: () => void;
  /**
   * Chamado quando o usuário confirma a mudança de funil.
   * O componente pai (BaseLeadsPage) cuida do reload via hook.
   */
  onConfirmarFunil: (novoStatus: string, motivoPerda: string | null) => Promise<boolean>;
}

// ════════════════════════════════════════════════════════════
// COMPONENTE
// ════════════════════════════════════════════════════════════

const LeadDetailDrawer: React.FC<LeadDetailDrawerProps> = ({
  lead,
  timeline,
  campanhas,
  respostas,
  loadingFunil,
  onFechar,
  onConfirmarFunil,
}) => {
  const [modalFunil, setModalFunil] = useState(false);
  const [novoFunil, setNovoFunil] = useState('');
  const [motivoPerda, setMotivoPerda] = useState('');

  if (!lead) return null;

  const funilAtual = FUNIL_LABELS[lead.funil_status] || FUNIL_LABELS.lead;

  const abrirModalFunil = () => {
    setNovoFunil('');
    setMotivoPerda('');
    setModalFunil(true);
  };

  const confirmar = async () => {
    if (!novoFunil) return;
    const ok = await onConfirmarFunil(
      novoFunil,
      novoFunil === 'perdido' ? motivoPerda : null
    );
    if (ok) {
      setModalFunil(false);
      setNovoFunil('');
      setMotivoPerda('');
    }
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-50 flex justify-end">
        <div className="bg-white w-full max-w-2xl h-full overflow-y-auto shadow-2xl">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b bg-indigo-50 sticky top-0 z-10">
            <div className="flex-1">
              <h2 className="text-lg font-bold text-gray-800">{lead.nome}</h2>
              <p className="text-sm text-gray-500">
                {lead.cargo || '—'} — {lead.email}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {/* Badge funil clicável → abre modal */}
              <button
                onClick={abrirModalFunil}
                className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium ${funilAtual.cor} hover:opacity-80 transition-opacity cursor-pointer`}
                title="Clique para alterar o funil"
              >
                <i className={funilAtual.icon}></i> {funilAtual.label}
                <i className="fa-solid fa-chevron-down text-[10px] ml-1"></i>
              </button>
              <button
                onClick={onFechar}
                className="text-gray-400 hover:text-gray-600 text-2xl ml-3"
                aria-label="Fechar"
              >
                &times;
              </button>
            </div>
          </div>

          {/* Dados do lead */}
          <div className="p-6 border-b">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-gray-500">Empresa:</span>{' '}
                {lead.email_empresas?.nome || '—'}
              </div>
              <div>
                <span className="text-gray-500">Setor:</span>{' '}
                {lead.email_empresas?.setor || '—'}
              </div>
              <div>
                <span className="text-gray-500">Telefone:</span> {lead.telefone || '—'}
              </div>
              <div>
                <span className="text-gray-500">Score:</span> {lead.score_engajamento}/100
              </div>
              <div>
                <span className="text-gray-500">Emails recebidos:</span>{' '}
                {lead.total_emails_recebidos}
              </div>
              <div>
                <span className="text-gray-500">Emails abertos:</span>{' '}
                {lead.total_emails_abertos}
              </div>
              <div>
                <span className="text-gray-500">Clicados:</span>{' '}
                {lead.total_emails_clicados}
              </div>
              <div>
                <span className="text-gray-500">Respostas:</span> {lead.total_respostas}
              </div>
            </div>

            {lead.linkedin_url && (
              <a
                href={lead.linkedin_url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 mt-3 text-sm text-blue-600 hover:underline"
              >
                <i className="fa-brands fa-linkedin"></i> Ver LinkedIn
              </a>
            )}

            {lead.tags && lead.tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-3">
                {lead.tags.map((tag: string) => (
                  <span
                    key={tag}
                    className="bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded text-xs"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}

            {lead.notas && (
              <p className="text-sm text-gray-600 mt-3 bg-gray-50 p-2 rounded">
                {lead.notas}
              </p>
            )}

            {lead.opt_out && (
              <div className="mt-3 bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm flex items-center gap-2">
                <i className="fa-solid fa-ban"></i> Este lead está na lista de opt-out e
                não receberá campanhas.
              </div>
            )}
          </div>

          {/* Campanhas do lead */}
          {campanhas.length > 0 && (
            <div className="p-6 border-b">
              <h3 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2">
                <i className="fa-solid fa-bullhorn text-indigo-500"></i> Campanhas (
                {campanhas.length})
              </h3>
              <div className="space-y-2">
                {campanhas.map((c: any) => (
                  <div
                    key={c.id}
                    className="flex items-center justify-between p-2 bg-gray-50 rounded text-sm"
                  >
                    <span className="font-medium">
                      {c.email_campanhas?.nome || 'Campanha'}
                    </span>
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <span>Step {c.step_atual}</span>
                      <span
                        className={`px-2 py-0.5 rounded ${
                          c.status === 'ativa'
                            ? 'bg-green-100 text-green-700'
                            : 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {c.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Respostas do lead */}
          {respostas.length > 0 && (
            <div className="p-6 border-b">
              <h3 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2">
                <i className="fa-solid fa-reply text-teal-500"></i> Respostas (
                {respostas.length})
              </h3>
              <div className="space-y-2">
                {respostas.map((r: any) => (
                  <div key={r.id} className="p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium">
                        {r.assunto || '(sem assunto)'}
                      </span>
                      <span className="text-xs text-gray-400">
                        {formatDateTime(r.recebido_em)}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600 line-clamp-3">
                      {r.corpo_texto || '—'}
                    </p>
                    {r.classificacao !== 'pendente' && (
                      <span className="inline-block mt-1 px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-xs">
                        {r.classificacao}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Timeline */}
          <div className="p-6">
            <h3 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2">
              <i className="fa-solid fa-clock-rotate-left text-amber-500"></i> Timeline
            </h3>
            {timeline.length === 0 ? (
              <p className="text-sm text-gray-400 py-4 text-center">
                Nenhum evento registrado
              </p>
            ) : (
              <div className="relative">
                {/* Linha vertical */}
                <div className="absolute left-3 top-2 bottom-2 w-0.5 bg-gray-200"></div>

                <div className="space-y-3">
                  {timeline.map((item) => (
                    <div key={item.id} className="flex items-start gap-3 pl-1">
                      <div className="relative z-10 w-6 h-6 rounded-full bg-white border-2 border-gray-200 flex items-center justify-center flex-shrink-0">
                        <i
                          className={`text-xs ${
                            HISTORICO_ICONS[item.tipo] ||
                            'fa-solid fa-circle text-gray-400'
                          }`}
                        ></i>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-800">{item.descricao || item.tipo}</p>
                        <div className="flex items-center gap-2 text-xs text-gray-400 mt-0.5">
                          <span>{formatDateTime(item.criado_em)}</span>
                          {item.criado_por && <span>— {item.criado_por}</span>}
                          {item.email_campanhas?.nome && (
                            <span className="text-indigo-500">
                              ({item.email_campanhas.nome})
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════ */}
      {/* MODAL: ALTERAR FUNIL                                         */}
      {/* ════════════════════════════════════════════════════════════ */}
      {modalFunil && (
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm">
            <div className="px-6 py-4 border-b">
              <h2 className="text-lg font-bold text-gray-800">Alterar Funil</h2>
              <p className="text-sm text-gray-500">{lead.nome}</p>
            </div>
            <div className="p-6 space-y-3">
              {Object.entries(FUNIL_LABELS).map(([key, val]) => (
                <button
                  key={key}
                  onClick={() => setNovoFunil(key)}
                  disabled={key === lead.funil_status}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm transition-colors ${
                    novoFunil === key
                      ? 'bg-indigo-50 border-2 border-indigo-500'
                      : key === lead.funil_status
                      ? 'bg-gray-100 opacity-50 cursor-not-allowed'
                      : 'bg-gray-50 hover:bg-gray-100 border-2 border-transparent'
                  }`}
                >
                  <i className={`${val.icon} w-5`}></i>
                  <span className="font-medium">{val.label}</span>
                  {key === lead.funil_status && (
                    <span className="text-xs text-gray-400 ml-auto">(atual)</span>
                  )}
                </button>
              ))}
              {novoFunil === 'perdido' && (
                <div className="mt-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Motivo da perda
                  </label>
                  <input
                    value={motivoPerda}
                    onChange={(e) => setMotivoPerda(e.target.value)}
                    placeholder="Ex: Não tem interesse, concorrente, etc."
                    className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-indigo-400 focus:outline-none"
                  />
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 px-6 py-4 border-t bg-gray-50">
              <button
                onClick={() => setModalFunil(false)}
                className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
              >
                Cancelar
              </button>
              <button
                onClick={confirmar}
                disabled={!novoFunil || loadingFunil}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
              >
                {loadingFunil ? 'Salvando...' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default LeadDetailDrawer;
