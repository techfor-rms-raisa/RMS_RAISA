/**
 * ============================================
 * SCRIPT DE MIGRAÇÃO AUTOMÁTICA DE IMPORTS
 * ============================================
 * Este script substitui automaticamente todos os imports
 * de types antigos para a nova estrutura @/types
 * ============================================
 */

const fs = require('fs');
const path = require('path');

// Contador de mudanças
let filesChanged = 0;
let totalReplacements = 0;

// Padrões de imports antigos que vamos substituir
const importPatterns = [
  // Imports relativos de types
  { old: /from ['"]\.\.\/types['"]/g, new: `from '@/types'` },
  { old: /from ['"]\.\.\/\.\.\/types['"]/g, new: `from '@/types'` },
  { old: /from ['"]\.\.\/\.\.\/\.\.\/types['"]/g, new: `from '@/types'` },
  { old: /from ['"]\.\/types['"]/g, new: `from '@/types'` },
  
  // Imports de components/types
  { old: /from ['"]\.\.\/components\/types['"]/g, new: `from '@/types'` },
  { old: /from ['"]\.\.\/\.\.\/components\/types['"]/g, new: `from '@/types'` },
  { old: /from ['"]\.\/components\/types['"]/g, new: `from '@/types'` },
  
  // Import type específico
  { old: /import type \{([^}]+)\} from ['"]\.\.\/types['"]/g, new: `import type {$1} from '@/types'` },
  { old: /import type \{([^}]+)\} from ['"]\.\.\/\.\.\/types['"]/g, new: `import type {$1} from '@/types'` },
  { old: /import type \{([^}]+)\} from ['"]\.\.\/components\/types['"]/g, new: `import type {$1} from '@/types'` },
];

/**
 * Processa um arquivo e substitui os imports
 */
function processFile(filePath) {
  try {
    let content = fs.readFileSync(filePath, 'utf8');
    let modified = false;
    let replacementsInFile = 0;

    // Aplica cada padrão de substituição
    importPatterns.forEach(pattern => {
      const beforeReplace = content;
      content = content.replace(pattern.old, pattern.new);
      
      if (beforeReplace !== content) {
        modified = true;
        // Conta quantas substituições foram feitas
        const matches = beforeReplace.match(pattern.old);
        if (matches) {
          replacementsInFile += matches.length;
        }
      }
    });

    // Se houve mudanças, salva o arquivo
    if (modified) {
      fs.writeFileSync(filePath, content, 'utf8');
      filesChanged++;
      totalReplacements += replacementsInFile;
      console.log(`✅ ${path.basename(filePath)} - ${replacementsInFile} imports corrigidos`);
    }
  } catch (error) {
    console.error(`❌ Erro ao processar ${filePath}:`, error.message);
  }
}

/**
 * Procura recursivamente por arquivos .ts e .tsx
 */
function findTypeScriptFiles(dir, fileList = []) {
  const files = fs.readdirSync(dir);

  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);

    if (stat.isDirectory()) {
      // Ignora node_modules e dist
      if (file !== 'node_modules' && file !== 'dist' && file !== '.git') {
        findTypeScriptFiles(filePath, fileList);
      }
    } else if (file.endsWith('.ts') || file.endsWith('.tsx')) {
      // Ignora o próprio script de migração
      if (!file.includes('migrate-imports')) {
        fileList.push(filePath);
      }
    }
  });

  return fileList;
}

/**
 * Função principal
 */
function main() {
  console.log('🚀 INICIANDO MIGRAÇÃO DE IMPORTS...\n');
  
  const srcDir = path.join(__dirname, 'src');
  
  if (!fs.existsSync(srcDir)) {
    console.error('❌ Pasta src/ não encontrada!');
    process.exit(1);
  }

  // Encontra todos os arquivos TypeScript
  const files = findTypeScriptFiles(srcDir);
  console.log(`📁 ${files.length} arquivos TypeScript encontrados\n`);

  // Processa cada arquivo
  files.forEach(processFile);

  // Resumo final
  console.log('\n' + '='.repeat(50));
  console.log('✅ MIGRAÇÃO CONCLUÍDA!');
  console.log('='.repeat(50));
  console.log(`📊 Arquivos modificados: ${filesChanged}`);
  console.log(`🔄 Total de imports corrigidos: ${totalReplacements}`);
  console.log('='.repeat(50));
  
  if (filesChanged === 0) {
    console.log('\n⚠️  Nenhum arquivo foi modificado. Possíveis razões:');
    console.log('   - Imports já estão corretos');
    console.log('   - Padrões de import diferentes do esperado');
  } else {
    console.log('\n✅ Execute agora:');
    console.log('   npm run build');
    console.log('\n   Para verificar se não há erros de compilação.');
  }
}

// Executa o script
main();