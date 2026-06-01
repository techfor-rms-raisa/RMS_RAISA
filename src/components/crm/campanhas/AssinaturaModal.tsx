/**
 * AssinaturaModal.tsx — Modal de gestão de assinatura
 *
 * Caminho: src/components/crm/campanhas/AssinaturaModal.tsx
 * Versão: 3.0 (Fase E-1/E-2 — 01/06/2026) — RECONSTRUÍDO
 *
 * Histórico:
 *  - v1.0 (30/05/2026 — Fase 1D): modal "Minha Assinatura" simples,
 *    1 assinatura por user_email, sem RBAC, sem seletor de pessoa.
 *  - v2.0 (01/06/2026 — Fase D): título "Assinatura", seletor de
 *    pessoa, modo readOnly, ConfirmDialog. ⚠️ Esta versão foi
 *    entregue mas o arquivo do disco do desenvolvedor não foi
 *    sobrescrito (limitação do Windows Defender + VS Code).
 *  - v3.0 (01/06/2026 — Fase E-1/E-2): RECONSTRUÍDO do zero
 *    consolidando o contrato esperado pelo AssinaturasPage v1.2/v1.3
 *    (props readOnly/pessoas/pessoaBloqueada + tipo PessoaAssinatura)
 *    e já com o campo "Unidade do grupo" introduzido pela Fase E-1.
 *
 * Contrato (props):
 *  - aberto: controla a visibilidade.
 *  - assinatura: valor atual em edição (Partial<Assinatura>).
 *  - saving: indica salvamento em andamento (desabilita o botão).
 *  - onChange / onSalvar / onFechar: handlers padrão.
 *  - readOnly?: quando true, todos os campos ficam desabilitados e
 *    o footer mostra apenas "Fechar" (sem botão Salvar).
 *  - pessoas?: lista de pessoas elegíveis (PessoaAssinatura[]). Se
 *    presente, exibe o seletor de pessoa no topo. Ao escolher uma
 *    pessoa, o modal preenche user_email/nome_completo/email_assinatura.
 *  - pessoaBloqueada?: quando true, a pessoa fica fixa (read-only)
 *    mesmo com `pessoas` informadas — usado em "Editar".
 *
 * Comportamento da Unidade (Fase E-1):
 *  - Sempre presente como dropdown.
 *  - LOCKED (somente leitura) quando se está editando uma assinatura
 *    existente (assinatura.id presente). Trocar a unidade depois de
 *    criada exigiria mover a linha entre chaves compostas — não dá.
 *    Para mudar de unidade, criar uma nova ou excluir a atual.
 *  - SELECIONÁVEL quando se está criando uma nova (assinatura.id
 *    ausente). Default é UNIDADE_PADRAO (TechFor TI).
 */

import React, { useMemo } from 'react';
import { UNIDADES_GRUPO, UNIDADE_PADRAO } from '../types/crm.constants';
import type { Assinatura, PessoaAssinatura } from '../types/crm.types';

// Re-export para que AssinaturasPage continue importando de aqui
// (compat com import `import AssinaturaModal, { PessoaAssinatura } from '...'`).
export type { PessoaAssinatura };

// ════════════════════════════════════════════════════════════
// PROPS
// ════════════════════════════════════════════════════════════

export interface AssinaturaModalProps {
  aberto: boolean;
  assinatura: Partial<Assinatura>;
  saving: boolean;
  onChange: (next: Partial<Assinatura>) => void;
  onSalvar: () => void;
  onFechar: () => void;
  /** Quando true, modal vira somente-leitura. Footer só com "Fechar". */
  readOnly?: boolean;
  /** Lista de pessoas elegíveis (Admin/GC/SDR ativos). Se presente, mostra o seletor de pessoa. */
  pessoas?: PessoaAssinatura[];
  /** Quando true, a pessoa fica fixa mesmo com `pessoas` informadas. */
  pessoaBloqueada?: boolean;
}

// ════════════════════════════════════════════════════════════
// COMPONENTE
// ════════════════════════════════════════════════════════════

const AssinaturaModal: React.FC<AssinaturaModalProps> = ({
  aberto,
  assinatura,
  saving,
  onChange,
  onSalvar,
  onFechar,
  readOnly = false,
  pessoas,
  pessoaBloqueada = false,
}) => {
  if (!aberto) return null;

  const isEdicao = typeof assinatura.id === 'number';
  const unidadeAtual = assinatura.unidade || UNIDADE_PADRAO;
  const temSeletorPessoa = Array.isArray(pessoas) && pessoas.length > 0;
  const pessoaAtual = useMemo(() => {
    if (!temSeletorPessoa) return null;
    return pessoas!.find((p) => p.email_usuario === assinatura.user_email) || null;
  }, [pessoas, temSeletorPessoa, assinatura.user_email]);

  // Setter genérico para qualquer campo escalar de Assinatura
  const setField = <K extends keyof Assinatura>(key: K, value: Assinatura[K]) => {
    onChange({ ...assinatura, [key]: value });
  };

  // Setter customizado para o seletor de pessoa — preenche também
  // user_email, nome_completo e email_assinatura ao escolher.
  const setPessoa = (email: string) => {
    if (!email) {
      onChange({ ...assinatura, user_email: '' });
      return;
    }
    const p = pessoas?.find((x) => x.email_usuario === email);
    if (!p) {
      onChange({ ...assinatura, user_email: email });
      return;
    }
    onChange({
      ...assinatura,
      user_email: p.email_usuario,
      // Pré-preenche campos textuais — usuário pode editar livremente depois
      nome_completo: assinatura.nome_completo || p.nome_usuario,
      email_assinatura: assinatura.email_assinatura || p.email_usuario,
    });
  };

  const disabledFields = readOnly;
  const camposObrigatoriosOk =
    !!assinatura.nome_completo && !!assinatura.email_assinatura && !!assinatura.user_email;

  // Estilo comum dos inputs (com variação para disabled/read-only)
  const inputClass =
    'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm ' +
    (disabledFields ? 'bg-gray-50 text-gray-600 cursor-not-allowed' : '');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h3 className="text-lg font-bold text-gray-900">
            {readOnly ? 'Consultar assinatura' : isEdicao ? 'Editar assinatura' : 'Nova assinatura'}
          </h3>
          <button
            onClick={onFechar}
            className="text-gray-400 hover:text-gray-600 text-xl"
            aria-label="Fechar"
          >
            <i className="fa-solid fa-xmark"></i>
          </button>
        </div>

        {/* Form */}
        <div className="px-6 py-4 space-y-4">
          {/* Seletor de pessoa — só aparece se `pessoas` foi fornecida */}
          {temSeletorPessoa && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Pessoa {!pessoaBloqueada && !readOnly && '*'}
              </label>
              {pessoaBloqueada || readOnly ? (
                <div className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-gray-50 text-gray-700">
                  {pessoaAtual ? (
                    <>
                      {pessoaAtual.nome_usuario}
                      <span className="text-xs text-gray-500 ml-2">
                        ({pessoaAtual.tipo_usuario}) — {pessoaAtual.email_usuario}
                      </span>
                    </>
                  ) : (
                    <span className="text-gray-400 italic">
                      {assinatura.user_email || '—'}
                    </span>
                  )}
                </div>
              ) : (
                <select
                  value={assinatura.user_email || ''}
                  onChange={(e) => setPessoa(e.target.value)}
                  className={inputClass}
                  disabled={disabledFields}
                >
                  <option value="">Selecionar pessoa...</option>
                  {pessoas!.map((p) => (
                    <option key={p.id} value={p.email_usuario}>
                      {p.nome_usuario} ({p.tipo_usuario}) — {p.email_usuario}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          {/* 🆕 Fase E-1: Unidade do grupo */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Unidade do grupo *
            </label>
            {isEdicao || readOnly ? (
              <div className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-gray-50 text-gray-700">
                {unidadeAtual}
                {isEdicao && !readOnly && (
                  <span className="text-xs text-gray-500 ml-2">
                    (fixo após criada — para trocar de unidade, crie uma nova)
                  </span>
                )}
              </div>
            ) : (
              <select
                value={unidadeAtual}
                onChange={(e) => setField('unidade', e.target.value)}
                className={inputClass}
                disabled={disabledFields}
              >
                {UNIDADES_GRUPO.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            )}
            <p className="text-xs text-gray-400 mt-1">
              Esta assinatura será usada nas campanhas desta unidade. Cada pessoa pode ter uma assinatura por unidade.
            </p>
          </div>

          {/* Nome completo */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Nome completo *
            </label>
            <input
              type="text"
              value={assinatura.nome_completo || ''}
              onChange={(e) => setField('nome_completo', e.target.value)}
              placeholder="Ex: Tatiana Santos da Silva Cruz"
              className={inputClass}
              disabled={disabledFields}
            />
          </div>

          {/* Cargo */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Cargo
            </label>
            <input
              type="text"
              value={assinatura.cargo || ''}
              onChange={(e) => setField('cargo', e.target.value)}
              placeholder="Ex: Gerente de Negócios"
              className={inputClass}
              disabled={disabledFields}
            />
          </div>

          {/* E-mail da assinatura */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Email na assinatura *
            </label>
            <input
              type="email"
              value={assinatura.email_assinatura || ''}
              onChange={(e) => setField('email_assinatura', e.target.value)}
              placeholder="Ex: tsilva@techforti.com.br"
              className={inputClass}
              disabled={disabledFields}
            />
            <p className="text-xs text-gray-400 mt-1">
              Email institucional do remetente. Geralmente é o mesmo em todas as unidades.
            </p>
          </div>

          {/* Telefones */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Telefone fixo
              </label>
              <input
                type="text"
                value={assinatura.telefone_fixo || ''}
                onChange={(e) => setField('telefone_fixo', e.target.value)}
                placeholder="+55 (11) 3138-5800"
                className={inputClass}
                disabled={disabledFields}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Celular
              </label>
              <input
                type="text"
                value={assinatura.telefone_celular || ''}
                onChange={(e) => setField('telefone_celular', e.target.value)}
                placeholder="+55 (11) 9 9484-4169"
                className={inputClass}
                disabled={disabledFields}
              />
            </div>
          </div>

          {/* Websites */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Websites (um por linha)
            </label>
            <textarea
              value={(assinatura.websites || []).join('\n')}
              onChange={(e) =>
                setField('websites', e.target.value.split('\n').filter(Boolean))
              }
              rows={2}
              placeholder={
                unidadeAtual === 'TechCob BPO'
                  ? 'http://www.techcob.com.br'
                  : unidadeAtual === 'TechBoat'
                  ? 'http://www.techboat.com.br'
                  : 'http://www.techforti.com.br'
              }
              className={inputClass}
              disabled={disabledFields}
            />
            <p className="text-xs text-gray-400 mt-1">
              Use o site da unidade comercial selecionada acima. Apenas o primeiro será exibido no rodapé do e-mail.
            </p>
          </div>

          {/* Política de Privacidade */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              URL Política de Privacidade
            </label>
            <input
              type="url"
              value={assinatura.politica_privacidade_url || ''}
              onChange={(e) => setField('politica_privacidade_url', e.target.value)}
              placeholder="https://outsourcing.techforti.online/privacidade/"
              className={inputClass}
              disabled={disabledFields}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 px-6 py-4 border-t bg-gray-50">
          <button
            onClick={onFechar}
            className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-100"
          >
            {readOnly ? 'Fechar' : 'Cancelar'}
          </button>
          {!readOnly && (
            <button
              onClick={onSalvar}
              disabled={saving || !camposObrigatoriosOk}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? (
                <i className="fa-solid fa-spinner fa-spin"></i>
              ) : (
                <i className="fa-solid fa-floppy-disk"></i>
              )}
              Salvar assinatura
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default AssinaturaModal;
