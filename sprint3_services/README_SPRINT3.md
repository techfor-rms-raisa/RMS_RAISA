# 📦 SPRINT 3 - INTEGRAÇÃO DE SERVICES PENDENTES
## Data: 28/12/2024

---

## 📁 ARQUIVOS INCLUSOS

| Arquivo | Destino | Descrição |
|---------|---------|-----------|
| `candidaturaEnvioService.ts` | `src/services/` | **FIX** Import corrigido |
| `predicaoRiscosService.ts` | `src/services/` | Já estava correto (referência) |
| `PredicaoRiscosPanel.tsx` | `src/components/raisa/` | **NOVO** Painel de predição |
| `AnaliseRisco.tsx` | `src/components/raisa/` | **ATUALIZADO** Com abas de alertas |

---

## 🚀 INSTRUÇÕES DE APLICAÇÃO

### PASSO 1: Copiar Arquivos (PowerShell)

```powershell
# Service corrigido
Copy-Item "sprint3_services\candidaturaEnvioService.ts" "src\services\" -Force

# Novo componente
Copy-Item "sprint3_services\PredicaoRiscosPanel.tsx" "src\components\raisa\" -Force

# Componente atualizado
Copy-Item "sprint3_services\AnaliseRisco.tsx" "src\components\raisa\" -Force
```

### PASSO 2: Testar Build

```powershell
npm run build
```

### PASSO 3: Commit

```powershell
git add -A
git commit -m "feat(services): integra services de predição de riscos

- Corrige import do candidaturaEnvioService
- Cria PredicaoRiscosPanel com 3 modos (individual/alertas/metricas)
- Atualiza AnaliseRisco com abas de alertas e métricas IA"
git push origin main
```

---

## ✨ NOVAS FUNCIONALIDADES

### 1. Análise de Risco Expandida

O componente **Análise de Risco** agora tem 3 abas:

| Aba | Descrição |
|-----|-----------|
| 📝 **Análise de CV** | Análise manual de currículo (já existia) |
| ⚠️ **Alertas Proativos** | Lista candidaturas com alto risco de reprovação |
| 📊 **Métricas IA** | Taxa de acerto das predições do modelo |

### 2. PredicaoRiscosPanel

Novo componente reutilizável que pode ser usado em diferentes contextos:

```tsx
// Modo individual (para uma candidatura específica)
<PredicaoRiscosPanel candidaturaId={123} modo="individual" />

// Modo alertas (lista todos os riscos altos)
<PredicaoRiscosPanel modo="alertas" />

// Modo métricas (estatísticas do modelo)
<PredicaoRiscosPanel modo="metricas" />
```

### 3. candidaturaEnvioService

Funções disponíveis para uso em outros componentes:

```typescript
import { candidaturaEnvioService } from '@/services/candidaturaEnvioService';

// Registrar envio de CV
await candidaturaEnvioService.registrarEnvio({
  candidatura_id: 1,
  vaga_id: 2,
  analista_id: 3,
  cliente_id: 4,
  // ... outros campos
});

// Buscar envios por analista
const envios = await candidaturaEnvioService.buscarEnviosPorAnalista(analistaId);

// Registrar aprovação/reprovação
await candidaturaEnvioService.registrarAprovacao({
  candidatura_id: 1,
  decisao: 'aprovado',
  // ... outros campos
});
```

### 4. predicaoRiscosService

Funções disponíveis:

```typescript
import { 
  preverRiscoCandidato, 
  gerarAlertasProativos,
  calcularTaxaSucessoPredicoes,
  sugerirPreparacaoCandidato 
} from '@/services/predicaoRiscosService';

// Prever risco de uma candidatura
const predicao = await preverRiscoCandidato(candidaturaId);
// Retorna: { risco_reprovacao, nivel_risco, motivos_risco, recomendacoes_preparacao, deve_enviar }

// Gerar alertas de candidaturas em risco
const alertas = await gerarAlertasProativos();

// Calcular taxa de acerto do modelo
const metricas = await calcularTaxaSucessoPredicoes();

// Sugerir preparação para candidato
const preparacao = await sugerirPreparacaoCandidato(candidaturaId);
```

---

## ⚙️ CONFIGURAÇÃO

A predição de riscos é controlada pela configuração em `aiConfig.ts`:

```typescript
ENABLE_AI_RISK_PREDICTION: false // Desativado por padrão
```

Para ativar, defina a variável de ambiente:
```
VITE_ENABLE_AI_RISK_PREDICTION=true
```

---

## 📊 COMO FUNCIONA A PREDIÇÃO

1. **Coleta de Dados**: Busca dados da candidatura, vaga e histórico
2. **Análise de Vagas Similares**: Compara com vagas semelhantes já fechadas
3. **Chamada à IA (Gemini)**: Envia dados para análise preditiva
4. **Cálculo de Risco**: Retorna probabilidade de reprovação (0-100%)
5. **Recomendações**: Sugere ações para reduzir o risco

---

## ✅ CHECKLIST

- [ ] Copiar `candidaturaEnvioService.ts` para `src/services/`
- [ ] Copiar `PredicaoRiscosPanel.tsx` para `src/components/raisa/`
- [ ] Copiar `AnaliseRisco.tsx` para `src/components/raisa/`
- [ ] `npm run build` passa
- [ ] Testar aba "Alertas Proativos" em Análise de Risco
- [ ] Commit e push

---

*Sprint 3 - Services Integrados | RMS-RAISA v2.3*
