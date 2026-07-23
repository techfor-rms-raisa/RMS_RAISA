/**
 * EmailsCorretorTimeline.tsx — Módulo CRECI / Aba Acompanhamento
 *
 * Histórico de e-mails do corretor, SOMENTE LEITURA.
 *
 * Caminho: src/components/creci/acompanhamento/EmailsCorretorTimeline.tsx
 *
 * A thread é remontada pelo backend a partir de email_fila (enviados) e
 * email_respostas (recebidos), casando o corretor com o lead do CRM por
 * e-mail. Não há ação de responder aqui: a resposta continua sendo feita na
 * aba Respostas do CRM, onde vale o RBAC de dono da campanha. Duplicar esse
 * fluxo criaria dois caminhos de escrita para a mesma caixa de entrada.
 *
 * Carregamento sob demanda: o fetch só dispara quando esta sub-aba é aberta.
 *
 * Histórico:
 *  - v1.0 (23/07/2026): versão inicial.
 */

import React from 'react';
import type { MensagemEmail } from './creciAcompanhamento.types';
import { formatDataHora } from './creciAcompanhamento.types';

interface Props {
  mensagens: MensagemEmail[];
  aviso: string | null;
  loading: boolean;
}

/** Rótulos amigáveis para classificacao de email_respostas. */
const LABEL_CLASSIFICACAO: Record<string, string> = {
  pendente: 'não classificado',
  interessado: 'interessado',
  nao_interessado: 'não interessado',
  pediu_mais_info: 'pediu mais info',
  agendou_reuniao: 'agendou reunião',
  fora_do_escritorio: 'fora do escritório',
};

const COR_CLASSIFICACAO: Record<string, string> = {
  interessado: 'bg-emerald-100 text-emerald-800',
  agendou_reuniao: 'bg-emerald-100 text-emerald-800',
  pediu_mais_info: 'bg-sky-100 text-sky-800',
  nao_interessado: 'bg-gray-200 text-gray-700',
  fora_do_escritorio: 'bg-gray-100 text-gray-500',
  pendente: 'bg-gray-100 text-gray-600',
};

const EmailsCorretorTimeline: React.FC<Props> = ({ mensagens, aviso, loading }) => {
  return (
    <div>
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-3 text-xs text-blue-900">
        <i className="fa-solid fa-circle-info mr-1" />
        Somente leitura. Histórico reaproveitado do CRM. Para responder, use a aba{' '}
        <strong>Respostas</strong> do CRM — lá vale a permissão do responsável pela campanha.
      </div>

      {loading && (
        <div className="p-6 text-center text-sm text-gray-400">Carregando histórico de e-mails...</div>
      )}

      {!loading && aviso && (
        <div className="p-4 border border-amber-200 bg-amber-50 rounded-lg text-sm text-amber-900">
          <i className="fa-solid fa-triangle-exclamation mr-1" /> {aviso}
        </div>
      )}

      {!loading && !aviso && mensagens.length === 0 && (
        <div className="p-6 text-center border border-dashed border-gray-200 rounded-lg">
          <div className="text-3xl mb-2">✉️</div>
          <p className="text-sm text-gray-600 font-medium">Nenhum e-mail no histórico</p>
          <p className="text-xs text-gray-400 mt-1">
            O corretor está no CRM, mas ainda não recebeu nem enviou mensagens.
          </p>
        </div>
      )}

      <div className="space-y-2">
        {mensagens.map(m => {
          const entrada = m.direcao === 'inbound';
          return (
            <div
              key={m.id}
              className={`border rounded-lg p-3 ${
                entrada ? 'border-emerald-200 bg-emerald-50/40' : 'border-gray-200 bg-white'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-semibold text-gray-800 min-w-0">
                  <i
                    className={`fa-solid ${
                      entrada ? 'fa-arrow-left text-emerald-600' : 'fa-arrow-right text-indigo-500'
                    } mr-1.5`}
                  />
                  <span className="break-words">{m.assunto}</span>
                </p>
                <span className="text-xs text-gray-500 shrink-0">{formatDataHora(m.data)}</span>
              </div>

              {/* Metadados */}
              <p className="text-xs text-gray-500 mt-1">
                {entrada ? (
                  <>de {m.de_nome ? `${m.de_nome} <${m.de_email}>` : m.de_email}</>
                ) : (
                  <>
                    {m.campanha_nome || 'Campanha'}
                    {m.step_ordem ? ` · Step ${m.step_ordem}` : ''}
                    {m.status ? ` · ${m.status}` : ''}
                  </>
                )}
              </p>

              {/* Selos de tracking (só nos enviados) */}
              {!entrada && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {m.entregue_em && (
                    <span className="text-[11px] bg-gray-100 text-gray-700 px-2 py-0.5 rounded-full">
                      entregue
                    </span>
                  )}
                  {m.aberto_em && (
                    <span className="text-[11px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full">
                      aberto
                    </span>
                  )}
                  {m.clicado_em && (
                    <span className="text-[11px] bg-sky-100 text-sky-800 px-2 py-0.5 rounded-full">
                      clicado
                    </span>
                  )}
                  {m.respondido_em && (
                    <span className="text-[11px] bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded-full">
                      respondido
                    </span>
                  )}
                </div>
              )}

              {/* Corpo da resposta recebida */}
              {entrada && m.corpo_texto && (
                <p className="text-sm text-gray-700 mt-2 whitespace-pre-wrap break-words line-clamp-6">
                  {m.corpo_texto}
                </p>
              )}

              {entrada && m.classificacao && (
                <span
                  className={`inline-block mt-2 text-[11px] px-2 py-0.5 rounded-full ${
                    COR_CLASSIFICACAO[m.classificacao] || 'bg-gray-100 text-gray-600'
                  }`}
                >
                  {LABEL_CLASSIFICACAO[m.classificacao] || m.classificacao}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default EmailsCorretorTimeline;
