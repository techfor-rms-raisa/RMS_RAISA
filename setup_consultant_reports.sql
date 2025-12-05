-- ========================================
-- SETUP COMPLETO: consultant_reports
-- ESCALA DE RISCO: 1-5
-- ========================================
-- Este script otimiza a tabela consultant_reports existente
-- Executar no Supabase SQL Editor
-- Data: 04/12/2025
-- ========================================

-- 1. CRIAR ÍNDICES PARA PERFORMANCE
-- ========================================

CREATE INDEX IF NOT EXISTS idx_consultant_reports_consultant 
ON consultant_reports(consultant_id);

CREATE INDEX IF NOT EXISTS idx_consultant_reports_period 
ON consultant_reports(year DESC, month DESC);

CREATE INDEX IF NOT EXISTS idx_consultant_reports_risk 
ON consultant_reports(risk_score);

CREATE INDEX IF NOT EXISTS idx_consultant_reports_created 
ON consultant_reports(created_at DESC);


-- 2. ATUALIZAR CONSTRAINT DE RISK_SCORE PARA 1-5
-- ========================================

-- Remover constraint antiga se existir
DO $$ 
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'consultant_reports_risk_score_check'
    ) THEN
        ALTER TABLE consultant_reports 
        DROP CONSTRAINT consultant_reports_risk_score_check;
    END IF;
END $$;

-- Adicionar nova constraint (1-5)
ALTER TABLE consultant_reports 
ADD CONSTRAINT consultant_reports_risk_score_check 
CHECK (risk_score BETWEEN 1 AND 5);


-- 3. ADICIONAR CONSTRAINT UNIQUE
-- ========================================
-- Garante que um consultor só pode ter 1 relatório por mês/ano

DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'unique_consultant_month_year'
    ) THEN
        ALTER TABLE consultant_reports 
        ADD CONSTRAINT unique_consultant_month_year 
        UNIQUE (consultant_id, month, year);
    END IF;
END $$;


-- 4. HABILITAR ROW LEVEL SECURITY (RLS)
-- ========================================

ALTER TABLE consultant_reports ENABLE ROW LEVEL SECURITY;


-- 5. CRIAR POLÍTICAS DE ACESSO
-- ========================================

-- Política de LEITURA
DROP POLICY IF EXISTS "Usuários autenticados podem ler relatórios" ON consultant_reports;
CREATE POLICY "Usuários autenticados podem ler relatórios"
ON consultant_reports FOR SELECT
TO authenticated
USING (true);

-- Política de INSERÇÃO
DROP POLICY IF EXISTS "Usuários autenticados podem inserir relatórios" ON consultant_reports;
CREATE POLICY "Usuários autenticados podem inserir relatórios"
ON consultant_reports FOR INSERT
TO authenticated
WITH CHECK (true);

-- Política de ATUALIZAÇÃO
DROP POLICY IF EXISTS "Usuários autenticados podem atualizar relatórios" ON consultant_reports;
CREATE POLICY "Usuários autenticados podem atualizar relatórios"
ON consultant_reports FOR UPDATE
TO authenticated
USING (true);

-- Política de DELEÇÃO
DROP POLICY IF EXISTS "Usuários autenticados podem deletar relatórios" ON consultant_reports;
CREATE POLICY "Usuários autenticados podem deletar relatórios"
ON consultant_reports FOR DELETE
TO authenticated
USING (true);


-- 6. VERIFICAR CONFIGURAÇÃO
-- ========================================

SELECT 
    '✅ Índices criados' AS status,
    COUNT(*) AS total
FROM pg_indexes 
WHERE tablename = 'consultant_reports'

UNION ALL

SELECT 
    '✅ Políticas RLS ativas' AS status,
    COUNT(*) AS total
FROM pg_policies 
WHERE tablename = 'consultant_reports'

UNION ALL

SELECT 
    '✅ Constraints' AS status,
    COUNT(*) AS total
FROM pg_constraint 
WHERE conrelid = 'consultant_reports'::regclass;


-- 7. VERIFICAR ESTRUTURA FINAL
-- ========================================

SELECT 
    column_name, 
    data_type, 
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_name = 'consultant_reports'
ORDER BY ordinal_position;


-- ========================================
-- ESCALA DE RISCO CONFIRMADA (1-5)
-- ========================================
-- 1 = Excelente (Verde #34A853)
-- 2 = Bom (Azul #4285F4)
-- 3 = Médio (Amarelo #FBBC05)
-- 4 = Alto (Laranja #FF6D00)
-- 5 = Crítico (Vermelho #EA4335)
-- ========================================
-- Quarentena: Scores 4 e 5
-- ========================================
