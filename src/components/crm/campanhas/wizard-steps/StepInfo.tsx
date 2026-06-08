/**
 * StepInfo.tsx — Passo 1 do wizard: Dados gerais da campanha
 *
 * Caminho: src/components/crm/campanhas/wizard-steps/StepInfo.tsx
 * Versão: 1.3 (Fase B — 08/06/2026)
 *
 * Histórico:
 *  - v1.0 (30/05/2026 — Fase 1D): decomposto de CampaignBuilder.tsx.
 *  - v1.1 (01/06/2026 — Fase E-1/E-2): novo campo "Unidade do grupo"
 *    (entre Tipo e Domínio). Default 'TechFor TI'. Toda campanha
 *    pertence a uma unidade, e a assinatura usada herda essa unidade
 *    (regra travada no backend desde a v1.7 de crm-campanhas.ts).
 *  - v1.2 (02/06/2026 — Fase 5B-UI): novo campo "Responsável da campanha"
 *    (entre Unidade e Domínio). Sem ele, a campanha era criada com
 *    `responsavel_id=null` e o filtro de leads_disponiveis devolvia
 *    sempre 0 — analista não conseguia vincular leads à campanha.
 *      • Admin enxerga dropdown com GC/SDR ativos.
 *      • Gestão Comercial vê o próprio nome disabled (trava no backend
 *        já forçava isso, agora a UI reflete).
 *      • Outros perfis nunca chegam aqui (criar_campanha bloqueia antes).
 *      • Lista vem por prop (`responsaveis` + `travadoNoProprio`),
 *        carregada uma vez pelo CampanhaWizard via
 *        GET listar_responsaveis_elegiveis (crm-campanhas.ts v1.8).
 *  - v1.3 (08/06/2026 — Fase B): novo campo "Encerrar em (opcional)"
 *    abaixo dos horários. Input type=date com min=hoje + botão X para
 *    limpar. Quando preenchido, o cron disparar-fila.ts v1.11 marca a
 *    campanha como 'concluida' ao atingir a data E cancela todos os
 *    pendentes em email_fila (decisão de produto — Opção A: encerramento
 *    limpo, LGPD-compliant). Backend valida formato YYYY-MM-DD e que a
 *    data não esteja no passado (crm-campanhas.ts v1.10).
 */

import React from 'react';
import { DOMINIOS_ENVIO, UNIDADES_GRUPO, UNIDADE_PADRAO } from '../../types/crm.constants';
import type { Campanha } from '../../types/crm.types';

// ════════════════════════════════════════════════════════════
// PROPS
// ════════════════════════════════════════════════════════════

/** Item de responsável vindo de listar_responsaveis_elegiveis (crm-campanhas v1.8). */
export interface ResponsavelElegivel {
  id: number;
  nome_usuario: string;
  email_usuario: string;
  tipo_usuario: string; // 'Administrador' | 'Gestão Comercial' | 'SDR'
}

export interface StepInfoProps {
  campanha: Partial<Campanha>;
  tipos: string[];
  assinaturaCarregada: boolean;
  /** Lista de responsáveis que o usuário ATUAL pode atribuir à campanha.
   *  Carregada pelo CampanhaWizard via GET listar_responsaveis_elegiveis. */
  responsaveis: ResponsavelElegivel[];
  /** True quando o backend forçou trava (Gestão Comercial — único candidato é ele mesmo).
   *  A UI desabilita o dropdown nesse caso para refletir a regra do backend. */
  travadoNoProprio: boolean;
  onChange: (campanha: Partial<Campanha>) => void;
  onAbrirAssinatura: () => void;
  onProximo: () => void;
}

// ════════════════════════════════════════════════════════════
// COMPONENTE
// ════════════════════════════════════════════════════════════

const StepInfo: React.FC<StepInfoProps> = ({
  campanha,
  tipos,
  assinaturaCarregada,
  responsaveis,
  travadoNoProprio,
  onChange,
  onAbrirAssinatura,
  onProximo,
}) => {
  const [showTipoCustom, setShowTipoCustom] = React.useState(false);
  const [tipoCustom, setTipoCustom] = React.useState('');

  const setField = <K extends keyof Campanha>(key: K, value: Campanha[K]) => {
    onChange({ ...campanha, [key]: value });
  };

  // ════════════════════════════════════════════════════════════
  // 🆕 30/05/2026 — Auto-fill do email_remetente baseado em
  // nome_remetente + dominio_envio (UX: evita digitação manual)
  //
  // Algoritmo: <inicial-primeiro-nome><último-sobrenome>@<dominio>
  // Exemplos:
  //   "Tatiana Silva"           + techfor.com.br    → tsilva@techfor.com.br
  //   "Messias Oliveira"        + techforti.inf.br  → moliveira@techforti.inf.br
  //   "Marcos Da Silva Souza"   + techfor.com.br    → msouza@techfor.com.br (Da ignorado)
  //   "Ana Maria Lima Pereira"  + techforti.inf.br  → apereira@techforti.inf.br
  //
  // Comportamento: só sobrescreve email_remetente se ele estiver vazio
  // ou se for um auto-fill anterior (preserva edição manual do usuário).
  // ════════════════════════════════════════════════════════════

  // Conectivos comuns em nomes BR — ignorados na hora de escolher sobrenome
  const CONECTIVOS_NOME = new Set([
    'da', 'de', 'di', 'do', 'du',
    'das', 'des', 'dos',
    'e', 'y',
    'la', 'le', 'lo',
  ]);

  /** Remove acentos de uma string (NFD + remove diacríticos). */
  const removerAcentos = (s: string): string =>
    s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  /**
   * Gera email a partir de nome + domínio.
   * Retorna string vazia se o nome não tiver pelo menos 1 palavra utilizável.
   */
  const derivarEmailRemetente = (nome: string, dominio: string): string => {
    if (!nome || !dominio) return '';
    const partes = removerAcentos(nome.trim())
      .toLowerCase()
      .split(/\s+/)
      .filter((p) => p.length > 0 && !CONECTIVOS_NOME.has(p));
    if (partes.length === 0) return '';

    const primeiro = partes[0];
    const sobrenome = partes.length > 1 ? partes[partes.length - 1] : primeiro;
    // Sanitiza para chars válidos de email (a-z0-9)
    const sanit = (s: string) => s.replace(/[^a-z0-9]/g, '');
    const inicial = sanit(primeiro).charAt(0);
    const ultimoSob = sanit(sobrenome);
    if (!inicial || !ultimoSob) return '';
    return `${inicial}${ultimoSob}@${dominio}`;
  };

  /**
   * Verifica se o email_remetente atual foi gerado pelo autofill
   * (com algum domínio válido) — assim sabemos se podemos sobrescrever.
   */
  const ehEmailAutoGerado = (email: string | undefined): boolean => {
    if (!email) return true; // vazio = pode preencher
    // Se o email atual bate exatamente com o que o algoritmo geraria
    // para os valores atuais OU para qualquer combinação anterior dos
    // 2 domínios válidos, consideramos auto-gerado.
    const nomeAtual = campanha.nome_remetente || '';
    const candidatos = [
      derivarEmailRemetente(nomeAtual, 'techfor.com.br'),
      derivarEmailRemetente(nomeAtual, 'techforti.inf.br'),
    ];
    return candidatos.includes(email);
  };

  /**
   * Setter customizado para nome_remetente — atualiza nome E recalcula email
   * (se email estava vazio ou foi auto-gerado anteriormente).
   */
  const setNomeRemetente = (nome: string) => {
    const proximaCampanha: Partial<Campanha> = { ...campanha, nome_remetente: nome };
    if (campanha.dominio_envio && ehEmailAutoGerado(campanha.email_remetente)) {
      const novoEmail = derivarEmailRemetente(nome, campanha.dominio_envio);
      if (novoEmail) proximaCampanha.email_remetente = novoEmail;
    }
    onChange(proximaCampanha);
  };

  /**
   * Setter customizado para dominio_envio — atualiza domínio E recalcula email
   * (se email estava vazio ou foi auto-gerado anteriormente).
   */
  const setDominioEnvio = (dominio: string) => {
    const proximaCampanha: Partial<Campanha> = { ...campanha, dominio_envio: dominio };
    if (campanha.nome_remetente && ehEmailAutoGerado(campanha.email_remetente)) {
      const novoEmail = derivarEmailRemetente(campanha.nome_remetente, dominio);
      if (novoEmail) proximaCampanha.email_remetente = novoEmail;
    }
    onChange(proximaCampanha);
  };

  return (
    <div className="space-y-5 max-w-2xl">
      {/* Nome */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Nome da campanha *
        </label>
        <input
          type="text"
          value={campanha.nome || ''}
          onChange={(e) => setField('nome', e.target.value)}
          placeholder="Ex: Outsourcing TI — Abertura Q2 2026"
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
      </div>

      {/* Tipo */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Tipo de campanha
        </label>
        {!showTipoCustom ? (
          <select
            value={campanha.tipo || 'Outsourcing'}
            onChange={(e) => {
              if (e.target.value === '__custom__') {
                setShowTipoCustom(true);
              } else {
                setField('tipo', e.target.value);
              }
            }}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
          >
            {tipos.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
            <option value="__custom__">+ Outro tipo...</option>
          </select>
        ) : (
          <div className="flex gap-2">
            <input
              type="text"
              value={tipoCustom}
              onChange={(e) => {
                setTipoCustom(e.target.value);
                setField('tipo', e.target.value);
              }}
              placeholder="Digite o novo tipo..."
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
              autoFocus
            />
            <button
              onClick={() => {
                setShowTipoCustom(false);
                setTipoCustom('');
              }}
              className="px-3 py-2 text-sm text-gray-500 hover:text-gray-700"
            >
              Cancelar
            </button>
          </div>
        )}
      </div>

      {/* 🆕 Fase E-1: Unidade do grupo */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Unidade do grupo *
        </label>
        <select
          value={campanha.unidade || UNIDADE_PADRAO}
          onChange={(e) => setField('unidade', e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
        >
          {UNIDADES_GRUPO.map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </select>
        <p className="text-xs text-gray-400 mt-1">
          Define qual a identidade comercial dos e-mails (assinatura, link da empresa). A assinatura usada será a do responsável NA UNIDADE escolhida.
        </p>
      </div>

      {/* 🆕 Fase 5B-UI: Responsável da campanha */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Responsável da campanha *
        </label>
        {travadoNoProprio ? (
          // Gestão Comercial: campo travado no próprio user
          <input
            type="text"
            value={responsaveis[0]?.nome_usuario || ''}
            disabled
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-gray-50 text-gray-600 cursor-not-allowed"
          />
        ) : (
          // Administrador: dropdown com GC/SDR ativos
          <select
            value={campanha.responsavel_id ?? ''}
            onChange={(e) =>
              setField(
                'responsavel_id',
                e.target.value === '' ? (null as any) : (Number(e.target.value) as any)
              )
            }
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
          >
            <option value="">Selecionar responsável...</option>
            {responsaveis.map((r) => (
              <option key={r.id} value={r.id}>
                {r.nome_usuario} — {r.tipo_usuario}
              </option>
            ))}
          </select>
        )}
        <p className="text-xs text-gray-400 mt-1">
          {travadoNoProprio
            ? 'Gestão Comercial atribui campanhas para si mesmo.'
            : 'Quem responde pelos envios. A assinatura usada será a dele, na unidade da campanha. Obrigatório para ativar a campanha.'}
        </p>
      </div>

      {/* Domínio de envio */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Domínio de envio
        </label>
        <select
          value={campanha.dominio_envio || ''}
          onChange={(e) => setDominioEnvio(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
        >
          <option value="">Selecionar domínio...</option>
          {DOMINIOS_ENVIO.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
        <p className="text-xs text-gray-400 mt-1">
          Domínio secundário usado no FROM. A assinatura sempre usa o domínio institucional.
        </p>
      </div>

      {/* Remetente */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Nome do remetente
          </label>
          <input
            type="text"
            value={campanha.nome_remetente || ''}
            onChange={(e) => setNomeRemetente(e.target.value)}
            placeholder="Ex: Tatiana Silva"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Email do remetente (FROM)
          </label>
          <input
            type="email"
            value={campanha.email_remetente || ''}
            onChange={(e) => setField('email_remetente', e.target.value)}
            placeholder="Ex: tsilva@techfor.com.br"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
          />
          <p className="text-xs text-gray-400 mt-1">
            Preenchido automaticamente a partir do nome + domínio. Pode editar livremente.
          </p>
        </div>
      </div>

      {/* Horários */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Horário início envio
          </label>
          <input
            type="time"
            value={campanha.horario_inicio || '08:00'}
            onChange={(e) => setField('horario_inicio', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Horário fim envio
          </label>
          <input
            type="time"
            value={campanha.horario_fim || '18:00'}
            onChange={(e) => setField('horario_fim', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
          />
        </div>
      </div>

      {/* 🆕 v1.3 (08/06/2026 — Fase B) — Data de encerramento (opcional).
          Quando atingida, o cron disparar-fila.ts v1.11 marca a campanha
          como 'concluida' E cancela todos os steps pendentes em email_fila
          (Opção A — encerramento limpo, LGPD-compliant). */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Encerrar em (opcional)
        </label>
        <div className="flex items-center gap-2">
          <input
            type="date"
            min={new Date().toISOString().slice(0, 10)}
            value={campanha.data_encerramento || ''}
            onChange={(e) =>
              setField('data_encerramento', e.target.value || null)
            }
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
          />
          {campanha.data_encerramento && (
            <button
              type="button"
              onClick={() => setField('data_encerramento', null)}
              className="px-3 py-2 text-sm text-gray-500 hover:text-red-600"
              title="Limpar data de encerramento"
            >
              <i className="fa-solid fa-xmark"></i>
            </button>
          )}
        </div>
        <p className="mt-1 text-xs text-gray-500">
          Quando a data for atingida, a campanha é automaticamente concluída e os e-mails pendentes são cancelados.
        </p>
      </div>

      {/* Aviso de assinatura */}
      {!assinaturaCarregada && (
        <div className="flex items-start gap-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
          <i className="fa-solid fa-triangle-exclamation text-yellow-600 mt-0.5 flex-shrink-0"></i>
          <div className="text-sm">
            <p className="font-medium text-yellow-800">Configure sua assinatura</p>
            <p className="text-yellow-600 mt-0.5">
              Sua assinatura será adicionada automaticamente ao final de cada email.{' '}
              <button
                onClick={onAbrirAssinatura}
                className="underline font-medium"
              >
                Configurar agora
              </button>
            </p>
          </div>
        </div>
      )}

      {/* Navegação */}
      <div className="flex justify-end pt-4 border-t">
        <button
          onClick={onProximo}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
        >
          Próximo: Steps <i className="fa-solid fa-chevron-right"></i>
        </button>
      </div>
    </div>
  );
};

export default StepInfo;
