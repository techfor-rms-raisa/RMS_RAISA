/**
 * AtividadeFormModal.tsx — Módulo CRECI / Aba Acompanhamento
 *
 * Modal de registro e edição de atividade do corretor: conversas, acordos,
 * reuniões, notas — com follow-up opcional.
 *
 * Caminho: src/components/creci/acompanhamento/AtividadeFormModal.tsx
 *
 * Renderizado apenas para perfis com escrita (SDR e Administrador). Na
 * edição, a autoria original NÃO é reescrita: quem executou a ação continua
 * sendo quem executou, mesmo que outra pessoa corrija o texto — regra
 * aplicada no backend.
 *
 * `data_atividade` é separada de `criado_em` de propósito: permite registrar
 * hoje uma conversa de ontem sem bagunçar a ordem da timeline.
 *
 * Histórico:
 *  - v1.0 (23/07/2026): versão inicial.
 */

import React, { useState, useEffect } from 'react';
import type { Atividade, TipoAtividade, Contrato } from './creciAcompanhamento.types';
import { LABEL_TIPO_ATIVIDADE, paraInputDateTime } from './creciAcompanhamento.types';

interface Props {
  aberto: boolean;
  atividade: Atividade | null; // null = criação
  contrato: Contrato | null;
  salvando: boolean;
  onFechar: () => void;
  onSalvar: (dados: Record<string, unknown>, atividadeId: number | null) => Promise<unknown>;
  onSucesso: (msg: string) => void;
  onErro: (msg: string) => void;
}

const AtividadeFormModal: React.FC<Props> = ({
  aberto,
  atividade,
  contrato,
  salvando,
  onFechar,
  onSalvar,
  onSucesso,
  onErro,
}) => {
  const [tipo, setTipo] = useState<TipoAtividade>('conversa');
  const [dataAtividade, setDataAtividade] = useState(paraInputDateTime(null));
  const [descricao, setDescricao] = useState('');
  const [fupEm, setFupEm] = useState('');
  const [vincularContrato, setVincularContrato] = useState(false);

  useEffect(() => {
    if (!aberto) return;
    if (atividade) {
      setTipo(atividade.tipo);
      setDataAtividade(paraInputDateTime(atividade.data_atividade));
      setDescricao(atividade.descricao);
      setFupEm(atividade.fup_em || '');
      setVincularContrato(!!atividade.contrato_id);
    } else {
      setTipo('conversa');
      setDataAtividade(paraInputDateTime(null));
      setDescricao('');
      setFupEm('');
      setVincularContrato(false);
    }
  }, [aberto, atividade]);

  if (!aberto) return null;

  const handleSalvar = async () => {
    if (!descricao.trim()) {
      onErro('Descreva o que foi conversado antes de salvar.');
      return;
    }
    if (!dataAtividade) {
      onErro('Informe a data da conversa.');
      return;
    }

    try {
      await onSalvar(
        {
          tipo,
          data_atividade: new Date(dataAtividade).toISOString(),
          descricao: descricao.trim(),
          fup_em: fupEm || null,
          contrato_id: vincularContrato && contrato ? contrato.id : null,
        },
        atividade?.id ?? null
      );
      onSucesso(atividade ? 'Atividade atualizada.' : 'Atividade registrada.');
      onFechar();
    } catch (e: any) {
      onErro(e?.message || 'Erro ao salvar a atividade.');
    }
  };

  const inputCls =
    'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500';

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl w-full max-w-lg shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between sticky top-0 bg-white">
          <h3 className="font-semibold text-gray-800">
            {atividade ? 'Editar atividade' : 'Registrar atividade'}
          </h3>
          <button
            type="button"
            onClick={onFechar}
            className="text-gray-400 hover:text-gray-600"
            aria-label="Fechar"
          >
            <i className="fa-solid fa-xmark" />
          </button>
        </div>

        <div className="p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Tipo</label>
              <select
                value={tipo}
                onChange={e => setTipo(e.target.value as TipoAtividade)}
                className={inputCls}
              >
                {(Object.keys(LABEL_TIPO_ATIVIDADE) as TipoAtividade[]).map(t => (
                  <option key={t} value={t}>
                    {LABEL_TIPO_ATIVIDADE[t]}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Data da conversa</label>
              <input
                type="datetime-local"
                value={dataAtividade}
                onChange={e => setDataAtividade(e.target.value)}
                className={inputCls}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              Descrição <span className="text-red-500">*</span>
            </label>
            <textarea
              rows={5}
              maxLength={8000}
              placeholder="O que foi conversado, o que ficou acordado, próximos passos..."
              value={descricao}
              onChange={e => setDescricao(e.target.value)}
              className={inputCls}
            />
            <p className="text-[11px] text-gray-400 mt-1">{descricao.length}/8000</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Agendar follow-up para
              </label>
              <input
                type="date"
                value={fupEm}
                onChange={e => setFupEm(e.target.value)}
                className={inputCls}
              />
              <p className="text-[11px] text-gray-400 mt-1">Opcional. Aparece como alerta na carteira.</p>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Vincular ao contrato</label>
              {contrato ? (
                <label className="flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-lg text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={vincularContrato}
                    onChange={e => setVincularContrato(e.target.checked)}
                    className="rounded border-gray-300"
                  />
                  <span className="text-gray-700 truncate">
                    {contrato.numero_contrato || `Contrato #${contrato.id}`}
                  </span>
                </label>
              ) : (
                <p className="px-3 py-2 border border-gray-200 rounded-lg text-xs text-gray-400 bg-gray-50">
                  Nenhum contrato criado ainda
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="px-4 py-3 border-t border-gray-200 flex justify-end gap-2 sticky bottom-0 bg-white">
          <button
            type="button"
            onClick={onFechar}
            disabled={salvando}
            className="px-4 py-2 text-sm border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-40"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSalvar}
            disabled={salvando || !descricao.trim()}
            className="px-4 py-2 text-sm bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {salvando ? 'Salvando...' : atividade ? 'Salvar alterações' : 'Salvar atividade'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AtividadeFormModal;
