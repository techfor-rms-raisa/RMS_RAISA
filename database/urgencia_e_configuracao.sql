-- ============================================
-- ADICIONAR CAMPOS DE URGÊNCIA E DATA LIMITE
-- ============================================

-- Adicionar campos na tabela vagas
ALTER TABLE vagas
ADD COLUMN IF NOT EXISTS flag_urgencia TEXT CHECK (flag_urgencia IN ('Baixa', 'Normal', 'Altíssima')) DEFAULT 'Normal',
ADD COLUMN IF NOT EXISTS data_limite DATE,
ADD COLUMN IF NOT EXISTS qtde_maxima_distribuicao INTEGER DEFAULT 1 CHECK (qtde_maxima_distribuicao >= 1);

-- Comentários
COMMENT ON COLUMN vagas.flag_urgencia IS 'Nível de urgência da vaga: Baixa, Normal ou Altíssima';
COMMENT ON COLUMN vagas.data_limite IS 'Data limite para fechamento da vaga (prioridade máxima)';
COMMENT ON COLUMN vagas.qtde_maxima_distribuicao IS 'Quantidade máxima de analistas que podem receber a vaga simultaneamente (default: 1)';

-- ============================================
-- TABELAS DE CONFIGURAÇÃO DE PESOS
-- ============================================

-- Configuração de Priorização
CREATE TABLE IF NOT EXISTS config_priorizacao (
    id BIGSERIAL PRIMARY KEY,
    nome_config TEXT NOT NULL DEFAULT 'Configuração Padrão',
    
    -- Pesos dos critérios (0-100, soma deve ser 100)
    peso_urgencia_prazo INTEGER DEFAULT 25 CHECK (peso_urgencia_prazo >= 0 AND peso_urgencia_prazo <= 100),
    peso_faturamento INTEGER DEFAULT 25 CHECK (peso_faturamento >= 0 AND peso_faturamento <= 100),
    peso_tempo_aberto INTEGER DEFAULT 25 CHECK (peso_tempo_aberto >= 0 AND peso_tempo_aberto <= 100),
    peso_complexidade INTEGER DEFAULT 25 CHECK (peso_complexidade >= 0 AND peso_complexidade <= 100),
    
    -- Bônus e multiplicadores
    bonus_cliente_vip INTEGER DEFAULT 20 CHECK (bonus_cliente_vip >= 0 AND bonus_cliente_vip <= 50),
    multiplicador_urgencia_baixa DECIMAL(3,2) DEFAULT 0.80 CHECK (multiplicador_urgencia_baixa > 0),
    multiplicador_urgencia_normal DECIMAL(3,2) DEFAULT 1.00 CHECK (multiplicador_urgencia_normal > 0),
    multiplicador_urgencia_altissima DECIMAL(3,2) DEFAULT 1.50 CHECK (multiplicador_urgencia_altissima > 0),
    
    -- Faixas de prioridade
    faixa_prioridade_alta_min INTEGER DEFAULT 80,
    faixa_prioridade_media_min INTEGER DEFAULT 50,
    
    -- Metadados
    ativa BOOLEAN DEFAULT true,
    criado_em TIMESTAMP DEFAULT NOW(),
    atualizado_em TIMESTAMP DEFAULT NOW(),
    atualizado_por BIGINT REFERENCES app_users(id),
    
    -- Constraint: soma dos pesos deve ser 100
    CONSTRAINT soma_pesos_100 CHECK (
        peso_urgencia_prazo + peso_faturamento + peso_tempo_aberto + peso_complexidade = 100
    )
);

-- Configuração de Distribuição
CREATE TABLE IF NOT EXISTS config_distribuicao (
    id BIGSERIAL PRIMARY KEY,
    nome_config TEXT NOT NULL DEFAULT 'Configuração Padrão',
    
    -- Pesos dos critérios (0-100, soma deve ser 100)
    peso_fit_stack INTEGER DEFAULT 40 CHECK (peso_fit_stack >= 0 AND peso_fit_stack <= 100),
    peso_fit_cliente INTEGER DEFAULT 30 CHECK (peso_fit_cliente >= 0 AND peso_fit_cliente <= 100),
    peso_disponibilidade INTEGER DEFAULT 20 CHECK (peso_disponibilidade >= 0 AND peso_disponibilidade <= 100),
    peso_taxa_sucesso INTEGER DEFAULT 10 CHECK (peso_taxa_sucesso >= 0 AND peso_taxa_sucesso <= 100),
    
    -- Parâmetros de disponibilidade
    capacidade_maxima_default INTEGER DEFAULT 7 CHECK (capacidade_maxima_default >= 1),
    carga_ideal_min INTEGER DEFAULT 0,
    carga_ideal_max INTEGER DEFAULT 5,
    carga_alta_max INTEGER DEFAULT 7,
    carga_critica_max INTEGER DEFAULT 10,
    
    -- Faixas de adequação
    faixa_excelente_min INTEGER DEFAULT 85,
    faixa_bom_min INTEGER DEFAULT 70,
    faixa_regular_min INTEGER DEFAULT 50,
    
    -- Metadados
    ativa BOOLEAN DEFAULT true,
    criado_em TIMESTAMP DEFAULT NOW(),
    atualizado_em TIMESTAMP DEFAULT NOW(),
    atualizado_por BIGINT REFERENCES app_users(id),
    
    -- Constraint: soma dos pesos deve ser 100
    CONSTRAINT soma_pesos_100_dist CHECK (
        peso_fit_stack + peso_fit_cliente + peso_disponibilidade + peso_taxa_sucesso = 100
    )
);

-- Adicionar campo de capacidade máxima por analista
ALTER TABLE app_users
ADD COLUMN IF NOT EXISTS capacidade_maxima_vagas INTEGER DEFAULT 7 CHECK (capacidade_maxima_vagas >= 1);

COMMENT ON COLUMN app_users.capacidade_maxima_vagas IS 'Quantidade máxima de vagas que o analista pode ter simultaneamente';

-- ============================================
-- INSERIR CONFIGURAÇÕES PADRÃO
-- ============================================

-- Configuração padrão de priorização
INSERT INTO config_priorizacao (
    nome_config,
    peso_urgencia_prazo,
    peso_faturamento,
    peso_tempo_aberto,
    peso_complexidade,
    bonus_cliente_vip,
    multiplicador_urgencia_baixa,
    multiplicador_urgencia_normal,
    multiplicador_urgencia_altissima,
    ativa
) VALUES (
    'Configuração Padrão',
    25, -- urgência
    25, -- faturamento
    25, -- tempo aberto
    25, -- complexidade
    20, -- bônus VIP
    0.80, -- multiplicador baixa
    1.00, -- multiplicador normal
    1.50, -- multiplicador altíssima
    true
) ON CONFLICT DO NOTHING;

-- Configuração padrão de distribuição
INSERT INTO config_distribuicao (
    nome_config,
    peso_fit_stack,
    peso_fit_cliente,
    peso_disponibilidade,
    peso_taxa_sucesso,
    capacidade_maxima_default,
    ativa
) VALUES (
    'Configuração Padrão',
    40, -- fit stack
    30, -- fit cliente
    20, -- disponibilidade
    10, -- taxa sucesso
    7,  -- capacidade máxima
    true
) ON CONFLICT DO NOTHING;

-- ============================================
-- HISTÓRICO DE MUDANÇAS DE CONFIGURAÇÃO
-- ============================================

CREATE TABLE IF NOT EXISTS historico_config_priorizacao (
    id BIGSERIAL PRIMARY KEY,
    config_id BIGINT REFERENCES config_priorizacao(id),
    campo_alterado TEXT NOT NULL,
    valor_anterior TEXT,
    valor_novo TEXT,
    alterado_por BIGINT REFERENCES app_users(id),
    alterado_em TIMESTAMP DEFAULT NOW(),
    motivo TEXT
);

CREATE TABLE IF NOT EXISTS historico_config_distribuicao (
    id BIGSERIAL PRIMARY KEY,
    config_id BIGINT REFERENCES config_distribuicao(id),
    campo_alterado TEXT NOT NULL,
    valor_anterior TEXT,
    valor_novo TEXT,
    alterado_por BIGINT REFERENCES app_users(id),
    alterado_em TIMESTAMP DEFAULT NOW(),
    motivo TEXT
);

-- ============================================
-- FUNÇÕES AUXILIARES
-- ============================================

-- Função para buscar configuração ativa de priorização
CREATE OR REPLACE FUNCTION get_config_priorizacao_ativa()
RETURNS config_priorizacao AS $$
BEGIN
    RETURN (SELECT * FROM config_priorizacao WHERE ativa = true ORDER BY id DESC LIMIT 1);
END;
$$ LANGUAGE plpgsql;

-- Função para buscar configuração ativa de distribuição
CREATE OR REPLACE FUNCTION get_config_distribuicao_ativa()
RETURNS config_distribuicao AS $$
BEGIN
    RETURN (SELECT * FROM config_distribuicao WHERE ativa = true ORDER BY id DESC LIMIT 1);
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- VIEWS ATUALIZADAS
-- ============================================

-- View de vagas com priorização (incluindo novos campos)
CREATE OR REPLACE VIEW vw_vagas_priorizacao AS
SELECT 
    v.id,
    v.titulo,
    v.status,
    v.flag_urgencia,
    v.data_limite,
    v.qtde_maxima_distribuicao,
    v.prazo_fechamento,
    v.faturamento_estimado,
    v.stack_tecnologica,
    v.senioridade,
    c.razao_social_cliente,
    c.cliente_vip,
    vp.score_prioridade,
    vp.nivel_prioridade,
    vp.sla_dias,
    vp.justificativa,
    vp.calculado_em,
    EXTRACT(DAY FROM (NOW() - v.created_at)) AS dias_aberta,
    CASE 
        WHEN v.data_limite IS NOT NULL THEN EXTRACT(DAY FROM (v.data_limite - NOW()::date))
        ELSE NULL
    END AS dias_ate_limite
FROM vagas v
LEFT JOIN clientes c ON v.cliente_id = c.id
LEFT JOIN vaga_priorizacao vp ON v.id = vp.vaga_id
WHERE v.status IN ('aberta', 'em_andamento');

-- ============================================
-- ÍNDICES
-- ============================================

CREATE INDEX IF NOT EXISTS idx_vagas_flag_urgencia ON vagas(flag_urgencia);
CREATE INDEX IF NOT EXISTS idx_vagas_data_limite ON vagas(data_limite);
CREATE INDEX IF NOT EXISTS idx_config_priorizacao_ativa ON config_priorizacao(ativa);
CREATE INDEX IF NOT EXISTS idx_config_distribuicao_ativa ON config_distribuicao(ativa);

-- ============================================
-- TRIGGERS PARA HISTÓRICO
-- ============================================

-- Trigger para registrar mudanças na configuração de priorização
CREATE OR REPLACE FUNCTION registrar_mudanca_config_priorizacao()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.peso_urgencia_prazo != NEW.peso_urgencia_prazo THEN
        INSERT INTO historico_config_priorizacao (config_id, campo_alterado, valor_anterior, valor_novo, alterado_por)
        VALUES (NEW.id, 'peso_urgencia_prazo', OLD.peso_urgencia_prazo::TEXT, NEW.peso_urgencia_prazo::TEXT, NEW.atualizado_por);
    END IF;
    
    IF OLD.peso_faturamento != NEW.peso_faturamento THEN
        INSERT INTO historico_config_priorizacao (config_id, campo_alterado, valor_anterior, valor_novo, alterado_por)
        VALUES (NEW.id, 'peso_faturamento', OLD.peso_faturamento::TEXT, NEW.peso_faturamento::TEXT, NEW.atualizado_por);
    END IF;
    
    IF OLD.peso_tempo_aberto != NEW.peso_tempo_aberto THEN
        INSERT INTO historico_config_priorizacao (config_id, campo_alterado, valor_anterior, valor_novo, alterado_por)
        VALUES (NEW.id, 'peso_tempo_aberto', OLD.peso_tempo_aberto::TEXT, NEW.peso_tempo_aberto::TEXT, NEW.atualizado_por);
    END IF;
    
    IF OLD.peso_complexidade != NEW.peso_complexidade THEN
        INSERT INTO historico_config_priorizacao (config_id, campo_alterado, valor_anterior, valor_novo, alterado_por)
        VALUES (NEW.id, 'peso_complexidade', OLD.peso_complexidade::TEXT, NEW.peso_complexidade::TEXT, NEW.atualizado_por);
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_registrar_mudanca_config_priorizacao
AFTER UPDATE ON config_priorizacao
FOR EACH ROW
EXECUTE FUNCTION registrar_mudanca_config_priorizacao();

-- ============================================
-- CONCLUÍDO
-- ============================================

-- Verificar configurações
SELECT 'Configuração de Priorização criada' AS status, * FROM config_priorizacao WHERE ativa = true;
SELECT 'Configuração de Distribuição criada' AS status, * FROM config_distribuicao WHERE ativa = true;
