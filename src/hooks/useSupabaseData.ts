// ✅ FUNÇÃO CORRIGIDA - processReportAnalysis
// Chama API Backend em vez de Gemini direto

const processReportAnalysis = async (text: string, gestorName?: string): Promise<AIAnalysisResult[]> => {
  try {
    console.log('🤖 Processando análise de relatório com IA Gemini...');
    console.log('📝 Tamanho do texto:', text.length, 'caracteres');
    console.log('📋 Primeiros 100 caracteres:', text.substring(0, 100));
    
    // ✅ CORRETO: Chamar API Backend (que tem acesso a process.env.API_KEY)
    console.log('📡 Enviando requisição para API Backend...');
    
    const response = await fetch('/api/analyze-activity-report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reportText: text, gestorName })
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`Erro na API: ${response.status} - ${errorData.message || response.statusText}`);
    }
    
    const data = await response.json();
    console.log('✅ Resposta recebida da API Backend');
    console.log('📊 Resultados:', data.results ? data.results.length : 0, 'consultores');
    
    // Retornar os resultados da análise
    return data.results || [];
    
  } catch (err: any) {
    console.error('❌ Erro ao processar análise com IA:', err);
    alert(`Erro ao processar relatório com IA: ${err.message}`);
    return [];
  }
};
