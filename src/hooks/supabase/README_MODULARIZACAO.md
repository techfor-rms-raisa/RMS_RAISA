# 📦 Modularização do useSupabaseData

## 📊 Resumo da Refatoração

O arquivo `useSupabaseData.ts` original (2.166 linhas) foi dividido em **12 módulos** menores:

| Arquivo | Linhas | Responsabilidade |
|---------|--------|------------------|
| `useUsers.ts` | ~150 | Gerenciamento de usuários (app_users) |
| `useClients.ts` | ~180 | Gerenciamento de clientes |
| `useGestoresCliente.ts` | ~210 | Gestores de clientes (usuarios_cliente) |
| `useCoordenadoresCliente.ts` | ~220 | Coordenadores de clientes |
| `useConsultants.ts` | ~340 | Consultores + lazy loading de relatórios |
| `useTemplates.ts` | ~150 | Templates de email |
| `useCampaigns.ts` | ~160 | Campanhas de compliance |
| `useVagas.ts` | ~220 | Vagas (RAISA) |
| `usePessoas.ts` | ~160 | Banco de talentos (RAISA) |
| `useCandidaturas.ts` | ~250 | Candidaturas (RAISA) |
| `useReportAnalysis.ts` | ~200 | Análise de relatórios com IA |
| `index.ts` | ~15 | Exportações centralizadas |
| `useSupabaseData.ts` | ~200 | Hook orquestrador (mantém compatibilidade) |

## 📁 Estrutura de Pastas

```
src/hooks/
├── useSupabaseData.ts          ← Hook orquestrador (usar este nos componentes)
└── supabase/
    ├── index.ts                ← Exportações centralizadas
    ├── useUsers.ts
    ├── useClients.ts
    ├── useGestoresCliente.ts
    ├── useCoordenadoresCliente.ts
    ├── useConsultants.ts
    ├── useTemplates.ts
    ├── useCampaigns.ts
    ├── useVagas.ts
    ├── usePessoas.ts
    ├── useCandidaturas.ts
    └── useReportAnalysis.ts
```

## ✅ Compatibilidade

O novo `useSupabaseData.ts` mantém **100% de compatibilidade** com o código existente.
Nenhuma alteração é necessária nos componentes que já usam o hook.

## 🔧 Comandos Git

Execute os comandos abaixo no terminal do VS Code:

```bash
# 1. Criar a pasta supabase dentro de hooks (se não existir)
mkdir -p src/hooks/supabase

# 2. Copiar os novos arquivos para as pastas corretas
# (assumindo que você baixou a pasta 'hooks' do Claude)

# 3. Fazer backup do arquivo original (IMPORTANTE!)
cp src/hooks/useSupabaseData.ts src/hooks/useSupabaseData.ts.backup

# 4. Substituir pelo novo arquivo orquestrador
# Copie o conteúdo de hooks/useSupabaseData.ts para src/hooks/useSupabaseData.ts

# 5. Adicionar todos os arquivos ao Git
git add src/hooks/supabase/
git add src/hooks/useSupabaseData.ts

# 6. Commit com mensagem descritiva
git commit -m "refactor: modulariza useSupabaseData em 12 hooks menores

BREAKING CHANGE: Nenhum (mantém compatibilidade total)

Mudanças:
- Separa useSupabaseData.ts (2166 linhas) em módulos independentes
- Cria pasta src/hooks/supabase/ com hooks específicos:
  - useUsers.ts: Gerenciamento de usuários
  - useClients.ts: Gerenciamento de clientes
  - useGestoresCliente.ts: Gestores de clientes
  - useCoordenadoresCliente.ts: Coordenadores
  - useConsultants.ts: Consultores + lazy loading
  - useTemplates.ts: Templates de email
  - useCampaigns.ts: Campanhas de compliance
  - useVagas.ts: Vagas RAISA
  - usePessoas.ts: Banco de talentos
  - useCandidaturas.ts: Candidaturas
  - useReportAnalysis.ts: Análise IA
- Mantém useSupabaseData.ts como orquestrador
- 100% compatível com código existente

Benefícios:
- Melhor manutenibilidade
- Facilita testes unitários
- Permite carregamento seletivo
- Código mais organizado"

# 7. Push para o repositório
git push origin main
```

## 🚀 Uso Avançado (Opcional)

Se quiser usar hooks individuais diretamente (mais performático):

```typescript
// Ao invés de importar tudo:
import { useSupabaseData } from '@/hooks/useSupabaseData';

// Pode importar apenas o que precisa:
import { useUsers, useClients } from '@/hooks/supabase';

const MeuComponente = () => {
  const { users, addUser } = useUsers();
  const { clients } = useClients();
  // ...
};
```

## ⚠️ Notas Importantes

1. **Teste antes de fazer push!** Execute a aplicação localmente para garantir que tudo funciona
2. **O arquivo de backup** (`useSupabaseData.ts.backup`) pode ser removido depois de validar
3. **Path aliases**: Certifique-se de que `@/hooks` está configurado no `tsconfig.json`
