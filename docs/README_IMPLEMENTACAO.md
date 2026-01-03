# 🤖 MODELO HÍBRIDO IA - RAISA

**Gemini Flash (70%) + Claude Haiku (30%)**

---

## 📋 ÍNDICE

1. [Visão Geral](#visão-geral)
2. [Arquivos Criados](#arquivos-criados)
3. [Instalação](#instalação)
4. [Configuração](#configuração)
5. [Uso](#uso)
6. [Análise de GAPs](#análise-de-gaps)
7. [Custos](#custos)

---

## 🎯 VISÃO GERAL

### Distribuição de Responsabilidades

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        MODELO HÍBRIDO RAISA                             │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  🟢 GEMINI FLASH (70%)                 🔵 CLAUDE HAIKU (30%)            │
│  ──────────────────────                ──────────────────────           │
│  • Extração de CV                      • Recomendação Final + GAPs      │
│  • Triagem Inicial                     • Análise de Risco               │
│  • Classificação                       • Avaliação de Entrevista        │
│  • Parsing de Requisitos               • Perguntas Técnicas             │
│  • Geração de Tags                     • Justificativa Cliente          │
│  • Resumo de CV                        • Fit Cultural                   │
│  • Normalização de Dados               • Match Detalhado + GAPs         │
│                                                                         │
│  Custo: ~R$ 0,003/req                  Custo: ~R$ 0,037/req             │
│  Foco: Volume                          Foco: Qualidade/Decisões         │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Custo Estimado (5.000 requisições/mês)

| Provider | % | Requisições | Custo |
|----------|---|-------------|-------|
| Gemini Flash | 70% | 3.500 | R$ 10,50 |
| Claude Haiku | 30% | 1.500 | R$ 55,20 |
| **TOTAL** | 100% | 5.000 | **R$ 65,70** |

---

## 📁 ARQUIVOS CRIADOS

```
modelo_hibrido_ia/
├── src/
│   └── services/
│       ├── claudeService.ts    # Serviço Claude Haiku
│       └── aiRouter.ts         # Roteador híbrido
├── api/
│   └── claude-analyze.ts       # Endpoint Vercel
└── README_IMPLEMENTACAO.md     # Este arquivo
```

### Onde colocar cada arquivo:

| Arquivo | Destino no Projeto |
|---------|-------------------|
| `claudeService.ts` | `src/services/claudeService.ts` |
| `aiRouter.ts` | `src/services/aiRouter.ts` |
| `claude-analyze.ts` | `api/claude-analyze.ts` |

---

## 📦 INSTALAÇÃO

### 1. Instalar SDK Anthropic

```bash
npm install @anthropic-ai/sdk
```

### 2. Copiar arquivos para o projeto

```bash
# Copiar services
cp modelo_hibrido_ia/src/services/claudeService.ts src/services/
cp modelo_hibrido_ia/src/services/aiRouter.ts src/services/

# Copiar API endpoint
cp modelo_hibrido_ia/api/claude-analyze.ts api/
```

---

## ⚙️ CONFIGURAÇÃO

### 1. Variáveis de Ambiente (Vercel)

Adicionar no Vercel Dashboard → Settings → Environment Variables:

```env
ANTHROPIC_API_KEY=sk-ant-api03-xxxxx
```

### 2. Variáveis Locais (.env.local)

```env
# Já existente
VITE_GEMINI_API_KEY=sua-chave-gemini

# Nova (apenas para testes locais)
ANTHROPIC_API_KEY=sk-ant-api03-xxxxx
```

### 3. Obter API Key Anthropic

1. Acesse: https://console.anthropic.com/
2. Crie uma conta ou faça login
3. Vá em "API Keys"
4. Clique em "Create Key"
5. Copie e guarde a chave

---

## 🚀 USO

### Exemplo 1: Fluxo Completo de Análise

```typescript
import aiRouter from '@/services/aiRouter';

async function analisarCandidato(cvBase64: string, vaga: DadosVaga) {
  // Executa fluxo completo: Gemini (extração) → Claude (decisão)
  const resultado = await aiRouter.fluxoAnaliseCompleto(
    cvBase64,
    vaga,
    true // isPDF
  );

  if (resultado.success && resultado.data) {
    const { extracao, classificacao, triagem, recomendacao, risco } = resultado.data;

    console.log('📄 Dados extraídos:', extracao);
    console.log('🏷️ Classificação:', classificacao);
    console.log('🔍 Triagem:', triagem);

    if (recomendacao) {
      console.log('✅ Recomendação:', recomendacao.recomendacao);
      console.log('📊 GAPs:', recomendacao.analise_gaps);
    }

    if (risco) {
      console.log('⚠️ Risco:', risco.nivel_risco);
    }

    console.log('💰 Custo total:', resultado.data.custoTotal);
  }
}
```

### Exemplo 2: Análise com GAPs Detalhados

```typescript
import { recomendarComGaps, analisarGaps } from '@/services/aiRouter';
import { verificarDesqualificacao, formatarGapsParaExibicao } from '@/services/claudeService';

async function analisarComGaps(candidato: DadosCandidato, vaga: DadosVaga) {
  // Obter recomendação com GAPs
  const resultado = await recomendarComGaps(candidato, vaga, 75);

  if (resultado.success && resultado.data) {
    const { recomendacao, analise_gaps } = resultado.data;

    // Verificar se deve ser desqualificado
    const status = verificarDesqualificacao(analise_gaps);

    if (status.desqualificado) {
      console.log('❌ Candidato DESQUALIFICADO');
      console.log('Motivos:', status.motivos);
    } else if (status.precisaAvaliacao) {
      console.log('⚠️ Candidato precisa AVALIAÇÃO do analista');
      console.log('Perguntas a fazer:', status.perguntasParaAnalista);
    } else {
      console.log('✅ Candidato APTO');
    }

    // Formatar GAPs para exibição
    const gapsFormatados = formatarGapsParaExibicao(analise_gaps);
    console.log('GAPs Eliminatórios:', gapsFormatados.eliminatorios);
    console.log('GAPs para Avaliar:', gapsFormatados.paraAvaliar);
  }
}
```

### Exemplo 3: Usar Roteador Direto

```typescript
import { routeAIRequest } from '@/services/aiRouter';

// Extração de CV (vai para Gemini)
const extracao = await routeAIRequest('extrair_cv', { 
  base64PDF: '...' 
});

// Recomendação (vai para Claude)
const recomendacao = await routeAIRequest('recomendar_decisao_final', {
  candidato: dadosCandidato,
  vaga: dadosVaga,
  scoreInicial: 80
});
```

---

## 📊 ANÁLISE DE GAPS

### Estrutura de um GAP

```typescript
interface GapAnalise {
  categoria: 'TECNICO' | 'EXPERIENCIA' | 'FORMACAO' | 'IDIOMA' | 'SOFT_SKILL' | 'CULTURAL' | 'LOGISTICO';
  requisito_vaga: string;      // O que a vaga exige
  situacao_candidato: string;  // O que o candidato tem
  severidade: 'ELIMINATORIO' | 'IMPORTANTE' | 'DESEJAVEL' | 'MENOR';
  impacto: 'DESQUALIFICA' | 'REQUER_AVALIACAO' | 'ACEITAVEL';
  justificativa: string;
  pergunta_sugerida?: string;  // Para o analista investigar
  possivel_mitigacao?: string; // Como superar o gap
}
```

### Níveis de Severidade

| Severidade | Significado | Ação |
|------------|-------------|------|
| **ELIMINATÓRIO** | Requisito obrigatório não atendido | Desqualifica automaticamente |
| **IMPORTANTE** | Gap significativo | Analista deve investigar |
| **DESEJÁVEL** | "Nice to have" não atendido | Pode seguir, mas anotar |
| **MENOR** | Pequena lacuna | Ignorar ou desenvolver depois |

### Exemplo de Resposta com GAPs

```json
{
  "recomendacao": "REAVALIAR",
  "score_final": 72,
  "analise_gaps": {
    "total_gaps": 4,
    "gaps_eliminatorios": [],
    "gaps_para_avaliar": [
      {
        "categoria": "TECNICO",
        "requisito_vaga": "Experiência com Kubernetes",
        "situacao_candidato": "Não menciona Kubernetes no CV",
        "severidade": "IMPORTANTE",
        "impacto": "REQUER_AVALIACAO",
        "justificativa": "Kubernetes é requisito obrigatório, mas candidato tem Docker que é base similar",
        "pergunta_sugerida": "Você tem experiência com orquestração de containers? Já trabalhou com Kubernetes ou similar?",
        "possivel_mitigacao": "Se tiver Docker avançado, pode aprender Kubernetes em 2-4 semanas"
      },
      {
        "categoria": "IDIOMA",
        "requisito_vaga": "Inglês fluente",
        "situacao_candidato": "Inglês avançado",
        "severidade": "IMPORTANTE",
        "impacto": "REQUER_AVALIACAO",
        "justificativa": "Vaga exige fluente, candidato indica avançado",
        "pergunta_sugerida": "Você se sente confortável conduzindo reuniões inteiras em inglês?",
        "possivel_mitigacao": "Testar na entrevista com perguntas em inglês"
      }
    ],
    "gaps_aceitaveis": [
      {
        "categoria": "EXPERIENCIA",
        "requisito_vaga": "5+ anos de experiência",
        "situacao_candidato": "4 anos de experiência",
        "severidade": "MENOR",
        "impacto": "ACEITAVEL",
        "justificativa": "Diferença de 1 ano é aceitável dado o perfil técnico sólido"
      }
    ],
    "resumo_gaps": "Candidato tem 2 GAPs importantes que precisam ser investigados na entrevista: Kubernetes e nível de inglês. Demais requisitos atendidos.",
    "recomendacao_analista": "Agendar entrevista técnica com foco em: 1) Testar conhecimento de orquestração de containers; 2) Conduzir parte da entrevista em inglês para avaliar fluência real."
  }
}
```

---

## 💰 CUSTOS DETALHADOS

### Por Ação

| Ação | Provider | Custo/Req |
|------|----------|-----------|
| extrair_cv | Gemini | R$ 0,003 |
| triagem_inicial | Gemini | R$ 0,002 |
| classificar_candidato | Gemini | R$ 0,002 |
| parsear_requisitos | Gemini | R$ 0,002 |
| gerar_tags | Gemini | R$ 0,001 |
| recomendar_decisao_final | Claude | R$ 0,037 |
| analisar_risco | Claude | R$ 0,030 |
| avaliar_entrevista | Claude | R$ 0,050 |
| gerar_perguntas_tecnicas | Claude | R$ 0,025 |
| justificativa_cliente | Claude | R$ 0,025 |
| analisar_fit_cultural | Claude | R$ 0,028 |

### Fluxo Completo (1 candidato)

| Etapa | Provider | Custo |
|-------|----------|-------|
| Extração CV | Gemini | R$ 0,003 |
| Classificação | Gemini | R$ 0,002 |
| Triagem | Gemini | R$ 0,002 |
| Recomendação + GAPs | Claude | R$ 0,037 |
| Análise Risco | Claude | R$ 0,030 |
| **TOTAL** | | **R$ 0,074** |

---

## 🔧 COMANDOS GIT

```bash
# Adicionar arquivos
git add src/services/claudeService.ts
git add src/services/aiRouter.ts
git add api/claude-analyze.ts

# Commit
git commit -m "feat(ia): Implementar modelo híbrido Gemini + Claude

- claudeService.ts: Serviço Claude Haiku para decisões críticas
- aiRouter.ts: Roteador inteligente 70/30
- claude-analyze.ts: Endpoint API Vercel
- Análise de GAPs detalhada com perguntas sugeridas
- Fluxo completo de análise de candidato

Distribuição: 70% Gemini | 30% Claude
Custo estimado: R$ 0,013/requisição (média)"

# Push
git push origin main
```

---

## ✅ CHECKLIST DE IMPLEMENTAÇÃO

- [ ] Instalar @anthropic-ai/sdk
- [ ] Copiar claudeService.ts
- [ ] Copiar aiRouter.ts
- [ ] Copiar claude-analyze.ts
- [ ] Configurar ANTHROPIC_API_KEY no Vercel
- [ ] Testar endpoint /api/claude-analyze
- [ ] Testar fluxo completo
- [ ] Verificar análise de GAPs

---

## 📞 SUPORTE

Em caso de erros:

1. Verificar se ANTHROPIC_API_KEY está configurada
2. Verificar logs no Vercel Functions
3. Testar endpoint direto com curl/Postman
4. Verificar formato do JSON de resposta

---

**Versão:** 1.0  
**Data:** 28/12/2024
