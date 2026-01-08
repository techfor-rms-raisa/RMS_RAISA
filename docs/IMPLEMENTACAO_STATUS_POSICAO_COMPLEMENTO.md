# 📋 IMPLEMENTAÇÃO STATUS_POSICAO + NOMES ANONIMIZADOS - RESUMO

## 🎯 O Que Foi Implementado

### 1️⃣ Nova Coluna `status_posicao` (Tabela Vagas)

| Valor | Descrição | Quem Atualiza |
|-------|-----------|---------------|
| `triagem` | Vaga criada, aguardando análise | Sistema (ao criar) |
| `entrevista` | Candidato em entrevista técnica | Modal Entrevista Técnica |
| `enviado_cliente` | CV enviado ao cliente | **Webhook Resend** ou Manual |
| `aguardando_cliente` | Aguardando retorno do cliente | **Webhook Resend** ou Manual |
| `entrevista_cliente` | Entrevista com cliente agendada | **Webhook Resend** ou Manual |
| `aprovado_cliente` | Cliente aprovou candidato | **Webhook Resend** ou Manual |
| `contratado` | Candidato contratado | Manual |
| `reprovado` | Processo encerrado sem sucesso | **Webhook Resend** ou Manual |

### 2️⃣ Novas Colunas de Anonimização (Tabela Pessoas)

| Coluna | Exemplo | Uso |
|--------|---------|-----|
| `nome_anoni_total` | J.S.X. | Anonimização total para envio a clientes |
| `nome_anoni_parcial` | José S.X. | Anonimização parcial para envio a clientes |

**Exemplo completo:**
- Nome: `José da Silva Xavier`
- Parcial: `José S.X.`
- Total: `J.S.X.`

---

## 📁 ARQUIVOS PARA DEPLOY

### SQL (Executar no Supabase PRIMEIRO)

| Arquivo | Descrição |
|---------|-----------|
| `add_status_posicao_vagas.sql` | Adiciona coluna status_posicao + histórico + trigger |
| `add_nomes_anonimizados_pessoas.sql` | Adiciona colunas de anonimização + funções + trigger |

### Código TypeScript

| Arquivo | Destino | Descrição |
|---------|---------|-----------|
| `types_models.ts` | `src/types/` | Interface Pessoa com campos anonimização |
| `usePessoas.ts` | `src/hooks/supabase/` | Funções de anonimização + busca por nome |
| `useVagas.ts` | `src/hooks/supabase/` | CRUD com status_posicao |
| `Vagas.tsx` | `src/components/raisa/` | Modal com campo Posição no Funil |
| `Candidaturas.tsx` | `src/components/raisa/` | Badge status_posicao da vaga |
| `email-inbound.ts` | `api/webhook/` | **Webhook atualiza status_posicao** |

---

## ⚠️ ORDEM DE EXECUÇÃO

### 1️⃣ Execute os SQLs no Supabase
```sql
-- Primeiro: status_posicao
-- Cole o conteúdo de add_status_posicao_vagas.sql

-- Segundo: nomes anonimizados
-- Cole o conteúdo de add_nomes_anonimizados_pessoas.sql
```

### 2️⃣ Substitua os arquivos no projeto

### 3️⃣ Deploy
```powershell
git add .
git commit -m "feat: status_posicao + nomes anonimizados + webhook resend"
git push origin main
```

---

## 🔄 FLUXO AUTOMÁTICO VIA WEBHOOK RESEND

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         FLUXO AUTOMÁTICO (IA + Resend)                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  📧 EMAIL ENVIADO (CV para cliente)                                         │
│  → IA detecta: tipo = "envio_cv"                                            │
│  → Busca candidato por: nome OU nome_anoni_parcial OU nome_anoni_total      │
│  → Atualiza candidatura: status = "enviado_cliente"                         │
│  → 🆕 Atualiza vaga: status_posicao = "enviado_cliente"                     │
│                                                                             │
│  📧 EMAIL RECEBIDO (Resposta do cliente)                                    │
│  → IA classifica resposta:                                                  │
│     • "agendamento" → status_posicao = "entrevista_cliente"                 │
│     • "aprovado" → status_posicao = "aprovado_cliente"                      │
│     • "reprovado" → status_posicao = "reprovado"                            │
│     • "duvida/em_analise" → status_posicao = "aguardando_cliente"           │
│  → 🆕 Atualiza vaga automaticamente                                         │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 🔍 BUSCA POR NOME ANONIMIZADO

### Como Funciona no Webhook:

1. **Primeira tentativa**: Busca por `candidato_nome` (nome completo)
2. **Se não encontrar**: Busca em `pessoas` por:
   - `nome_anoni_parcial` (ex: "José S.X.")
   - `nome_anoni_total` (ex: "J.S.X.")
3. **Encontrou pessoa**: Busca candidaturas vinculadas

### Código de Busca:
```typescript
// Busca em pessoas pelo nome anonimizado
const { data: pessoas } = await supabase
  .from('pessoas')
  .select('id, nome, nome_anoni_parcial, nome_anoni_total')
  .or(`nome_anoni_parcial.ilike.%${nome}%,nome_anoni_total.ilike.%${nome}%`)
```

---

## ✅ O QUE JÁ FUNCIONA

- [x] Coluna `status_posicao` no banco de dados
- [x] CRUD completo (criar, ler, atualizar)
- [x] Modal de edição manual no Vagas.tsx
- [x] Exibição no dropdown de Candidaturas
- [x] Badge visual ao selecionar vaga
- [x] Histórico automático de mudanças (trigger no banco)
- [x] Colunas `nome_anoni_total` e `nome_anoni_parcial`
- [x] Geração automática via trigger (banco)
- [x] Geração no frontend (usePessoas)
- [x] Webhook busca por nomes anonimizados
- [x] Webhook atualiza `status_posicao` da vaga

## 🔜 PRÓXIMOS PASSOS (Opcionais)

- [ ] Atualização automática ao assinalar analista (Distribuição IA)
- [ ] Atualização automática no Modal Entrevista Técnica
- [ ] Dashboard com visão por status_posicao
- [ ] Exibir nomes anonimizados no BancoTalentos

---

*Documento atualizado em 08/01/2026*
