# ============================================
# SCRIPT DE ATUALIZACAO AUTOMATICA
# CVGeneratorV2.tsx - v3.0 (DOCX Real)
# ============================================

$arquivo = "src\components\raisa\CVGeneratorV2.tsx"

if (-not (Test-Path $arquivo)) {
    Write-Host "ERRO: Arquivo nao encontrado: $arquivo" -ForegroundColor Red
    Write-Host "Certifique-se de executar na raiz do projeto RMS_RAISA" -ForegroundColor Yellow
    exit 1
}

Write-Host "Arquivo encontrado: $arquivo" -ForegroundColor Green

# Ler conteudo
$conteudo = Get-Content $arquivo -Raw -Encoding UTF8

# Backup
$dataBackup = Get-Date -Format "yyyyMMdd_HHmmss"
$backup = "$arquivo.bak_$dataBackup"
Copy-Item $arquivo $backup
Write-Host "Backup criado: $backup" -ForegroundColor Cyan

# ============================================
# SUBSTITUICAO 1: handleBaixarPDF -> handleBaixarDocx (nome da funcao)
# ============================================
Write-Host ""
Write-Host "Alteracao 1: Renomeando funcao..." -ForegroundColor Yellow

$conteudo = $conteudo.Replace("handleBaixarPDF", "handleBaixarDocx")
Write-Host "  handleBaixarPDF -> handleBaixarDocx OK" -ForegroundColor Green

# ============================================
# SUBSTITUICAO 2: Substituir corpo da funcao
# Trocar de syncrono para async com fetch
# ============================================
Write-Host ""
Write-Host "Alteracao 2: Substituindo corpo da funcao..." -ForegroundColor Yellow

$oldBody = "const handleBaixarDocx = () => {"
$newBody = "const handleBaixarDocx = async () => {"

if ($conteudo.Contains($oldBody)) {
    $conteudo = $conteudo.Replace($oldBody, $newBody)
    Write-Host "  Funcao tornada async OK" -ForegroundColor Green
} else {
    Write-Host "  Funcao ja era async ou nao encontrada" -ForegroundColor Yellow
}

# ============================================
# SUBSTITUICAO 3: Trocar o conteudo do bloco da funcao
# De window.print para fetch /api/cv-generator-docx
# ============================================
Write-Host ""
Write-Host "Alteracao 3: Substituindo logica interna..." -ForegroundColor Yellow

# Encontrar e substituir o bloco inteiro entre o inicio da funcao e o proximo marcador
$marcadorInicio = "const handleBaixarDocx = async () => {"
$marcadorFim = "  // Adicionar experiencia"

if ($conteudo.Contains($marcadorInicio) -and $conteudo.Contains($marcadorFim)) {
    $posInicio = $conteudo.IndexOf($marcadorInicio)
    $posFim = $conteudo.IndexOf($marcadorFim)
    
    if ($posInicio -lt $posFim) {
        $antes = $conteudo.Substring(0, $posInicio)
        $depois = $conteudo.Substring($posFim)
        
        $novaFuncao = @'
const handleBaixarDocx = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/cv-generator-docx', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dados: dados,
          template: templateSelecionado === 'tsystems' ? 'tsystems' : 'techfor'
        })
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'Erro ao gerar DOCX');
      }

      const result = await response.json();
      
      // Converter base64 para blob e iniciar download
      const byteCharacters = atob(result.docx_base64);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { 
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' 
      });

      // Criar link de download
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = result.filename || 'CV_Techfor.docx';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      console.log('DOCX baixado: ' + result.size + ' bytes');
    } catch (err: any) {
      console.error('Erro ao gerar DOCX:', err);
      setError(err.message || 'Erro ao gerar documento Word');
    } finally {
      setLoading(false);
    }
  };

'@
        
        $conteudo = $antes + "  " + $novaFuncao + "  " + $depois
        Write-Host "  Corpo da funcao substituido com sucesso!" -ForegroundColor Green
    } else {
        Write-Host "  ERRO: Posicoes invalidas" -ForegroundColor Red
    }
} else {
    Write-Host "  Marcadores nao encontrados - apenas nomes foram atualizados" -ForegroundColor Yellow
}

# ============================================
# SUBSTITUICAO 4: Atualizar textos dos botoes
# ============================================
Write-Host ""
Write-Host "Alteracao 4: Atualizando textos dos botoes..." -ForegroundColor Yellow

$conteudo = $conteudo.Replace("Imprimir/PDF", "Baixar DOCX")
$conteudo = $conteudo.Replace("Baixar PDF", "Baixar DOCX (Word)")
Write-Host "  Textos dos botoes atualizados OK" -ForegroundColor Green

# ============================================
# SALVAR
# ============================================
Write-Host ""
Write-Host "Salvando arquivo..." -ForegroundColor Yellow
[System.IO.File]::WriteAllText((Resolve-Path $arquivo).Path, $conteudo, [System.Text.Encoding]::UTF8)
Write-Host "Arquivo salvo com sucesso!" -ForegroundColor Green

# ============================================
# VERIFICACAO
# ============================================
Write-Host ""
Write-Host "VERIFICACAO:" -ForegroundColor Cyan
$check = Get-Content $arquivo -Raw -Encoding UTF8

if ($check.Contains("handleBaixarDocx")) {
    Write-Host "  OK - handleBaixarDocx encontrada" -ForegroundColor Green
} else {
    Write-Host "  FALHA - handleBaixarDocx nao encontrada" -ForegroundColor Red
}

if ($check.Contains("handleBaixarPDF")) {
    Write-Host "  ATENCAO - handleBaixarPDF ainda existe" -ForegroundColor Yellow
} else {
    Write-Host "  OK - handleBaixarPDF removida" -ForegroundColor Green
}

if ($check.Contains("cv-generator-docx")) {
    Write-Host "  OK - chamada a nova API encontrada" -ForegroundColor Green
} else {
    Write-Host "  INFO - Nova API nao encontrada no corpo (pode precisar verificar)" -ForegroundColor Yellow
}

if ($check.Contains("Baixar DOCX")) {
    Write-Host "  OK - texto do botao atualizado" -ForegroundColor Green
} else {
    Write-Host "  ATENCAO - texto do botao pode nao ter sido atualizado" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Script concluido!" -ForegroundColor Green
Write-Host "Backup em: $backup" -ForegroundColor Cyan
