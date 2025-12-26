# 🚀 INSTRUÇÕES DE DEPLOY - FASE 5
## Áudio e Transcrição de Entrevistas

---

## 📦 LISTA DE ARQUIVOS (8 arquivos)

### 🗄️ SQL (Execute no Supabase)

| # | Arquivo | Descrição |
|---|---------|-----------|
| 1 | `audio_transcricao_schema.sql` | Tabelas, views e funções |

### 📁 API Vercel (api/)

| # | Arquivo | Descrição |
|---|---------|-----------|
| 2 | `gemini-audio-transcription.ts` | Transcrição e análise de áudio |
| 3 | `gemini-questoes-vaga.ts` | Geração de questões com IA |

### 📁 Hooks (src/hooks/Supabase/)

| # | Arquivo | Descrição |
|---|---------|-----------|
| 4 | `useAudioEntrevista.ts` | Gerenciar uploads e análises |
| 5 | `useQuestoesVaga.ts` | Gerenciar questões da vaga |

### 📁 Componentes (src/components/raisa/)

| # | Arquivo | Descrição |
|---|---------|-----------|
| 6 | `AudioEntrevistaPanel.tsx` | Painel de upload e análise |
| 7 | `QuestoesVagaPanel.tsx` | Gerenciamento de questões |

### 📁 Documentação

| # | Arquivo | Descrição |
|---|---------|-----------|
| 8 | `DEPLOY_FASE5_AUDIO.md` | Este arquivo |

---

## 🔧 PASSO A PASSO

### ETAPA 1: SQL no Supabase

Execute o `audio_transcricao_schema.sql` no Supabase SQL Editor.

### ETAPA 2: Configurar Storage Bucket

No Supabase Dashboard:
1. Ir em **Storage**
2. Clicar em **New Bucket**
3. Nome: `entrevistas-audio`
4. Marcar como **Private**
5. Criar políticas de acesso (ver SQL abaixo)

```sql
-- Política para upload (apenas usuários autenticados)
CREATE POLICY "Users can upload audio" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'entrevistas-audio');

-- Política para leitura
CREATE POLICY "Users can read audio" ON storage.objects
FOR SELECT TO authenticated
USING (bucket_id = 'entrevistas-audio');
```

### ETAPA 3: Copiar Arquivos

```
api/
├── gemini-audio-transcription.ts   ← NOVO
└── gemini-questoes-vaga.ts         ← NOVO

src/
├── hooks/
│   └── Supabase/
│       ├── useAudioEntrevista.ts   ← NOVO
│       └── useQuestoesVaga.ts      ← NOVO
│
└── components/
    └── raisa/
        ├── AudioEntrevistaPanel.tsx ← NOVO
        └── QuestoesVagaPanel.tsx    ← NOVO
```

### ETAPA 4: Git

```powershell
git add api/gemini-audio-transcription.ts
git add api/gemini-questoes-vaga.ts
git add src/hooks/Supabase/useAudioEntrevista.ts
git add src/hooks/Supabase/useQuestoesVaga.ts
git add src/components/raisa/AudioEntrevistaPanel.tsx
git add src/components/raisa/QuestoesVagaPanel.tsx

git commit -m "feat(raisa): FASE 5 - Sistema de áudio e transcrição de entrevistas

- Upload de áudio para Supabase Storage
- Transcrição automática com Gemini
- Análise de entrevista vs questionário da vaga
- Geração de questões com IA (5-10 por vaga)
- Cálculo de aderência e recomendação (aprovar/reprovar/revisar)
- Extração automática de pontos fortes/fracos e gaps"

git push origin main
```

---

## 📊 ONDE SE ENCAIXA NO FLUXO

```
VAGA CRIADA
    ↓
IA Melhora Anúncio
    ↓
Aprovação Gestores
    ↓
Busca CVs (máx 20)
    ↓
Distribui para 2 Analistas
    ↓
┌──────────────────────────────────────────┐
│ 🆕 IA GERA 5-10 QUESTÕES PARA A VAGA    │ ← QuestoesVagaPanel
└──────────────────────────────────────────┘
    ↓
┌──────────────────────────────────────────┐
│ 🎤 ETAPA 1 - ENTREVISTA INTERNA         │
│                                          │
│ • Analista entrevista candidato          │
│ • Grava áudio                           │
│ • Upload do áudio ← AudioEntrevistaPanel│
│ • IA Transcreve                         │
│ • IA Analisa vs Questionário            │
│ • Emite parecer (0-100% aderência)      │
└──────────────────────────────────────────┘
    ↓
Analista decide enviar ou não ao cliente
    ↓
IA Gera CV Padrão TECHFOR
    ↓
┌──────────────────────────────────────────┐
│ 🎤 ETAPA 2 - ENTREVISTA TÉCNICA CLIENTE │
│                                          │
│ • Cliente entrevista candidato          │
│ • Grava áudio                           │
│ • Upload do áudio ← AudioEntrevistaPanel│
│ • IA Transcreve                         │
│ • IA Prevê aprovação/reprovação         │
└──────────────────────────────────────────┘
    ↓
Aprovação/Reprovação
    ↓
IA Aprende para futuras vagas
```

---

## 🎯 FUNCIONALIDADES ENTREGUES

### AudioEntrevistaPanel
- ✅ Upload drag & drop de áudio
- ✅ Formatos: MP3, WAV, M4A, WebM, OGG
- ✅ Limite: 50MB (configurável)
- ✅ Transcrição automática com Gemini
- ✅ Análise da entrevista vs questionário
- ✅ Cálculo de aderência (0-100%)
- ✅ Previsão de aprovação (0-100%)
- ✅ Recomendação: aprovar/reprovar/revisar
- ✅ Pontos fortes/fracos e gaps
- ✅ Notas da analista

### QuestoesVagaPanel
- ✅ Gerar 5-10 questões com IA
- ✅ Categorias: técnica, comportamental, experiência, situacional
- ✅ Peso por questão (1-10)
- ✅ Critério de avaliação
- ✅ Adicionar/editar/excluir manual
- ✅ Reordenar questões

---

## 🧪 TESTES

### Teste 1: Gerar Questões
1. Abrir uma vaga
2. Clicar em "Questões para Entrevista"
3. Clicar em "Gerar Questões com IA"
4. Verificar questões geradas
5. Salvar

### Teste 2: Upload de Áudio
1. Abrir candidatura
2. Clicar em "Entrevista Interna"
3. Fazer upload de áudio (pode ser gravação do celular)
4. Aguardar processamento
5. Verificar transcrição e análise

### Teste 3: Verificar no Banco
```sql
-- Ver áudios
SELECT * FROM entrevista_audios ORDER BY uploaded_em DESC;

-- Ver questões
SELECT * FROM vaga_questoes WHERE vaga_id = X;

-- Ver respostas extraídas
SELECT * FROM candidato_respostas WHERE entrevista_audio_id = X;
```

---

## ⚠️ OBSERVAÇÕES

1. **Bucket de Storage**: Criar manualmente no Supabase
2. **API Key Gemini**: Verificar se está configurada na Vercel
3. **Áudios grandes**: Podem demorar para processar
4. **Transcrição**: Qualidade depende do áudio

---

## 📊 TABELAS CRIADAS

| Tabela | Descrição |
|--------|-----------|
| `entrevista_audios` | Áudios, transcrições e análises |
| `vaga_questoes` | Questões de cada vaga |
| `candidato_respostas` | Respostas extraídas da transcrição |

## 📊 VIEWS CRIADAS

| View | Descrição |
|------|-----------|
| `vw_entrevistas_audio` | Entrevistas com dados relacionados |
| `vw_questoes_vaga` | Questões com estatísticas |

---

**Claude DEV + IA + Processos**  
**Data:** 26/12/2024  
**Fase:** 5 - Áudio e Transcrição
