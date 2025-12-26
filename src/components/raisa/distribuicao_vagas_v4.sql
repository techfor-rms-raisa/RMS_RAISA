-- ============================================
-- SCRIPT CORRIGIDO: Distribuição Inteligente de Vagas
-- Projeto: RMS_RAISA
-- Data: 26/12/2024
-- Versão: 1.4 - Colunas corretas de app_users
-- ============================================

-- ============================================
-- PARTE 1: TABELA DE DISTRIBUIÇÃO VAGA-ANALISTA
-- ============================================

CREATE TABLE IF NOT EXISTS vaga_analista_distribuicao (
    id SERIAL PRIMARY KEY,
    vaga_id INTEGER NOT NULL REFERENCES vagas(id) ON DELETE CASCADE,
    analista_id INTEGER NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
    
    -- Configuração de distribuição
    ativo BOOLEAN DEFAULT TRUE,
    percentual_distribuicao INTEGER DEFAULT 50,
    max_candidatos INTEGER,
    
    -- Contadores
    candidatos_atribuidos INTEGER DEFAULT 0,
    ultimo_candidato_em TIMESTAMPTZ,
    
    -- Controle de ordem para alternância
    ordem_alternancia INTEGER DEFAULT 1,
    
    -- Metadados
    criado_em TIMESTAMPTZ DEFAULT NOW(),
    criado_por INTEGER REFERENCES app_users(id),
    atualizado_em TIMESTAMPTZ,
    
    -- Constraint única
    UNIQUE(vaga_id, analista_id)
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_vaga_analista_dist_vaga ON vaga_analista_distribuicao(vaga_id);
CREATE INDEX IF NOT EXISTS idx_vaga_analista_dist_analista ON vaga_analista_distribuicao(analista_id);
CREATE INDEX IF NOT EXISTS idx_vaga_analista_dist_ativo ON vaga_analista_distribuicao(vaga_id, ativo);

-- ============================================
-- PARTE 2: TABELA DE HISTÓRICO DE DISTRIBUIÇÃO
-- ============================================

CREATE TABLE IF NOT EXISTS distribuicao_candidato_historico (
    id SERIAL PRIMARY KEY,
    candidatura_id INTEGER NOT NULL REFERENCES candidaturas(id) ON DELETE CASCADE,
    vaga_id INTEGER NOT NULL REFERENCES vagas(id) ON DELETE CASCADE,
    analista_id INTEGER NOT NULL REFERENCES app_users(id),
    
    -- Tipo de atribuição
    tipo_atribuicao VARCHAR(50) DEFAULT 'automatica',
    motivo_redistribuicao TEXT,
    
    -- Referência anterior
    analista_anterior_id INTEGER REFERENCES app_users(id),
    
    -- Timestamps
    atribuido_em TIMESTAMPTZ DEFAULT NOW(),
    atribuido_por INTEGER REFERENCES app_users(id),
    
    -- Status
    status VARCHAR(50) DEFAULT 'ativo'
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_dist_hist_candidatura ON distribuicao_candidato_historico(candidatura_id);
CREATE INDEX IF NOT EXISTS idx_dist_hist_analista ON distribuicao_candidato_historico(analista_id);
CREATE INDEX IF NOT EXISTS idx_dist_hist_vaga ON distribuicao_candidato_historico(vaga_id);

-- ============================================
-- PARTE 3: ADICIONAR CAMPO analista_responsavel NA CANDIDATURAS
-- ============================================

DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'candidaturas' AND column_name = 'analista_responsavel_id'
    ) THEN
        ALTER TABLE candidaturas ADD COLUMN analista_responsavel_id INTEGER REFERENCES app_users(id);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_candidaturas_analista ON candidaturas(analista_responsavel_id);

-- ============================================
-- PARTE 4: FUNÇÃO DE DISTRIBUIÇÃO AUTOMÁTICA
-- ============================================

CREATE OR REPLACE FUNCTION fn_distribuir_candidato_automatico(
    p_candidatura_id INTEGER,
    p_vaga_id INTEGER
)
RETURNS INTEGER AS $$
DECLARE
    v_analista_id INTEGER;
    v_distribuicao RECORD;
BEGIN
    SELECT 
        vad.analista_id,
        vad.id as distribuicao_id
    INTO v_distribuicao
    FROM vaga_analista_distribuicao vad
    WHERE vad.vaga_id = p_vaga_id
      AND vad.ativo = TRUE
      AND (vad.max_candidatos IS NULL OR vad.candidatos_atribuidos < vad.max_candidatos)
    ORDER BY 
        vad.candidatos_atribuidos ASC,
        vad.ordem_alternancia ASC,
        vad.ultimo_candidato_em ASC NULLS FIRST
    LIMIT 1;
    
    IF v_distribuicao.analista_id IS NOT NULL THEN
        v_analista_id := v_distribuicao.analista_id;
        
        UPDATE candidaturas 
        SET analista_responsavel_id = v_analista_id
        WHERE id = p_candidatura_id;
        
        UPDATE vaga_analista_distribuicao
        SET 
            candidatos_atribuidos = candidatos_atribuidos + 1,
            ultimo_candidato_em = NOW(),
            atualizado_em = NOW()
        WHERE id = v_distribuicao.distribuicao_id;
        
        INSERT INTO distribuicao_candidato_historico (
            candidatura_id, vaga_id, analista_id, tipo_atribuicao
        ) VALUES (
            p_candidatura_id, p_vaga_id, v_analista_id, 'automatica'
        );
        
        RETURN v_analista_id;
    END IF;
    
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- PARTE 5: FUNÇÃO PARA REDISTRIBUIR CANDIDATO
-- ============================================

CREATE OR REPLACE FUNCTION fn_redistribuir_candidato(
    p_candidatura_id INTEGER,
    p_novo_analista_id INTEGER,
    p_motivo TEXT DEFAULT NULL,
    p_usuario_id INTEGER DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
    v_analista_anterior INTEGER;
    v_vaga_id INTEGER;
BEGIN
    SELECT analista_responsavel_id, vaga_id
    INTO v_analista_anterior, v_vaga_id
    FROM candidaturas
    WHERE id = p_candidatura_id;
    
    UPDATE candidaturas 
    SET analista_responsavel_id = p_novo_analista_id
    WHERE id = p_candidatura_id;
    
    IF v_analista_anterior IS NOT NULL THEN
        UPDATE vaga_analista_distribuicao
        SET candidatos_atribuidos = GREATEST(0, candidatos_atribuidos - 1)
        WHERE vaga_id = v_vaga_id AND analista_id = v_analista_anterior;
    END IF;
    
    UPDATE vaga_analista_distribuicao
    SET 
        candidatos_atribuidos = candidatos_atribuidos + 1,
        ultimo_candidato_em = NOW()
    WHERE vaga_id = v_vaga_id AND analista_id = p_novo_analista_id;
    
    INSERT INTO distribuicao_candidato_historico (
        candidatura_id, vaga_id, analista_id, 
        tipo_atribuicao, motivo_redistribuicao, 
        analista_anterior_id, atribuido_por
    ) VALUES (
        p_candidatura_id, v_vaga_id, p_novo_analista_id,
        'redistribuicao', p_motivo,
        v_analista_anterior, p_usuario_id
    );
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- PARTE 6: VIEW COM COLUNAS CORRETAS
-- ============================================

CREATE OR REPLACE VIEW vw_distribuicao_vagas AS
SELECT 
    v.id AS vaga_id,
    v.titulo AS vaga_titulo,
    v.status AS vaga_status,
    c.razao_social_cliente AS cliente_nome,
    vad.id AS distribuicao_id,
    vad.analista_id,
    au.nome_usuario AS analista_nome,
    au.email_usuario AS analista_email,
    vad.ativo,
    vad.percentual_distribuicao,
    vad.max_candidatos,
    vad.candidatos_atribuidos,
    vad.ordem_alternancia,
    vad.ultimo_candidato_em,
    (SELECT COUNT(*) FROM candidaturas WHERE vaga_id = v.id) AS total_candidatos_vaga,
    (SELECT COUNT(*) FROM candidaturas 
     WHERE vaga_id = v.id 
       AND analista_responsavel_id = vad.analista_id
       AND status IN ('novo', 'em_analise')) AS candidatos_pendentes
FROM vagas v
LEFT JOIN clients c ON c.id = v.cliente_id
LEFT JOIN vaga_analista_distribuicao vad ON vad.vaga_id = v.id
LEFT JOIN app_users au ON au.id = vad.analista_id
WHERE vad.id IS NOT NULL
ORDER BY v.id, vad.ordem_alternancia;

-- ============================================
-- PARTE 7: VIEW DE ANALISTAS DISPONÍVEIS
-- ============================================

CREATE OR REPLACE VIEW vw_analistas_disponiveis AS
SELECT 
    id,
    nome_usuario AS nome,
    email_usuario AS email,
    tipo_usuario,
    ativo_usuario AS ativo
FROM app_users
WHERE ativo_usuario = TRUE
AND tipo_usuario = 'Analista de R&S'
ORDER BY nome_usuario;

-- ============================================
-- PARTE 8: TRIGGER PARA DISTRIBUIÇÃO AUTOMÁTICA
-- ============================================

CREATE OR REPLACE FUNCTION trg_distribuir_candidato_novo()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.analista_responsavel_id IS NULL THEN
        PERFORM fn_distribuir_candidato_automatico(NEW.id, NEW.vaga_id);
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_candidatura_distribuicao ON candidaturas;

CREATE TRIGGER trg_candidatura_distribuicao
    AFTER INSERT ON candidaturas
    FOR EACH ROW
    EXECUTE FUNCTION trg_distribuir_candidato_novo();

-- ============================================
-- PARTE 9: VERIFICAÇÃO
-- ============================================

SELECT '✅ Tabelas criadas:' as info;
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('vaga_analista_distribuicao', 'distribuicao_candidato_historico');

SELECT '✅ Funções criadas:' as info;
SELECT routine_name 
FROM information_schema.routines 
WHERE routine_schema = 'public' 
AND routine_name LIKE '%distribu%';

SELECT '✅ Views criadas:' as info;
SELECT table_name as view_name
FROM information_schema.views
WHERE table_schema = 'public'
AND table_name IN ('vw_distribuicao_vagas', 'vw_analistas_disponiveis');

SELECT '✅ Analistas de R&S disponíveis:' as info;
SELECT * FROM vw_analistas_disponiveis;

SELECT '🎉 Script executado com sucesso!' as resultado;

-- ============================================
-- FIM DO SCRIPT
-- ============================================
