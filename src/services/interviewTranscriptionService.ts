/**
 * Interview Transcription Service
 * Gerencia upload, transcrição e sumarização de entrevistas com IA
 */

import { summarizeInterview } from './geminiService';
import { 
    atualizarTranscricao, 
    atualizarSumarioIA, 
    buscarEntrevistaPorId 
} from './interviewService';
import type { InterviewSummary } from './interviewService';

// ============================================
// INTERFACES
// ============================================

export interface TranscricaoResult {
    success: boolean;
    transcricao?: string;
    error?: string;
}

export interface SumarizacaoResult {
    success: boolean;
    sumario?: InterviewSummary;
    error?: string;
}

// ============================================
// FUNÇÕES PRINCIPAIS
// ============================================

/**
 * Processar transcrição manual
 * Recebe o texto da transcrição colado pelo analista
 */
export async function processarTranscricaoManual(
    entrevista_id: number,
    transcricao_texto: string
): Promise<TranscricaoResult> {
    try {
        if (!transcricao_texto || transcricao_texto.trim().length < 50) {
            return {
                success: false,
                error: 'Transcrição muito curta. Mínimo de 50 caracteres.'
            };
        }

        const entrevistaAtualizada = await atualizarTranscricao(
            entrevista_id,
            transcricao_texto.trim(),
            'manual'
        );

        if (!entrevistaAtualizada) {
            return {
                success: false,
                error: 'Erro ao salvar transcrição no banco de dados.'
            };
        }

        return {
            success: true,
            transcricao: transcricao_texto.trim()
        };
    } catch (error) {
        console.error('Erro ao processar transcrição manual:', error);
        return {
            success: false,
            error: 'Erro inesperado ao processar transcrição.'
        };
    }
}

/**
 * Sumarizar entrevista usando Gemini
 * Requer que a entrevista já tenha transcrição
 */
export async function sumarizarEntrevista(
    entrevista_id: number,
    descricao_vaga: string
): Promise<SumarizacaoResult> {
    try {
        // 1. Buscar entrevista
        const entrevista = await buscarEntrevistaPorId(entrevista_id);

        if (!entrevista) {
            return {
                success: false,
                error: 'Entrevista não encontrada.'
            };
        }

        // 2. Validar transcrição
        if (!entrevista.transcricao_texto || entrevista.transcricao_texto.trim().length < 50) {
            return {
                success: false,
                error: 'Entrevista não possui transcrição válida. Adicione a transcrição primeiro.'
            };
        }

        // 3. Chamar Gemini para sumarizar
        const sumario = await summarizeInterview(
            entrevista.transcricao_texto,
            descricao_vaga
        );

        if (!sumario) {
            return {
                success: false,
                error: 'Erro ao gerar sumarização com IA.'
            };
        }

        // 4. Salvar sumário no banco
        const entrevistaAtualizada = await atualizarSumarioIA(entrevista_id, sumario);

        if (!entrevistaAtualizada) {
            return {
                success: false,
                error: 'Erro ao salvar sumarização no banco de dados.'
            };
        }

        return {
            success: true,
            sumario
        };
    } catch (error) {
        console.error('Erro ao sumarizar entrevista:', error);
        return {
            success: false,
            error: 'Erro inesperado ao sumarizar entrevista.'
        };
    }
}

/**
 * Processar entrevista completa (transcrição + sumarização)
 * Fluxo completo em uma única chamada
 */
export async function processarEntrevistaCompleta(
    entrevista_id: number,
    transcricao_texto: string,
    descricao_vaga: string
): Promise<{
    success: boolean;
    transcricao?: string;
    sumario?: InterviewSummary;
    error?: string;
}> {
    try {
        // Passo 1: Processar transcrição
        const resultTranscricao = await processarTranscricaoManual(
            entrevista_id,
            transcricao_texto
        );

        if (!resultTranscricao.success) {
            return {
                success: false,
                error: resultTranscricao.error
            };
        }

        // Passo 2: Sumarizar
        const resultSumarizacao = await sumarizarEntrevista(
            entrevista_id,
            descricao_vaga
        );

        if (!resultSumarizacao.success) {
            return {
                success: false,
                transcricao: resultTranscricao.transcricao,
                error: resultSumarizacao.error
            };
        }

        return {
            success: true,
            transcricao: resultTranscricao.transcricao,
            sumario: resultSumarizacao.sumario
        };
    } catch (error) {
        console.error('Erro ao processar entrevista completa:', error);
        return {
            success: false,
            error: 'Erro inesperado ao processar entrevista.'
        };
    }
}

/**
 * Validar formato de transcrição
 * Verifica se a transcrição tem um formato mínimo aceitável
 */
export function validarTranscricao(transcricao: string): {
    valida: boolean;
    problemas: string[];
} {
    const problemas: string[] = [];

    if (!transcricao || transcricao.trim().length === 0) {
        problemas.push('Transcrição vazia');
        return { valida: false, problemas };
    }

    const tamanho = transcricao.trim().length;
    if (tamanho < 50) {
        problemas.push('Transcrição muito curta (mínimo 50 caracteres)');
    }

    if (tamanho > 50000) {
        problemas.push('Transcrição muito longa (máximo 50.000 caracteres). Considere resumir.');
    }

    // Verificar se tem pelo menos 2 linhas (diálogo mínimo)
    const linhas = transcricao.split('\n').filter(l => l.trim().length > 0);
    if (linhas.length < 2) {
        problemas.push('Transcrição deve ter pelo menos 2 linhas de diálogo');
    }

    return {
        valida: problemas.length === 0,
        problemas
    };
}

/**
 * Extrair estatísticas da transcrição
 * Útil para exibir informações ao usuário
 */
export function extrairEstatisticasTranscricao(transcricao: string): {
    total_caracteres: number;
    total_palavras: number;
    total_linhas: number;
    tempo_leitura_minutos: number;
} {
    const caracteres = transcricao.length;
    const palavras = transcricao.split(/\s+/).filter(p => p.length > 0).length;
    const linhas = transcricao.split('\n').filter(l => l.trim().length > 0).length;
    const tempoLeitura = Math.ceil(palavras / 200); // 200 palavras por minuto

    return {
        total_caracteres: caracteres,
        total_palavras: palavras,
        total_linhas: linhas,
        tempo_leitura_minutos: tempoLeitura
    };
}

/**
 * Formatar transcrição para melhor legibilidade
 * Remove espaços extras, corrige quebras de linha, etc.
 */
export function formatarTranscricao(transcricao: string): string {
    return transcricao
        .trim()
        .replace(/\n{3,}/g, '\n\n') // Remove múltiplas quebras de linha
        .replace(/  +/g, ' ') // Remove múltiplos espaços
        .split('\n')
        .map(linha => linha.trim())
        .join('\n');
}

/**
 * Detectar idioma da transcrição (simples)
 * Retorna 'pt-BR' ou 'en' baseado em palavras comuns
 */
export function detectarIdioma(transcricao: string): 'pt-BR' | 'en' | 'outro' {
    const palavrasPortugues = ['o', 'a', 'de', 'da', 'do', 'em', 'para', 'com', 'que', 'é'];
    const palavrasIngles = ['the', 'is', 'and', 'to', 'of', 'in', 'for', 'with', 'that'];

    const palavras = transcricao.toLowerCase().split(/\s+/);
    
    let countPt = 0;
    let countEn = 0;

    palavras.forEach(palavra => {
        if (palavrasPortugues.includes(palavra)) countPt++;
        if (palavrasIngles.includes(palavra)) countEn++;
    });

    if (countPt > countEn && countPt > 5) return 'pt-BR';
    if (countEn > countPt && countEn > 5) return 'en';
    return 'outro';
}
