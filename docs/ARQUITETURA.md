# 📚 ARQUITETURA RMS-RAISA
## Documentação de Padrões e Convenções

---

## 📁 Estrutura de Pastas

```
src/
├── components/           # Componentes React
│   ├── layout/          # Layout (Sidebar, Header)
│   ├── raisa/           # Componentes RAISA
│   ├── atividades/      # Componentes Atividades
│   └── import/          # Componentes de Importação
├── hooks/
│   └── supabase/        # Hooks de dados Supabase
├── services/            # Serviços de negócio
├── contexts/            # Contexts React (Auth, Permissions)
├── types/               # Tipos TypeScript
├── constants/           # Constantes e configurações
└── config/              # Configurações (Supabase, AI)
```

---

## 🔧 PADRÕES DE CÓDIGO

### 1. Imports de Tipos

**✅ CORRETO:**
```typescript
import { User, Vaga, Client } from '@/types';
```

**❌ ERRADO:**
```typescript
import { User } from '../types';
import { User } from '../../components/types';
```

### 2. Imports de Hooks

**✅ CORRETO (barrel export):**
```typescript
import { useUsers, useClients, useVagas } from '@/hooks/supabase';
```

**⚠️ ACEITÁVEL (quando precisa de tipos do hook):**
```typescript
import { useDistribuicaoIA, AnalistaScore } from '@/hooks/supabase/useDistribuicaoIA';
```

### 3. Imports de Supabase

**✅ CORRETO:**
```typescript
import { supabase } from '@/config/supabase';
// ou
import { supabase } from '../../config/supabase';
```

**❌ ERRADO (pasta deletada):**
```typescript
import { supabase } from '../../Lib/supabase';
```

### 4. Imports de Constantes

**✅ CORRETO:**
```typescript
import { ROUTES, ROUTE_LABELS } from '@/constants/routes';
import { APP_TITLE, RISK_COLORS } from '@/constants';
```

---

## 👤 GERENCIAMENTO DE USUÁRIO

### Padrão Atual (Híbrido)

**Componentes Raiz (recebem via props):**
- Dashboard
- Header
- ManageClients
- ManageConsultants
- ManageUsers
- Quarentena
- TemplateLibrary

```tsx
// App.tsx passa currentUser como prop
<Dashboard currentUser={currentUser} ... />

// Componente recebe via props
const Dashboard: React.FC<Props> = ({ currentUser }) => {
```

**Modais e Sub-componentes (usam useAuth):**
- RedistribuicaoModal
- NotificacaoBell
- DescricaoAprovacaoModal
- PriorizacaoAprovacaoModal
- AjustesDistribuicaoAnalista
- ConfiguracaoPriorizacaoDistribuicao

```tsx
import { useAuth } from '@/contexts/AuthContext';

const MeuModal = () => {
  const { user } = useAuth();
  const usuarioId = user?.id || 1;
```

### Regra para Novos Componentes

- **Componentes de página**: Receber `currentUser` via props do App.tsx
- **Modais e componentes filhos**: Usar `useAuth()` hook

---

## 🛣️ ROTAS E NAVEGAÇÃO

### Tipo View

Todas as rotas estão definidas em `types/types_models.ts`:

```typescript
export type View = 
  | 'dashboard' | 'quarantine' | 'recommendations' | ...
  | 'vagas' | 'candidaturas' | ...
  | 'dashboard_ml' | 'dashboard_raisa_metrics' | ...
```

### Constantes de Rotas

Usar `constants/routes.ts` para evitar erros de digitação:

```typescript
import { ROUTES } from '@/constants/routes';

// Em vez de:
onNavigate('dashboard_ml')

// Preferir:
onNavigate(ROUTES.DASHBOARD_ML)
```

---

## 📦 HOOKS SUPABASE

### Hooks Disponíveis (index.ts)

| Hook | Descrição |
|------|-----------|
| `useUsers` | CRUD de usuários |
| `useClients` | CRUD de clientes |
| `useConsultants` | CRUD de consultores |
| `useVagas` | CRUD de vagas |
| `usePessoas` | CRUD de pessoas/candidatos |
| `useCandidaturas` | CRUD de candidaturas |
| `useDistribuicaoIA` | Distribuição inteligente de vagas |
| `useMLLearning` | Machine Learning e aprendizado |
| `useRaisaMetrics` | Métricas do RAISA |
| ... | Ver index.ts completo |

### Padrão de Hook

```typescript
export function useMinhaFuncionalidade() {
  const [dados, setDados] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('tabela')
        .select('*');
      if (error) throw error;
      setDados(data || []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  return { dados, loading, error, carregar };
}
```

---

## 🎨 COMPONENTES

### Estrutura de Componente

```tsx
/**
 * COMPONENTE: NomeDoComponente
 * Descrição breve do que faz
 * 
 * @version 1.0
 * @date 28/12/2024
 */

import React, { useState, useEffect } from 'react';
import { supabase } from '@/config/supabase';
import { MeuTipo } from '@/types';

interface Props {
  propObrigatoria: string;
  propOpcional?: number;
}

const NomeDoComponente: React.FC<Props> = ({ propObrigatoria, propOpcional = 10 }) => {
  // Estados
  const [loading, setLoading] = useState(false);

  // Efeitos
  useEffect(() => {
    // ...
  }, []);

  // Handlers
  const handleClick = () => {
    // ...
  };

  // Render
  return (
    <div>
      {/* ... */}
    </div>
  );
};

export default NomeDoComponente;
```

---

## 🗄️ SERVICES

### Services Ativos

| Service | Usado por |
|---------|-----------|
| `geminiService` | Análise IA, geração de texto |
| `vagaWorkflowService` | Workflow de vagas |
| `notificacaoService` | Sistema de notificações |
| `priorizacaoAprendizadoService` | ML de priorização |
| `dashboardRaisaService` | Dados dos dashboards |

### Services Backend (Cron)

| Service | Descrição |
|---------|-----------|
| `cronJobsService` | Jobs agendados (backend) |

### Services Reservados (Uso Futuro)

| Service | Status |
|---------|--------|
| `candidaturaEnvioService` | Implementado, aguardando integração |
| `predicaoRiscosService` | Implementado, aguardando integração |

---

## ✅ CHECKLIST PARA NOVOS COMPONENTES

- [ ] Usar tipos de `@/types`
- [ ] Usar hooks de `@/hooks/supabase`
- [ ] Usar supabase de `@/config/supabase`
- [ ] Adicionar documentação no topo
- [ ] Adicionar ao App.tsx se for página
- [ ] Adicionar ao Sidebar se tiver menu
- [ ] Adicionar ao tipo View se for rota

---

*Documentação atualizada em 28/12/2024*
