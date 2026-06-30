/**
 * sanitizarHtmlRespostas.ts — Sanitização XSS para HTML de respostas
 *                            de email exibidos no CRM E-mail.
 *
 * Caminho: src/components/crm/shared/utils/sanitizarHtmlRespostas.ts
 * Versão: 1.0 (Pacote P1 — 30/06/2026)
 *
 * Por que existe (Claude Riscos):
 *   Os emails dos leads chegam via webhook Resend e são gravados em
 *   `email_respostas.corpo_html` SEM SANITIZAÇÃO no momento do insert.
 *   Renderizar isso direto via `dangerouslySetInnerHTML` no React abre
 *   um vetor de XSS armazenado — qualquer lead pode mandar uma resposta
 *   com `<script>`, `<iframe>`, `onload` etc. e executar JS no contexto
 *   do operador (Tatiana, Marcos, Roseni, Débora, Messias) — sequestro
 *   de sessão Supabase, exfiltração de dados, escalada para conta admin.
 *
 *   A decisão de produto (Messias, 30/06/2026 item 6): "conteúdo é
 *   corporativo, sem dados pessoais sensíveis" — mas isso é argumento
 *   de RISCO de NEGÓCIO (LGPD), não de segurança técnica (XSS). XSS
 *   não depende de boa-fé do remetente: emails podem ser falsificados,
 *   spoofados, ou conter payloads de pentesters. Logo, esta sanitização
 *   é OBRIGATÓRIA — defesa em camadas, mesmo com baixo risco percebido.
 *
 * Estratégia:
 *   DOMPurify com whitelist CONSERVADORA. Permite só o que faz sentido
 *   para visualizar conversas profissionais por email.
 *
 *   Permitido:
 *     • Parágrafos: p, br, span, div
 *     • Ênfase: strong, em, b, i, u
 *     • Listas: ul, ol, li
 *     • Tabelas básicas: table, thead, tbody, tr, td, th
 *     • Citações: blockquote
 *     • Links: a com href https/mailto (target=_blank + rel=noopener)
 *     • Imagens: img com src https (impede data: e javascript:)
 *     • Hr, code, pre (úteis para emails técnicos)
 *
 *   Removido:
 *     • TODOS os scripts, iframes, objects, embeds
 *     • Event handlers (onclick, onload, onerror, etc.)
 *     • Estilos perigosos (expression(), url(javascript:), behavior)
 *     • Tags meta/link/style no HEAD (vazia de qualquer forma)
 *     • Inline styles complexos (mantém só os essenciais via whitelist)
 *
 * Dependência: dompurify (~12kb gzipped). Instalação:
 *   npm install dompurify
 *   npm install --save-dev @types/dompurify
 *
 * Fallback (caso DOMPurify falhe a importar): retorna string vazia
 *   ao invés de HTML não-sanitizado. Componente exibirá "(corpo
 *   indisponível)" — escolha segura por padrão.
 */

import DOMPurify from 'dompurify';

// ════════════════════════════════════════════════════════════
// CONFIGURAÇÃO — Whitelist conservadora
// ════════════════════════════════════════════════════════════

const TAGS_PERMITIDAS = [
  // Estrutura básica
  'p', 'br', 'div', 'span',
  // Ênfase
  'strong', 'b', 'em', 'i', 'u', 's',
  // Cabeçalhos (úteis em emails)
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  // Listas
  'ul', 'ol', 'li',
  // Citações e separadores
  'blockquote', 'hr',
  // Tabelas
  'table', 'thead', 'tbody', 'tr', 'td', 'th',
  // Links e mídia
  'a', 'img',
  // Código
  'code', 'pre',
];

const ATRIBUTOS_PERMITIDOS = [
  // Estrutura
  'class',
  // Links
  'href', 'target', 'rel', 'title',
  // Imagens
  'src', 'alt', 'width', 'height',
  // Tabelas
  'colspan', 'rowspan', 'align',
];

const URIs_PERMITIDAS = /^(https?:|mailto:|tel:|#)/i;

// ════════════════════════════════════════════════════════════
// FUNÇÃO PRINCIPAL
// ════════════════════════════════════════════════════════════

/**
 * Sanitiza HTML cru de respostas de email para exibição segura
 * via `dangerouslySetInnerHTML`.
 *
 * Robustez:
 *   - Se input for null/undefined/string vazia → retorna ''
 *   - Se DOMPurify lançar exceção → retorna ''
 *   - Adiciona target=_blank + rel=noopener noreferrer em todos os
 *     links de saída (previne tabnabbing + vazamento de Referer)
 *
 * @param html  HTML cru vindo do banco (email_respostas.corpo_html
 *              ou similar). Pode ser malicioso.
 * @returns     HTML sanitizado, seguro para renderização.
 */
export function sanitizarHtmlRespostas(html: string | null | undefined): string {
  if (!html || typeof html !== 'string' || html.trim().length === 0) {
    return '';
  }

  try {
    // Hook: forçar target/rel em links externos.
    //   Sem isso, links abrem na mesma janela (perdendo o contexto
    //   do CRM) e expõem o Referer ao destino (vazamento de URL
    //   interna).
    if (typeof DOMPurify.addHook === 'function') {
      DOMPurify.removeAllHooks();
      DOMPurify.addHook('afterSanitizeAttributes', (node: any) => {
        if (node.nodeName === 'A' && node.getAttribute) {
          node.setAttribute('target', '_blank');
          node.setAttribute('rel', 'noopener noreferrer');
        }
      });
    }

    const limpo = DOMPurify.sanitize(html, {
      ALLOWED_TAGS: TAGS_PERMITIDAS,
      ALLOWED_ATTR: ATRIBUTOS_PERMITIDOS,
      ALLOWED_URI_REGEXP: URIs_PERMITIDAS,
      // Bloqueia data:image e qualquer outro esquema não-explicitamente-permitido
      ALLOW_DATA_ATTR: false,
      // Conserva conteúdo de tags removidas como texto (evita perda de info
      // quando algo inocente foi indevidamente bloqueado).
      KEEP_CONTENT: true,
      // Sem comentários HTML (evita leakage de info interna do cliente do lead).
      ALLOW_UNKNOWN_PROTOCOLS: false,
    });

    return typeof limpo === 'string' ? limpo : '';
  } catch (e) {
    // Falha catastrófica → devolve vazio (escolha segura por padrão).
    // O componente vai exibir o fallback "(corpo indisponível)".
    console.warn('[sanitizarHtmlRespostas] Falha ao sanitizar:', e);
    return '';
  }
}

export default sanitizarHtmlRespostas;
