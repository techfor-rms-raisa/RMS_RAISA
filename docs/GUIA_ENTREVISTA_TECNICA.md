# 🎯 Entrevista Técnica Inteligente v2.7 - Guia de Integração

## 📁 Arquivos Criados/Atualizados

### 1. Banco de Dados
- **`sql_entrevista_tecnica.sql`** - Execute no Supabase SQL Editor
  - Tabela `analise_adequacao` - Salva análises de CV vs Vaga
  - Tabela `entrevista_tecnica` - Salva entrevistas e transcrições
  - Storage bucket `entrevistas-audio` - Armazena áudios
  - View `vw_entrevistas_completas` - Consulta facilitada

### 2. APIs
- **`api/gemini-audio-transcription.ts`** - Nova API
  - Transcrição de áudio para texto
  - Análise de respostas vs perguntas esperadas
  - Suporta: MP3, WAV, M4A, WebM, OGG (até 50MB)

### 3. Hooks
- **`src/hooks/supabase/useAnaliseAdequacao.ts`** - Atualizado
  - Nova função `salvarAnalise(candidaturaId?, pessoaId?, vagaId?, userId?)`
  - Nova função `buscarPerguntasEntrevista(candidaturaId?, pessoaId?, vagaId?)`
  - Persiste na tabela `analise_adequacao`

### 4. Componentes
- **`src/components/raisa/EntrevistaTecnicaInteligente.tsx`** - NOVO
  - UI completa com 5 etapas
  - Upload de áudio
  - Transcrição automática
  - Análise por IA
  - Decisão do analista

---

## 🚀 Instruções de Instalação

### Passo 1: Banco de Dados
```sql
-- Execute sql_entrevista_tecnica.sql no Supabase SQL Editor
```

### Passo 2: Copiar Arquivos
```
api/
├── gemini-audio-transcription.ts     ← NOVO
├── analise-adequacao-perfil.ts       ← JÁ EXISTE (Gemini)

src/components/raisa/
├── EntrevistaTecnicaInteligente.tsx  ← NOVO
├── EntrevistaTecnica.tsx             ← ANTIGO (pode remover)

src/hooks/supabase/
├── useAnaliseAdequacao.ts            ← ATUALIZADO
```

### Passo 3: Atualizar Importações
No `App.tsx` ou onde usa EntrevistaTecnica:

```tsx
// ANTES
import EntrevistaTecnica from './components/raisa/EntrevistaTecnica';

// DEPOIS
import EntrevistaTecnicaInteligente from './components/raisa/EntrevistaTecnicaInteligente';

// No render:
<EntrevistaTecnicaInteligente 
  candidaturas={candidaturas}
  vagas={vagas}
  currentUserId={currentUser?.id}
  onEntrevistaCompleta={(id, resultado) => console.log(`Candidatura ${id}: ${resultado}`)}
/>
```

---

## 📊 Fluxo de Uso

```
┌─────────────────────────────────────────────────────────────┐
│ 1️⃣ ANÁLISE DE CV (AnaliseRisco.tsx)                         │
│    • Upload de CV                                           │
│    • Seleciona Vaga                                         │
│    • Análise de Adequação                                   │
│    • Perguntas geradas → Salvas em analise_adequacao        │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│ 2️⃣ ENTREVISTA TÉCNICA (EntrevistaTecnicaInteligente.tsx)    │
│    • Seleciona Candidatura                                  │
│    • Busca Perguntas (da análise anterior)                  │
│    • Conduz Entrevista                                      │
│    • Upload do Áudio                                        │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│ 3️⃣ PROCESSAMENTO IA                                         │
│    • Transcrição (Gemini)                                   │
│    • Análise Respostas vs Perguntas                         │
│    • Score Técnico / Comunicação / Geral                    │
│    • Recomendação: APROVAR / REPROVAR / REAVALIAR           │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│ 4️⃣ DECISÃO DO ANALISTA                                      │
│    • Revisa resultados                                      │
│    • Aprova ou Reprova                                      │
│    • Adiciona observações                                   │
│    • Tudo salvo em entrevista_tecnica                       │
└─────────────────────────────────────────────────────────────┘
```

---

## 🔧 Integração no AnaliseRisco

Para salvar a análise automaticamente no AnaliseRisco.tsx, adicione após a análise:

```tsx
// Após receber resultado da análise de adequação
const resultado = await response.json();

if (resultado.success && resultado.data) {
  setAnaliseAdequacao(resultado.data);
  
  // NOVO: Salvar na tabela analise_adequacao
  const { data: savedAnalise, error } = await supabase
    .from('analise_adequacao')
    .insert({
      pessoa_id: pessoaSalva?.id || null,
      vaga_id: vagaSelecionada?.id || null,
      candidatura_id: null, // Se tiver candidatura
      score_geral: resultado.data.score_geral,
      nivel_adequacao: resultado.data.nivel_adequacao_geral,
      confianca_analise: resultado.data.confianca_analise,
      recomendacao: resultado.data.avaliacao_final?.recomendacao,
      perguntas_entrevista: resultado.data.perguntas_entrevista,
      resultado_completo: resultado.data,
      modelo_ia: 'gemini-2.0-flash'
    })
    .select('id')
    .single();
    
  if (!error) {
    console.log('✅ Análise salva com ID:', savedAnalise.id);
  }
}
```

---

## 📱 API Reference

### POST /api/gemini-audio-transcription

#### Ação: transcribe
```json
{
  "action": "transcribe",
  "audioBase64": "base64_do_audio",
  "audioMimeType": "audio/mp3"
}
```

#### Ação: analyze
```json
{
  "action": "analyze",
  "transcricao": "texto da transcrição",
  "perguntas": [
    { "pergunta": "...", "categoria": "Técnico", "peso": 1 }
  ],
  "vaga": { "titulo": "...", "requisitos_obrigatorios": "..." },
  "candidato": { "nome": "..." }
}
```

#### Ação: transcribe_and_analyze (combo)
```json
{
  "action": "transcribe_and_analyze",
  "audioBase64": "...",
  "audioMimeType": "audio/mp3",
  "perguntas": [...],
  "vaga": {...},
  "candidato": {...}
}
```

---

## ✅ Checklist de Deploy

- [ ] Executar SQL no Supabase
- [ ] Criar bucket `entrevistas-audio` no Storage
- [ ] Copiar `gemini-audio-transcription.ts` para `/api`
- [ ] Copiar `EntrevistaTecnicaInteligente.tsx` para `/src/components/raisa`
- [ ] Atualizar `useAnaliseAdequacao.ts`
- [ ] Atualizar imports no App.tsx
- [ ] git commit & push
- [ ] Testar fluxo completo

---

## 🎉 Pronto!

Com esses arquivos, você terá:
- ✅ Perguntas de entrevista personalizadas por vaga
- ✅ Upload e transcrição automática de áudio
- ✅ Análise por IA das respostas
- ✅ Scores detalhados (técnico, comunicação, geral)
- ✅ Recomendação automática
- ✅ Histórico persistido no banco
- ✅ Transcrição salva para auditoria futura
