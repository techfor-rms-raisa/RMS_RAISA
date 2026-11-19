/**
 * linkedinEmpresa.ts — Helpers do link do LinkedIn da empresa
 *
 * Caminho: src/components/crm/shared/utils/linkedinEmpresa.ts
 * Versão: 1.0 — 19/11/2026
 *
 * Usado por:
 *   • EmpresasTab.tsx         → coluna "LinkedIn" (Perfil / Buscar)
 *   • EmpresaFormModal.tsx    → campo "LinkedIn da empresa" (validação + normalização)
 *   • EmpresaDetailDrawer.tsx → link no painel lateral
 *
 * Fonte do dado: email_empresas.linkedin_url (já existente; a listagem
 * `listar_empresas` e o `detalhe_empresa` fazem select('*'), e
 * `criar_empresa`/`atualizar_empresa` já aceitam o campo).
 *
 * Regra de negócio: o sistema NÃO acessa o LinkedIn. Aqui só se montam
 * links que o analista abre no próprio navegador — compatível com
 * `podeUsarLinkedIn` negado para Gestão Comercial (23/03/2026).
 */

// Página de empresa no LinkedIn: company / school / showcase.
// Aceita subdomínio de país (br., in., www.) e protocolo opcional.
const RE_LINKEDIN_EMPRESA =
  /^(https?:\/\/)?([a-z0-9-]+\.)?linkedin\.com\/(company|school|showcase)\/[^\s/?#]+/i;

/**
 * true quando o valor está vazio (campo opcional) ou é um endereço de
 * página de empresa no LinkedIn.
 */
export function isLinkedinEmpresaValido(valor: string | null | undefined): boolean {
  const v = (valor || '').trim();
  return v === '' || RE_LINKEDIN_EMPRESA.test(v);
}

/**
 * Normaliza o que o analista colou: tira espaços, vazio vira null e
 * acrescenta https:// quando faltar. Valor inválido volta só aparado
 * (a validação do formulário é quem avisa).
 */
export function normalizarLinkedinEmpresa(valor: string | null | undefined): string | null {
  const v = (valor || '').trim();
  if (!v) return null;
  if (RE_LINKEDIN_EMPRESA.test(v) && !/^https?:\/\//i.test(v)) return `https://${v}`;
  return v;
}

/**
 * href pronto para abrir a página da empresa, ou null quando o campo está
 * vazio ou não é uma página de empresa do LinkedIn (nesse caso a UI mostra
 * "Buscar" em vez de um link quebrado).
 */
export function hrefLinkedinEmpresa(valor: string | null | undefined): string | null {
  const v = (valor || '').trim();
  if (!v || !RE_LINKEDIN_EMPRESA.test(v)) return null;
  return normalizarLinkedinEmpresa(v);
}

/** Busca de empresas do LinkedIn já com o nome da empresa. */
export function urlBuscaLinkedinEmpresa(nome: string): string {
  return `https://www.linkedin.com/search/results/companies/?keywords=${encodeURIComponent((nome || '').trim())}`;
}
