/**
 * TESTE: Validar uso correto da API GoogleGenAI
 */

import { GoogleGenAI } from '@google/genai';

const apiKey = process.env.GEMINI_API_KEY || 'test-key';
const genAI = new GoogleGenAI({ apiKey });

console.log('✅ GoogleGenAI instanciado com sucesso');
console.log('📦 Propriedades disponíveis:', Object.keys(genAI));
console.log('🔧 Métodos em genAI.models:', Object.getOwnPropertyNames(Object.getPrototypeOf(genAI.models)));

// Testar estrutura da chamada
async function testAPI() {
  try {
    console.log('\n🧪 Testando chamada à API...');
    
    const result = await genAI.models.generateContent({
      model: 'gemini-2.0-flash-exp',
      contents: 'Diga apenas "OK" se você está funcionando.'
    });
    
    console.log('✅ Chamada bem-sucedida!');
    console.log('📝 Tipo de result:', typeof result);
    console.log('📝 Propriedades de result:', Object.keys(result));
    console.log('📝 Resposta:', result.text || result);
    
  } catch (error) {
    console.error('❌ Erro na chamada:', error.message);
  }
}

// Só testar se tiver API key válida
if (apiKey !== 'test-key') {
  testAPI();
} else {
  console.log('\n⚠️ GEMINI_API_KEY não configurada, pulando teste de chamada');
  console.log('💡 Para testar: export GEMINI_API_KEY=sua_chave && node test-gemini-api.js');
}
