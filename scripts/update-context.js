/**
 * scripts/update-context.js
 *
 * Atualiza automaticamente o CONTEXT.md com métricas reais do projeto:
 * - Contagem de arquivos por módulo
 * - Últimas modificações
 * - Data de atualização
 *
 * Uso manual:    node scripts/update-context.js
 * Agendamento:   GitHub Actions (diário às 03:00 BRT)
 */

import fs   from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const ROOT         = path.resolve(__dirname, '..');
const CONTEXT_FILE = path.join(ROOT, 'CONTEXT.md');

// ─── Helpers ─────────────────────────────────────────────────────────

function contarArquivos(dir, extensoes = ['.ts', '.tsx', '.js', '.jsx']) {
    if (!fs.existsSync(dir)) return 0;
    let count = 0;
    try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
            if (entry.name === 'node_modules') continue;
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                count += contarArquivos(fullPath, extensoes);
            } else if (extensoes.some(ext => entry.name.endsWith(ext))) {
                count++;
            }
        }
    } catch { /* pasta não acessível */ }
    return count;
}

function ultimaModificacao(dir) {
    if (!fs.existsSync(dir)) return 'N/A';
    let latest = 0;
    try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
            if (entry.name === 'node_modules') continue;
            const fullPath = path.join(dir, entry.name);
            try {
                const stat = fs.statSync(fullPath);
                if (entry.isDirectory()) {
                    const subLatest = ultimaModificacaoTimestamp(fullPath);
                    if (subLatest > latest) latest = subLatest;
                } else if (stat.mtimeMs > latest) {
                    latest = stat.mtimeMs;
                }
            } catch { /* skip */ }
        }
    } catch { /* skip */ }
    if (!latest) return 'N/A';
    return new Date(latest).toLocaleDateString('pt-BR');
}

function ultimaModificacaoTimestamp(dir) {
    if (!fs.existsSync(dir)) return 0;
    let latest = 0;
    try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
            if (entry.name === 'node_modules') continue;
            const fullPath = path.join(dir, entry.name);
            try {
                const stat = fs.statSync(fullPath);
                if (entry.isFile() && stat.mtimeMs > latest) latest = stat.mtimeMs;
                if (entry.isDirectory()) {
                    const sub = ultimaModificacaoTimestamp(fullPath);
                    if (sub > latest) latest = sub;
                }
            } catch { /* skip */ }
        }
    } catch { /* skip */ }
    return latest;
}

function tamanhoDir(dir) {
    if (!fs.existsSync(dir)) return '0 KB';
    let total = 0;
    try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
            if (entry.name === 'node_modules') continue;
            const fullPath = path.join(dir, entry.name);
            try {
                if (entry.isFile()) total += fs.statSync(fullPath).size;
                if (entry.isDirectory()) total += parseInt(tamanhoDir(fullPath));
            } catch { /* skip */ }
        }
    } catch { /* skip */ }
    if (total < 1024) return `${total} B`;
    if (total < 1024 * 1024) return `${(total / 1024).toFixed(1)} KB`;
    return `${(total / 1024 / 1024).toFixed(2)} MB`;
}

// ─── Coletar métricas ────────────────────────────────────────────────

function coletarMetricas() {
    const agora = new Date();
    const dataFormatada = agora.toLocaleDateString('pt-BR', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
    });

    const modulos = [
        { nome: 'api (serverless)',        dir: 'api' },
        { nome: 'src/components',          dir: 'src/components' },
        { nome: 'src/pages',               dir: 'src/pages' },
        { nome: 'src/contexts',            dir: 'src/contexts' },
        { nome: 'src/types',               dir: 'src/types' },
        { nome: 'database',                dir: 'database' },
        { nome: 'scripts',                 dir: 'scripts' },
    ];

    const linhasModulos = modulos.map(m => {
        const dir      = path.join(ROOT, m.dir);
        const arquivos = contarArquivos(dir);
        const ultima   = ultimaModificacao(dir);
        const tamanho  = tamanhoDir(dir);
        return `| \`${m.dir}/\` | ${arquivos} arquivos | ${tamanho} | ${ultima} |`;
    }).join('\n');

    // Arquivos API listados individualmente
    const apiDir = path.join(ROOT, 'api');
    let arquivosApi = '';
    if (fs.existsSync(apiDir)) {
        const files = fs.readdirSync(apiDir)
            .filter(f => f.endsWith('.ts') || f.endsWith('.js'))
            .sort();
        arquivosApi = files.map(f => `- \`api/${f}\``).join('\n');
    }

    return { dataFormatada, linhasModulos, arquivosApi };
}

// ─── Atualizar apenas o cabeçalho e seção de métricas ───────────────

function atualizarContext() {
    if (!fs.existsSync(CONTEXT_FILE)) {
        console.error('❌ CONTEXT.md não encontrado em:', CONTEXT_FILE);
        process.exit(1);
    }

    let conteudo = fs.readFileSync(CONTEXT_FILE, 'utf-8');
    const { dataFormatada, linhasModulos, arquivosApi } = coletarMetricas();

    // 1. Atualizar data no cabeçalho
    conteudo = conteudo.replace(
        /> Última atualização.*$/m,
        `> Última atualização automática: ${dataFormatada}`
    );

    // 2. Atualizar ou inserir seção de métricas antes do rodapé
    const secaoMetricas = `
---

## 10. Métricas do Repositório
> Gerado automaticamente pelo script update-context.js

| Módulo | Arquivos | Tamanho | Última modificação |
|---|---|---|---|
${linhasModulos}

### Endpoints API ativos
${arquivosApi || '_(nenhum arquivo encontrado)_'}

---
`;

    // Remove seção existente se houver e adiciona ao final
    conteudo = conteudo.replace(/\n---\n\n## 10\. Métricas[\s\S]*$/, '');
    conteudo = conteudo.trimEnd() + secaoMetricas;

    fs.writeFileSync(CONTEXT_FILE, conteudo, 'utf-8');
    console.log(`✅ CONTEXT.md atualizado em: ${dataFormatada}`);
}

// ─── Executar ────────────────────────────────────────────────────────
atualizarContext();
