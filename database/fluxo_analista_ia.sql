-- ============================================
-- FLUXO COMPLETO DO ANALISTA DE R&S COM IA
-- Sistema de Aprendizado Contínuo
-- ============================================

-- ============================================
-- 1. ATUALIZAÇÃO DA TABELA CANDIDATURAS
-- ============================================

-- Adicionar campos de feedback do cliente e detecção de divergência
ALTER TABLE candidaturas
ADD COLUMN IF NOT EXISTS cv_enviado_em TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS cv_enviado_por BIGINT REFERENCES app_users(id),
ADD COLUMN IF NOT EXISTS ia_recomendacao_acatada BOOLEAN,
ADD COLUMN IF NOT EXISTS motivo_divergencia TEXT,
ADD COLUMN IF NOT EXISTS feedback_cliente TEXT,
ADD COLUMN IF NOT EXISTS feedback_cliente_categoria TEXT,
ADD COLUMN IF NOT EXISTS feedback_cliente_registrado_em TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS feedback_cliente_registrado_por BIGINT REFERENCES app_users(id);

-- Comentários
COMMENT ON COLUMN candidaturas.cv_enviado_em IS 'Data/hora que o CV foi enviado ao cliente';
COMMENT ON COLUMN candidaturas.ia_recomendacao_acatada IS 'TRUE se analista acatou recomendação da IA, FALSE se divergiu';
COMMENT ON COLUMN candidaturas.motivo_divergencia IS 'Motivo pelo qual analista discordou da IA';
COMMENT ON COLUMN candidaturas.feedback_cliente IS 'Feedback detalhado do cliente sobre o candidato';
COMMENT ON COLUMN candidaturas.feedback_cliente_categoria IS 'Categoria do feedback: tecnico, comportamental, cultural, salario, outro';

-- ============================================
-- 2. TABELA DE RECOMENDAÇÕES DA IA
-- ============================================

CREATE TABLE IF NOT EXISTS ia_recomendacoes_candidato (
    id BIGSERIAL PRIMARY KEY,
    candidatura_id BIGINT NOT NULL REFERENCES candidaturas(id) ON DELETE CASCADE,
    vaga_id BIGINT NOT NULL REFERENCES vagas(id) ON DELETE CASCADE,
    candidato_id BIGINT NOT NULL REFERENCES candidatos(id) ON DELETE CASCADE,
    
    -- Recomendação
    tipo_recomendacao TEXT NOT NULL, -- 'questoes', 'decisao', 'red_flags', 'predicao_risco'
    recomendacao TEXT NOT NULL, -- 'aprovar', 'rejeitar', 'reavaliar'
    score_confianca INTEGER, -- 0-100
    justificativa TEXT,
    
    -- Detalhes da análise
    red_flags JSONB, -- Array de red flags identificados
    pontos_fortes JSONB, -- Array de pontos fortes
    analise_detalhada JSONB, -- Análise completa em JSON
    
    -- Resultado
    acatada_por_analista BOOLEAN,
    motivo_divergencia TEXT,
    resultado_final TEXT, -- 'aprovado_cliente', 'reprovado_cliente', 'pendente'
    
    -- Metadados
    criado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    atualizado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_ia_recomendacoes_candidatura ON ia_recomendacoes_candidato(candidatura_id);
CREATE INDEX idx_ia_recomendacoes_vaga ON ia_recomendacoes_candidato(vaga_id);
CREATE INDEX idx_ia_recomendacoes_tipo ON ia_recomendacoes_candidato(tipo_recomendacao);

-- ============================================
-- 3. TABELA DE QUESTÕES RECOMENDADAS POR VAGA
-- ============================================

CREATE TABLE IF NOT EXISTS vaga_questoes_recomendadas (
    id BIGSERIAL PRIMARY KEY,
    vaga_id BIGINT NOT NULL REFERENCES vagas(id) ON DELETE CASCADE,
    
    -- Questão
    questao TEXT NOT NULL,
    categoria TEXT NOT NULL, -- 'tecnica', 'comportamental', 'cultural'
    subcategoria TEXT, -- Ex: 'javascript', 'react', 'comunicacao', 'lideranca'
    
    -- Relevância
    relevancia_score INTEGER NOT NULL, -- 0-100
    baseado_em_reprovacoes BOOLEAN DEFAULT FALSE,
    reprovacoes_relacionadas INTEGER DEFAULT 0,
    
    -- Eficácia
    poder_preditivo DECIMAL(3,2), -- 0.00-1.00 (calculado após ter dados)
    vezes_usada INTEGER DEFAULT 0,
    vezes_candidato_aprovado INTEGER DEFAULT 0,
    vezes_candidato_reprovado INTEGER DEFAULT 0,
    
    -- Status
    ativa BOOLEAN DEFAULT TRUE,
    aprovada_por_analista BOOLEAN DEFAULT FALSE,
    
    -- Metadados
    criado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    atualizado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_vaga_questoes_vaga ON vaga_questoes_recomendadas(vaga_id);
CREATE INDEX idx_vaga_questoes_categoria ON vaga_questoes_recomendadas(categoria);
CREATE INDEX idx_vaga_questoes_ativa ON vaga_questoes_recomendadas(ativa);

-- ============================================
-- 4. TABELA DE RESPOSTAS DE CANDIDATOS
-- ============================================

CREATE TABLE IF NOT EXISTS candidato_respostas_questoes (
    id BIGSERIAL PRIMARY KEY,
    candidatura_id BIGINT NOT NULL REFERENCES candidaturas(id) ON DELETE CASCADE,
    questao_id BIGINT REFERENCES vaga_questoes_recomendadas(id),
    
    -- Questão e resposta
    questao_texto TEXT NOT NULL,
    resposta_texto TEXT,
    
    -- Avaliação
    avaliacao_ia TEXT, -- 'excelente', 'boa', 'regular', 'ruim'
    score_ia INTEGER, -- 0-100
    red_flags_identificados JSONB,
    
    -- Fonte
    fonte TEXT, -- 'entrevista_transcrita', 'digitacao_manual'
    
    -- Metadados
    respondido_em TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_candidato_respostas_candidatura ON candidato_respostas_questoes(candidatura_id);
CREATE INDEX idx_candidato_respostas_questao ON candidato_respostas_questoes(questao_id);

-- ============================================
-- 5. TABELA DE RED FLAGS
-- ============================================

CREATE TABLE IF NOT EXISTS candidato_red_flags (
    id BIGSERIAL PRIMARY KEY,
    candidato_id BIGINT NOT NULL REFERENCES candidatos(id) ON DELETE CASCADE,
    candidatura_id BIGINT REFERENCES candidaturas(id) ON DELETE CASCADE,
    
    -- Flag
    tipo_flag TEXT NOT NULL, -- 'tecnico', 'comportamental', 'comunicacao', 'experiencia', 'cultural'
    descricao TEXT NOT NULL,
    severidade INTEGER NOT NULL, -- 1-5 (1=baixa, 5=crítica)
    
    -- Fonte
    identificado_em TEXT NOT NULL, -- 'cv', 'entrevista_interna', 'entrevista_cliente', 'feedback_cliente'
    trecho_original TEXT, -- Trecho do texto que gerou o flag
    
    -- Impacto
    impactou_resultado BOOLEAN, -- TRUE se candidato foi reprovado por causa disso
    
    -- Metadados
    criado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_candidato_red_flags_candidato ON candidato_red_flags(candidato_id);
CREATE INDEX idx_candidato_red_flags_candidatura ON candidato_red_flags(candidatura_id);
CREATE INDEX idx_candidato_red_flags_tipo ON candidato_red_flags(tipo_flag);

-- ============================================
-- 6. TABELA DE ANÁLISE DE REPROVAÇÕES
-- ============================================

CREATE TABLE IF NOT EXISTS analise_reprovacoes (
    id BIGSERIAL PRIMARY KEY,
    
    -- Período
    periodo TEXT NOT NULL, -- 'YYYY-MM'
    data_analise TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Estatísticas
    total_candidaturas INTEGER,
    total_reprovacoes INTEGER,
    taxa_reprovacao DECIMAL(5,2),
    
    -- Padrões identificados
    padroes_tecnicos JSONB,
    padroes_comportamentais JSONB,
    padroes_culturais JSONB,
    
    -- Questões
    questoes_eficazes JSONB, -- Questões com alto poder preditivo
    questoes_ineficazes JSONB, -- Questões com baixo poder preditivo
    questoes_novas_sugeridas JSONB,
    
    -- Recomendações
    recomendacoes_melhoria JSONB,
    insights JSONB,
    
    -- Acurácia da IA
    total_recomendacoes_ia INTEGER,
    recomendacoes_acertadas INTEGER,
    recomendacoes_erradas INTEGER,
    taxa_acuracia DECIMAL(5,2),
    
    -- Metadados
    criado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_analise_reprovacoes_periodo ON analise_reprovacoes(periodo);

-- ============================================
-- 7. VIEWS ÚTEIS
-- ============================================

-- View: Histórico completo do candidato
CREATE OR REPLACE VIEW vw_candidato_historico_completo AS
SELECT 
    c.id AS candidato_id,
    c.nome AS candidato_nome,
    c.email AS candidato_email,
    COUNT(DISTINCT ca.id) AS total_candidaturas,
    COUNT(DISTINCT ca.id) FILTER (WHERE ca.status = 'aprovado') AS total_aprovacoes,
    COUNT(DISTINCT ca.id) FILTER (WHERE ca.status = 'rejeitado') AS total_reprovacoes,
    ARRAY_AGG(DISTINCT v.titulo) AS vagas_aplicadas,
    ARRAY_AGG(DISTINCT cl.nome) AS clientes_interagidos,
    (
        SELECT JSONB_AGG(
            JSONB_BUILD_OBJECT(
                'tipo', rf.tipo_flag,
                'descricao', rf.descricao,
                'severidade', rf.severidade,
                'data', rf.criado_em
            )
        )
        FROM candidato_red_flags rf
        WHERE rf.candidato_id = c.id
    ) AS red_flags_historico
FROM candidatos c
LEFT JOIN candidaturas ca ON c.id = ca.candidato_id
LEFT JOIN vagas v ON ca.vaga_id = v.id
LEFT JOIN clients cl ON v.cliente_id = cl.id
GROUP BY c.id;

-- View: Eficácia das questões
CREATE OR REPLACE VIEW vw_eficacia_questoes AS
SELECT 
    q.id,
    q.vaga_id,
    q.questao,
    q.categoria,
    q.relevancia_score,
    q.vezes_usada,
    q.vezes_candidato_aprovado,
    q.vezes_candidato_reprovado,
    CASE 
        WHEN q.vezes_usada > 0 THEN 
            ROUND((q.vezes_candidato_aprovado::DECIMAL / q.vezes_usada), 2)
        ELSE 0
    END AS taxa_aprovacao,
    q.poder_preditivo,
    CASE
        WHEN q.poder_preditivo >= 0.7 THEN 'Alta'
        WHEN q.poder_preditivo >= 0.5 THEN 'Média'
        WHEN q.poder_preditivo >= 0.3 THEN 'Baixa'
        ELSE 'Insuficiente'
    END AS classificacao_eficacia
FROM vaga_questoes_recomendadas q
WHERE q.ativa = TRUE;

-- View: Dashboard de recomendações da IA
CREATE OR REPLACE VIEW vw_dashboard_recomendacoes_ia AS
SELECT 
    DATE_TRUNC('month', criado_em) AS mes,
    COUNT(*) AS total_recomendacoes,
    COUNT(*) FILTER (WHERE acatada_por_analista = TRUE) AS recomendacoes_acatadas,
    COUNT(*) FILTER (WHERE acatada_por_analista = FALSE) AS recomendacoes_rejeitadas,
    ROUND(
        (COUNT(*) FILTER (WHERE acatada_por_analista = TRUE)::DECIMAL / COUNT(*)) * 100, 
        2
    ) AS taxa_aceitacao,
    COUNT(*) FILTER (WHERE resultado_final = 'aprovado_cliente') AS candidatos_aprovados,
    COUNT(*) FILTER (WHERE resultado_final = 'reprovado_cliente') AS candidatos_reprovados
FROM ia_recomendacoes_candidato
WHERE tipo_recomendacao = 'decisao'
GROUP BY DATE_TRUNC('month', criado_em)
ORDER BY mes DESC;

-- View: Divergências entre IA e Analista
CREATE OR REPLACE VIEW vw_divergencias_ia_analista AS
SELECT 
    ir.id,
    ir.candidatura_id,
    v.titulo AS vaga_titulo,
    c.nome AS candidato_nome,
    ir.recomendacao AS ia_recomendou,
    CASE 
        WHEN ca.cv_enviado_em IS NOT NULL THEN 'enviou_cv'
        ELSE 'nao_enviou_cv'
    END AS analista_decidiu,
    ir.motivo_divergencia,
    ca.status AS resultado_final,
    ca.feedback_cliente,
    CASE
        WHEN ir.recomendacao = 'aprovar' AND ca.status = 'aprovado' THEN 'ia_acertou'
        WHEN ir.recomendacao = 'rejeitar' AND ca.status = 'rejeitado' THEN 'ia_acertou'
        WHEN ir.recomendacao = 'aprovar' AND ca.status = 'rejeitado' THEN 'ia_errou'
        WHEN ir.recomendacao = 'rejeitar' AND ca.status = 'aprovado' THEN 'ia_errou'
        ELSE 'pendente'
    END AS avaliacao_recomendacao
FROM ia_recomendacoes_candidato ir
JOIN candidaturas ca ON ir.candidatura_id = ca.id
JOIN vagas v ON ir.vaga_id = v.id
JOIN candidatos c ON ir.candidato_id = c.id
WHERE ir.acatada_por_analista = FALSE;

-- ============================================
-- 8. FUNÇÕES AUXILIARES
-- ============================================

-- Função: Calcular poder preditivo de uma questão
CREATE OR REPLACE FUNCTION calcular_poder_preditivo_questao(p_questao_id BIGINT)
RETURNS DECIMAL AS $$
DECLARE
    v_poder_preditivo DECIMAL;
BEGIN
    -- Poder preditivo = (aprovados / total) se questão foi usada
    -- Se não foi usada ainda, retorna NULL
    
    SELECT 
        CASE 
            WHEN vezes_usada >= 5 THEN
                ROUND((vezes_candidato_aprovado::DECIMAL / vezes_usada), 2)
            ELSE NULL
        END
    INTO v_poder_preditivo
    FROM vaga_questoes_recomendadas
    WHERE id = p_questao_id;
    
    RETURN v_poder_preditivo;
END;
$$ LANGUAGE plpgsql;

-- Função: Atualizar estatísticas de questão após resultado
CREATE OR REPLACE FUNCTION atualizar_estatisticas_questao()
RETURNS TRIGGER AS $$
BEGIN
    -- Quando candidatura é finalizada (aprovado/rejeitado)
    IF NEW.status IN ('aprovado', 'rejeitado') AND OLD.status != NEW.status THEN
        
        -- Atualizar estatísticas das questões usadas
        UPDATE vaga_questoes_recomendadas q
        SET 
            vezes_candidato_aprovado = vezes_candidato_aprovado + 
                CASE WHEN NEW.status = 'aprovado' THEN 1 ELSE 0 END,
            vezes_candidato_reprovado = vezes_candidato_reprovado + 
                CASE WHEN NEW.status = 'rejeitado' THEN 1 ELSE 0 END,
            poder_preditivo = calcular_poder_preditivo_questao(q.id),
            atualizado_em = NOW()
        WHERE q.id IN (
            SELECT questao_id 
            FROM candidato_respostas_questoes 
            WHERE candidatura_id = NEW.id
        );
        
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_atualizar_estatisticas_questao
AFTER UPDATE ON candidaturas
FOR EACH ROW
EXECUTE FUNCTION atualizar_estatisticas_questao();

-- ============================================
-- 9. POLÍTICAS DE SEGURANÇA (RLS)
-- ============================================

-- Habilitar RLS nas novas tabelas
ALTER TABLE ia_recomendacoes_candidato ENABLE ROW LEVEL SECURITY;
ALTER TABLE vaga_questoes_recomendadas ENABLE ROW LEVEL SECURITY;
ALTER TABLE candidato_respostas_questoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE candidato_red_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE analise_reprovacoes ENABLE ROW LEVEL SECURITY;

-- Políticas: Usuários autenticados podem ler
CREATE POLICY "Usuários autenticados podem ler recomendações"
ON ia_recomendacoes_candidato FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Usuários autenticados podem ler questões"
ON vaga_questoes_recomendadas FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Usuários autenticados podem ler respostas"
ON candidato_respostas_questoes FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Usuários autenticados podem ler red flags"
ON candidato_red_flags FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Usuários autenticados podem ler análises"
ON analise_reprovacoes FOR SELECT
TO authenticated
USING (true);

-- Políticas: Apenas analistas e gestores podem inserir
CREATE POLICY "Analistas podem criar recomendações"
ON ia_recomendacoes_candidato FOR INSERT
TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1 FROM app_users
        WHERE id = auth.uid()::bigint
        AND role IN ('Analista de R&S', 'Gestão de Pessoas', 'Admin')
    )
);

CREATE POLICY "Analistas podem criar questões"
ON vaga_questoes_recomendadas FOR INSERT
TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1 FROM app_users
        WHERE id = auth.uid()::bigint
        AND role IN ('Analista de R&S', 'Gestão de Pessoas', 'Admin')
    )
);

-- ============================================
-- FIM DO SCRIPT
-- ============================================

-- Comentários finais
COMMENT ON TABLE ia_recomendacoes_candidato IS 'Recomendações da IA sobre candidatos com registro de divergências';
COMMENT ON TABLE vaga_questoes_recomendadas IS 'Questões recomendadas pela IA por vaga com métricas de eficácia';
COMMENT ON TABLE candidato_respostas_questoes IS 'Respostas dos candidatos às questões recomendadas';
COMMENT ON TABLE candidato_red_flags IS 'Red flags identificados pela IA em candidatos';
COMMENT ON TABLE analise_reprovacoes IS 'Análise mensal de padrões de reprovação para aprendizado da IA';
