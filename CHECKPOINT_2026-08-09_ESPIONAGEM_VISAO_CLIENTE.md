# CHECKPOINT — 09/08/2026 — Espionagem: Visão Cliente × Concorrentes (Sessão 6)

## Contexto da sessão

Na sequência da Sessão 5 (Empresa Canônica), Messias solicitou a **operação
inversa da espionagem**: dado um CLIENTE, mapear quais CONCORRENTES o
possuem na carteira — 100% resolvido na base interna (sem Gemini), no mesmo
formato visual hierárquico da tela existente. Adendo aprovado na mesma
sessão: **edição (nome/website/domínio) e arquivamento de concorrente**,
que não existiam na UI (a action de backend já existia desde a v1.0).

Mockup estático aprovado antes do código (Regra 9):
`mockup_visao_cliente_concorrentes.html` (não versionado).

## Entregas

### SQL — `2026-08-09_espionagem_visao_cliente.sql`
- **RPC `espionagem_listar_empresas()`** (RETURNS jsonb): empresas canônicas
  com `num_concorrentes` (apenas vínculos ativos em concorrentes
  não-arquivados; filtro `num_concorrentes > 0`).
- **RPC `espionagem_analisar_empresa(p_empresa_id)`** (RETURNS jsonb):
  métricas canônicas de UMA empresa usando o **mesmo padrão de performance
  da RPC v4** (dominio_map via unnest + ramos UNION ALL equi-join +
  bool_or p/ flag corporativo + siglas 2–3 chars `~* '\y..\y'`), mais o
  mapa de concorrentes (total_clientes, descoberto_em, origem,
  cobertura_pct e data da última análise). Retorno:
  `{ empresa|null, concorrentes[], total_concorrentes }`.

### Backend — `api/crm-espionagem.ts` v2.1 (cirúrgico sobre a v2.0)
- GET `listar_empresas` e GET `analisar_empresa` (404 se empresa
  inexistente). Mesmo RBAC (Admin + GC + SDR).
- Edição/arquivamento de concorrente: NENHUMA mudança — reutiliza
  `atualizar_concorrente` (whitelist nome/website/dominio/status) da v1.0.

### Frontend — `src/components/espionagem/EspionagemPage.tsx` v2.0
- **Aba nova "🔄 Visão Cliente"**: seletor de cliente (com nº de
  concorrentes) + botão "Mapear concorrentes" → card central escuro com
  métricas canônicas e chips (⚔️ conta disputada ≥2 concorrentes,
  ✅ presença TechFor, oportunidade intocada, frio +90d, só e-mail
  pessoal) → grid de cards de concorrentes (contas na carteira, "na
  carteira desde", origem gemini/manual, 🔥 descoberto ≤7d, cobertura %).
  Empresas carregadas lazy ao abrir a aba. Ajuste aprovado vs mockup:
  seletor de cliente DENTRO da aba (não na barra superior), para não
  conflitar com o seletor de concorrente.
- **✏️ Editar concorrente**: botão na barra abre form inline
  (nome/website/domínio) → PATCH `atualizar_concorrente`.
- **🗄️ Arquivar concorrente**: `window.confirm` → `status='arquivado'`
  (remoção LÓGICA — carteira e histórico preservados; reversível via SQL:
  `UPDATE espionagem_concorrentes SET status='ativo' WHERE id=X`).
- Sub-componente novo `VisaoClienteHierarquica`; nada das 3 abas
  existentes foi alterado.

## Validação

- Preview: migrações aplicadas (incl. paridade da RPC v4), smoke
  estrutural OK, deploy preview OK (commit `dd1ae697`).
- Production: release `main` (commit `4d410b2f..fe8e4365`), SQL aplicado,
  smoke Bloco 4 OK, teste visual da aba e dos botões ✏️/🗄️ OK —
  validado por Messias em 09/08/2026.
- Nota pós-teste: concorrentes de teste foram ARQUIVADOS em Production —
  seletores vazios na tela são o comportamento esperado do filtro
  (Visão Cliente só exibe empresas com vínculo ativo em concorrente
  não-arquivado).

## Lições / padrões reforçados

1. Motor de cruzamento: SEMPRE padrão v4 (dominio_map + UNION ALL
   equi-joins) em qualquer RPC nova que cruze domínios — nunca
   `= ANY(array) OR IN (subquery)` em JOIN.
2. Reuso de actions: antes de criar endpoint novo para UI nova, verificar
   whitelist das actions existentes (edição de concorrente já existia).
3. Mockup aprovado pode ter ajuste de implementação documentado
   (posicionamento do seletor) — registrar a divergência e o motivo.

## Pendências / Próximos passos

- [ ] (Operacional) Recadastrar concorrentes reais em Production (os de
      teste foram arquivados) — via Novo Concorrente + descoberta Gemini
- [ ] (Backlog UX) chip "disputado" também nos cards da aba Resultado
- [ ] (Backlog curadoria) mesclar canônicas duplicadas ("CVC" × "CVC Corp")
- [ ] (Higiene) adicionar `mockup_*.html` ao `.gitignore`
- Demais pendências gerais inalteradas (Sub-fase 3.B, TTL R1–R5, Camada D,
  Apollo key, governance patch, etc.)

## Arquivos da sessão

| Arquivo | Caminho | Versão |
|---------|---------|--------|
| 2026-08-09_espionagem_visao_cliente.sql | migrações (raiz do repo) | RPCs listar/analisar empresa |
| crm-espionagem.ts | api/crm-espionagem.ts | v2.1 |
| EspionagemPage.tsx | src/components/espionagem/EspionagemPage.tsx | v2.0 |
