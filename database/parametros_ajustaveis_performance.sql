-- ============================================
-- PARÂMETROS AJUSTÁVEIS PARA MEDIR PERFORMANCE
-- ============================================

-- ============================================
-- CAMPOS AJUSTÁVEIS POR ANALISTA
-- ============================================

ALTER TABLE app_users
ADD COLUMN IF NOT EXISTS fit_stack_override INTEGER CHECK (fit_stack_override >= 0 AND fit_stack_override <= 100),
ADD COLUMN IF NOT EXISTS fit_cliente_override INTEGER CHECK (fit_cliente_override >= 0 AND fit_cliente_override <= 100),
ADD COLUMN IF NOT EXISTS multiplicador_performance DECIMAL(3,2) DEFAULT 1.00 CHECK (multiplicador_performance > 0),
ADD COLUMN IF NOT EXISTS bonus_experiencia INTEGER DEFAULT 0 CHECK (bonus_experiencia >= 0 AND bonus_experiencia <= 20),
ADD COLUMN IF NOT EXISTS prioridade_distribuicao TEXT CHECK (prioridade_distribuicao IN ('Alta', 'Normal', 'Baixa')) DEFAULT 'Normal',
ADD COLUMN IF NOT EXISTS ativo_para_distribuicao BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS observacoes_distribuicao TEXT;

COMMENT ON COLUMN app_users.fit_stack_override IS 'Override manual do score de fit de stack (0-100). Se definido, substitui cálculo automático.';
COMMENT ON COLUMN app_users.fit_cliente_override IS 'Override manual do score de fit com cliente (0-100). Se definido, substitui cálculo automático.';
COMMENT ON COLUMN app_users.multiplicador_performance IS 'Multiplicador de performance do analista (ex: 1.20 = +20% no score final)';
COMMENT ON COLUMN app_users.bonus_experiencia IS 'Bônus fixo por experiência excepcional (0-20 pontos)';
COMMENT ON COLUMN app_users.prioridade_distribuicao IS 'Prioridade do analista na distribuição (Alta/Normal/Baixa)';
COMMENT ON COLUMN app_users.ativo_para_distribuicao IS 'Se false, analista não recebe novas vagas automaticamente';
COMMENT ON COLUMN app_users.observacoes_distribuicao IS 'Observações sobre a distribuição do analista';

-- ============================================
-- CAMPOS AJUSTÁVEIS POR VAGA
-- ============================================

ALTER TABLE vagas
ADD COLUMN IF NOT EXISTS peso_fit_stack_custom INTEGER CHECK (peso_fit_stack_custom >= 0 AND peso_fit_stack_custom <= 100),
ADD COLUMN IF NOT EXISTS peso_fit_cliente_custom INTEGER CHECK (peso_fit_cliente_custom >= 0 AND peso_fit_cliente_custom <= 100),
ADD COLUMN IF NOT EXISTS peso_disponibilidade_custom INTEGER CHECK (peso_disponibilidade_custom >= 0 AND peso_disponibilidade_custom <= 100),
ADD COLUMN IF NOT EXISTS peso_taxa_sucesso_custom INTEGER CHECK (peso_taxa_sucesso_custom >= 0 AND peso_taxa_sucesso_custom <= 100),
ADD COLUMN IF NOT EXISTS analistas_priorizados BIGINT[],
ADD COLUMN IF NOT EXISTS analistas_excluidos BIGINT[],
ADD COLUMN IF NOT EXISTS requer_aprovacao_manual BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS observacoes_distribuicao TEXT;

COMMENT ON COLUMN vagas.peso_fit_stack_custom IS 'Peso customizado de fit de stack para esta vaga (0-100%). Se null, usa configuração global.';
COMMENT ON COLUMN vagas.peso_fit_cliente_custom IS 'Peso customizado de fit com cliente para esta vaga (0-100%). Se null, usa configuração global.';
COMMENT ON COLUMN vagas.peso_disponibilidade_custom IS 'Peso customizado de disponibilidade para esta vaga (0-100%). Se null, usa configuração global.';
COMMENT ON COLUMN vagas.peso_taxa_sucesso_custom IS 'Peso customizado de taxa de sucesso para esta vaga (0-100%). Se null, usa configuração global.';
COMMENT ON COLUMN vagas.analistas_priorizados IS 'IDs de analistas que devem ter prioridade nesta vaga';
COMMENT ON COLUMN vagas.analistas_excluidos IS 'IDs de analistas que NÃO devem receber esta vaga';
COMMENT ON COLUMN vagas.requer_aprovacao_manual IS 'Se true, distribuição requer aprovação manual do gestor';
COMMENT ON COLUMN vagas.observacoes_distribuicao IS 'Observações sobre a distribuição da vaga';

-- ============================================
-- TABELA DE EXPERIMENTOS A/B
-- ============================================

CREATE TABLE IF NOT EXISTS experimentos_distribuicao (
    id BIGSERIAL PRIMARY KEY,
    nome_experimento TEXT NOT NULL,
    descricao TEXT,
    tipo TEXT CHECK (tipo IN ('pesos', 'analista', 'vaga', 'global')) NOT NULL,
    
    -- Configuração do experimento
    config_antes JSONB,
    config_depois JSONB,
    
    -- Período do experimento
    data_inicio DATE NOT NULL,
    data_fim DATE,
    ativo BOOLEAN DEFAULT true,
    
    -- Métricas
    vagas_testadas INTEGER DEFAULT 0,
    tempo_medio_fechamento_antes DECIMAL(10,2),
    tempo_medio_fechamento_depois DECIMAL(10,2),
    taxa_aprovacao_antes DECIMAL(5,2),
    taxa_aprovacao_depois DECIMAL(5,2),
    
    -- Resultado
    resultado TEXT CHECK (resultado IN ('sucesso', 'fracasso', 'inconclusivo', 'em_andamento')) DEFAULT 'em_andamento',
    conclusoes TEXT,
    
    -- Metadados
    criado_por BIGINT REFERENCES app_users(id),
    criado_em TIMESTAMP DEFAULT NOW(),
    atualizado_em TIMESTAMP DEFAULT NOW()
);

COMMENT ON TABLE experimentos_distribuicao IS 'Experimentos A/B para testar diferentes configurações de distribuição';

-- ============================================
-- TABELA DE MÉTRICAS DE PERFORMANCE
-- ============================================

CREATE TABLE IF NOT EXISTS metricas_distribuicao (
    id BIGSERIAL PRIMARY KEY,
    vaga_id BIGINT REFERENCES vagas(id),
    analista_id BIGINT REFERENCES app_users(id),
    
    -- Scores calculados
    score_match_calculado INTEGER,
    score_match_ajustado INTEGER,
    
    -- Detalhamento dos scores
    fit_stack_calculado INTEGER,
    fit_stack_override INTEGER,
    fit_stack_final INTEGER,
    
    fit_cliente_calculado INTEGER,
    fit_cliente_override INTEGER,
    fit_cliente_final INTEGER,
    
    disponibilidade_calculada INTEGER,
    taxa_sucesso_calculada INTEGER,
    
    -- Ajustes aplicados
    multiplicador_aplicado DECIMAL(3,2),
    bonus_aplicado INTEGER,
    prioridade_analista TEXT,
    
    -- Pesos utilizados
    peso_fit_stack INTEGER,
    peso_fit_cliente INTEGER,
    peso_disponibilidade INTEGER,
    peso_taxa_sucesso INTEGER,
    
    -- Resultado
    foi_distribuido BOOLEAN DEFAULT false,
    motivo_nao_distribuicao TEXT,
    tempo_fechamento_dias INTEGER,
    resultado_final TEXT CHECK (resultado_final IN ('aprovado_cliente', 'reprovado_cliente', 'cancelado', 'em_andamento')),
    
    -- Metadados
    calculado_em TIMESTAMP DEFAULT NOW(),
    experimento_id BIGINT REFERENCES experimentos_distribuicao(id)
);

COMMENT ON TABLE metricas_distribuicao IS 'Métricas detalhadas de cada distribuição para análise de performance';

-- ============================================
-- TABELA DE HISTÓRICO DE AJUSTES
-- ============================================

CREATE TABLE IF NOT EXISTS historico_ajustes_distribuicao (
    id BIGSERIAL PRIMARY KEY,
    tipo_entidade TEXT CHECK (tipo_entidade IN ('analista', 'vaga', 'global')) NOT NULL,
    entidade_id BIGINT,
    
    campo_alterado TEXT NOT NULL,
    valor_anterior TEXT,
    valor_novo TEXT,
    motivo TEXT,
    
    impacto_esperado TEXT,
    impacto_real TEXT,
    
    alterado_por BIGINT REFERENCES app_users(id),
    alterado_em TIMESTAMP DEFAULT NOW()
);

COMMENT ON TABLE historico_ajustes_distribuicao IS 'Histórico de todos os ajustes manuais para análise de impacto';

-- ============================================
-- VIEWS PARA ANÁLISE DE PERFORMANCE
-- ============================================

-- View de performance por analista
CREATE OR REPLACE VIEW vw_performance_analista_distribuicao AS
SELECT 
    a.id AS analista_id,
    a.nome_usuario AS analista_nome,
    a.capacidade_maxima_vagas,
    a.multiplicador_performance,
    a.bonus_experiencia,
    a.prioridade_distribuicao,
    a.ativo_para_distribuicao,
    
    COUNT(DISTINCT m.vaga_id) AS total_vagas_recebidas,
    COUNT(DISTINCT CASE WHEN m.foi_distribuido THEN m.vaga_id END) AS total_vagas_distribuidas,
    AVG(m.score_match_ajustado) AS score_medio,
    AVG(m.tempo_fechamento_dias) AS tempo_medio_fechamento,
    
    COUNT(CASE WHEN m.resultado_final = 'aprovado_cliente' THEN 1 END) AS total_aprovados,
    COUNT(CASE WHEN m.resultado_final = 'reprovado_cliente' THEN 1 END) AS total_reprovados,
    
    CASE 
        WHEN COUNT(CASE WHEN m.resultado_final IN ('aprovado_cliente', 'reprovado_cliente') THEN 1 END) > 0
        THEN ROUND(
            COUNT(CASE WHEN m.resultado_final = 'aprovado_cliente' THEN 1 END)::DECIMAL / 
            COUNT(CASE WHEN m.resultado_final IN ('aprovado_cliente', 'reprovado_cliente') THEN 1 END) * 100, 
            2
        )
        ELSE 0
    END AS taxa_aprovacao
FROM app_users a
LEFT JOIN metricas_distribuicao m ON a.id = m.analista_id
WHERE a.tipo_usuario = 'analista_rs'
GROUP BY a.id, a.nome_usuario, a.capacidade_maxima_vagas, a.multiplicador_performance, 
         a.bonus_experiencia, a.prioridade_distribuicao, a.ativo_para_distribuicao;

-- View de impacto de ajustes
CREATE OR REPLACE VIEW vw_impacto_ajustes AS
SELECT 
    h.id,
    h.tipo_entidade,
    h.entidade_id,
    h.campo_alterado,
    h.valor_anterior,
    h.valor_novo,
    h.motivo,
    h.impacto_esperado,
    h.impacto_real,
    h.alterado_em,
    u.nome_usuario AS alterado_por_nome,
    
    -- Métricas antes do ajuste (30 dias antes)
    (SELECT AVG(tempo_fechamento_dias) 
     FROM metricas_distribuicao 
     WHERE (
         (h.tipo_entidade = 'analista' AND analista_id = h.entidade_id) OR
         (h.tipo_entidade = 'vaga' AND vaga_id = h.entidade_id)
     )
     AND calculado_em BETWEEN h.alterado_em - INTERVAL '30 days' AND h.alterado_em
    ) AS tempo_medio_antes,
    
    -- Métricas depois do ajuste (30 dias depois)
    (SELECT AVG(tempo_fechamento_dias) 
     FROM metricas_distribuicao 
     WHERE (
         (h.tipo_entidade = 'analista' AND analista_id = h.entidade_id) OR
         (h.tipo_entidade = 'vaga' AND vaga_id = h.entidade_id)
     )
     AND calculado_em BETWEEN h.alterado_em AND h.alterado_em + INTERVAL '30 days'
    ) AS tempo_medio_depois
FROM historico_ajustes_distribuicao h
LEFT JOIN app_users u ON h.alterado_por = u.id;

-- View de experimentos ativos
CREATE OR REPLACE VIEW vw_experimentos_ativos AS
SELECT 
    e.*,
    u.nome_usuario AS criado_por_nome,
    COUNT(DISTINCT m.vaga_id) AS vagas_no_experimento,
    AVG(m.tempo_fechamento_dias) AS tempo_medio_atual,
    
    CASE 
        WHEN COUNT(CASE WHEN m.resultado_final IN ('aprovado_cliente', 'reprovado_cliente') THEN 1 END) > 0
        THEN ROUND(
            COUNT(CASE WHEN m.resultado_final = 'aprovado_cliente' THEN 1 END)::DECIMAL / 
            COUNT(CASE WHEN m.resultado_final IN ('aprovado_cliente', 'reprovado_cliente') THEN 1 END) * 100, 
            2
        )
        ELSE 0
    END AS taxa_aprovacao_atual
FROM experimentos_distribuicao e
LEFT JOIN app_users u ON e.criado_por = u.id
LEFT JOIN metricas_distribuicao m ON e.id = m.experimento_id
WHERE e.ativo = true
GROUP BY e.id, u.nome_usuario;

-- ============================================
-- FUNÇÕES AUXILIARES
-- ============================================

-- Função para registrar métrica de distribuição
CREATE OR REPLACE FUNCTION registrar_metrica_distribuicao(
    p_vaga_id BIGINT,
    p_analista_id BIGINT,
    p_scores JSONB,
    p_foi_distribuido BOOLEAN,
    p_experimento_id BIGINT DEFAULT NULL
) RETURNS BIGINT AS $$
DECLARE
    v_metrica_id BIGINT;
BEGIN
    INSERT INTO metricas_distribuicao (
        vaga_id,
        analista_id,
        score_match_calculado,
        score_match_ajustado,
        fit_stack_calculado,
        fit_stack_override,
        fit_stack_final,
        fit_cliente_calculado,
        fit_cliente_override,
        fit_cliente_final,
        disponibilidade_calculada,
        taxa_sucesso_calculada,
        multiplicador_aplicado,
        bonus_aplicado,
        peso_fit_stack,
        peso_fit_cliente,
        peso_disponibilidade,
        peso_taxa_sucesso,
        foi_distribuido,
        experimento_id
    ) VALUES (
        p_vaga_id,
        p_analista_id,
        (p_scores->>'score_match_calculado')::INTEGER,
        (p_scores->>'score_match_ajustado')::INTEGER,
        (p_scores->>'fit_stack_calculado')::INTEGER,
        (p_scores->>'fit_stack_override')::INTEGER,
        (p_scores->>'fit_stack_final')::INTEGER,
        (p_scores->>'fit_cliente_calculado')::INTEGER,
        (p_scores->>'fit_cliente_override')::INTEGER,
        (p_scores->>'fit_cliente_final')::INTEGER,
        (p_scores->>'disponibilidade_calculada')::INTEGER,
        (p_scores->>'taxa_sucesso_calculada')::INTEGER,
        (p_scores->>'multiplicador_aplicado')::DECIMAL,
        (p_scores->>'bonus_aplicado')::INTEGER,
        (p_scores->>'peso_fit_stack')::INTEGER,
        (p_scores->>'peso_fit_cliente')::INTEGER,
        (p_scores->>'peso_disponibilidade')::INTEGER,
        (p_scores->>'peso_taxa_sucesso')::INTEGER,
        p_foi_distribuido,
        p_experimento_id
    ) RETURNING id INTO v_metrica_id;
    
    RETURN v_metrica_id;
END;
$$ LANGUAGE plpgsql;

-- Função para calcular impacto de ajuste
CREATE OR REPLACE FUNCTION calcular_impacto_ajuste(p_historico_id BIGINT)
RETURNS TEXT AS $$
DECLARE
    v_tempo_antes DECIMAL;
    v_tempo_depois DECIMAL;
    v_impacto TEXT;
BEGIN
    SELECT tempo_medio_antes, tempo_medio_depois
    INTO v_tempo_antes, v_tempo_depois
    FROM vw_impacto_ajustes
    WHERE id = p_historico_id;
    
    IF v_tempo_antes IS NULL OR v_tempo_depois IS NULL THEN
        RETURN 'Dados insuficientes';
    END IF;
    
    IF v_tempo_depois < v_tempo_antes THEN
        v_impacto := 'Positivo: Redução de ' || ROUND((v_tempo_antes - v_tempo_depois) / v_tempo_antes * 100, 2) || '% no tempo';
    ELSIF v_tempo_depois > v_tempo_antes THEN
        v_impacto := 'Negativo: Aumento de ' || ROUND((v_tempo_depois - v_tempo_antes) / v_tempo_antes * 100, 2) || '% no tempo';
    ELSE
        v_impacto := 'Neutro: Sem mudança significativa';
    END IF;
    
    -- Atualizar histórico com impacto real
    UPDATE historico_ajustes_distribuicao
    SET impacto_real = v_impacto
    WHERE id = p_historico_id;
    
    RETURN v_impacto;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- ÍNDICES
-- ============================================

CREATE INDEX IF NOT EXISTS idx_metricas_vaga_analista ON metricas_distribuicao(vaga_id, analista_id);
CREATE INDEX IF NOT EXISTS idx_metricas_experimento ON metricas_distribuicao(experimento_id);
CREATE INDEX IF NOT EXISTS idx_metricas_calculado_em ON metricas_distribuicao(calculado_em);
CREATE INDEX IF NOT EXISTS idx_historico_entidade ON historico_ajustes_distribuicao(tipo_entidade, entidade_id);
CREATE INDEX IF NOT EXISTS idx_experimentos_ativo ON experimentos_distribuicao(ativo);

-- ============================================
-- TRIGGERS
-- ============================================

-- Trigger para registrar ajustes no histórico
CREATE OR REPLACE FUNCTION trigger_registrar_ajuste_analista()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.multiplicador_performance != NEW.multiplicador_performance THEN
        INSERT INTO historico_ajustes_distribuicao (tipo_entidade, entidade_id, campo_alterado, valor_anterior, valor_novo)
        VALUES ('analista', NEW.id, 'multiplicador_performance', OLD.multiplicador_performance::TEXT, NEW.multiplicador_performance::TEXT);
    END IF;
    
    IF OLD.bonus_experiencia != NEW.bonus_experiencia THEN
        INSERT INTO historico_ajustes_distribuicao (tipo_entidade, entidade_id, campo_alterado, valor_anterior, valor_novo)
        VALUES ('analista', NEW.id, 'bonus_experiencia', OLD.bonus_experiencia::TEXT, NEW.bonus_experiencia::TEXT);
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_ajuste_analista
AFTER UPDATE ON app_users
FOR EACH ROW
WHEN (OLD.multiplicador_performance IS DISTINCT FROM NEW.multiplicador_performance 
      OR OLD.bonus_experiencia IS DISTINCT FROM NEW.bonus_experiencia)
EXECUTE FUNCTION trigger_registrar_ajuste_analista();

-- ============================================
-- DADOS INICIAIS
-- ============================================

-- Ativar todos os analistas para distribuição por padrão
UPDATE app_users
SET ativo_para_distribuicao = true,
    prioridade_distribuicao = 'Normal',
    multiplicador_performance = 1.00,
    bonus_experiencia = 0
WHERE tipo_usuario = 'analista_rs'
AND ativo_para_distribuicao IS NULL;

-- ============================================
-- CONCLUÍDO
-- ============================================

SELECT 'Parâmetros ajustáveis criados com sucesso!' AS status;
