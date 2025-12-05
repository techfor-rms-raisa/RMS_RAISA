-- ============================================
-- SCRIPT: Adicionar campos de CV e vínculo com candidatos
-- Objetivo: Permitir recuperação automática de CVs de candidatos aprovados
-- Data: 2025-12-04
-- ============================================

-- 1. Adicionar campos na tabela consultants
ALTER TABLE consultants 
ADD COLUMN IF NOT EXISTS pessoa_id INTEGER REFERENCES pessoas(id),
ADD COLUMN IF NOT EXISTS candidatura_id INTEGER REFERENCES candidaturas(id),
ADD COLUMN IF NOT EXISTS curriculo_url TEXT,
ADD COLUMN IF NOT EXISTS curriculo_filename TEXT,
ADD COLUMN IF NOT EXISTS curriculo_uploaded_at TIMESTAMP;

-- 2. Criar índices para melhorar performance de busca
CREATE INDEX IF NOT EXISTS idx_consultants_pessoa_id ON consultants(pessoa_id);
CREATE INDEX IF NOT EXISTS idx_consultants_candidatura_id ON consultants(candidatura_id);
CREATE INDEX IF NOT EXISTS idx_consultants_cpf ON consultants(cpf);
CREATE INDEX IF NOT EXISTS idx_consultants_email ON consultants(email_consultor);

-- 3. Criar índice na tabela pessoas para busca por CPF e email
CREATE INDEX IF NOT EXISTS idx_pessoas_cpf ON pessoas(cpf);
CREATE INDEX IF NOT EXISTS idx_pessoas_email ON pessoas(email);

-- 4. Comentários nas colunas para documentação
COMMENT ON COLUMN consultants.pessoa_id IS 'Referência à pessoa no banco de talentos (se veio de candidatura)';
COMMENT ON COLUMN consultants.candidatura_id IS 'Referência à candidatura aprovada que originou este consultor';
COMMENT ON COLUMN consultants.curriculo_url IS 'URL do CV armazenado no Supabase Storage ou link externo';
COMMENT ON COLUMN consultants.curriculo_filename IS 'Nome original do arquivo do CV';
COMMENT ON COLUMN consultants.curriculo_uploaded_at IS 'Data/hora do upload do CV';

-- 5. Criar função para buscar CV de candidato por CPF ou Email
CREATE OR REPLACE FUNCTION buscar_cv_candidato(
    p_cpf TEXT DEFAULT NULL,
    p_email TEXT DEFAULT NULL
)
RETURNS TABLE (
    pessoa_id INTEGER,
    candidatura_id INTEGER,
    curriculo_url TEXT,
    nome_pessoa TEXT,
    email_pessoa TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        p.id AS pessoa_id,
        c.id::INTEGER AS candidatura_id,
        p.curriculo_url,
        p.nome AS nome_pessoa,
        p.email AS email_pessoa
    FROM pessoas p
    LEFT JOIN candidaturas c ON c.pessoa_id = p.id::TEXT
        AND c.status IN ('aprovado_cliente', 'aprovado')
    WHERE 
        (p_cpf = p_cpf OR p.email = p_email)
        AND p.curriculo_url IS NOT NULL
    ORDER BY c.created_at DESC
    LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- 6. Criar view para consultores com informações de CV
CREATE OR REPLACE VIEW vw_consultores_com_cv AS
SELECT 
    c.*,
    p.nome AS candidato_nome_original,
    p.email AS candidato_email_original,
    p.telefone AS candidato_telefone,
    p.linkedin_url AS candidato_linkedin,
    cand.vaga_id,
    cand.status AS candidatura_status,
    cand.created_at AS data_candidatura,
    CASE 
        WHEN c.curriculo_url IS NOT NULL THEN true
        ELSE false
    END AS tem_cv
FROM consultants c
LEFT JOIN pessoas p ON c.pessoa_id = p.id
LEFT JOIN candidaturas cand ON c.candidatura_id = cand.id::INTEGER;

COMMENT ON VIEW vw_consultores_com_cv IS 'View completa de consultores com informações de CV e candidatura original';

-- ============================================
-- SCRIPT DE MIGRAÇÃO DE DADOS EXISTENTES
-- ============================================

-- 7. Tentar vincular consultores existentes com pessoas no banco de talentos
-- (Executar apenas uma vez após criar as colunas)

UPDATE consultants cons
SET 
    pessoa_id = p.id,
    curriculo_url = p.curriculo_url,
    curriculo_uploaded_at = p.created_at
FROM pessoas p
WHERE 
    cons.pessoa_id IS NULL
    AND (
        (cons.cpf IS NOT NULL AND cons.cpf = p.cpf)
        OR (cons.email_consultor IS NOT NULL AND cons.email_consultor = p.email)
    )
    AND p.curriculo_url IS NOT NULL;

-- 8. Vincular candidaturas aprovadas aos consultores
UPDATE consultants cons
SET candidatura_id = cand.id::INTEGER
FROM candidaturas cand
WHERE 
    cons.candidatura_id IS NULL
    AND cons.pessoa_id IS NOT NULL
    AND cand.pessoa_id = cons.pessoa_id::TEXT
    AND cand.status IN ('aprovado_cliente', 'aprovado')
ORDER BY cand.created_at DESC
LIMIT 1;

-- ============================================
-- VERIFICAÇÃO
-- ============================================

-- Verificar quantos consultores têm CV vinculado
SELECT 
    COUNT(*) AS total_consultores,
    COUNT(curriculo_url) AS com_cv,
    COUNT(pessoa_id) AS vinculados_pessoa,
    COUNT(candidatura_id) AS vinculados_candidatura
FROM consultants;

-- Listar consultores com CV
SELECT 
    nome_consultores,
    email_consultor,
    cpf,
    curriculo_url,
    candidato_nome_original,
    tem_cv
FROM vw_consultores_com_cv
WHERE tem_cv = true
ORDER BY nome_consultores;

-- ============================================
-- FIM DO SCRIPT
-- ============================================
