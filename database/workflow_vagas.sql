-- ============================================
-- WORKFLOW DE VAGAS - ORBIT.AI
-- Implementa fluxo completo de 10 etapas
-- ============================================

-- ============================================
-- 1. ATUALIZAÇÃO DA TABELA VAGAS
-- ============================================

-- Adicionar novos campos para workflow
ALTER TABLE vagas
ADD COLUMN IF NOT EXISTS status_workflow TEXT DEFAULT 'rascunho',
ADD COLUMN IF NOT EXISTS descricao_original TEXT,
ADD COLUMN IF NOT EXISTS descricao_melhorada TEXT,
ADD COLUMN IF NOT EXISTS descricao_aprovada_em TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS descricao_aprovada_por BIGINT REFERENCES app_users(id),
ADD COLUMN IF NOT EXISTS prioridade_aprovada_em TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS prioridade_aprovada_por BIGINT REFERENCES app_users(id);

-- Comentários
COMMENT ON COLUMN vagas.status_workflow IS 'Status do workflow: rascunho, aguardando_revisao, aguardando_aprovacao_descricao, descricao_aprovada, aguardando_aprovacao_priorizacao, priorizada_e_distribuida, em_andamento, cvs_enviados, entrevistas_agendadas, fechada';

-- ============================================
-- 2. TABELA DE HISTÓRICO DE DESCRIÇÕES
-- ============================================

CREATE TABLE IF NOT EXISTS vaga_descricao_historico (
    id BIGSERIAL PRIMARY KEY,
    vaga_id BIGINT NOT NULL REFERENCES vagas(id) ON DELETE CASCADE,
    
    -- Descrições
    descricao_original TEXT NOT NULL,
    descricao_melhorada TEXT NOT NULL,
    mudancas_sugeridas JSONB, -- Lista de mudanças que a IA fez
    
    -- Aprovação
    acao TEXT NOT NULL, -- 'aprovado', 'editado_e_aprovado', 'rejeitado'
    descricao_final TEXT, -- Se foi editada manualmente
    aprovado_por_usuario_id BIGINT REFERENCES app_users(id),
    aprovado_por_nome TEXT,
    aprovado_em TIMESTAMP WITH TIME ZONE,
    
    -- Metadados
    criado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_vaga_descricao_historico_vaga ON vaga_descricao_historico(vaga_id);

-- ============================================
-- 3. TABELA DE NOTIFICAÇÕES
-- ============================================

CREATE TABLE IF NOT EXISTS notificacoes (
    id BIGSERIAL PRIMARY KEY,
    usuario_id BIGINT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
    
    -- Conteúdo
    tipo_notificacao TEXT NOT NULL, -- 'nova_vaga', 'descricao_pronta', 'priorizacao_pronta', 'sugestao_repriorizacao', 'vaga_redistribuida'
    titulo TEXT NOT NULL,
    mensagem TEXT NOT NULL,
    link_relacionado TEXT, -- ex: /vagas/123
    dados_adicionais JSONB, -- Dados extras para renderização
    
    -- Status
    lida BOOLEAN DEFAULT FALSE,
    lida_em TIMESTAMP WITH TIME ZONE,
    
    -- Metadados
    criado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_notificacoes_usuario ON notificacoes(usuario_id);
CREATE INDEX idx_notificacoes_lida ON notificacoes(lida);
CREATE INDEX idx_notificacoes_criado_em ON notificacoes(criado_em DESC);

-- ============================================
-- 4. TABELA DE REDISTRIBUIÇÃO DE VAGAS
-- ============================================

CREATE TABLE IF NOT EXISTS vaga_redistribuicao_historico (
    id BIGSERIAL PRIMARY KEY,
    vaga_id BIGINT NOT NULL REFERENCES vagas(id) ON DELETE CASCADE,
    
    -- Analistas
    analista_anterior_id BIGINT REFERENCES app_users(id),
    analista_anterior_nome TEXT,
    analista_novo_id BIGINT NOT NULL REFERENCES app_users(id),
    analista_novo_nome TEXT NOT NULL,
    
    -- Justificativa
    motivo TEXT NOT NULL,
    redistribuido_por_usuario_id BIGINT NOT NULL REFERENCES app_users(id),
    redistribuido_por_nome TEXT NOT NULL,
    
    -- Metadados
    redistribuido_em TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_vaga_redistribuicao_vaga ON vaga_redistribuicao_historico(vaga_id);

-- ============================================
-- 5. TABELA DE REPRIORIZAÇÃO DINÂMICA
-- ============================================

CREATE TABLE IF NOT EXISTS vaga_repriorizacao_sugestao (
    id BIGSERIAL PRIMARY KEY,
    vaga_id BIGINT NOT NULL REFERENCES vagas(id) ON DELETE CASCADE,
    
    -- Prioridade Atual
    score_atual INTEGER NOT NULL,
    nivel_atual TEXT NOT NULL,
    sla_atual INTEGER NOT NULL,
    
    -- Prioridade Sugerida
    score_sugerido INTEGER NOT NULL,
    nivel_sugerido TEXT NOT NULL,
    sla_sugerido INTEGER NOT NULL,
    
    -- Justificativa
    motivo_mudanca TEXT NOT NULL,
    contexto_analise JSONB, -- Dados que levaram à mudança
    
    -- Status
    status TEXT DEFAULT 'pendente', -- 'pendente', 'aprovado', 'rejeitado'
    aprovado_por_usuario_id BIGINT REFERENCES app_users(id),
    aprovado_em TIMESTAMP WITH TIME ZONE,
    
    -- Metadados
    sugerido_em TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_vaga_repriorizacao_vaga ON vaga_repriorizacao_sugestao(vaga_id);
CREATE INDEX idx_vaga_repriorizacao_status ON vaga_repriorizacao_sugestao(status);

-- ============================================
-- 6. VIEWS ÚTEIS
-- ============================================

-- View: Vagas no Workflow
CREATE OR REPLACE VIEW vw_vagas_workflow AS
SELECT 
    v.id,
    v.titulo,
    v.status_workflow,
    v.criado_em,
    v.descricao_aprovada_em,
    v.prioridade_aprovada_em,
    c.nome AS cliente_nome,
    u.nome AS analista_nome,
    vp.score_prioridade,
    vp.nivel_prioridade,
    vp.sla_dias,
    CASE 
        WHEN v.status_workflow IN ('rascunho', 'aguardando_revisao') THEN 'Aguardando Início'
        WHEN v.status_workflow IN ('aguardando_aprovacao_descricao', 'descricao_aprovada', 'aguardando_aprovacao_priorizacao') THEN 'Em Aprovação'
        WHEN v.status_workflow IN ('priorizada_e_distribuida', 'em_andamento') THEN 'Em Andamento'
        WHEN v.status_workflow IN ('cvs_enviados', 'entrevistas_agendadas') THEN 'Avançada'
        WHEN v.status_workflow = 'fechada' THEN 'Concluída'
        ELSE 'Desconhecido'
    END AS fase_workflow
FROM vagas v
LEFT JOIN clients c ON v.cliente_id = c.id
LEFT JOIN app_users u ON v.analista_id = u.id
LEFT JOIN vaga_priorizacao vp ON v.id = vp.vaga_id;

-- View: Notificações Não Lidas por Usuário
CREATE OR REPLACE VIEW vw_notificacoes_nao_lidas AS
SELECT 
    usuario_id,
    COUNT(*) AS total_nao_lidas
FROM notificacoes
WHERE lida = FALSE
GROUP BY usuario_id;

-- View: Dashboard de Workflow
CREATE OR REPLACE VIEW vw_dashboard_workflow AS
SELECT 
    COUNT(*) FILTER (WHERE status_workflow = 'rascunho') AS vagas_rascunho,
    COUNT(*) FILTER (WHERE status_workflow = 'aguardando_aprovacao_descricao') AS vagas_aguardando_descricao,
    COUNT(*) FILTER (WHERE status_workflow = 'aguardando_aprovacao_priorizacao') AS vagas_aguardando_priorizacao,
    COUNT(*) FILTER (WHERE status_workflow = 'em_andamento') AS vagas_em_andamento,
    COUNT(*) FILTER (WHERE status_workflow = 'fechada') AS vagas_fechadas,
    COUNT(*) AS total_vagas
FROM vagas;

-- ============================================
-- 7. TRIGGERS
-- ============================================

-- Trigger: Atualizar timestamp ao mudar status
CREATE OR REPLACE FUNCTION atualizar_timestamp_workflow()
RETURNS TRIGGER AS $$
BEGIN
    NEW.atualizado_em = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_atualizar_timestamp_workflow
BEFORE UPDATE ON vagas
FOR EACH ROW
WHEN (OLD.status_workflow IS DISTINCT FROM NEW.status_workflow)
EXECUTE FUNCTION atualizar_timestamp_workflow();

-- ============================================
-- 8. POLÍTICAS DE SEGURANÇA (RLS)
-- ============================================

-- Habilitar RLS nas novas tabelas
ALTER TABLE vaga_descricao_historico ENABLE ROW LEVEL SECURITY;
ALTER TABLE notificacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE vaga_redistribuicao_historico ENABLE ROW LEVEL SECURITY;
ALTER TABLE vaga_repriorizacao_sugestao ENABLE ROW LEVEL SECURITY;

-- Políticas: Todos os usuários autenticados podem ler
CREATE POLICY "Usuários autenticados podem ler histórico de descrições"
ON vaga_descricao_historico FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Usuários podem ver suas próprias notificações"
ON notificacoes FOR SELECT
TO authenticated
USING (auth.uid()::bigint = usuario_id);

CREATE POLICY "Usuários autenticados podem ler histórico de redistribuição"
ON vaga_redistribuicao_historico FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Usuários autenticados podem ler sugestões de repriorização"
ON vaga_repriorizacao_sugestao FOR SELECT
TO authenticated
USING (true);

-- Políticas: Apenas gestores podem inserir
CREATE POLICY "Apenas gestores podem criar histórico de descrição"
ON vaga_descricao_historico FOR INSERT
TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1 FROM app_users
        WHERE id = auth.uid()::bigint
        AND role IN ('Gestão de Pessoas', 'Admin')
    )
);

CREATE POLICY "Sistema pode criar notificações"
ON notificacoes FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Apenas gestores podem redistribuir vagas"
ON vaga_redistribuicao_historico FOR INSERT
TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1 FROM app_users
        WHERE id = auth.uid()::bigint
        AND role IN ('Gestão de Pessoas', 'Admin')
    )
);

-- ============================================
-- 9. FUNÇÕES AUXILIARES
-- ============================================

-- Função: Criar notificação
CREATE OR REPLACE FUNCTION criar_notificacao(
    p_usuario_id BIGINT,
    p_tipo TEXT,
    p_titulo TEXT,
    p_mensagem TEXT,
    p_link TEXT DEFAULT NULL,
    p_dados JSONB DEFAULT NULL
)
RETURNS BIGINT AS $$
DECLARE
    v_notificacao_id BIGINT;
BEGIN
    INSERT INTO notificacoes (
        usuario_id,
        tipo_notificacao,
        titulo,
        mensagem,
        link_relacionado,
        dados_adicionais
    ) VALUES (
        p_usuario_id,
        p_tipo,
        p_titulo,
        p_mensagem,
        p_link,
        p_dados
    )
    RETURNING id INTO v_notificacao_id;
    
    RETURN v_notificacao_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- FIM DO SCRIPT
-- ============================================

-- Comentários finais
COMMENT ON TABLE vaga_descricao_historico IS 'Histórico de melhorias de descrição de vagas pela IA';
COMMENT ON TABLE notificacoes IS 'Sistema de notificações para usuários';
COMMENT ON TABLE vaga_redistribuicao_historico IS 'Histórico de redistribuição de vagas entre analistas';
COMMENT ON TABLE vaga_repriorizacao_sugestao IS 'Sugestões de repriorização dinâmica geradas pela IA';
