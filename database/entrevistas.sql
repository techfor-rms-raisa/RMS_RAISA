-- ==============================================================================
-- ORBIT.AI - TABELA DE ENTREVISTAS E SUMARIZAÇÃO COM IA
-- Data: 28/11/2025
-- ==============================================================================

-- 1. ENUM para tipos e status de entrevista
DO $$ BEGIN
    CREATE TYPE tipo_entrevista AS ENUM ('comportamental', 'tecnica', 'cliente', 'mista');
    CREATE TYPE plataforma_entrevista AS ENUM ('Teams', 'Zoom', 'Meet', 'Presencial', 'Outra');
    CREATE TYPE status_entrevista AS ENUM ('agendada', 'realizada', 'transcrita', 'sumarizada', 'erro', 'cancelada');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. TABELA PRINCIPAL: Entrevistas
CREATE TABLE IF NOT EXISTS entrevistas (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    candidatura_id BIGINT NOT NULL REFERENCES candidaturas(id) ON DELETE CASCADE,
    vaga_id BIGINT NOT NULL REFERENCES vagas(id),
    analista_id BIGINT NOT NULL REFERENCES app_users(id),
    
    -- Informações da Entrevista
    data_entrevista TIMESTAMPTZ NOT NULL,
    tipo_entrevista tipo_entrevista DEFAULT 'tecnica',
    plataforma plataforma_entrevista DEFAULT 'Teams',
    duracao_minutos INT,
    participantes TEXT[], -- Array com nomes dos participantes
    
    -- Arquivos de Mídia
    media_url TEXT, -- URL do arquivo de áudio/vídeo no Supabase Storage
    media_filename TEXT,
    media_size_mb DECIMAL(10, 2),
    media_duration_seconds INT,
    
    -- Transcrição
    transcricao_texto TEXT, -- Texto completo da transcrição (manual ou automática)
    transcricao_fonte VARCHAR(50) DEFAULT 'manual', -- 'manual', 'teams', 'google_stt', 'outro'
    transcricao_url TEXT, -- URL do arquivo de transcrição original (se houver)
    
    -- Sumarização IA (Gemini)
    sumario_ia JSONB, -- Objeto InterviewSummary completo
    sumario_narrativo TEXT, -- Campo desnormalizado para busca rápida
    pontos_fortes TEXT[], -- Array de strings
    areas_desenvolvimento TEXT[], -- Array de strings
    fit_cultural_score INT CHECK (fit_cultural_score BETWEEN 1 AND 5),
    citacoes_chave JSONB, -- Array de {quote, speaker}
    recomendacao_proxima_etapa VARCHAR(50), -- 'Avançar', 'Rejeitar', 'Reentrevista', 'Aguardando Cliente'
    
    -- Metadados e Status
    status status_entrevista DEFAULT 'agendada',
    sumarizado_em TIMESTAMPTZ,
    sumarizado_por VARCHAR(50) DEFAULT 'Gemini',
    observacoes_analista TEXT,
    
    -- Auditoria
    criado_em TIMESTAMPTZ DEFAULT NOW(),
    criado_por BIGINT REFERENCES app_users(id),
    atualizado_em TIMESTAMPTZ DEFAULT NOW(),
    atualizado_por BIGINT REFERENCES app_users(id),
    
    -- Metadados Adicionais
    metadados JSONB,
    ativo BOOLEAN DEFAULT TRUE
);

-- 3. ÍNDICES para Performance
CREATE INDEX IF NOT EXISTS idx_entrevistas_candidatura ON entrevistas(candidatura_id);
CREATE INDEX IF NOT EXISTS idx_entrevistas_vaga ON entrevistas(vaga_id);
CREATE INDEX IF NOT EXISTS idx_entrevistas_analista ON entrevistas(analista_id);
CREATE INDEX IF NOT EXISTS idx_entrevistas_data ON entrevistas(data_entrevista);
CREATE INDEX IF NOT EXISTS idx_entrevistas_status ON entrevistas(status);
CREATE INDEX IF NOT EXISTS idx_entrevistas_recomendacao ON entrevistas(recomendacao_proxima_etapa);

-- Índice GIN para busca full-text na transcrição
CREATE INDEX IF NOT EXISTS idx_entrevistas_transcricao_fulltext ON entrevistas USING gin(to_tsvector('portuguese', transcricao_texto));

-- 4. TRIGGER para atualizar timestamp
CREATE OR REPLACE FUNCTION update_entrevista_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.atualizado_em = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_entrevistas_updated
    BEFORE UPDATE ON entrevistas
    FOR EACH ROW
    EXECUTE FUNCTION update_entrevista_timestamp();

-- 5. FUNÇÃO para extrair campos do sumario_ia JSONB
CREATE OR REPLACE FUNCTION sync_entrevista_sumario_fields()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.sumario_ia IS NOT NULL THEN
        NEW.sumario_narrativo := NEW.sumario_ia->>'narrativeSummary';
        NEW.pontos_fortes := ARRAY(SELECT jsonb_array_elements_text(NEW.sumario_ia->'strengths'));
        NEW.areas_desenvolvimento := ARRAY(SELECT jsonb_array_elements_text(NEW.sumario_ia->'areasForDevelopment'));
        NEW.fit_cultural_score := (NEW.sumario_ia->>'culturalFitScore')::INT;
        NEW.recomendacao_proxima_etapa := NEW.sumario_ia->>'nextStepRecommendation';
        NEW.citacoes_chave := NEW.sumario_ia->'keyQuotes';
        NEW.sumarizado_em := NOW();
        NEW.status := 'sumarizada';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_sync_sumario_fields
    BEFORE INSERT OR UPDATE OF sumario_ia ON entrevistas
    FOR EACH ROW
    WHEN (NEW.sumario_ia IS NOT NULL)
    EXECUTE FUNCTION sync_entrevista_sumario_fields();

-- 6. VIEW: Entrevistas com dados relacionados
CREATE OR REPLACE VIEW vw_entrevistas_completas AS
SELECT 
    e.id,
    e.candidatura_id,
    e.vaga_id,
    e.analista_id,
    
    -- Dados da Candidatura
    c.candidato_nome,
    c.candidato_email,
    c.status AS candidatura_status,
    
    -- Dados da Vaga
    v.titulo AS vaga_titulo,
    v.senioridade AS vaga_senioridade,
    v.cliente_id,
    cl.razao_social_cliente AS cliente_nome,
    
    -- Dados do Analista
    u.nome_usuario AS analista_nome,
    
    -- Dados da Entrevista
    e.data_entrevista,
    e.tipo_entrevista,
    e.plataforma,
    e.duracao_minutos,
    e.status,
    
    -- Transcrição
    e.transcricao_texto,
    e.transcricao_fonte,
    LENGTH(e.transcricao_texto) AS transcricao_tamanho_chars,
    
    -- Sumarização
    e.sumario_narrativo,
    e.pontos_fortes,
    e.areas_desenvolvimento,
    e.fit_cultural_score,
    e.recomendacao_proxima_etapa,
    e.citacoes_chave,
    e.sumarizado_em,
    
    -- Mídia
    e.media_url,
    e.media_filename,
    e.media_size_mb,
    
    -- Auditoria
    e.criado_em,
    e.atualizado_em,
    e.observacoes_analista
    
FROM entrevistas e
INNER JOIN candidaturas c ON e.candidatura_id = c.id
INNER JOIN vagas v ON e.vaga_id = v.id
INNER JOIN app_users u ON e.analista_id = u.id
LEFT JOIN clients cl ON v.cliente_id = cl.id
WHERE e.ativo = TRUE
ORDER BY e.data_entrevista DESC;

-- 7. VIEW: Estatísticas de Entrevistas por Analista
CREATE OR REPLACE VIEW vw_entrevistas_stats_analista AS
SELECT 
    e.analista_id,
    u.nome_usuario AS analista_nome,
    COUNT(*) AS total_entrevistas,
    COUNT(*) FILTER (WHERE e.status = 'sumarizada') AS total_sumarizadas,
    COUNT(*) FILTER (WHERE e.recomendacao_proxima_etapa = 'Avançar para a próxima fase') AS total_recomendadas_avancar,
    COUNT(*) FILTER (WHERE e.recomendacao_proxima_etapa = 'Rejeitar') AS total_recomendadas_rejeitar,
    ROUND(AVG(e.fit_cultural_score), 2) AS media_fit_cultural,
    ROUND(AVG(e.duracao_minutos), 0) AS media_duracao_minutos,
    COUNT(DISTINCT e.vaga_id) AS total_vagas_atendidas,
    COUNT(DISTINCT e.candidatura_id) AS total_candidatos_entrevistados
FROM entrevistas e
INNER JOIN app_users u ON e.analista_id = u.id
WHERE e.ativo = TRUE AND e.status IN ('sumarizada', 'transcrita')
GROUP BY e.analista_id, u.nome_usuario
ORDER BY total_entrevistas DESC;

-- 8. VIEW: Entrevistas Pendentes de Sumarização
CREATE OR REPLACE VIEW vw_entrevistas_pendentes_sumario AS
SELECT 
    e.id,
    e.candidatura_id,
    c.candidato_nome,
    v.titulo AS vaga_titulo,
    u.nome_usuario AS analista_nome,
    e.data_entrevista,
    e.tipo_entrevista,
    e.status,
    LENGTH(e.transcricao_texto) AS transcricao_tamanho,
    EXTRACT(DAY FROM NOW() - e.data_entrevista) AS dias_desde_entrevista
FROM entrevistas e
INNER JOIN candidaturas c ON e.candidatura_id = c.id
INNER JOIN vagas v ON e.vaga_id = v.id
INNER JOIN app_users u ON e.analista_id = u.id
WHERE e.ativo = TRUE 
  AND e.status IN ('realizada', 'transcrita')
  AND e.transcricao_texto IS NOT NULL
  AND e.sumario_ia IS NULL
ORDER BY e.data_entrevista ASC;

-- 9. POLÍTICAS DE SEGURANÇA (RLS)
ALTER TABLE entrevistas ENABLE ROW LEVEL SECURITY;

-- Analistas podem ver suas próprias entrevistas
CREATE POLICY entrevistas_analista_select ON entrevistas
    FOR SELECT
    USING (analista_id = current_setting('app.current_user_id')::BIGINT);

-- Analistas podem inserir suas próprias entrevistas
CREATE POLICY entrevistas_analista_insert ON entrevistas
    FOR INSERT
    WITH CHECK (analista_id = current_setting('app.current_user_id')::BIGINT);

-- Analistas podem atualizar suas próprias entrevistas
CREATE POLICY entrevistas_analista_update ON entrevistas
    FOR UPDATE
    USING (analista_id = current_setting('app.current_user_id')::BIGINT);

-- Administradores podem ver tudo
CREATE POLICY entrevistas_admin_all ON entrevistas
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM app_users 
            WHERE id = current_setting('app.current_user_id')::BIGINT 
            AND tipo_usuario = 'Administrador'
        )
    );

-- 10. COMENTÁRIOS PARA DOCUMENTAÇÃO
COMMENT ON TABLE entrevistas IS 'Armazena entrevistas realizadas com candidatos, incluindo transcrições e sumarizações geradas por IA (Gemini)';
COMMENT ON COLUMN entrevistas.sumario_ia IS 'Objeto JSON completo do tipo InterviewSummary gerado pelo Gemini';
COMMENT ON COLUMN entrevistas.transcricao_texto IS 'Texto completo da transcrição da entrevista (pode ser manual ou automática)';
COMMENT ON COLUMN entrevistas.fit_cultural_score IS 'Pontuação de fit cultural de 1 a 5 gerada pela IA';
COMMENT ON COLUMN entrevistas.recomendacao_proxima_etapa IS 'Recomendação da IA sobre o próximo passo do processo seletivo';

-- ==============================================================================
-- FIM DO SCRIPT
-- ==============================================================================
