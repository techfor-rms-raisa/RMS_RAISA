# 📋 IMPLEMENTAÇÃO: Sistema de Exclusividade de Candidatos

## RMS-RAISA v56.0 | Data: 11/01/2026

---

## 🎯 RESUMO DA IMPLEMENTAÇÃO

### Modelo de Exclusividade
```
┌─────────────────────────────────────────────────────────────┐
│  PERÍODO BASE: 60 dias                                       │
│  ├── Dia 45: Notificação "Sua exclusividade vence em 15 dias"│
│  ├── Dia 55: Notificação "Última chance de renovar"          │
│  └── Dia 60: Expira OU Renova por mais 30 dias               │
│                                                              │
│  RENOVAÇÃO: +30 dias (máximo 2 renovações = 120 dias total)  │
│  └── Requer justificativa no sistema                         │
└─────────────────────────────────────────────────────────────┘
```

---

## ✅ CHECKLIST DE IMPLEMENTAÇÃO

### FASE 1: Banco de Dados (EXECUTAR MANUALMENTE)

| # | Tarefa | Arquivo | Status |
|---|--------|---------|--------|
| 1 | Script SQL completo | `docs/SQL_EXCLUSIVIDADE_CANDIDATOS.sql` | ✅ Criado |

**⚠️ AÇÃO NECESSÁRIA:**
```
1. Acesse o Supabase Dashboard
2. Vá em SQL Editor
3. Cole e execute o script SQL_EXCLUSIVIDADE_CANDIDATOS.sql
4. Verifique se as tabelas foram criadas
```

---

### FASE 2: Tipos e Hooks

| # | Arquivo | Alteração | Status |
|---|---------|-----------|--------|
| 2 | `src/types/types_models.ts` | Novos tipos Pessoa, ConfigExclusividade, LogExclusividade | ✅ |
| 3 | `src/hooks/supabase/usePessoas.ts` | Sistema completo de exclusividade | ✅ |
| 4 | `src/hooks/supabase/useExclusividade.ts` | Novo hook para config e notificações | ✅ |
| 5 | `src/hooks/supabase/index.ts` | Exports atualizados | ✅ |

---

### FASE 3: API Backend

| # | Arquivo | Alteração | Status |
|---|---------|-----------|--------|
| 6 | `api/linkedin/importar.ts` | Exige analista_id, seta exclusividade | ✅ |

---

### FASE 4: Serviços

| # | Arquivo | Alteração | Status |
|---|---------|-----------|--------|
| 7 | `src/services/configuracaoService.ts` | Funções de config exclusividade | ✅ |

---

### FASE 5: Componentes (A IMPLEMENTAR)

| # | Arquivo | Alteração | Status |
|---|---------|-----------|--------|
| 8 | `CVImportIA.tsx` | Passar userId para addPessoa | 🔲 Pendente |
| 9 | `BancoTalentos_v3.tsx` | Filtros de exclusividade, badges | 🔲 Pendente |
| 10 | `LinkedInImportPanel.tsx` | Passar userId na importação | 🔲 Pendente |
| 11 | `ConfiguracaoPriorizacaoDistribuicao.tsx` | Nova aba Exclusividade | 🔲 Pendente |
| 12 | `Candidaturas.tsx` | Filtros por exclusividade | 🔲 Pendente |

---

## 🗄️ ESTRUTURA DE DADOS

### Tabela: `pessoas` (colunas adicionadas)
```sql
id_analista_rs              INTEGER   -- FK para app_users
periodo_exclusividade       INTEGER   -- Default 60 dias
data_inicio_exclusividade   TIMESTAMP 
data_final_exclusividade    TIMESTAMP -- Calculada automaticamente
qtd_renovacoes              INTEGER   -- Default 0
max_renovacoes              INTEGER   -- Default 2
```

### Tabela: `config_exclusividade` (nova)
```sql
periodo_exclusividade_default  INTEGER  -- 60
periodo_renovacao              INTEGER  -- 30
max_renovacoes                 INTEGER  -- 2
dias_aviso_vencimento          INTEGER  -- 15
dias_aviso_urgente             INTEGER  -- 5
permitir_auto_renovacao        BOOLEAN  -- false
```

### Tabela: `log_exclusividade` (nova)
```sql
pessoa_id                   INTEGER
acao                        VARCHAR   -- atribuicao, renovacao, liberacao, transferencia
analista_anterior_id        INTEGER
analista_novo_id            INTEGER
realizado_por               INTEGER
motivo                      TEXT
data_exclusividade_anterior TIMESTAMP
data_exclusividade_nova     TIMESTAMP
```

### Tabela: `notificacoes_exclusividade` (nova)
```sql
pessoa_id    INTEGER
analista_id  INTEGER
tipo         VARCHAR  -- aviso_15_dias, aviso_5_dias, vencimento
titulo       VARCHAR
mensagem     TEXT
lida         BOOLEAN
acao_tomada  VARCHAR  -- renovado, liberado, ignorado
```

---

## 🔧 FUNÇÕES SQL CRIADAS

| Função | Descrição |
|--------|-----------|
| `renovar_exclusividade(pessoa_id, analista_id, motivo)` | Renova +30 dias |
| `liberar_exclusividade(pessoa_id, supervisor_id, motivo)` | Remove exclusividade |
| `transferir_exclusividade(pessoa_id, novo_analista, supervisor_id, motivo)` | Transfere para outro |

---

## 👤 PAPÉIS DE USUÁRIO

| Papel | Pode Ver | Pode Renovar | Pode Liberar | Pode Transferir |
|-------|----------|--------------|--------------|-----------------|
| Admin | Todos | Sim | Sim | Sim |
| Supervisor de R&S | Todos | Sim | Sim | Sim |
| Analista de R&S | Seus + Disponíveis | Só seus | Não | Não |
| Gestão de Pessoas | Todos (leitura) | Não | Não | Não |
| Consulta | Todos (leitura) | Não | Não | Não |

---

## 📊 FLUXO DE VISUALIZAÇÃO

### Analista de R&S
```
[Meus Candidatos]  →  Candidatos com id_analista_rs = meu_id
[Disponíveis]      →  Candidatos sem exclusividade OU expirados
```

### Supervisor / Admin
```
[Todos]            →  Todos os candidatos
[Por Analista]     →  Filtro por analista específico
[Expirando]        →  Exclusividade vencendo em 15 dias
```

---

## 🚀 PRÓXIMOS PASSOS

1. **Execute o SQL** no Supabase
2. **Faça deploy** dos arquivos atualizados
3. **Teste** a importação de CV com usuário logado
4. **Teste** a importação do LinkedIn
5. **Verifique** os filtros no Banco de Talentos

---

## 📝 COMANDOS GIT

```powershell
# No VS Code, terminal PowerShell:

# 1. Verificar alterações
git status

# 2. Adicionar arquivos modificados
git add .

# 3. Commit com mensagem descritiva
git commit -m "feat(exclusividade): Sistema de exclusividade de candidatos v56.0

- Período base 60 dias + renovação 30 dias (máx 120 dias)
- Atribuição automática ao importar CV/LinkedIn
- Filtros por exclusividade (meus/disponíveis/todos)
- Log de todas as ações de exclusividade
- Funções SQL para renovar/liberar/transferir
- Papel Supervisor de R&S
- Notificações de vencimento (15 e 5 dias)"

# 4. Push para GitHub
git push origin main

# 5. Aguardar deploy automático no Vercel
```

---

## ⚠️ NOTAS IMPORTANTES

1. **O SQL deve ser executado ANTES do deploy** - senão as queries vão falhar
2. **Teste primeiro em ambiente de dev** se tiver
3. **Backup do banco** recomendado antes de executar
4. **Papéis de usuário** - verifique se a coluna `papel` existe em `app_users`

---

*Documentação gerada em 11/01/2026*
