/**
 * ContratoForm.tsx — Módulo CRECI / Aba Acompanhamento
 *
 * Ficha de contrato do corretor: data do aceite, valor, status, modelo de
 * remuneração, próxima revisão e observações do acordo.
 *
 * Caminho: src/components/creci/acompanhamento/ContratoForm.tsx
 *
 * Somente leitura para Gestão Comercial (podeEscrever = false): os campos
 * ficam desabilitados e o botão de salvar não é renderizado. A permissão
 * real é aplicada no servidor — isto aqui é apenas a camada de UX.
 *
 * Regra de negócio refletida na UI: contrato com status "Finalizado" exige
 * data de aceite. A validação também existe como CHECK no banco e como
 * validação no endpoint — três camadas, mensagem única.
 *
 * Histórico:
 *  - v1.0 (23/07/2026): versão inicial.
 */

import React, { useState, useEffect } from 'react';
import type { Contrato, StatusContrato, ModeloRemuneracao } from './creciAcompanhamento.types';
import {
  LABEL_STATUS_CONTRATO,
  LABEL_MODELO_REMUNERACAO,
  formatDataHora,
} from './creciAcompanhamento.types';

interface Props {
  contrato: Contrato | null;
  podeEscrever: boolean;
  salvando: boolean;
  onSalvar: (dados: Record<string, unknown>) => Promise<unknown>;
  onSucesso: (msg: string) => void;
  onErro: (msg: string) => void;
}

interface FormState {
  numero_contrato: string;
  data_aceite: string;
  valor_contrato: string;
  status_contrato: StatusContrato;
  modelo_remuneracao: string;
  percentual_exito: string;
  proxima_revisao: string;
  observacoes: string;
}

const VAZIO: FormState = {
  numero_contrato: '',
  data_aceite: '',
  valor_contrato: '',
  status_contrato: 'pendente',
  modelo_remuneracao: '',
  percentual_exito: '',
  proxima_revisao: '',
  observacoes: '',
};

function contratoParaForm(c: Contrato | null): FormState {
  if (!c) return { ...VAZIO };
  return {
    numero_contrato: c.numero_contrato || '',
    data_aceite: c.data_aceite || '',
    valor_contrato: c.valor_contrato !== null ? String(c.valor_contrato) : '',
    status_contrato: c.status_contrato,
    modelo_remuneracao: c.modelo_remuneracao || '',
    percentual_exito: c.percentual_exito !== null ? String(c.percentual_exito) : '',
    proxima_revisao: c.proxima_revisao || '',
    observacoes: c.observacoes || '',
  };
}

const ContratoForm: React.FC<Props> = ({
  contrato,
  podeEscrever,
  salvando,
  onSalvar,
  onSucesso,
  onErro,
}) => {
  const [form, setForm] = useState<FormState>(contratoParaForm(contrato));
  const [alterado, setAlterado] = useState(false);

  // Recarrega o formulário quando o contrato muda (troca de corretor ou save)
  useEffect(() => {
    setForm(contratoParaForm(contrato));
    setAlterado(false);
  }, [contrato]);

  const set = (campo: keyof FormState, valor: string) => {
    setForm(prev => ({ ...prev, [campo]: valor }));
    setAlterado(true);
  };

  const exigePercentual =
    form.modelo_remuneracao === 'exito' || form.modelo_remuneracao === 'misto';

  const handleSalvar = async () => {
    if (form.status_contrato === 'finalizado' && !form.data_aceite) {
      onErro('Contrato finalizado exige data de aceite preenchida.');
      return;
    }

    try {
      await onSalvar({
        numero_contrato: form.numero_contrato || null,
        data_aceite: form.data_aceite || null,
        valor_contrato: form.valor_contrato === '' ? null : Number(form.valor_contrato),
        status_contrato: form.status_contrato,
        modelo_remuneracao: form.modelo_remuneracao || null,
        percentual_exito:
          exigePercentual && form.percentual_exito !== '' ? Number(form.percentual_exito) : null,
        proxima_revisao: form.proxima_revisao || null,
        observacoes: form.observacoes || null,
      });
      setAlterado(false);
      onSucesso(contrato ? 'Contrato atualizado.' : 'Contrato criado.');
    } catch (e: any) {
      onErro(e?.message || 'Erro ao salvar o contrato.');
    }
  };

  const inputCls = (dis: boolean) =>
    `w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 ${
      dis ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : ''
    }`;

  const dis = !podeEscrever || salvando;

  return (
    <div className="border border-indigo-200 rounded-lg overflow-hidden">
      <div className="px-3 py-2 bg-indigo-50 border-b border-indigo-200 flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-indigo-800 uppercase tracking-wide">
          <i className="fa-solid fa-file-signature mr-1" /> Ficha de contrato
          {!contrato && <span className="ml-2 font-normal normal-case text-indigo-600">— ainda não criada</span>}
        </span>
        <span className="text-[11px] text-indigo-600">
          {podeEscrever ? 'editável pelo SDR e pelo Administrador' : 'somente leitura'}
        </span>
      </div>

      <div className="p-3 grid md:grid-cols-3 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Data do aceite</label>
          <input
            type="date"
            value={form.data_aceite}
            disabled={dis}
            onChange={e => set('data_aceite', e.target.value)}
            className={inputCls(dis)}
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Valor do contrato (R$)</label>
          <input
            type="number"
            step="0.01"
            min="0"
            placeholder="0,00"
            value={form.valor_contrato}
            disabled={dis}
            onChange={e => set('valor_contrato', e.target.value)}
            className={inputCls(dis)}
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Status do contrato</label>
          <select
            value={form.status_contrato}
            disabled={dis}
            onChange={e => set('status_contrato', e.target.value as StatusContrato)}
            className={inputCls(dis)}
          >
            {(Object.keys(LABEL_STATUS_CONTRATO) as StatusContrato[]).map(s => (
              <option key={s} value={s}>
                {LABEL_STATUS_CONTRATO[s]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Nº do contrato</label>
          <input
            type="text"
            maxLength={60}
            placeholder="TC-2026-0000"
            value={form.numero_contrato}
            disabled={dis}
            onChange={e => set('numero_contrato', e.target.value)}
            className={inputCls(dis)}
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Modelo de remuneração</label>
          <select
            value={form.modelo_remuneracao}
            disabled={dis}
            onChange={e => set('modelo_remuneracao', e.target.value)}
            className={inputCls(dis)}
          >
            <option value="">— não definido —</option>
            {(Object.keys(LABEL_MODELO_REMUNERACAO) as ModeloRemuneracao[]).map(m => (
              <option key={m} value={m}>
                {LABEL_MODELO_REMUNERACAO[m]}
              </option>
            ))}
          </select>
        </div>

        {exigePercentual ? (
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">% de êxito</label>
            <input
              type="number"
              step="0.01"
              min="0"
              max="100"
              placeholder="20"
              value={form.percentual_exito}
              disabled={dis}
              onChange={e => set('percentual_exito', e.target.value)}
              className={inputCls(dis)}
            />
          </div>
        ) : (
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Próxima revisão</label>
            <input
              type="date"
              value={form.proxima_revisao}
              disabled={dis}
              onChange={e => set('proxima_revisao', e.target.value)}
              className={inputCls(dis)}
            />
          </div>
        )}

        {exigePercentual && (
          <div className="md:col-span-3 md:w-1/3">
            <label className="block text-xs font-medium text-gray-500 mb-1">Próxima revisão</label>
            <input
              type="date"
              value={form.proxima_revisao}
              disabled={dis}
              onChange={e => set('proxima_revisao', e.target.value)}
              className={inputCls(dis)}
            />
          </div>
        )}

        <div className="md:col-span-3">
          <label className="block text-xs font-medium text-gray-500 mb-1">Observações do acordo</label>
          <textarea
            rows={3}
            maxLength={8000}
            placeholder="O que foi acordado, condições, pendências..."
            value={form.observacoes}
            disabled={dis}
            onChange={e => set('observacoes', e.target.value)}
            className={inputCls(dis)}
          />
        </div>

        <div className="md:col-span-3 flex items-center justify-between border-t border-gray-100 pt-3 gap-3">
          <p className="text-[11px] text-gray-400">
            {contrato
              ? `Criado por ${contrato.criado_por_nome} em ${formatDataHora(contrato.criado_em)}` +
                (contrato.atualizado_por_nome
                  ? ` · última alteração: ${contrato.atualizado_por_nome} em ${formatDataHora(contrato.atualizado_em)}`
                  : '')
              : 'Nenhum contrato registrado para este corretor ainda.'}
          </p>

          {podeEscrever && (
            <button
              type="button"
              onClick={handleSalvar}
              disabled={salvando || !alterado}
              className="shrink-0 bg-indigo-600 hover:bg-indigo-700 text-white text-sm px-4 py-2 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <i className="fa-solid fa-floppy-disk mr-1" />
              {salvando ? 'Salvando...' : contrato ? 'Salvar contrato' : 'Criar contrato'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default ContratoForm;
