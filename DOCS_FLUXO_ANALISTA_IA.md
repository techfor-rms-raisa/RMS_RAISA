
_Este documento foi gerado pela IA Manus em 01/12/2025._

# 🚀 Documentação Técnica: Fluxo do Analista com IA - ORBIT.AI

## 1. Visão Geral

Esta documentação detalha a implementação dos novos endpoints de API e do cron job que compõem o **Fluxo do Analista de R&S potencializado por Inteligência Artificial**. O objetivo é automatizar e enriquecer o processo de recrutamento, desde a geração de perguntas para entrevistas até a análise preditiva de risco de reprovação.

O sistema foi construído de forma modular, com serviços desacoplados e endpoints de API claros, utilizando o framework Next.js e a API do Google Gemini para as funcionalidades de IA.

### Arquitetura da Solução

A solução é composta por três camadas principais:

1.  **Camada de API (`/api`)**: Expõe os endpoints HTTP para o frontend e para os cron jobs. É a porta de entrada para todas as requisições.
2.  **Camada de Serviços (`/src/services`)**: Contém a lógica de negócio principal. Orquestra as chamadas ao banco de dados e à camada de IA.
3.  **Camada de IA (`/services/geminiService.ts`)**: Isola toda a comunicação com a API do Google Gemini, contendo os prompts, os schemas de resposta e o tratamento de erros.

## 2. Endpoints de API

Foram criados 3 novos arquivos de API para servir as funcionalidades de IA. Todos os endpoints seguem o padrão de autenticação e tratamento de erros já existente no projeto.

### 2.1. Questões Inteligentes

Este endpoint gerencia a criação e o registro de perguntas e respostas de entrevistas.

-   **Arquivo**: `api/questoes-inteligentes.ts`

| Método | Rota                                       | Descrição                                         |
| :----- | :----------------------------------------- | :-------------------------------------------------- |
| `POST` | `/api/questoes-inteligentes/gerar`         | Gera de 5 a 10 questões personalizadas para uma vaga. |
| `POST` | `/api/questoes-inteligentes/responder`     | Salva a resposta de um candidato a uma questão.     |
| `GET`  | `/api/questoes-inteligentes/[vagaId]`      | Busca todas as questões geradas para uma vaga.      |

**Exemplo de uso (Gerar Questões):**

```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -d '{
    "vagaId": "a1b2c3d4-e5f6-g7h8-i9j0-k1l2m3n4o5p6",
    "analistaId": "z9y8x7w6-v5u4-t3s2-r1q0-p9o8n7m6l5k4"
  }' \
  https://seu-dominio.com/api/questoes-inteligentes/gerar
```

### 2.2. Recomendação do Analista

Endpoint central para a análise de candidatos, gerando recomendações de "Aprovar", "Rejeitar" ou "Reavaliar".

-   **Arquivo**: `api/recomendacao-analista.ts`

| Método | Rota                                     | Descrição                                                                   |
| :----- | :--------------------------------------- | :-------------------------------------------------------------------------- |
| `POST` | `/api/recomendacao-analista/analisar`    | Executa a análise completa de um candidato e gera a recomendação da IA.     |
| `POST` | `/api/recomendacao-analista/enviar-cv`   | **Endpoint chave.** Usado quando o analista envia o CV. Detecta automaticamente se a ação diverge da recomendação da IA. |
| `GET`  | `/api/recomendacao-analista/[candidaturaId]` | Busca a recomendação de IA para uma candidatura específica.                 |

**Exemplo de uso (Analisar Candidato):**

```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -d '{
    "candidaturaId": "c1d2e3f4-g5h6-i7j8-k9l0-m1n2o3p4q5r6",
    "analistaId": "z9y8x7w6-v5u4-t3s2-r1q0-p9o8n7m6l5k4",
    "parecerAnalista": "Candidato demonstrou bom conhecimento em React, mas pareceu um pouco inseguro sobre testes automatizados."
  }' \
  https://seu-dominio.com/api/recomendacao-analista/analisar
```

### 2.3. Predição de Riscos

Fornece uma análise preditiva sobre a probabilidade de um candidato ser reprovado pelo cliente final.

-   **Arquivo**: `api/predicao-riscos.ts`

| Método | Rota                                   | Descrição                                                               |
| :----- | :------------------------------------- | :---------------------------------------------------------------------- |
| `POST` | `/api/predicao-riscos/prever`          | Calcula o risco de reprovação de um candidato antes do envio ao cliente. |
| `POST` | `/api/predicao-riscos/gerar-alertas`   | Gera alertas proativos para todas as candidaturas de uma vaga em risco. |
| `GET`  | `/api/predicao-riscos/[candidaturaId]` | Busca a predição de risco para uma candidatura.                         |

## 3. Cron Job: Aprendizado Contínuo

Para que a IA aprenda e melhore com o tempo, foi criado um cron job que executa uma análise mensal dos padrões de reprovação.

-   **Arquivo**: `api/cron/analise-reprovacoes.ts`

### Funcionalidades

-   **Análise de Padrões**: Identifica os motivos mais comuns de reprovação (técnicos e comportamentais).
-   **Análise de Red Flags**: Encontra os sinais de alerta que mais se correlacionam com reprovações.
-   **Avaliação de Questões**: Mede a eficácia das questões geradas pela IA.
-   **Acurácia da IA**: Compara as recomendações da IA com o feedback final do cliente para medir a acurácia.
-   **Divergências do Analista**: Analisa os casos em que o analista não seguiu a recomendação da IA e qual foi o resultado.

### Configuração

Para ativar o cron job, adicione a seguinte configuração ao seu arquivo `vercel.json`:

```json
{
  "crons": [
    {
      "path": "/api/cron/analise-reprovacoes",
      "schedule": "0 2 1 * *"
    }
    // ... outros cron jobs
  ]
}
```

-   **Schedule `0 2 1 * *`**: Significa que o job será executado todo **dia 1º de cada mês, às 02:00 AM**.

### Variáveis de Ambiente

Certifique-se de que as seguintes variáveis de ambiente estão configuradas no seu ambiente Vercel (ou similar):

-   `CRON_SECRET`: Um token secreto para autenticar as requisições do cron job.
-   `DATABASE_URL`: A URL de conexão com o banco de dados Supabase.
-   `API_KEY`: A chave de API para o Google Gemini.

## 4. Próximos Passos e Recomendações

1.  **Integração com Frontend**: Os novos endpoints devem ser integrados aos componentes React correspondentes (`QuestoesRecomendadasPanel.tsx`, `RecomendacaoIACard.tsx`, etc.).
2.  **Testes End-to-End**: É crucial realizar testes completos do fluxo, simulando o processo de uma candidatura do início ao fim.
3.  **Monitoramento e Logs**: Acompanhe os logs no Vercel, especialmente os do cron job, para garantir que a análise mensal está sendo executada corretamente.
4.  **Ajuste de Prompts**: Os prompts da IA no `geminiService.ts` podem ser refinados com o tempo, com base nos resultados e no feedback dos analistas, para melhorar ainda mais a qualidade das respostas.
