-- ============================================
-- RAISA ADVANCED: PRIORIZAÇÃO E DISTRIBUIÇÃO INTELIGENTE DE VAGAS
-- ============================================

-- Tabela de Priorização de Vagas
CREATE TABLE IF NOT EXISTS vaga_priorizacao (
    id BIGSERIAL PRIMARY KEY,
    vaga_id UUID NOT NULL REFERENCES vagas(id) ON DELETE CASCADE,
    score_prioridade INTEGER NOT NULL CHECK (score_prioridade >= 0 AND score_prioridade <= 100),
    nivel_prioridade TEXT NOT NULL CHECK (nivel_prioridade IN ('Alta', 'Média', 'Baixa')),
    sla_dias INTEGER NOT NULL,
    justificativa TEXT NOT NULL,
    fatores_considerados JSONB NOT NULL,
    calculado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(vaga_id)
);

-- Tabela de Distribuição de Vagas (Recomendação de Analistas)
CREATE TABLE IF NOT EXISTS vaga_distribuicao (
    id BIGSERIAL PRIMARY KEY,
    vaga_id UUID NOT NULL REFERENCES vagas(id) ON DELETE CASCADE,
    analista_id INTEGER NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
    score_match INTEGER NOT NULL CHECK (score_match >= 0 AND score_match <= 100),
    nivel_adequacao TEXT NOT NULL CHECK (nivel_adequacao IN ('Excelente', 'Bom', 'Regular', 'Baixo')),
    justificativa_match TEXT NOT NULL,
    fatores_match JSONB NOT NULL,
    tempo_estimado_fechamento_dias INTEGER NOT NULL,
    recomendacao TEXT NOT NULL CHECK (recomendacao IN ('Altamente Recomendado', 'Recomendado', 'Adequado', 'Não Recomendado')),
    calculado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(vaga_id, analista_id)
);

-- Tabela de Perfil de Analista (para armazenar stack e histórico)
CREATE TABLE IF NOT EXISTS analista_perfil (
    id BIGSERIAL PRIMARY KEY,
    analista_id INTEGER NOT NULL UNIQUE REFERENCES app_users(id) ON DELETE CASCADE,
    stack_experiencia TEXT[] DEFAULT '{}',
    especialidades TEXT[] DEFAULT '{}',
    certificacoes TEXT[] DEFAULT '{}',
    anos_experiencia_rs INTEGER DEFAULT 0,
    taxa_aprovacao_geral NUMERIC(5,2) DEFAULT 0.00,
    tempo_medio_fechamento_dias INTEGER DEFAULT 30,
    vagas_fechadas_total INTEGER DEFAULT 0,
    atualizado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_vaga_priorizacao_vaga_id ON vaga_priorizacao(vaga_id);
CREATE INDEX IF NOT EXISTS idx_vaga_priorizacao_nivel ON vaga_priorizacao(nivel_prioridade);
CREATE INDEX IF NOT EXISTS idx_vaga_priorizacao_score ON vaga_priorizacao(score_prioridade DESC);

CREATE INDEX IF NOT EXISTS idx_vaga_distribuicao_vaga_id ON vaga_distribuicao(vaga_id);
CREATE INDEX IF NOT EXISTS idx_vaga_distribuicao_analista_id ON vaga_distribuicao(analista_id);
CREATE INDEX IF NOT EXISTS idx_vaga_distribuicao_score ON vaga_distribuicao(score_match DESC);

CREATE INDEX IF NOT EXISTS idx_analista_perfil_analista_id ON analista_perfil(analista_id);

-- ============================================
-- VIEWS ÚTEIS
-- ============================================

-- View: Vagas com Prioridade
CREATE OR REPLACE VIEW vw_vagas_com_prioridade AS
SELECT 
    v.id,
    v.titulo,
    v.status,
    v.senioridade,
    v.stack_tecnologica,
    v.cliente_id,
    c.razao_social_cliente AS cliente_nome,
    c.cliente_vip,
    v.analista_id,
    u.nome_usuario AS analista_nome,
    vp.score_prioridade,
    vp.nivel_prioridade,
    vp.sla_dias,
    vp.justificativa AS justificativa_prioridade,
    vp.calculado_em AS prioridade_calculada_em,
    EXTRACT(DAY FROM (NOW() - v.created_at)) AS dias_em_aberto,
    CASE 
        WHEN vp.sla_dias IS NOT NULL THEN 
            vp.sla_dias - EXTRACT(DAY FROM (NOW() - v.created_at))
        ELSE NULL
    END AS dias_restantes_sla
FROM vagas v
LEFT JOIN vaga_priorizacao vp ON v.id = vp.vaga_id
LEFT JOIN clientes c ON v.cliente_id = c.id
LEFT JOIN app_users u ON v.analista_id = u.id
WHERE v.status IN ('aberta', 'em_andamento')
ORDER BY vp.score_prioridade DESC NULLS LAST;

-- View: Recomendações de Analistas por Vaga
CREATE OR REPLACE VIEW vw_recomendacoes_analistas AS
SELECT 
    vd.vaga_id,
    v.titulo AS vaga_titulo,
    vd.analista_id,
    u.nome_usuario AS analista_nome,
    vd.score_match,
    vd.nivel_adequacao,
    vd.recomendacao,
    vd.justificativa_match,
    vd.tempo_estimado_fechamento_dias,
    vd.fatores_match,
    ap.taxa_aprovacao_geral,
    ap.tempo_medio_fechamento_dias,
    ap.vagas_fechadas_total,
    (SELECT COUNT(*) FROM vagas WHERE analista_id = vd.analista_id AND status IN ('aberta', 'em_andamento')) AS carga_trabalho_atual
FROM vaga_distribuicao vd
JOIN vagas v ON vd.vaga_id = v.id
JOIN app_users u ON vd.analista_id = u.id
LEFT JOIN analista_perfil ap ON vd.analista_id = ap.analista_id
ORDER BY vd.vaga_id, vd.score_match DESC;

-- View: Dashboard de Priorização (Métricas Gerais)
CREATE OR REPLACE VIEW vw_dashboard_priorizacao AS
SELECT 
    COUNT(*) FILTER (WHERE nivel_prioridade = 'Alta') AS vagas_alta_prioridade,
    COUNT(*) FILTER (WHERE nivel_prioridade = 'Média') AS vagas_media_prioridade,
    COUNT(*) FILTER (WHERE nivel_prioridade = 'Baixa') AS vagas_baixa_prioridade,
    ROUND(AVG(score_prioridade), 2) AS score_medio_prioridade,
    ROUND(AVG(sla_dias), 2) AS sla_medio_dias,
    COUNT(*) FILTER (WHERE dias_restantes_sla < 0) AS vagas_atrasadas,
    COUNT(*) FILTER (WHERE dias_restantes_sla BETWEEN 0 AND 3) AS vagas_urgentes,
    COUNT(*) FILTER (WHERE analista_id IS NULL) AS vagas_sem_analista
FROM vw_vagas_com_prioridade;

-- View: Performance de Analistas (com dados de priorização)
CREATE OR REPLACE VIEW vw_analistas_performance_priorizacao AS
SELECT 
    u.id AS analista_id,
    u.nome_usuario AS analista_nome,
    ap.stack_experiencia,
    ap.taxa_aprovacao_geral,
    ap.tempo_medio_fechamento_dias,
    ap.vagas_fechadas_total,
    (SELECT COUNT(*) FROM vagas WHERE analista_id = u.id AND status IN ('aberta', 'em_andamento')) AS carga_atual,
    (SELECT AVG(vd.score_match) FROM vaga_distribuicao vd WHERE vd.analista_id = u.id) AS score_match_medio,
    (SELECT COUNT(*) FROM vaga_distribuicao vd WHERE vd.analista_id = u.id AND vd.recomendacao = 'Altamente Recomendado') AS vezes_altamente_recomendado
FROM app_users u
LEFT JOIN analista_perfil ap ON u.id = ap.analista_id
WHERE u.tipo_usuario = 'Analista de R&S' AND u.ativo_usuario = true
ORDER BY ap.taxa_aprovacao_geral DESC NULLS LAST;

-- ============================================
-- TRIGGERS
-- ============================================

-- Trigger: Atualizar timestamp de atualização do perfil do analista
CREATE OR REPLACE FUNCTION atualizar_timestamp_analista_perfil()
RETURNS TRIGGER AS $$
BEGIN
    NEW.atualizado_em = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_atualizar_analista_perfil
BEFORE UPDATE ON analista_perfil
FOR EACH ROW
EXECUTE FUNCTION atualizar_timestamp_analista_perfil();

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================

-- Habilitar RLS nas tabelas
ALTER TABLE vaga_priorizacao ENABLE ROW LEVEL SECURITY;
ALTER TABLE vaga_distribuicao ENABLE ROW LEVEL SECURITY;
ALTER TABLE analista_perfil ENABLE ROW LEVEL SECURITY;

-- Políticas de acesso (todos os usuários autenticados podem ler)
CREATE POLICY "Usuários autenticados podem ler priorização"
ON vaga_priorizacao FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Usuários autenticados podem ler distribuição"
ON vaga_distribuicao FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Usuários autenticados podem ler perfil de analista"
ON analista_perfil FOR SELECT
TO authenticated
USING (true);

-- Políticas de escrita (apenas admins e gestores)
CREATE POLICY "Admins e Gestores podem inserir/atualizar priorização"
ON vaga_priorizacao FOR ALL
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM app_users 
        WHERE id = auth.uid()::integer 
        AND tipo_usuario IN ('Administrador', 'Gestão Comercial', 'Gestão de Pessoas')
    )
);

CREATE POLICY "Admins e Gestores podem inserir/atualizar distribuição"
ON vaga_distribuicao FOR ALL
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM app_users 
        WHERE id = auth.uid()::integer 
        AND tipo_usuario IN ('Administrador', 'Gestão Comercial', 'Gestão de Pessoas')
    )
);

CREATE POLICY "Admins e Gestores podem inserir/atualizar perfil de analista"
ON analista_perfil FOR ALL
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM app_users 
        WHERE id = auth.uid()::integer 
        AND tipo_usuario IN ('Administrador', 'Gestão de Pessoas')
    )
);

-- ============================================
-- COMENTÁRIOS
-- ============================================

COMMENT ON TABLE vaga_priorizacao IS 'Armazena scores de prioridade calculados pela IA para cada vaga';
COMMENT ON TABLE vaga_distribuicao IS 'Armazena recomendações de analistas para cada vaga, calculadas pela IA';
COMMENT ON TABLE analista_perfil IS 'Perfil detalhado de cada analista (stack, experiência, performance)';

COMMENT ON VIEW vw_vagas_com_prioridade IS 'Lista vagas abertas com seus scores de prioridade e SLA';
COMMENT ON VIEW vw_recomendacoes_analistas IS 'Lista recomendações de analistas para cada vaga com justificativas';
COMMENT ON VIEW vw_dashboard_priorizacao IS 'Métricas gerais do sistema de priorização';
COMMENT ON VIEW vw_analistas_performance_priorizacao IS 'Performance de analistas considerando dados de priorização';
