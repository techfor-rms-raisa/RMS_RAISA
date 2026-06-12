# smoke_test_recovery_preview.ps1
# ════════════════════════════════════════════════════════════════════════════
#
# Smoke test do endpoint Email Recovery Pipeline em PREVIEW.
# Cobre os 3 cenários principais da Fase 2 (F3 + F6):
#   1. lead_status        → GET    (gratuito, só lê banco)
#   2. recover_lead       → POST   (orquestra MX + padrão + Snov.io)
#   3. manual_revalidate  → POST   (edição manual + MX, Snov.io opcional)
#
# v1.0 — 12/06/2026
#
# Estrutura espelha o disparar_cron_preview.ps1 (validação via clipboard,
# obtenção interativa do bypass token).
#
# IMPORTANTE — Bypass Token de Preview:
#   O ambiente Preview do Vercel tem Deployment Protection. Toda chamada a
#   endpoints em Preview precisa do header `x-vercel-protection-bypass`.
#   Pegue o token em: Vercel Dashboard → Project rms-raisa → Settings →
#   Deployment Protection → Protection Bypass for Automation.
#
# DIFERENÇA frente ao cron:
#   - Cron usa: Bypass Token + CRON_SECRET (2 segredos)
#   - Recovery usa: APENAS Bypass Token (RBAC fica na UI conforme D8)
#
# Para acionar em PRODUCTION, trocar a URL para:
#   https://rms-raisa.vercel.app/api/campaign-email-recovery
# E remover o header de bypass (Production não tem Deployment Protection).
# ════════════════════════════════════════════════════════════════════════════

$CRECOVERY_URL = "https://rms-raisa-git-preview-techfor.vercel.app/api/campaign-email-recovery"

Write-Host "`n══════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  SMOKE TEST — Email Recovery Pipeline (Preview)" -ForegroundColor Cyan
Write-Host "══════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  URL base: $CRECOVERY_URL" -ForegroundColor DarkGray

# ── 1) Bypass Token ─────────────────────────────
Write-Host "`n[1] Copie o Protection Bypass Token do Vercel agora (Ctrl+C no painel)" -ForegroundColor Cyan
Read-Host "    Apos copiar, pressione ENTER"
$bypassToken = (Get-Clipboard).Trim()
if ($bypassToken.Length -lt 20 -or $bypassToken.StartsWith("whsec_")) {
    Write-Host "    ❌ Bypass invalido. Esperado: 32+ chars sem prefixo whsec_. Lidos: $($bypassToken.Length)" -ForegroundColor Red
    return
}
Write-Host "    ✅ Bypass OK ($($bypassToken.Length) chars, preview: $($bypassToken.Substring(0,8))...)" -ForegroundColor Green

# ── 2) Lead ID ──────────────────────────────────
Write-Host "`n[2] Lead ID para teste" -ForegroundColor Cyan
$leadIdInput = Read-Host "    Digite o lead_id (ex: 9)"
$leadId = 0
if (-not [int]::TryParse($leadIdInput.Trim(), [ref]$leadId) -or $leadId -lt 1) {
    Write-Host "    ❌ Lead ID invalido. Deve ser inteiro positivo." -ForegroundColor Red
    return
}
Write-Host "    ✅ Lead ID: $leadId" -ForegroundColor Green

# ── 3) Identificacao do operador (criado_por) ───
Write-Host "`n[3] Identificacao do operador (criado_por)" -ForegroundColor Cyan
$criadoPor = Read-Host "    Digite o e-mail do operador (ex: mvieira@techforti.com.br)"
if ([string]::IsNullOrWhiteSpace($criadoPor) -or -not $criadoPor.Contains("@")) {
    Write-Host "    ❌ E-mail invalido." -ForegroundColor Red
    return
}
Write-Host "    ✅ Operador: $criadoPor" -ForegroundColor Green

# ── 4) Headers padrao ───────────────────────────
$baseHeaders = @{
    "x-vercel-protection-bypass" = $bypassToken
    "Content-Type"               = "application/json"
}

# ── 5) Menu de cenarios ─────────────────────────
function Show-Menu {
    Write-Host "`n╔════════════════════════════════════════════════════════╗" -ForegroundColor Yellow
    Write-Host "║  Escolha o cenario para testar                         ║" -ForegroundColor Yellow
    Write-Host "╠════════════════════════════════════════════════════════╣" -ForegroundColor Yellow
    Write-Host "║  1) GET   lead_status         (gratuito)               ║" -ForegroundColor Yellow
    Write-Host "║  2) POST  recover_lead        (gasta creditos Snov.io) ║" -ForegroundColor Yellow
    Write-Host "║  3) POST  manual_revalidate   (so MX, Snov.io OFF)     ║" -ForegroundColor Yellow
    Write-Host "║  4) POST  manual_revalidate   (MX + Snov.io)           ║" -ForegroundColor Yellow
    Write-Host "║  5) Sair                                               ║" -ForegroundColor Yellow
    Write-Host "╚════════════════════════════════════════════════════════╝" -ForegroundColor Yellow
}

function Invoke-Recovery {
    param(
        [string]$Method,
        [string]$Action,
        [hashtable]$Body
    )

    $url = "${CRECOVERY_URL}?action=$Action"
    if ($Method -eq "GET") {
        $url += "&lead_id=$leadId"
    }

    Write-Host "`n→ $Method $url" -ForegroundColor DarkCyan
    if ($Body) {
        $bodyJson = $Body | ConvertTo-Json -Depth 5 -Compress
        Write-Host "  Body: $bodyJson" -ForegroundColor DarkGray
    }

    try {
        $params = @{
            Uri     = $url
            Method  = $Method
            Headers = $baseHeaders
        }
        if ($Body) {
            $params.Body = ($Body | ConvertTo-Json -Depth 5)
        }

        $resp = Invoke-RestMethod @params

        Write-Host "`n✅ RESPOSTA RECEBIDA" -ForegroundColor Green
        $resp | ConvertTo-Json -Depth 10
    }
    catch {
        Write-Host "`n❌ Erro: $($_.Exception.Message)" -ForegroundColor Red
        if ($_.Exception.Response) {
            $sc = $_.Exception.Response.StatusCode
            Write-Host "   HTTP Status: $sc" -ForegroundColor Yellow
        }
        if ($_.ErrorDetails -and $_.ErrorDetails.Message) {
            Write-Host "   Detalhes do servidor:" -ForegroundColor Yellow
            $msg = $_.ErrorDetails.Message
            Write-Host "   $($msg.Substring(0, [Math]::Min(500, $msg.Length)))" -ForegroundColor DarkYellow
        }
    }
}

# ── 6) Loop interativo ──────────────────────────
while ($true) {
    Show-Menu
    $opcao = Read-Host "`n  Opcao"

    switch ($opcao.Trim()) {
        "1" {
            Invoke-Recovery -Method "GET" -Action "lead_status"
        }
        "2" {
            Write-Host "`n⚠️  ATENCAO: este teste pode consumir ate ~30 creditos Snov.io (~`$0.12)" -ForegroundColor Yellow
            $conf = Read-Host "   Confirma? (s/n)"
            if ($conf.Trim().ToLower() -eq "s") {
                $body = @{
                    lead_id    = $leadId
                    criado_por = $criadoPor
                }
                Invoke-Recovery -Method "POST" -Action "recover_lead" -Body $body
            }
            else {
                Write-Host "   Cancelado." -ForegroundColor DarkGray
            }
        }
        "3" {
            $novoEmail = Read-Host "`n   Digite o novo e-mail (ex: dsouza@techforti.com.br)"
            if ([string]::IsNullOrWhiteSpace($novoEmail) -or -not $novoEmail.Contains("@")) {
                Write-Host "   ❌ E-mail invalido." -ForegroundColor Red
                continue
            }
            $body = @{
                lead_id        = $leadId
                novo_email     = $novoEmail.Trim()
                criado_por     = $criadoPor
                validar_snovio = $false
            }
            Invoke-Recovery -Method "POST" -Action "manual_revalidate" -Body $body
        }
        "4" {
            $novoEmail = Read-Host "`n   Digite o novo e-mail (ex: dsouza@techforti.com.br)"
            if ([string]::IsNullOrWhiteSpace($novoEmail) -or -not $novoEmail.Contains("@")) {
                Write-Host "   ❌ E-mail invalido." -ForegroundColor Red
                continue
            }
            Write-Host "`n⚠️  ATENCAO: este teste consome 1 credito Snov.io (~`$0.004)" -ForegroundColor Yellow
            $conf = Read-Host "   Confirma? (s/n)"
            if ($conf.Trim().ToLower() -eq "s") {
                $body = @{
                    lead_id        = $leadId
                    novo_email     = $novoEmail.Trim()
                    criado_por     = $criadoPor
                    validar_snovio = $true
                }
                Invoke-Recovery -Method "POST" -Action "manual_revalidate" -Body $body
            }
            else {
                Write-Host "   Cancelado." -ForegroundColor DarkGray
            }
        }
        "5" {
            Write-Host "`nEncerrando." -ForegroundColor DarkGray
            break
        }
        default {
            Write-Host "`n   Opcao invalida. Use 1-5." -ForegroundColor Red
        }
    }

    # Sair do while quando o usuario escolher "5"
    if ($opcao.Trim() -eq "5") { break }
}
