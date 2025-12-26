# 🚀 INSTRUÇÕES GIT - FASE 4: Distribuição Inteligente
## RMS_RAISA - Deploy 26/12/2024

---

## 📋 RESUMO DA FUNCIONALIDADE

Sistema de **distribuição automática de candidatos** entre múltiplos analistas:

### 🎯 Funcionalidades:
- ✅ Atribuir 2+ analistas por vaga
- ✅ Alternância automática (round-robin)
- ✅ Balanceamento por carga (quem tem menos recebe)
- ✅ Limite máximo de candidatos por analista
- ✅ Pausar/ativar analistas
- ✅ Redistribuição manual
- ✅ Histórico completo de distribuições
- ✅ Trigger automático em novos candidatos

---

## 📦 ARQUIVOS PARA DEPLOY (4 arquivos)

| # | Arquivo | Destino | Descrição |
|---|---------|---------|-----------|
| 1 | `distribuicao_vagas.sql` | `database/` | Schema SQL completo |
| 2 | `useDistribuicaoVagas.ts` | `src/hooks/supabase/` | Hook de distribuição |
| 3 | `DistribuicaoVagasPanel.tsx` | `src/components/raisa/` | UI de configuração |
| 4 | `INSTRUCOES_GIT_DISTRIBUICAO.md` | `docs/` | Este arquivo |

---

## 🗄️ ESTRUTURA DO BANCO DE DADOS

### Novas Tabelas:

```sql
-- Vincula analistas às vagas
vaga_analista_distribuicao
├── id
├── vaga_id
├── analista_id
├── ativo
├── percentual_distribuicao (peso %)
├── max_candidatos (limite)
├── candidatos_atribuidos (contador)
├── ordem_alternancia (1, 2, 3...)
└── ultimo_candidato_em

-- Histórico de distribuições
distribuicao_candidato_historico
├── id
├── candidatura_id
├── vaga_id
├── analista_id
├── tipo_atribuicao (automatica/manual/redistribuicao)
├── motivo_redistribuicao
├── analista_anterior_id
└── atribuido_em
```

### Nova Coluna em `candidaturas`:
```sql
analista_responsavel_id INTEGER REFERENCES app_users(id)
```

### Funções SQL:
- `fn_distribuir_candidato_automatico()` - Distribui round-robin
- `fn_redistribuir_candidato()` - Redistribuição manual
- `trg_distribuir_candidato_novo()` - Trigger automático

---

## 🔧 PASSO 1: EXECUTAR SQL NO SUPABASE

**⚠️ IMPORTANTE: Execute ANTES do deploy!**

1. Acesse **Supabase Dashboard**
2. Vá em **SQL Editor**
3. Cole o conteúdo de `distribuicao_vagas.sql`
4. Execute

### Verificação:
```sql
-- Deve retornar 2 tabelas
SELECT table_name FROM information_schema.tables 
WHERE table_name IN ('vaga_analista_distribuicao', 'distribuicao_candidato_historico');

-- Deve retornar as funções
SELECT routine_name FROM information_schema.routines 
WHERE routine_name LIKE '%distribu%';
```

---

## 🖥️ PASSO 2: COPIAR ARQUIVOS

```
src/
├── hooks/supabase/
│   └── useDistribuicaoVagas.ts   ← NOVO
└── components/raisa/
    └── DistribuicaoVagasPanel.tsx ← NOVO
```

---

## 🖥️ PASSO 3: COMANDOS GIT

```powershell
# 1. Atualizar main
git checkout main
git pull origin main

# 2. Criar branch
git checkout -b feature/distribuicao-inteligente

# 3. Adicionar arquivos
git add src/hooks/supabase/useDistribuicaoVagas.ts
git add src/components/raisa/DistribuicaoVagasPanel.tsx
git add database/distribuicao_vagas.sql

# 4. Verificar
git status

# 5. Commit
git commit -m "feat(raisa): implementa distribuição inteligente de vagas

- Distribuição round-robin entre múltiplos analistas
- Balanceamento automático por carga
- Limite máximo por analista
- Histórico completo de atribuições
- Trigger automático em novos candidatos
- UI de configuração e monitoramento"

# 6. Push
git push -u origin feature/distribuicao-inteligente

# 7. Merge
git checkout main
git merge feature/distribuicao-inteligente
git push origin main
```

---

## 🔄 COMO FUNCIONA A DISTRIBUIÇÃO

### Exemplo com 2 analistas:

```
Vaga: Desenvolvedor Java Senior
├── Analista A (Maria) - ordem 1
└── Analista B (João) - ordem 2

Candidato 1 chega → Maria (tem 0)
Candidato 2 chega → João (tem 0, Maria tem 1)
Candidato 3 chega → João (tem 1, Maria tem 1, João é próximo na ordem)
Candidato 4 chega → Maria (tem 1, João tem 2)
...
```

### Algoritmo:
1. Busca analistas ativos da vaga
2. Ordena por `candidatos_atribuidos ASC`
3. Atribui ao primeiro disponível
4. Atualiza contador

---

## 🧪 TESTES

### Teste 1: Configurar Distribuição
1. Abrir uma vaga no RAISA
2. Clicar em "Distribuição" (ou integrar o painel)
3. Adicionar 2 analistas
4. Verificar se aparecem na lista

### Teste 2: Distribuição Automática
1. Com distribuição configurada
2. Criar nova candidatura na vaga
3. Verificar se `analista_responsavel_id` foi preenchido
4. Verificar histórico

### Teste 3: Redistribuição Manual
1. Na listagem de candidatos
2. Usar função de redistribuir
3. Verificar se mudou de analista
4. Verificar histórico

---

## 🔗 INTEGRAÇÃO COM OUTRAS TELAS

### Para usar o painel na tela de Vagas:

```tsx
import DistribuicaoVagasPanel from '@/components/raisa/DistribuicaoVagasPanel';

// No componente Vagas.tsx ou VagasConsultar.tsx
const [showDistribuicao, setShowDistribuicao] = useState(false);
const [vagaSelecionada, setVagaSelecionada] = useState<number | null>(null);

// Botão na listagem
<button onClick={() => {
  setVagaSelecionada(vaga.id);
  setShowDistribuicao(true);
}}>
  👥 Distribuição
</button>

// Modal
{showDistribuicao && vagaSelecionada && (
  <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
    <div className="w-full max-w-3xl">
      <DistribuicaoVagasPanel
        vagaId={vagaSelecionada}
        onClose={() => setShowDistribuicao(false)}
        currentUserId={currentUser?.id}
      />
    </div>
  </div>
)}
```

### Para usar o hook em Candidaturas:

```tsx
import { useDistribuicaoVagas } from '@/hooks/supabase/useDistribuicaoVagas';

const { redistribuirCandidato } = useDistribuicaoVagas();

// Redistribuir candidato
await redistribuirCandidato(
  candidaturaId,
  novoAnalistaId,
  'Motivo da redistribuição',
  currentUserId
);
```

---

## 📊 CONSULTAS ÚTEIS

```sql
-- Ver distribuição de uma vaga
SELECT * FROM vw_distribuicao_vagas WHERE vaga_id = 123;

-- Candidatos por analista
SELECT 
  au.nome,
  COUNT(*) as total
FROM candidaturas c
JOIN app_users au ON au.id = c.analista_responsavel_id
WHERE c.vaga_id = 123
GROUP BY au.nome;

-- Histórico recente
SELECT * FROM distribuicao_candidato_historico
ORDER BY atribuido_em DESC
LIMIT 20;
```

---

## ⚠️ OBSERVAÇÕES

1. O **trigger automático** só funciona se houver analistas configurados
2. Se todos analistas atingirem o limite, candidatos ficam sem atribuição
3. Analistas **pausados** não recebem novos candidatos
4. A **redistribuição** atualiza os contadores automaticamente

---

**Claude DEV**  
**Data:** 26/12/2024  
**Versão:** 1.0
