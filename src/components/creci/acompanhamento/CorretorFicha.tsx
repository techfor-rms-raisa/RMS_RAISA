/**
 * CorretorFicha.tsx — Módulo CRECI / Aba Acompanhamento
 *
 * Painel de detalhe do corretor selecionado. Cabeçalho com identificação e
 * ações, e quatro sub-abas:
 *
 *   Ficha & Contrato → dados do corretor, origem no funil e ficha de contrato
 *   Atividades       → timeline de conversas, acordos e follow-ups
 *   E-mails          → histórico do CRM (somente leitura, carregado sob demanda)
 *   Linha do tempo   → fusão cronológica de tudo
 *
 * Caminho: src/components/creci/acompanhamento/CorretorFicha.tsx
 *
 * A linha do tempo é montada apenas com marcos que existem de fato no banco
 * (data_contato, data_whatsapp_clicado, data_envio_adv, negocio_fechado,
 * datas do contrato, atividades e e-mails). Não há coluna registrando QUANDO
 * o interesse virou "Sim" — corretores_creci.interesse guarda só o estado
 * atual. Esse marco fica de fora até que a coluna exista.
 *
 * O botão de WhatsApp abre o wa.me sem texto pré-preenchido de propósito: a
 * mensagem padrão (WHATSAPP_TEXTO_PADRAO) é da fase de prospecção e vive no
 * CreciPage. Duplicar a constante aqui criaria duas fontes de verdade para
 * uma copy que já mudou por decisão de produto no passado.
 *
 * Histórico:
 *  - v1.0 (23/07/2026): versão inicial.
 *  - v1.1 (23/07/2026): correção de fuso na linha do tempo. Os marcos vindos
 *      de colunas `date` (data_contato, data_envio_adv, negocio_fechado,
 *      data_aceite) eram exibidos por formatDataHora e apareciam um dia
 *      atrás, às 21:00 — o construtor Date lê 'YYYY-MM-DD' como meia-noite
 *      UTC. Passam a usar formatDataOuHora, que detecta a granularidade da
 *      origem. Uma linha alterada; nenhuma outra lógica tocada.
 */

import React, { useState, useEffect, useMemo } from 'react';
import type { Atividade, Contrato, MensagemEmail, CarteiraItem } from './creciAcompanhamento.types';
import {
  LABEL_STATUS_CONTRATO,
  CORES_STATUS_CONTRATO,
  LABEL_TIPO_ATIVIDADE,
  formatData,
  formatDataHora,
  formatDataOuHora,
} from './creciAcompanhamento.types';
import ContratoForm from './ContratoForm';
import AtividadesTimeline from './AtividadesTimeline';
import EmailsCorretorTimeline from './EmailsCorretorTimeline';

type SubAba = 'ficha' | 'atividades' | 'emails' | 'timeline';

interface Props {
  itemCarteira: CarteiraItem | null;
  corretor: any | null;
  contrato: Contrato | null;
  lead: any | null;
  atividades: Atividade[];
  emails: MensagemEmail[];
  avisoEmails: string | null;
  loading: boolean;
  loadingEmails: boolean;
  salvando: boolean;
  podeEscrever: boolean;
  onCarregarEmails: () => void;
  onNovaAtividade: () => void;
  onEditarAtividade: (a: Atividade) => void;
  onConcluirFup: (id: number) => void;
  onSalvarContrato: (dados: Record<string, unknown>) => Promise<unknown>;
  onSucesso: (msg: string) => void;
  onErro: (msg: string) => void;
}

interface EventoTimeline {
  data: string;
  titulo: string;
  detalhe?: string;
  cor: string;
}

const CorretorFicha: React.FC<Props> = ({
  itemCarteira,
  corretor,
  contrato,
  lead,
  atividades,
  emails,
  avisoEmails,
  loading,
  loadingEmails,
  salvando,
  podeEscrever,
  onCarregarEmails,
  onNovaAtividade,
  onEditarAtividade,
  onConcluirFup,
  onSalvarContrato,
  onSucesso,
  onErro,
}) => {
  const [sub, setSub] = useState<SubAba>('ficha');

  // Trocar de corretor volta para a primeira sub-aba
  useEffect(() => {
    setSub('ficha');
  }, [corretor?.id]);

  // Carregamento sob demanda da thread de e-mails
  useEffect(() => {
    if (sub === 'emails') onCarregarEmails();
  }, [sub, onCarregarEmails]);

  const fupsPendentes = useMemo(
    () => atividades.filter(a => a.fup_em && !a.fup_concluido_em).length,
    [atividades]
  );

  const timeline = useMemo<EventoTimeline[]>(() => {
    if (!corretor) return [];
    const eventos: EventoTimeline[] = [];

    if (corretor.data_contato)
      eventos.push({ data: corretor.data_contato, titulo: 'Primeiro contato', cor: 'bg-gray-400' });

    if (corretor.data_whatsapp_clicado)
      eventos.push({
        data: corretor.data_whatsapp_clicado,
        titulo: 'WhatsApp acionado',
        cor: 'bg-emerald-500',
      });

    if (corretor.data_envio_adv)
      eventos.push({
        data: corretor.data_envio_adv,
        titulo: 'Promovido ao CRM',
        detalhe: 'Corretor vinculado a campanha de e-mail',
        cor: 'bg-sky-500',
      });

    if (corretor.negocio_fechado)
      eventos.push({
        data: corretor.negocio_fechado,
        titulo: 'Negócio fechado',
        cor: 'bg-emerald-600',
      });

    if (contrato) {
      eventos.push({
        data: contrato.criado_em,
        titulo: 'Ficha de contrato criada',
        detalhe: `por ${contrato.criado_por_nome}`,
        cor: 'bg-indigo-500',
      });
      if (contrato.data_aceite)
        eventos.push({
          data: contrato.data_aceite,
          titulo: 'Aceite do contrato',
          detalhe: contrato.numero_contrato || undefined,
          cor: 'bg-indigo-600',
        });
    }

    atividades.forEach(a =>
      eventos.push({
        data: a.data_atividade,
        titulo: `Atividade — ${LABEL_TIPO_ATIVIDADE[a.tipo]}`,
        detalhe: `${a.executado_por_nome}: ${a.descricao.slice(0, 120)}${
          a.descricao.length > 120 ? '...' : ''
        }`,
        cor: a.fup_em && !a.fup_concluido_em ? 'bg-rose-500' : 'bg-sky-400',
      })
    );

    emails.forEach(m => {
      if (!m.data) return;
      eventos.push({
        data: m.data,
        titulo: m.direcao === 'inbound' ? 'E-mail recebido' : 'E-mail enviado',
        detalhe: m.assunto,
        cor: m.direcao === 'inbound' ? 'bg-emerald-500' : 'bg-gray-400',
      });
    });

    return eventos.sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime());
  }, [corretor, contrato, atividades, emails]);

  // ── Estado vazio ───────────────────────────────────────────────────────────
  if (!corretor && !loading) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-10 text-center">
        <div className="text-4xl mb-3">👈</div>
        <p className="text-sm text-gray-600 font-medium">Selecione um corretor na carteira</p>
        <p className="text-xs text-gray-400 mt-1">
          A ficha completa, o contrato e todo o histórico aparecem aqui.
        </p>
      </div>
    );
  }

  const subBtn = (valor: SubAba, icone: string, label: string, badge?: number) => (
    <button
      type="button"
      onClick={() => setSub(valor)}
      className={`px-3 py-1.5 rounded-lg text-xs transition-colors ${
        sub === valor ? 'bg-indigo-50 text-indigo-700 font-semibold' : 'text-gray-600 hover:bg-gray-100'
      }`}
    >
      <i className={`${icone} mr-1`} /> {label}
      {badge !== undefined && badge > 0 && (
        <span className="ml-1.5 bg-gray-200 text-gray-700 px-1.5 rounded-full">{badge}</span>
      )}
    </button>
  );

  const telefoneLimpo = String(corretor?.celular || '').replace(/\D/g, '');
  const emailCorretor = corretor?.email_creci || corretor?.email_pessoal || null;

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
      {/* ── Cabeçalho ── */}
      <div className="px-4 py-3 border-b border-gray-200 bg-gradient-to-r from-gray-50 to-white">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-gray-800 break-words">
              {corretor?.nome || 'Carregando...'}
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {corretor?.creci}
              {corretor?.cidade ? ` · ${corretor.cidade}` : ''}
              {corretor?.uf ? `/${corretor.uf}` : ''}
              {corretor?.analista ? ` · responsável: ${corretor.analista}` : ''}
            </p>

            <div className="flex flex-wrap gap-1.5 mt-2">
              {corretor?.interesse === 'yes' && (
                <span className="text-[11px] bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full">
                  👍 Interesse
                </span>
              )}
              {corretor?.negocio_fechado && (
                <span className="text-[11px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full">
                  🤝 Negócio fechado em {formatData(corretor.negocio_fechado)}
                </span>
              )}
              {contrato && (
                <span
                  className={`text-[11px] px-2 py-0.5 rounded-full ${
                    CORES_STATUS_CONTRATO[contrato.status_contrato]
                  }`}
                >
                  {LABEL_STATUS_CONTRATO[contrato.status_contrato]}
                </span>
              )}
              {fupsPendentes > 0 && (
                <span className="text-[11px] bg-rose-600 text-white px-2 py-0.5 rounded-full">
                  {fupsPendentes} FUP pendente{fupsPendentes > 1 ? 's' : ''}
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-2 shrink-0">
            {podeEscrever && (
              <button
                type="button"
                onClick={onNovaAtividade}
                className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs px-3 py-2 rounded-lg whitespace-nowrap"
              >
                <i className="fa-solid fa-plus mr-1" /> Nova atividade
              </button>
            )}
            {telefoneLimpo && (
              <a
                href={`https://wa.me/55${telefoneLimpo}`}
                target="_blank"
                rel="noopener noreferrer"
                className="border border-gray-300 hover:bg-gray-50 text-gray-700 text-xs px-3 py-2 rounded-lg whitespace-nowrap text-center"
              >
                <i className="fa-brands fa-whatsapp mr-1 text-emerald-600" /> WhatsApp
              </a>
            )}
          </div>
        </div>
      </div>

      {/* ── Sub-abas ── */}
      <div className="flex gap-1 px-3 py-2 border-b border-gray-200 bg-gray-50 flex-wrap">
        {subBtn('ficha', 'fa-solid fa-file-contract', 'Ficha & Contrato')}
        {subBtn('atividades', 'fa-solid fa-list-check', 'Atividades', atividades.length)}
        {subBtn('emails', 'fa-solid fa-envelope', 'E-mails', emails.length)}
        {subBtn('timeline', 'fa-solid fa-timeline', 'Linha do tempo')}
      </div>

      <div className="p-4 max-h-[560px] overflow-y-auto">
        {loading && (
          <div className="p-6 text-center text-sm text-gray-400">Carregando ficha...</div>
        )}

        {!loading && sub === 'ficha' && (
          <>
            {!podeEscrever && (
              <div className="mb-4 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900">
                <i className="fa-solid fa-eye mr-1" />
                <strong>Modo leitura.</strong> Gestão Comercial acompanha toda a carteira. O registro
                de atividades e a edição do contrato são feitos pelo SDR ou pelo Administrador.
              </div>
            )}

            <div className="grid md:grid-cols-2 gap-4 mb-5">
              <div className="border border-gray-200 rounded-lg p-3">
                <p className="text-[11px] uppercase tracking-wide text-gray-500 mb-2">
                  Dados do corretor
                </p>
                <dl className="text-sm space-y-1.5">
                  <Linha rotulo="CRECI" valor={corretor?.creci} />
                  <Linha rotulo="E-mail" valor={emailCorretor} classe="text-blue-600 truncate" />
                  <Linha rotulo="Celular" valor={corretor?.celular} />
                  <Linha
                    rotulo="Cidade/UF"
                    valor={corretor?.cidade ? `${corretor.cidade}/${corretor.uf || ''}` : null}
                  />
                  <Linha rotulo="Responsável" valor={corretor?.analista} />
                  <Linha rotulo="1º contato" valor={formatData(corretor?.data_contato)} />
                </dl>
              </div>

              <div className="border border-gray-200 rounded-lg p-3">
                <p className="text-[11px] uppercase tracking-wide text-gray-500 mb-2">
                  Origem no funil
                </p>
                <dl className="text-sm space-y-1.5">
                  <Linha rotulo="Negócio fechado" valor={formatData(corretor?.negocio_fechado)} />
                  <Linha rotulo="Promovido ao CRM" valor={formatData(corretor?.data_envio_adv)} />
                  <Linha
                    rotulo="Lead no CRM"
                    valor={lead ? `#${lead.id}` : 'não vinculado'}
                    classe={lead ? 'text-blue-600' : 'text-gray-400'}
                  />
                  <Linha rotulo="Funil" valor={lead?.funil_status || '—'} />
                  <Linha
                    rotulo="WhatsApp"
                    valor={formatData(corretor?.data_whatsapp_clicado)}
                  />
                  <Linha
                    rotulo="Atividades"
                    valor={String(itemCarteira?.total_atividades ?? atividades.length)}
                  />
                </dl>
              </div>
            </div>

            <ContratoForm
              contrato={contrato}
              podeEscrever={podeEscrever}
              salvando={salvando}
              onSalvar={onSalvarContrato}
              onSucesso={onSucesso}
              onErro={onErro}
            />
          </>
        )}

        {!loading && sub === 'atividades' && (
          <AtividadesTimeline
            atividades={atividades}
            loading={false}
            podeEscrever={podeEscrever}
            salvando={salvando}
            onNova={onNovaAtividade}
            onEditar={onEditarAtividade}
            onConcluirFup={onConcluirFup}
          />
        )}

        {!loading && sub === 'emails' && (
          <EmailsCorretorTimeline
            mensagens={emails}
            aviso={avisoEmails}
            loading={loadingEmails}
          />
        )}

        {!loading && sub === 'timeline' && (
          <div>
            <p className="text-xs text-gray-500 mb-3">
              Marcos do funil, contrato, atividades e e-mails em ordem cronológica.
              {emails.length === 0 && (
                <span className="text-gray-400">
                  {' '}
                  Abra a sub-aba E-mails uma vez para incluir as mensagens aqui.
                </span>
              )}
            </p>

            {timeline.length === 0 ? (
              <div className="p-6 text-center text-sm text-gray-400">Nenhum evento registrado.</div>
            ) : (
              <ol className="relative border-l-2 border-gray-200 ml-3 space-y-4">
                {timeline.map((ev, i) => (
                  <li key={`${ev.data}_${i}`} className="ml-5">
                    <span
                      className={`absolute -left-[9px] w-4 h-4 rounded-full border-2 border-white ${ev.cor}`}
                    />
                    <p className="text-xs text-gray-400">{formatDataOuHora(ev.data)}</p>
                    <p className="text-sm text-gray-800 font-medium">{ev.titulo}</p>
                    {ev.detalhe && (
                      <p className="text-xs text-gray-600 mt-0.5 break-words">{ev.detalhe}</p>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

// ── Linha de definição (rótulo + valor) ─────────────────────────────────────
const Linha: React.FC<{ rotulo: string; valor?: string | null; classe?: string }> = ({
  rotulo,
  valor,
  classe = 'text-gray-800',
}) => (
  <div className="flex justify-between gap-2">
    <dt className="text-gray-500 shrink-0">{rotulo}</dt>
    <dd className={`${classe} text-right`}>{valor || '—'}</dd>
  </div>
);

export default CorretorFicha;
