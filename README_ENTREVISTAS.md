# 🎙️ FUNCIONALIDADE DE ENTREVISTAS - ORBIT.AI

## 📋 O QUE FOI IMPLEMENTADO

Esta funcionalidade permite que analistas de R&S:

1. ✅ **Registrem entrevistas** realizadas com candidatos
2. ✅ **Façam upload de arquivos** de áudio/vídeo (para referência)
3. ✅ **Colem transcrições** manuais (do Teams, Zoom, ou outras ferramentas)
4. ✅ **Sumarizem automaticamente** as entrevistas usando IA (Gemini)
5. ✅ **Visualizem insights** gerados pela IA sobre o candidato
6. ✅ **Integrem** o resumo da entrevista na avaliação final do candidato

---

## 🗄️ SETUP DO BANCO DE DADOS

### **PASSO 1: Criar a tabela `entrevistas`**

1. Acesse o painel do Supabase
2. Vá em **SQL Editor**
3. Abra o arquivo `database/entrevistas.sql`
4. Copie todo o conteúdo
5. Cole no SQL Editor do Supabase
6. Clique em **Run**

Este script irá criar:
- ✅ Tabela `entrevistas` com todos os campos
- ✅ 3 Views úteis (`vw_entrevistas_completas`, `vw_entrevistas_stats_analista`, `vw_entrevistas_pendentes_sumario`)
- ✅ Triggers automáticos
- ✅ Índices de performance
- ✅ Políticas de segurança (RLS)

### **PASSO 2: Criar bucket de Storage (opcional)**

Se você quiser permitir upload de arquivos de áudio/vídeo:

1. Vá em **Storage** no Supabase
2. Clique em **New Bucket**
3. Nome: `media`
4. Público: **Sim** (para permitir download dos arquivos)
5. Clique em **Create**

---

## 🚀 COMO USAR

### **Para Analistas:**

1. **Acesse uma candidatura** no módulo RAISA
2. **Clique no botão "Gerenciar Entrevistas"** (novo botão adicionado)
3. **Clique em "+ Nova Entrevista"**
4. **Preencha os dados:**
   - Data e hora da entrevista
   - Tipo (Técnica, Comportamental, Cliente, Mista)
   - Plataforma (Teams, Zoom, Meet, etc.)
   - Duração em minutos
5. **(Opcional) Faça upload do arquivo** de áudio/vídeo
6. **Cole a transcrição** no campo de texto
   - Se usou Teams: copie a transcrição automática do Teams
   - Se usou Zoom: copie a transcrição do Zoom
   - Se foi presencial: transcreva manualmente ou use ferramenta externa
7. **Clique em "Criar e Sumarizar Entrevista"**
8. **Aguarde alguns segundos** enquanto a IA processa
9. **Veja o resumo gerado** com:
   - Resumo narrativo
   - Pontos fortes do candidato
   - Áreas de desenvolvimento
   - Score de fit cultural (1-5)
   - Citações importantes
   - Recomendação de próxima etapa

---

## 📁 ARQUIVOS CRIADOS

### **Backend (Services):**
- `services/interviewService.ts` - CRUD de entrevistas
- `services/interviewTranscriptionService.ts` - Transcrição e sumarização
- `services/geminiService.ts` - IA (já existia, foi atualizado)

### **Frontend (Componentes):**
- `components/raisa/InterviewManager.tsx` - Gerenciador principal

### **Banco de Dados:**
- `database/entrevistas.sql` - Script de criação da tabela

---

## 🔧 INTEGRAÇÕES

### **Onde adicionar o botão de entrevistas:**

O componente `InterviewManager` pode ser integrado em:

1. **Candidaturas.tsx** - Adicionar botão "Gerenciar Entrevistas" na lista de candidaturas
2. **EntrevistaTecnica.tsx** - Integrar diretamente no fluxo de entrevista técnica

### **Exemplo de integração:**

```typescript
import InterviewManager from './InterviewManager';

// Dentro do componente
const [showEntrevistas, setShowEntrevistas] = useState(false);

// No JSX
{showEntrevistas && (
    <InterviewManager
        candidatura_id={candidatura.id}
        vaga_id={candidatura.vaga_id}
        vaga_descricao={vaga.descricao}
        analista_id={currentUser.id}
        onClose={() => setShowEntrevistas(false)}
    />
)}
```

---

## 🤖 COMO FUNCIONA A IA

### **Sumarização com Gemini:**

1. **Entrada:** Transcrição da entrevista + Descrição da vaga
2. **Processamento:** Gemini analisa o diálogo e extrai insights
3. **Saída:** Objeto JSON estruturado com:
   - `narrativeSummary`: Resumo em texto
   - `strengths`: Array de pontos fortes
   - `areasForDevelopment`: Array de áreas a desenvolver
   - `culturalFitScore`: Pontuação de 1 a 5
   - `keyQuotes`: Citações importantes do candidato
   - `nextStepRecommendation`: Recomendação (Avançar, Rejeitar, Reentrevista, Aguardando Cliente)

### **Integração com Avaliação Final:**

O resumo da entrevista é automaticamente usado na função `generateFinalAssessment` do Gemini, que combina:
- ✅ Dados do CV (currículo)
- ✅ Resumo da entrevista
- ✅ Requisitos da vaga

Para gerar uma **avaliação final completa** do candidato.

---

## 📊 VIEWS CRIADAS

### **1. vw_entrevistas_completas**
Lista todas as entrevistas com dados relacionados (candidato, vaga, cliente, analista)

### **2. vw_entrevistas_stats_analista**
Estatísticas de entrevistas por analista:
- Total de entrevistas
- Total sumarizadas
- Média de fit cultural
- Média de duração
- Etc.

### **3. vw_entrevistas_pendentes_sumario**
Entrevistas que têm transcrição mas ainda não foram sumarizadas

---

## ⚠️ OBSERVAÇÕES IMPORTANTES

### **Transcrição Manual vs Automática:**

Esta implementação usa **transcrição manual** (o analista cola o texto).

**Por quê?**
- ✅ Mais simples de implementar
- ✅ Funciona com qualquer ferramenta (Teams, Zoom, Meet, etc.)
- ✅ Sem custo adicional
- ✅ Sem necessidade de backend complexo

**Ferramentas que já fazem transcrição automática:**
- Microsoft Teams (transcrição automática nativa)
- Zoom (transcrição automática com plano pago)
- Google Meet (transcrição automática com Google Workspace)
- Otter.ai (ferramenta externa gratuita)

### **Tamanho da Transcrição:**

- **Mínimo:** 50 caracteres
- **Máximo recomendado:** 50.000 caracteres (~10.000 palavras)
- **Tempo de processamento:** 3-10 segundos (depende do tamanho)

### **Custo da IA:**

- Gemini Flash é **gratuito** até 15 requisições por minuto
- Cada sumarização conta como 1 requisição
- Para uso intenso, considere o Gemini Pro (pago)

---

## 🎯 PRÓXIMOS PASSOS (FUTURO)

Se quiser evoluir esta funcionalidade no futuro:

1. **Transcrição Automática:**
   - Integrar Google Cloud Speech-to-Text
   - Criar backend Node.js para processar áudio
   - Upload direto do arquivo → transcrição automática

2. **Análise de Sentimento:**
   - Detectar emoções na fala do candidato
   - Identificar hesitações ou inseguranças

3. **Comparação de Candidatos:**
   - Dashboard comparativo de entrevistas
   - Ranking automático baseado em fit

4. **Feedback Automático:**
   - Gerar email de feedback para o candidato
   - Baseado no resumo da entrevista

---

## 🆘 TROUBLESHOOTING

### **Erro ao criar entrevista:**
- Verifique se a tabela `entrevistas` foi criada no Supabase
- Verifique se o usuário tem permissão (RLS policies)

### **Erro ao sumarizar:**
- Verifique se a variável de ambiente `VITE_API_KEY` está configurada (Gemini)
- Verifique se a transcrição tem pelo menos 50 caracteres
- Verifique o console do navegador para erros detalhados

### **Upload de arquivo não funciona:**
- Verifique se o bucket `media` foi criado no Supabase Storage
- Verifique se o bucket está configurado como público

---

## 📞 SUPORTE

Para dúvidas ou problemas:
1. Verifique o console do navegador (F12)
2. Verifique os logs do Supabase
3. Entre em contato com o time de desenvolvimento

---

**Desenvolvido com ❤️ para Orbit.ai**
