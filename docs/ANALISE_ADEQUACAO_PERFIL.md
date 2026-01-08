# 🎯 Análise de Adequação de Perfil - RAISA

## Visão Geral

Nova funcionalidade que realiza **análise profunda requisito a requisito** entre um candidato e uma vaga, indo muito além do simples match de skills.

### Características Principais

- ✅ **Análise Requisito a Requisito**: Cada requisito da vaga é analisado individualmente
- ✅ **Níveis de Adequação Granulares**: Atende, Atende Parcialmente, Gap Identificado
- ✅ **Evidências Contextuais**: Extrai evidências das experiências, não apenas das skills
- ✅ **Perguntas por Tema**: Perguntas de entrevista organizadas por categoria
- ✅ **Análise Semântica**: Entende que "análise de requisitos" pode atender "levantamento de requisitos"
- ✅ **Persistência**: Salva análises no banco para consulta posterior

---

## Arquivos Criados

```
📁 api/
└── analise-adequacao-perfil.ts     # Backend Vercel (Claude Sonnet)

📁 src/
├── services/
│   └── analiseAdequacaoService.ts  # Serviço frontend + tipos
├── hooks/supabase/
│   └── useAnaliseAdequacao.ts      # Hook React customizado
├── components/raisa/
│   ├── AnaliseAdequacaoPanel.tsx   # Componente principal (completo)
│   ├── AnaliseAdequacaoBadge.tsx   # Badge compacto para listagens
│   └── ExemploAnaliseAdequacao.tsx # Exemplo de integração
└── database/migrations/
    └── create_candidatura_analises.sql  # Script SQL Supabase
```

---

## Instalação

### 1. Copiar os arquivos para seu projeto

Copie todos os arquivos listados acima para as respectivas pastas.

### 2. Executar migration no Supabase

Acesse o **SQL Editor** do Supabase e execute:

```sql
-- Cole o conteúdo de: src/database/migrations/create_candidatura_analises.sql
```

### 3. Configurar variável de ambiente

No Vercel, certifique-se de ter:

```env
ANTHROPIC_API_KEY=sk-ant-...
```

### 4. Atualizar index de hooks (opcional)

Se você usa um index centralizado, adicione:

```typescript
// src/hooks/supabase/index.ts
export { useAnaliseAdequacao, useAnaliseAdequacaoExistente } from './useAnaliseAdequacao';
```

---

## Como Usar

### Uso Básico com Hook

```tsx
import { useAnaliseAdequacao } from '@/hooks/supabase/useAnaliseAdequacao';
import { AnaliseAdequacaoPanel } from '@/components/raisa/AnaliseAdequacaoPanel';

function MeuComponente({ candidato, vaga }) {
  const { analise, loading, error, analisar, salvarAnalise } = useAnaliseAdequacao();

  const handleAnalisar = async () => {
    await analisar(candidato, vaga);
  };

  return (
    <div>
      <button onClick={handleAnalisar} disabled={loading}>
        {loading ? 'Analisando...' : 'Analisar Adequação'}
      </button>

      {error && <div className="text-red-500">{error}</div>}

      {analise && (
        <AnaliseAdequacaoPanel 
          analise={analise}
          onAddPergunta={(p) => console.log('Pergunta:', p)}
        />
      )}
    </div>
  );
}
```

### Uso do Badge em Listagens

```tsx
import { AnaliseAdequacaoBadge } from '@/components/raisa/AnaliseAdequacaoBadge';

function ListaCandidatos({ candidatos }) {
  return (
    <table>
      {candidatos.map(c => (
        <tr key={c.id}>
          <td>{c.nome}</td>
          <td>
            <AnaliseAdequacaoBadge
              analise={c.analise}
              onVerDetalhes={() => abrirDetalhes(c.id)}
            />
          </td>
        </tr>
      ))}
    </table>
  );
}
```

### Chamada Direta ao Serviço

```typescript
import { analisarAdequacaoPerfil } from '@/services/analiseAdequacaoService';

const resultado = await analisarAdequacaoPerfil(
  {
    nome: 'João Silva',
    titulo_profissional: 'Desenvolvedor Full Stack',
    skills: ['React', 'Node.js', 'PostgreSQL'],
    experiencias: [
      {
        empresa: 'TechCorp',
        cargo: 'Dev Senior',
        descricao: 'Desenvolvimento de APIs REST...'
      }
    ]
  },
  {
    titulo: 'Tech Lead',
    requisitos_obrigatorios: '5+ anos de experiência, Liderança técnica...',
    stack_tecnologica: ['React', 'Node.js', 'AWS']
  }
);

console.log(resultado.score_geral); // 78
console.log(resultado.avaliacao_final.recomendacao); // 'ENTREVISTAR'
```

---

## Estrutura da Resposta

```typescript
interface AnaliseAdequacaoPerfil {
  // Metadados
  candidato_nome: string;
  vaga_titulo: string;
  data_analise: string;
  
  // Scores
  score_geral: number;              // 0-100
  nivel_adequacao_geral: 'MUITO_COMPATIVEL' | 'COMPATIVEL' | 'PARCIALMENTE_COMPATIVEL' | 'INCOMPATIVEL';
  confianca_analise: number;        // 0-100
  
  // Análise por requisito
  requisitos_imprescindiveis: RequisitoAnalisado[];
  requisitos_muito_desejaveis: RequisitoAnalisado[];
  requisitos_desejaveis: RequisitoAnalisado[];
  
  // Resumo executivo
  resumo_executivo: {
    principais_pontos_fortes: string[];
    gaps_criticos: string[];
    gaps_investigar: string[];
    diferenciais_candidato: string[];
  };
  
  // Perguntas organizadas por tema
  perguntas_entrevista: CategoriaPerguntas[];
  
  // Avaliação final
  avaliacao_final: {
    recomendacao: 'APROVAR' | 'ENTREVISTAR' | 'REAVALIAR' | 'REPROVAR';
    justificativa: string;
    proximos_passos: string[];
    riscos_identificados: string[];
    pontos_atencao_entrevista: string[];
  };
}
```

---

## Comparativo: Antes vs Depois

| Aspecto | Antes (Match de Skills) | Depois (Análise de Adequação) |
|---------|-------------------------|-------------------------------|
| Análise | Skills listadas vs Stack da vaga | Cada requisito individualmente |
| Evidências | Presença/ausência de palavras | Contexto das experiências |
| Níveis | Match/No Match | Atende/Parcial/Gap/Não Avaliável |
| Perguntas | Genéricas | Específicas por tema + referência ao CV |
| Output | Score único | Análise detalhada + Recomendação |

---

## Comandos Git

```powershell
# Adicionar novos arquivos
git add api/analise-adequacao-perfil.ts
git add src/services/analiseAdequacaoService.ts
git add src/hooks/supabase/useAnaliseAdequacao.ts
git add src/components/raisa/AnaliseAdequacaoPanel.tsx
git add src/components/raisa/AnaliseAdequacaoBadge.tsx
git add src/components/raisa/ExemploAnaliseAdequacao.tsx
git add src/database/migrations/create_candidatura_analises.sql

# Commit
git commit -m "feat(raisa): adiciona análise de adequação de perfil requisito a requisito

- Nova API /api/analise-adequacao-perfil usando Claude Sonnet
- Análise profunda com evidências contextuais
- Perguntas de entrevista organizadas por tema
- Componentes: Panel completo + Badge compacto
- Hook useAnaliseAdequacao com persistência
- Migration SQL para tabela candidatura_analises"

# Push
git push origin main
```

---

## Custos Estimados (Claude API)

| Modelo | Input | Output | Custo por Análise |
|--------|-------|--------|-------------------|
| Claude Sonnet 3.5 | ~4K tokens | ~3K tokens | ~$0.03 |

---

## Próximas Evoluções

1. **Exportar PDF** - Gerar documento profissional
2. **Comparar Candidatos** - Side-by-side de múltiplos candidatos
3. **Histórico de Análises** - Timeline de reanálises
4. **Integração com Entrevista** - Adicionar perguntas automaticamente
5. **Feedback Loop** - Aprender com aprovações/reprovações

---

## Suporte

Qualquer dúvida, me pergunte! 🚀
