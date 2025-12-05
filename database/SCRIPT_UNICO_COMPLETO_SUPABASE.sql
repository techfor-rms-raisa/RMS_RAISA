-- ============================================================================
-- ORBIT.AI V2.1 - DATABASE SCHEMA COMPLETO
-- Data: 01/12/2025
-- Inclui: RMS + RAISA + COMPLIANCE + AI + FLUXO DO ANALISTA
-- ============================================================================
-- 
-- IMPORTANTE: Este script cria TODAS as tabelas do sistema do zero
-- Execute este script em um banco de dados VAZIO ou que não tenha as tabelas
--
-- ============================================================================

-- ============================================================================
-- PARTE 1: EXTENSÕES
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- PARTE 2: TIPOS ENUM (Tipagem Forte)
-- ============================================================================

-- Tipos do Sistema Core
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
CREATE TYPE user_role AS ENUM ('Administrador', 'Gestão Comercial', 'Gestão de Pessoas', 'Analista de R&S', 'Consulta', 'Cliente');
END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'consultant_status') THEN
CREATE TYPE consultant_status AS ENUM ('Ativo', 'Perdido', 'Encerrado');
END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'template_status') THEN
CREATE TYPE template_status AS ENUM ('rascunho', 'em_revisao', 'aprovado', 'rejeitado');
END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'campaign_target') THEN
CREATE TYPE campaign_target AS ENUM ('all_active', 'quarantine', 'risk_only');
END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'campaign_status') THEN
CREATE TYPE campaign_status AS ENUM ('active', 'paused', 'completed');
END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'action_status') THEN
CREATE TYPE action_status AS ENUM ('pendente', 'concluido');
END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'action_priority') THEN
CREATE TYPE action_priority AS ENUM ('alta', 'media', 'baixa');
END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'alert_origin') THEN
CREATE TYPE alert_origin AS ENUM ('ai_feedback', 'ai_quarantine', 'manual');
END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'flag_type') THEN
CREATE TYPE flag_type AS ENUM ('ATTENDANCE', 'COMMUNICATION', 'QUALITY', 'ENGAGEMENT', 'OTHER');
END IF; END $$;

-- RAISA Enums
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'vaga_status') THEN
CREATE TYPE vaga_status AS ENUM ('aberta', 'pausada', 'fechada', 'cancelada');
END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'senioridade_nivel') THEN
CREATE TYPE senioridade_nivel AS ENUM ('Junior', 'Pleno', 'Senior', 'Especialista');
END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'candidatura_status') THEN
CREATE TYPE candidatura_status AS ENUM (
'triagem', 'entrevista', 'teste_tecnico', 'aprovado', 'reprovado',
'enviado_cliente', 'aguardando_cliente', 'aprovado_cliente', 'reprovado_cliente',
'aprovado_interno', 'reprovado_interno', 'contratado'
);
END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'envio_meio') THEN
CREATE TYPE envio_meio AS ENUM ('email', 'portal_cliente', 'whatsapp', 'outro');
END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'decisao_cliente') THEN
CREATE TYPE decisao_cliente AS ENUM ('aprovado', 'reprovado', 'em_analise', 'aguardando_resposta');
END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'nivel_dificuldade') THEN
CREATE TYPE nivel_dificuldade AS ENUM ('junior', 'pleno', 'senior');
END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'categoria_pergunta') THEN
CREATE TYPE categoria_pergunta AS ENUM ('tecnica', 'comportamental', 'experiencia');
END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'impressao_analista') THEN
CREATE TYPE impressao_analista AS ENUM ('excelente', 'boa', 'regular', 'fraca');
END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'recomendacao_ia') THEN
CREATE TYPE recomendacao_ia AS ENUM ('aprovado', 'reprovado', 'condicional');
END IF; END $$;

-- Novos tipos para Fluxo do Analista com IA
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'categoria_questao_ia') THEN
CREATE TYPE categoria_questao_ia AS ENUM ('tecnica', 'comportamental', 'cultural');
END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'recomendacao_decisao') THEN
CREATE TYPE recomendacao_decisao AS ENUM ('aprovar', 'rejeitar', 'reavaliar');
END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tipo_red_flag') THEN
CREATE TYPE tipo_red_flag AS ENUM ('tecnico', 'comportamental', 'comunicacao', 'experiencia', 'cultural');
END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'nivel_risco') THEN
CREATE TYPE nivel_risco AS ENUM ('baixo', 'medio', 'alto', 'critico');
END IF; END $$;

-- ============================================================================
-- PARTE 3: CORE & RMS TABLES
-- ============================================================================

-- Usuários do Sistema
CREATE TABLE IF NOT EXISTS app_users (
id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
nome_usuario TEXT NOT NULL,
email_usuario TEXT UNIQUE NOT NULL,
senha_usuario TEXT NOT NULL,
ativo_usuario BOOLEAN DEFAULT TRUE,
receber_alertas_email BOOLEAN DEFAULT FALSE,
tipo_usuario user_role NOT NULL,
client_id BIGINT,
gestor_rs_id BIGINT,
created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Clientes
CREATE TABLE IF NOT EXISTS clients (
id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
razao_social_cliente TEXT NOT NULL,
ativo_cliente BOOLEAN DEFAULT TRUE,
vip BOOLEAN DEFAULT FALSE,
id_gestao_comercial BIGINT REFERENCES app_users(id),
id_gestao_de_pessoas BIGINT REFERENCES app_users(id),
id_gestor_rs BIGINT REFERENCES app_users(id),
created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Consultores
CREATE TABLE IF NOT EXISTS consultants (
id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
nome_consultores TEXT NOT NULL,
email_consultor TEXT UNIQUE,
cpf VARCHAR(14) UNIQUE,
cargo_consultores TEXT,
ano_vigencia INT DEFAULT EXTRACT(YEAR FROM NOW()),
data_inclusao_consultores DATE NOT NULL,
data_ultima_alteracao DATE,
data_saida DATE,
status consultant_status DEFAULT 'Ativo',
motivo_desligamento TEXT,
valor_faturamento NUMERIC(10, 2),
gestor_imediato_id BIGINT REFERENCES app_users(id),
coordenador_id BIGINT REFERENCES app_users(id),
gestor_rs_id BIGINT REFERENCES app_users(id),
id_gestao_de_pessoas BIGINT REFERENCES app_users(id),
parecer_1_consultor INT, parecer_2_consultor INT, parecer_3_consultor INT,
parecer_4_consultor INT, parecer_5_consultor INT, parecer_6_consultor INT,
parecer_7_consultor INT, parecer_8_consultor INT, parecer_9_consultor INT,
parecer_10_consultor INT, parecer_11_consultor INT, parecer_12_consultor INT,
parecer_final_consultor INT,
created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Relatórios de Acompanhamento RMS
CREATE TABLE IF NOT EXISTS consultant_reports (
id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
consultant_id BIGINT REFERENCES consultants(id) ON DELETE CASCADE,
month INT NOT NULL,
year INT NOT NULL,
risk_score INT NOT NULL,
summary TEXT,
negative_pattern TEXT,
predictive_alert TEXT,
recommendations JSONB,
content TEXT,
generated_by TEXT CHECK (generated_by IN ('manual', 'ia_automatica')) DEFAULT 'manual',
alert_type TEXT CHECK (alert_type IN ('queda_performance', 'risco_sistemico', 'falta_contato')),
ai_justification TEXT,
created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Memória de Comportamentos (IA Learning Loop)
CREATE TABLE IF NOT EXISTS consultant_behavioral_flags (
id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
report_id UUID REFERENCES consultant_reports(id) ON DELETE SET NULL,
consultant_id BIGINT REFERENCES consultants(id) ON DELETE CASCADE,
flag_type flag_type NOT NULL,
description TEXT NOT NULL,
flag_date DATE NOT NULL,
ativo BOOLEAN DEFAULT TRUE,
created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS learning_feedback_loop (
id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
person_id BIGINT,
termination_reason TEXT,
candidacy_risks JSONB,
behavioral_history JSONB,
created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- PARTE 4: COMPLIANCE MODULE
-- ============================================================================

CREATE TABLE IF NOT EXISTS email_templates (
id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
name TEXT NOT NULL,
subject TEXT NOT NULL,
body TEXT NOT NULL,
context TEXT,
status template_status DEFAULT 'rascunho',
created_at TIMESTAMPTZ DEFAULT NOW(),
updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS compliance_campaigns (
id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
name TEXT NOT NULL,
target_filter campaign_target NOT NULL,
interval_days INT DEFAULT 7,
start_date TIMESTAMPTZ,
status campaign_status DEFAULT 'paused',
created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS feedback_requests (
id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
consultant_id BIGINT REFERENCES consultants(id) ON DELETE CASCADE,
campaign_id UUID REFERENCES compliance_campaigns(id),
token UUID DEFAULT uuid_generate_v4() UNIQUE NOT NULL,
status TEXT CHECK (status IN ('pending', 'answered')) DEFAULT 'pending',
created_at TIMESTAMPTZ DEFAULT NOW(),
expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '7 days')
);

CREATE TABLE IF NOT EXISTS feedback_responses (
id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
request_id UUID REFERENCES feedback_requests(id),
consultant_id BIGINT REFERENCES consultants(id),
score INT NOT NULL CHECK (score >= 0 AND score <= 10),
comment TEXT,
answered_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rh_actions (
id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
consultant_id BIGINT REFERENCES consultants(id) ON DELETE CASCADE,
description TEXT NOT NULL,
status action_status DEFAULT 'pendente',
priority action_priority DEFAULT 'media',
origin alert_origin NOT NULL,
created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- PARTE 5: RAISA (RECRUITMENT) MODULE
-- ============================================================================

-- Pessoas (Candidatos)
CREATE TABLE IF NOT EXISTS pessoas (
id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
nome VARCHAR(255) NOT NULL,
email VARCHAR(255) UNIQUE NOT NULL,
telefone VARCHAR(20),
cpf VARCHAR(14) UNIQUE,
linkedin_url TEXT,
curriculo_url TEXT,
observacoes TEXT,
created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Vagas
CREATE TABLE IF NOT EXISTS vagas (
id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
titulo VARCHAR(255) NOT NULL,
descricao TEXT,
senioridade senioridade_nivel,
stack_tecnologica TEXT[],
salario_min DECIMAL(10,2),
salario_max DECIMAL(10,2),
status vaga_status DEFAULT 'aberta',
requisitos_obrigatorios TEXT[],
requisitos_desejaveis TEXT[],
regime_contratacao VARCHAR(50),
modalidade VARCHAR(50),
beneficios TEXT[],
analista_id BIGINT REFERENCES app_users(id),
cliente_id BIGINT REFERENCES clients(id),
urgente BOOLEAN DEFAULT FALSE,
prazo_fechamento DATE,
faturamento_mensal DECIMAL(10,2),
criado_em TIMESTAMPTZ DEFAULT NOW(),
atualizado_em TIMESTAMPTZ DEFAULT NOW()
);

-- Candidaturas
CREATE TABLE IF NOT EXISTS candidaturas (
id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
vaga_id BIGINT REFERENCES vagas(id),
pessoa_id BIGINT REFERENCES pessoas(id),
candidato_nome VARCHAR(255),
candidato_email VARCHAR(255),
candidato_cpf VARCHAR(14),
analista_id BIGINT REFERENCES app_users(id),
status candidatura_status DEFAULT 'triagem',
curriculo_texto TEXT,
cv_url TEXT,
observacoes TEXT,
feedback_cliente TEXT,
data_envio_cliente TIMESTAMPTZ,
enviado_ao_cliente BOOLEAN DEFAULT FALSE,
criado_em TIMESTAMPTZ DEFAULT NOW(),
atualizado_em TIMESTAMPTZ DEFAULT NOW()
);

-- Controle de Envios (Cliente)
CREATE TABLE IF NOT EXISTS candidatura_envio (
id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
candidatura_id BIGINT REFERENCES candidaturas(id) ON DELETE CASCADE,
vaga_id BIGINT REFERENCES vagas(id),
analista_id BIGINT REFERENCES app_users(id),
cliente_id BIGINT REFERENCES clients(id),
enviado_em TIMESTAMPTZ DEFAULT NOW(),
enviado_por BIGINT REFERENCES app_users(id),
meio_envio envio_meio,
destinatario_email VARCHAR(255),
destinatario_nome VARCHAR(255),
cv_anexado_url TEXT,
cv_versao VARCHAR(50),
observacoes TEXT,
status VARCHAR(50) DEFAULT 'enviado',
visualizado_em TIMESTAMPTZ,
ativo BOOLEAN DEFAULT TRUE,
metadados JSONB
);

-- Controle de Aprovação (Cliente)
CREATE TABLE IF NOT EXISTS candidatura_aprovacao (
id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
candidatura_id BIGINT UNIQUE REFERENCES candidaturas(id) ON DELETE CASCADE,
candidatura_envio_id BIGINT REFERENCES candidatura_envio(id),
vaga_id BIGINT REFERENCES vagas(id),
cliente_id BIGINT REFERENCES clients(id),
analista_id BIGINT REFERENCES app_users(id),
decisao decisao_cliente,
decidido_em TIMESTAMPTZ,
decidido_por VARCHAR(255),
motivo_reprovacao TEXT,
categoria_reprovacao VARCHAR(100),
feedback_cliente TEXT,
prazo_resposta_dias INT DEFAULT 5,
respondido_no_prazo BOOLEAN,
dias_para_resposta INT,
registrado_em TIMESTAMPTZ DEFAULT NOW(),
ativo BOOLEAN DEFAULT TRUE
);

-- Análise Proativa de Vaga (IA)
CREATE TABLE IF NOT EXISTS vaga_analise_ia (
id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
vaga_id BIGINT UNIQUE REFERENCES vagas(id) ON DELETE CASCADE,
descricao_original TEXT,
fonte VARCHAR(50),
sugestoes JSONB,
confidence_score INT,
confidence_detalhado JSONB,
ajustes JSONB,
total_ajustes INT DEFAULT 0,
campos_ajustados TEXT[],
qualidade_sugestao INT,
feedback_texto TEXT,
analisado_em TIMESTAMPTZ DEFAULT NOW(),
analisado_por VARCHAR(20) DEFAULT 'Gemini',
revisado_em TIMESTAMPTZ,
revisado_por BIGINT,
aprovado BOOLEAN DEFAULT FALSE,
requer_revisao_manual BOOLEAN DEFAULT FALSE,
metadados JSONB
);

-- Perguntas Técnicas (Geradas por IA)
CREATE TABLE IF NOT EXISTS vaga_perguntas_tecnicas (
id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
vaga_id BIGINT REFERENCES vagas(id) ON DELETE CASCADE,
pergunta_texto TEXT,
categoria categoria_pergunta,
tecnologia_relacionada VARCHAR(100),
nivel_dificuldade nivel_dificuldade,
resposta_esperada TEXT,
pontos_chave JSONB,
ordem INT,
gerada_em TIMESTAMPTZ DEFAULT NOW(),
gerada_por VARCHAR(20) DEFAULT 'Gemini',
ativa BOOLEAN DEFAULT TRUE,
metadados JSONB
);

-- Respostas do Candidato
CREATE TABLE IF NOT EXISTS candidatura_respostas (
id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
candidatura_id BIGINT REFERENCES candidaturas(id) ON DELETE CASCADE,
pergunta_id BIGINT REFERENCES vaga_perguntas_tecnicas(id),
vaga_id BIGINT REFERENCES vagas(id),
analista_id BIGINT REFERENCES app_users(id),
resposta_texto TEXT,
coletada_em TIMESTAMPTZ DEFAULT NOW(),
observacoes_analista TEXT,
impressao_analista impressao_analista,
metadados JSONB
);

-- Matriz de Qualificações
CREATE TABLE IF NOT EXISTS candidatura_matriz_qualificacoes (
id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
candidatura_id BIGINT UNIQUE REFERENCES candidaturas(id) ON DELETE CASCADE,
vaga_id BIGINT REFERENCES vagas(id),
analista_id BIGINT REFERENCES app_users(id),
qualificacoes JSONB,
preenchida_em TIMESTAMPTZ DEFAULT NOW(),
preenchida_por BIGINT REFERENCES app_users(id),
metadados JSONB
);

-- Avaliação Final IA
CREATE TABLE IF NOT EXISTS candidatura_avaliacao_ia (
id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
candidatura_id BIGINT UNIQUE REFERENCES candidaturas(id) ON DELETE CASCADE,
vaga_id BIGINT REFERENCES vagas(id),
analista_id BIGINT REFERENCES app_users(id),
score_geral INT,
recomendacao recomendacao_ia,
pontos_fortes JSONB,
gaps_identificados JSONB,
score_tecnico INT,
score_experiencia INT,
score_fit_cultural INT,
justificativa TEXT,
requisitos_atendidos JSONB,
taxa_atendimento INT,
decisao_final VARCHAR(50),
decisao_justificativa TEXT,
decidido_por BIGINT REFERENCES app_users(id),
decidido_em TIMESTAMPTZ,
concordancia BOOLEAN,
avaliado_em TIMESTAMPTZ DEFAULT NOW(),
avaliado_por VARCHAR(20) DEFAULT 'Gemini',
metadados JSONB
);

-- ============================================================================
-- PARTE 6: RAISA ADVANCED - DISTRIBUTION & PRIORITIZATION
-- ============================================================================

-- Distribuição de Vagas
CREATE TABLE IF NOT EXISTS vaga_distribuicao (
id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
vaga_id BIGINT REFERENCES vagas(id) ON DELETE CASCADE,
analista_id BIGINT REFERENCES app_users(id),
analista_nome VARCHAR(255),
tipo_distribuicao VARCHAR(50) CHECK (tipo_distribuicao IN ('automatica', 'manual')),
distribuido_em TIMESTAMPTZ DEFAULT NOW(),
distribuido_por BIGINT,
score_match INT,
justificativa_match TEXT,
reatribuido BOOLEAN DEFAULT FALSE,
reatribuido_de BIGINT,
reatribuido_em TIMESTAMPTZ,
reatribuido_por BIGINT,
motivo_reatribuicao TEXT,
ativo BOOLEAN DEFAULT TRUE,
metadados JSONB
);

-- Priorização de Vagas
CREATE TABLE IF NOT EXISTS vaga_priorizacao (
id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
vaga_id BIGINT UNIQUE REFERENCES vagas(id) ON DELETE CASCADE,
score_prioridade INT,
nivel_prioridade VARCHAR(20) CHECK (nivel_prioridade IN ('alta', 'media', 'baixa')),
score_urgencia INT,
score_faturamento INT,
score_velocidade INT,
score_tempo_aberto INT,
score_cliente_vip INT,
justificativa TEXT,
sla_dias INT,
prazo_limite DATE,
dias_restantes INT,
em_atraso BOOLEAN DEFAULT FALSE,
ajuste_manual BOOLEAN DEFAULT FALSE,
ajustado_por BIGINT,
ajustado_em TIMESTAMPTZ,
motivo_ajuste TEXT,
calculado_em TIMESTAMPTZ DEFAULT NOW(),
ultima_atualizacao TIMESTAMPTZ DEFAULT NOW(),
metadados JSONB
);

-- Priorização Histórico
CREATE TABLE IF NOT EXISTS priorizacao_historico (
id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
vaga_id BIGINT REFERENCES vagas(id) ON DELETE CASCADE,
nivel_anterior VARCHAR(20),
nivel_novo VARCHAR(20),
score_anterior INT,
score_novo INT,
tipo_mudanca VARCHAR(50),
motivo TEXT,
alterado_em TIMESTAMPTZ DEFAULT NOW(),
alterado_por BIGINT,
metadados JSONB
);

-- ============================================================================
-- PARTE 7: RAISA ADVANCED - AI TUNING & CV GENERATION
-- ============================================================================

-- Tunning de IA (Avaliação de Resposta)
CREATE TABLE IF NOT EXISTS pergunta_resposta_avaliacao (
id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
candidatura_id BIGINT REFERENCES candidaturas(id) ON DELETE CASCADE,
vaga_id BIGINT REFERENCES vagas(id),
analista_id BIGINT REFERENCES app_users(id),
pergunta_id BIGINT REFERENCES vaga_perguntas_tecnicas(id),
pergunta_texto TEXT,
resposta_texto TEXT,
score_profundidade INT,
score_relevancia INT,
score_completude INT,
score_evidencias INT,
score_total INT,
feedback_ia TEXT,
sugestao_melhoria TEXT,
avaliado_em TIMESTAMPTZ DEFAULT NOW(),
avaliado_por VARCHAR(20) DEFAULT 'Gemini',
metadados JSONB
);

-- Templates de CV
CREATE TABLE IF NOT EXISTS cv_template (
id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
nome VARCHAR(255),
descricao TEXT,
logo_url TEXT,
cor_primaria VARCHAR(7),
cor_secundaria VARCHAR(7),
fonte VARCHAR(50),
secoes JSONB,
template_html TEXT,
template_css TEXT,
ativo BOOLEAN DEFAULT TRUE,
criado_em TIMESTAMPTZ DEFAULT NOW(),
criado_por BIGINT,
metadados JSONB
);

-- CVs Gerados
CREATE TABLE IF NOT EXISTS cv_gerado (
id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
candidatura_id BIGINT UNIQUE REFERENCES candidaturas(id) ON DELETE CASCADE,
template_id BIGINT REFERENCES cv_template(id),
cv_original_url TEXT,
dados_processados JSONB,
cv_padronizado_url TEXT,
cv_html TEXT,
aprovado BOOLEAN DEFAULT FALSE,
aprovado_por BIGINT,
aprovado_em TIMESTAMPTZ,
diferencas JSONB,
gerado_em TIMESTAMPTZ DEFAULT NOW(),
gerado_por BIGINT,
versao INT DEFAULT 1,
metadados JSONB
);

-- Configurações do Sistema
CREATE TABLE IF NOT EXISTS configuracoes_sistema (
id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
tipo VARCHAR(50),
descricao TEXT,
categoria VARCHAR(100),
atualizado_em TIMESTAMPTZ DEFAULT NOW(),
atualizado_por BIGINT
);

-- ============================================================================
-- PARTE 8: FLUXO DO ANALISTA COM IA (NOVAS TABELAS)
-- ============================================================================

-- Questões Inteligentes Geradas por IA
CREATE TABLE IF NOT EXISTS questoes_inteligentes (
id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
vaga_id BIGINT NOT NULL REFERENCES vagas(id) ON DELETE CASCADE,
analista_id BIGINT NOT NULL REFERENCES app_users(id),
questao TEXT NOT NULL,
categoria categoria_questao_ia NOT NULL,
subcategoria VARCHAR(100),
relevancia INT CHECK (relevancia >= 0 AND relevancia <= 100),
motivo TEXT,
baseado_em_reprovacao BOOLEAN DEFAULT FALSE,
reprovacao_referencia_id BIGINT,
vezes_usada INT DEFAULT 0,
correlacao_aprovacao DECIMAL(5,2),
eficacia_score INT,
ativa BOOLEAN DEFAULT TRUE,
gerada_em TIMESTAMPTZ DEFAULT NOW(),
gerada_por VARCHAR(50) DEFAULT 'Gemini',
desativada_em TIMESTAMPTZ,
motivo_desativacao TEXT,
metadados JSONB
);

CREATE INDEX IF NOT EXISTS idx_questoes_inteligentes_vaga ON questoes_inteligentes(vaga_id);
CREATE INDEX IF NOT EXISTS idx_questoes_inteligentes_categoria ON questoes_inteligentes(categoria);
CREATE INDEX IF NOT EXISTS idx_questoes_inteligentes_ativa ON questoes_inteligentes(ativa);

-- Respostas dos Candidatos às Questões
CREATE TABLE IF NOT EXISTS candidato_respostas_questoes (
id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
candidatura_id BIGINT NOT NULL REFERENCES candidaturas(id) ON DELETE CASCADE,
questao_id BIGINT NOT NULL REFERENCES questoes_inteligentes(id) ON DELETE CASCADE,
vaga_id BIGINT NOT NULL REFERENCES vagas(id) ON DELETE CASCADE,
resposta TEXT NOT NULL,
coletada_em TIMESTAMPTZ DEFAULT NOW(),
coletada_por BIGINT REFERENCES app_users(id),
score_qualidade INT CHECK (score_qualidade >= 0 AND score_qualidade <= 100),
pontos_positivos TEXT[],
pontos_negativos TEXT[],
red_flags_identificados TEXT[],
metadados JSONB
);

CREATE INDEX IF NOT EXISTS idx_candidato_respostas_candidatura ON candidato_respostas_questoes(candidatura_id);
CREATE INDEX IF NOT EXISTS idx_candidato_respostas_questao ON candidato_respostas_questoes(questao_id);

-- Recomendações da IA para o Analista
CREATE TABLE IF NOT EXISTS recomendacoes_analista_ia (
id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
candidatura_id BIGINT NOT NULL UNIQUE REFERENCES candidaturas(id) ON DELETE CASCADE,
vaga_id BIGINT NOT NULL REFERENCES vagas(id) ON DELETE CASCADE,
analista_id BIGINT NOT NULL REFERENCES app_users(id),
recomendacao recomendacao_decisao NOT NULL,
score_confianca INT CHECK (score_confianca >= 0 AND score_confianca <= 100),
justificativa TEXT NOT NULL,
red_flags JSONB,
pontos_fortes TEXT[],
probabilidade_aprovacao_cliente INT CHECK (probabilidade_aprovacao_cliente >= 0 AND probabilidade_aprovacao_cliente <= 100),
score_tecnico INT,
score_comportamental INT,
score_cultural INT,
score_experiencia INT,
decisao_analista recomendacao_decisao,
justificativa_analista TEXT,
seguiu_recomendacao BOOLEAN,
divergencia_detectada BOOLEAN DEFAULT FALSE,
data_decisao TIMESTAMPTZ,
resultado_final VARCHAR(50),
motivo_resultado TEXT,
data_resultado TIMESTAMPTZ,
ia_acertou BOOLEAN,
tipo_erro VARCHAR(50),
gerada_em TIMESTAMPTZ DEFAULT NOW(),
gerada_por VARCHAR(50) DEFAULT 'Gemini',
atualizada_em TIMESTAMPTZ DEFAULT NOW(),
metadados JSONB
);

CREATE INDEX IF NOT EXISTS idx_recomendacoes_ia_candidatura ON recomendacoes_analista_ia(candidatura_id);
CREATE INDEX IF NOT EXISTS idx_recomendacoes_ia_vaga ON recomendacoes_analista_ia(vaga_id);
CREATE INDEX IF NOT EXISTS idx_recomendacoes_ia_divergencia ON recomendacoes_analista_ia(divergencia_detectada);

-- Análise Mensal de Padrões de Reprovação
CREATE TABLE IF NOT EXISTS analise_reprovacao_mensal (
id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
mes INT NOT NULL CHECK (mes >= 1 AND mes <= 12),
ano INT NOT NULL CHECK (ano >= 2024),
data_analise TIMESTAMPTZ DEFAULT NOW(),
total_reprovacoes INT NOT NULL,
total_aprovacoes INT NOT NULL,
taxa_reprovacao DECIMAL(5,2),
padroes_tecnicos JSONB,
padroes_comportamentais JSONB,
red_flags_recorrentes JSONB,
questoes_mais_eficazes JSONB,
questoes_ineficazes JSONB,
total_recomendacoes INT,
recomendacoes_corretas INT,
acuracia_ia DECIMAL(5,2),
falsos_positivos INT,
falsos_negativos INT,
total_divergencias INT,
divergencias_analista_acertou INT,
divergencias_ia_acertou INT,
insights TEXT[],
recomendacoes_melhoria TEXT[],
executada_por VARCHAR(50) DEFAULT 'Cron Job',
tempo_execucao_segundos INT,
metadados JSONB,
CONSTRAINT analise_reprovacao_periodo_unique UNIQUE (mes, ano)
);

CREATE INDEX IF NOT EXISTS idx_analise_reprovacao_periodo ON analise_reprovacao_mensal(ano, mes);

-- Predição de Risco de Candidatos
CREATE TABLE IF NOT EXISTS predicao_risco_candidato (
id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
candidatura_id BIGINT NOT NULL UNIQUE REFERENCES candidaturas(id) ON DELETE CASCADE,
vaga_id BIGINT NOT NULL REFERENCES vagas(id) ON DELETE CASCADE,
analista_id BIGINT NOT NULL REFERENCES app_users(id),
nivel_risco nivel_risco NOT NULL,
probabilidade_reprovacao INT CHECK (probabilidade_reprovacao >= 0 AND probabilidade_reprovacao <= 100),
score_risco INT CHECK (score_risco >= 0 AND score_risco <= 100),
fatores_risco JSONB,
red_flags_criticos TEXT[],
gaps_tecnicos TEXT[],
gaps_comportamentais TEXT[],
acoes_mitigacao TEXT[],
pontos_atencao TEXT[],
perguntas_adicionais TEXT[],
resultado_real VARCHAR(50),
predicao_correta BOOLEAN,
data_validacao TIMESTAMPTZ,
gerada_em TIMESTAMPTZ DEFAULT NOW(),
gerada_por VARCHAR(50) DEFAULT 'Gemini',
metadados JSONB
);

CREATE INDEX IF NOT EXISTS idx_predicao_risco_candidatura ON predicao_risco_candidato(candidatura_id);
CREATE INDEX IF NOT EXISTS idx_predicao_risco_nivel ON predicao_risco_candidato(nivel_risco);

-- ============================================================================
-- PARTE 9: VIEWS PARA DASHBOARDS
-- ============================================================================

-- Dashboard de Acurácia da IA
CREATE OR REPLACE VIEW vw_acuracia_ia AS
SELECT 
    DATE_TRUNC('month', gerada_em) AS mes,
    COUNT(*) AS total_recomendacoes,
    COUNT(*) FILTER (WHERE ia_acertou = TRUE) AS acertos,
    COUNT(*) FILTER (WHERE ia_acertou = FALSE) AS erros,
    ROUND(
        (COUNT(*) FILTER (WHERE ia_acertou = TRUE)::DECIMAL / NULLIF(COUNT(*), 0)) * 100, 
        2
    ) AS taxa_acuracia,
    COUNT(*) FILTER (WHERE tipo_erro = 'falso_positivo') AS falsos_positivos,
    COUNT(*) FILTER (WHERE tipo_erro = 'falso_negativo') AS falsos_negativos,
    COUNT(*) FILTER (WHERE divergencia_detectada = TRUE) AS divergencias
FROM recomendacoes_analista_ia
WHERE resultado_final IS NOT NULL
GROUP BY DATE_TRUNC('month', gerada_em)
ORDER BY mes DESC;

-- Questões mais eficazes
CREATE OR REPLACE VIEW vw_questoes_eficazes AS
SELECT 
    qi.id,
    qi.questao,
    qi.categoria,
    qi.subcategoria,
    qi.vezes_usada,
    qi.correlacao_aprovacao,
    qi.eficacia_score,
    v.titulo AS vaga_titulo,
    COUNT(DISTINCT crq.candidatura_id) AS candidatos_responderam
FROM questoes_inteligentes qi
LEFT JOIN vagas v ON qi.vaga_id = v.id
LEFT JOIN candidato_respostas_questoes crq ON qi.id = crq.questao_id
WHERE qi.ativa = TRUE
GROUP BY qi.id, qi.questao, qi.categoria, qi.subcategoria, 
         qi.vezes_usada, qi.correlacao_aprovacao, qi.eficacia_score, v.titulo
ORDER BY qi.eficacia_score DESC NULLS LAST, qi.vezes_usada DESC;

-- Red Flags mais comuns
CREATE OR REPLACE VIEW vw_red_flags_comuns AS
WITH red_flags_expandidos AS (
    SELECT 
        jsonb_array_elements(red_flags)->>'tipo' AS tipo_red_flag,
        jsonb_array_elements(red_flags)->>'descricao' AS descricao,
        (jsonb_array_elements(red_flags)->>'severidade')::INT AS severidade
    FROM recomendacoes_analista_ia
    WHERE red_flags IS NOT NULL
)
SELECT 
    tipo_red_flag,
    descricao,
    COUNT(*) AS frequencia,
    ROUND(AVG(severidade), 1) AS severidade_media
FROM red_flags_expandidos
GROUP BY tipo_red_flag, descricao
ORDER BY frequencia DESC
LIMIT 20;

-- ============================================================================
-- PARTE 10: TRIGGERS PARA AUTOMAÇÃO
-- ============================================================================

-- Função para atualizar timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.atualizada_em = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger para recomendações
DROP TRIGGER IF EXISTS trigger_update_recomendacoes_ia ON recomendacoes_analista_ia;
CREATE TRIGGER trigger_update_recomendacoes_ia
    BEFORE UPDATE ON recomendacoes_analista_ia
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Função para detectar divergência
CREATE OR REPLACE FUNCTION detectar_divergencia_ia()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.decisao_analista IS NOT NULL AND OLD.decisao_analista IS NULL THEN
        NEW.seguiu_recomendacao := (NEW.decisao_analista = NEW.recomendacao);
        NEW.divergencia_detectada := (NEW.decisao_analista != NEW.recomendacao);
        NEW.data_decisao := NOW();
    END IF;
    
    IF NEW.resultado_final IS NOT NULL AND OLD.resultado_final IS NULL THEN
        NEW.data_resultado := NOW();
        
        IF NEW.resultado_final = 'aprovado_cliente' THEN
            NEW.ia_acertou := (NEW.recomendacao = 'aprovar');
            IF NEW.ia_acertou = FALSE THEN
                NEW.tipo_erro := 'falso_negativo';
            END IF;
        ELSIF NEW.resultado_final = 'reprovado_cliente' THEN
            NEW.ia_acertou := (NEW.recomendacao = 'rejeitar');
            IF NEW.ia_acertou = FALSE THEN
                NEW.tipo_erro := 'falso_positivo';
            END IF;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_detectar_divergencia ON recomendacoes_analista_ia;
CREATE TRIGGER trigger_detectar_divergencia
    BEFORE UPDATE ON recomendacoes_analista_ia
    FOR EACH ROW
    EXECUTE FUNCTION detectar_divergencia_ia();

-- ============================================================================
-- PARTE 11: PERMISSÕES
-- ============================================================================

GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- ============================================================================
-- PARTE 12: DADOS INICIAIS
-- ============================================================================

INSERT INTO configuracoes_sistema (tipo, descricao, categoria, atualizado_em)
VALUES 
    ('cron_analise_reprovacao', 'Análise mensal de padrões de reprovação', 'ia_learning', NOW())
ON CONFLICT DO NOTHING;

-- ============================================================================
-- FIM DO SCRIPT
-- ============================================================================

DO $$
BEGIN
    RAISE NOTICE '✅ Script executado com sucesso!';
    RAISE NOTICE '📊 28 tabelas criadas (23 originais + 5 novas de IA)';
    RAISE NOTICE '📈 3 views criadas para dashboards';
    RAISE NOTICE '⚡ 2 triggers criados para automação';
    RAISE NOTICE '';
    RAISE NOTICE '🎯 Sistema ORBIT.AI completo instalado!';
END $$;
