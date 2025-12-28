# 🚀 SPRINT 4 - DISTRIBUIÇÃO INTELIGENTE
## Instruções de Deploy

**Data:** 27/12/2024  
**Status:** PRONTO PARA DEPLOY  
**Gap resolvido:** 60% → 100%

---

## 📊 OBJETIVO

Implementar sistema completo de distribuição inteligente de vagas com:
- Priorização automática de vagas (score de urgência/importância)
- Sugestão de analistas baseada em scores
- Tracking de decisões (IA aceita vs override manual)
- Redistribuição com log completo
- Métricas de performance IA vs Manual

---

## 📁 ARQUIVOS ENTREGUES

### SQL (executar PRIMEIRO no Supabase):
```
SQL_DISTRIBUICAO_INTELIGENTE.sql    ← Criar tabelas, views e funções
```

### Novos Arquivos (criar):
```
src/hooks/supabase/usePriorizacaoDistribuicao.ts    ← Hook consolidado
```

### Arquivos Alterados (substituir):
```
src/hooks/supabase/index.ts    ← Exports atualizados
```

---

## 📂 CAMINHOS HIERÁRQUICOS

```
src/
└── hooks/
    └── supabase/
        ├── index.ts                          ✏️ ALTERADO
        ├── usePriorizacaoDistribuicao.ts     🆕 NOVO
        ├── useDistribuicaoIA.ts              (já existia, exportado)
        └── useDistribuicaoVagas.ts           (já existia, exportado)
```

---

## 🗄️ ESTRUTURAS SQL CRIADAS

### Tabelas:
| Tabela | Descrição |
|--------|-----------|
| `vaga_distribuicao` | Registro de atribuições de vagas |
| `vaga_priorizacao` | Scores de prioridade de vagas |
| `distribuicao_sugestao_ia` | Sugestões da IA para distribuição |
| `distribuicao_decisao` | Tracking IA aceita vs override |
| `redistribuicao_log` | Log de redistribuições |

### Views:
| View | Descrição |
|------|-----------|
| `vw_carga_analista` | Carga de trabalho por analista |
| `vw_performance_distribuicao` | IA vs Manual performance |
| `vw_ranking_priorizacao` | Ranking de prioridade de vagas |
| `vw_historico_redistribuicoes` | Histórico de redistribuições |
| `vw_sugestoes_ia_pendentes` | Sugestões ainda não decididas |
| `vw_metricas_distribuicao` | Métricas consolidadas |

### Função:
```sql
fn_calcular_prioridade_vaga(p_vaga_id) → (score_total, nivel, detalhes)
```

---

## 🔧 COMANDOS GIT

```bash
# 1. Adicionar novo arquivo
git add src/hooks/supabase/usePriorizacaoDistribuicao.ts

# 2. Adicionar arquivo alterado
git add src/hooks/supabase/index.ts

# 3. Commit
git commit -m "feat(raisa): Sprint 4 - Distribuição Inteligente

- Hook usePriorizacaoDistribuicao consolidado
- Priorização automática de vagas com scores
- Sugestão de analistas com ranking IA
- Tracking de decisões (IA vs Manual)
- Redistribuição com log completo
- Métricas de performance comparativas
- Views SQL para dashboards

Tabelas: vaga_distribuicao, vaga_priorizacao, distribuicao_decisao
Views: 6 views para distribuição
Gap resolvido: 60% → 100%"

# 4. Push
git push origin main
```

---

## ⚠️ ORDEM DE DEPLOY

### PASSO 1: Executar SQL no Supabase
1. Acesse **Supabase Dashboard** → **SQL Editor**
2. Cole o conteúdo de `SQL_DISTRIBUICAO_INTELIGENTE.sql`
3. Execute (Run)
4. Verifique:
```sql
-- Tabelas criadas
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name LIKE '%distribuicao%' OR table_name LIKE '%priorizacao%';

-- Views criadas
SELECT table_name FROM information_schema.views 
WHERE table_schema = 'public' AND table_name LIKE 'vw_carga%' 
OR table_name LIKE 'vw_ranking%' OR table_name LIKE 'vw_metricas%';
```

### PASSO 2: Deploy do código
1. Copie os arquivos para o projeto
2. Execute os comandos Git
3. Aguarde o deploy no Vercel

---

## ✅ FUNCIONALIDADES DO HOOK

### `usePriorizacaoDistribuicao`

| Método | Descrição |
|--------|-----------|
| `buscarRankingPriorizacao()` | Lista vagas ordenadas por prioridade |
| `calcularPrioridade(vagaId)` | Calcula score de uma vaga |
| `buscarCargaAnalistas()` | Lista carga de trabalho |
| `gerarSugestaoAnalistas(vagaId)` | Gera ranking de analistas para vaga |
| `registrarDecisao(decisao)` | Registra decisão (IA ou override) |
| `redistribuirVaga(input)` | Redistribui vaga com log |
| `buscarMetricas()` | Métricas consolidadas |
| `buscarPerformanceIA()` | Performance IA vs Manual |
| `carregarTudo()` | Carrega todos os dados |

---

## 🎨 COMO USAR

```tsx
import { usePriorizacaoDistribuicao } from '@/hooks/supabase';

const DistribuicaoPage: React.FC = () => {
  const {
    loading,
    rankingPriorizacao,
    cargaAnalistas,
    sugestaoAtual,
    metricas,
    gerarSugestaoAnalistas,
    registrarDecisao,
    carregarTudo
  } = usePriorizacaoDistribuicao();

  useEffect(() => {
    carregarTudo();
  }, []);

  const handleDistribuir = async (vagaId: number) => {
    // Gerar sugestão da IA
    const sugestao = await gerarSugestaoAnalistas(vagaId);
    
    if (sugestao && sugestao.ranking_analistas.length > 0) {
      // Aceitar sugestão da IA
      await registrarDecisao({
        vaga_id: vagaId,
        analistas_sugeridos_ia: sugestao.ranking_analistas.map(a => a.analista_id),
        analistas_escolhidos: [sugestao.ranking_analistas[0].analista_id],
        tipo_decisao: 'ia_aceita',
        decidido_por: currentUserId
      });
    }
  };

  return (
    <div>
      {/* Ranking de Priorização */}
      {rankingPriorizacao.map(vaga => (
        <div key={vaga.vaga_id}>
          <span className={`badge-${vaga.nivel_prioridade}`}>
            {vaga.nivel_prioridade.toUpperCase()}
          </span>
          <span>{vaga.titulo}</span>
          <span>Score: {vaga.score_prioridade}</span>
        </div>
      ))}

      {/* Carga de Analistas */}
      {cargaAnalistas.map(analista => (
        <div key={analista.analista_id}>
          <span>{analista.analista_nome}</span>
          <span>{analista.vagas_ativas} vagas</span>
          <span className={`carga-${analista.nivel_carga}`}>
            {analista.carga_percentual}%
          </span>
        </div>
      ))}
    </div>
  );
};
```

---

## 📊 PESOS DE SCORING (CONFIGURÁVEIS)

```typescript
const PESOS_SCORING = {
  especializacao: { peso: 30, descricao: 'Expertise na tecnologia da vaga' },
  cliente: { peso: 25, descricao: 'Histórico com o cliente' },
  carga: { peso: 20, descricao: 'Disponibilidade atual' },
  taxa_aprovacao: { peso: 15, descricao: 'Taxa histórica de aprovação' },
  velocidade: { peso: 10, descricao: 'Velocidade de fechamento' }
};
```

---

## 🧪 QUERIES DE VERIFICAÇÃO

```sql
-- Verificar ranking de priorização
SELECT * FROM vw_ranking_priorizacao LIMIT 10;

-- Verificar carga de analistas
SELECT * FROM vw_carga_analista;

-- Verificar métricas
SELECT * FROM vw_metricas_distribuicao;

-- Testar função de cálculo
SELECT * FROM fn_calcular_prioridade_vaga(1);
```

---

## 📈 STATUS DOS SPRINTS

| Sprint | Módulo | Status |
|--------|--------|--------|
| **1** | Geração de CV | ✅ CONCLUÍDO |
| **2** | Recomendação de Candidatos | ✅ CONCLUÍDO |
| **3** | Dashboards | ✅ CONCLUÍDO |
| **4** | Distribuição Inteligente | ✅ **CONCLUÍDO** |
| 5 | Finalização | ⏳ Próximo |

---

## 🚀 PRÓXIMO SPRINT

**Sprint 5: Finalização (90% → 100%)**
- Validação de integridade
- Testes de ponta a ponta
- Otimização de performance
- Documentação final

---

*Claude DEV - 27/12/2024*
