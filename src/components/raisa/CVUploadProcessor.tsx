/**
 * CVUploadProcessor.tsx - Processador de CVs com IA
 * 
 * Funcionalidades:
 * - Upload de CV (PDF, DOCX, TXT)
 * - Extração de texto
 * - Processamento com Gemini IA para extrair:
 *   - Skills e competências
 *   - Experiências profissionais
 *   - Formação acadêmica
 *   - Idiomas
 *   - Título profissional sugerido
 *   - Senioridade detectada
 * 
 * Versão: 1.0
 * Data: 26/12/2024
 */

import React, { useState, useRef } from 'react';
import { supabase } from '@/config/supabase';

interface CVUploadProcessorProps {
  pessoaId: number;
  pessoaNome: string;
  onProcessamentoCompleto: (resultado: ProcessamentoResult) => void;
  onClose: () => void;
}

interface ProcessamentoResult {
  sucesso: boolean;
  skills: SkillExtraida[];
  experiencias: ExperienciaExtraida[];
  formacao: FormacaoExtraida[];
  idiomas: IdiomaExtraido[];
  titulo_sugerido: string;
  senioridade_detectada: string;
  resumo: string;
  erro?: string;
}

interface SkillExtraida {
  nome: string;
  categoria: string;
  nivel: string;
  anos_experiencia: number;
}

interface ExperienciaExtraida {
  empresa: string;
  cargo: string;
  data_inicio: string;
  data_fim: string | null;
  atual: boolean;
  descricao: string;
  tecnologias: string[];
}

interface FormacaoExtraida {
  tipo: string;
  curso: string;
  instituicao: string;
  ano_conclusao: number | null;
  em_andamento: boolean;
}

interface IdiomaExtraido {
  idioma: string;
  nivel: string;
}

const CVUploadProcessor: React.FC<CVUploadProcessorProps> = ({
  pessoaId,
  pessoaNome,
  onProcessamentoCompleto,
  onClose
}) => {
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [textoCV, setTextoCV] = useState<string>('');
  const [etapa, setEtapa] = useState<'upload' | 'preview' | 'processando' | 'resultado'>('upload');
  const [resultado, setResultado] = useState<ProcessamentoResult | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [progresso, setProgresso] = useState<number>(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Aceitar PDF, DOCX e TXT
  const tiposAceitos = '.pdf,.docx,.doc,.txt';

  // Handler de upload de arquivo
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setArquivo(file);
    setErro(null);

    // Verificar tipo de arquivo
    const extensao = file.name.split('.').pop()?.toLowerCase();
    if (!['pdf', 'docx', 'doc', 'txt'].includes(extensao || '')) {
      setErro('Tipo de arquivo não suportado. Use PDF, DOCX ou TXT.');
      return;
    }

    // Verificar tamanho (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      setErro('Arquivo muito grande. Máximo 10MB.');
      return;
    }

    // Para TXT, extrair texto diretamente
    if (extensao === 'txt') {
      const texto = await file.text();
      setTextoCV(texto);
      setEtapa('preview');
      return;
    }

    // Para PDF e DOCX, precisamos enviar para processamento
    setEtapa('preview');
    await extrairTextoDoArquivo(file);
  };

  // Extrair texto do arquivo (PDF/DOCX)
  const extrairTextoDoArquivo = async (file: File) => {
    try {
      setProgresso(10);
      
      // Converter arquivo para base64
      const base64 = await fileToBase64(file);
      
      setProgresso(30);

      // Chamar API para extração de texto
      const response = await fetch('/api/gemini-cv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'extrair_texto',
          arquivo_base64: base64,
          arquivo_nome: file.name,
          arquivo_tipo: file.type
        })
      });

      if (!response.ok) {
        throw new Error('Erro ao extrair texto do arquivo');
      }

      const data = await response.json();
      setTextoCV(data.texto || '');
      setProgresso(50);
    } catch (err: any) {
      console.error('Erro na extração:', err);
      setErro('Erro ao extrair texto do CV. Tente colar o texto manualmente.');
      // Permitir entrada manual
      setTextoCV('');
    }
  };

  // Converter arquivo para base64
  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const result = reader.result as string;
        // Remover o prefixo data:...;base64,
        const base64 = result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = error => reject(error);
    });
  };

  // Processar CV com IA
  const processarComIA = async () => {
    if (!textoCV.trim()) {
      setErro('O texto do CV está vazio. Por favor, faça upload ou cole o conteúdo.');
      return;
    }

    try {
      setEtapa('processando');
      setProgresso(60);
      setErro(null);

      // Chamar API de processamento com Gemini
      const response = await fetch('/api/gemini-cv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'processar_cv',
          texto_cv: textoCV,
          pessoa_id: pessoaId,
          pessoa_nome: pessoaNome
        })
      });

      setProgresso(80);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Erro ao processar CV');
      }

      const data = await response.json();
      
      setProgresso(90);

      // Salvar dados extraídos no Supabase
      await salvarDadosExtraidos(data);

      setProgresso(100);
      setResultado(data);
      setEtapa('resultado');

    } catch (err: any) {
      console.error('Erro no processamento:', err);
      setErro(err.message || 'Erro ao processar CV com IA');
      setEtapa('preview');
    }
  };

  // Salvar dados extraídos no Supabase
  const salvarDadosExtraidos = async (dados: ProcessamentoResult) => {
    try {
      // 1. Atualizar pessoa com campos básicos
      await supabase
        .from('pessoas')
        .update({
          titulo_profissional: dados.titulo_sugerido,
          senioridade: dados.senioridade_detectada,
          cv_texto_completo: textoCV,
          cv_resumo: dados.resumo,
          cv_processado: true,
          cv_processado_em: new Date().toISOString(),
          cv_processado_por: 'Gemini'
        })
        .eq('id', pessoaId);

      // 2. Inserir skills
      if (dados.skills && dados.skills.length > 0) {
        const skillsData = dados.skills.map((s, index) => ({
          pessoa_id: pessoaId,
          skill_nome: s.nome,
          skill_categoria: s.categoria,
          nivel: s.nivel,
          anos_experiencia: s.anos_experiencia || 0,
          ordem: index
        }));

        // Deletar skills anteriores
        await supabase
          .from('pessoa_skills')
          .delete()
          .eq('pessoa_id', pessoaId);

        // Inserir novas skills
        await supabase
          .from('pessoa_skills')
          .insert(skillsData);
      }

      // 3. Inserir experiências
      if (dados.experiencias && dados.experiencias.length > 0) {
        const expData = dados.experiencias.map((e, index) => ({
          pessoa_id: pessoaId,
          empresa: e.empresa,
          cargo: e.cargo,
          data_inicio: e.data_inicio || null,
          data_fim: e.data_fim || null,
          atual: e.atual || false,
          descricao: e.descricao,
          tecnologias_usadas: e.tecnologias || [],
          motivo_saida: e.motivo_saida || null,
          ordem: index
        }));

        // Deletar experiências anteriores
        await supabase
          .from('pessoa_experiencias')
          .delete()
          .eq('pessoa_id', pessoaId);

        // Inserir novas experiências
        await supabase
          .from('pessoa_experiencias')
          .insert(expData);
      }

      // 4. Inserir formação
      if (dados.formacao && dados.formacao.length > 0) {
        const formData = dados.formacao.map(f => ({
          pessoa_id: pessoaId,
          tipo: f.tipo,
          curso: f.curso,
          instituicao: f.instituicao,
          ano_conclusao: f.ano_conclusao,
          em_andamento: f.em_andamento || false
        }));

        // Deletar formação anterior
        await supabase
          .from('pessoa_formacao')
          .delete()
          .eq('pessoa_id', pessoaId);

        // Inserir nova formação
        await supabase
          .from('pessoa_formacao')
          .insert(formData);
      }

      // 5. Inserir idiomas
      if (dados.idiomas && dados.idiomas.length > 0) {
        const idiomasData = dados.idiomas.map(i => ({
          pessoa_id: pessoaId,
          idioma: i.idioma,
          nivel: i.nivel
        }));

        // Deletar idiomas anteriores
        await supabase
          .from('pessoa_idiomas')
          .delete()
          .eq('pessoa_id', pessoaId);

        // Inserir novos idiomas
        await supabase
          .from('pessoa_idiomas')
          .insert(idiomasData);
      }

      // 6. Registrar log
      await supabase
        .from('pessoa_cv_log')
        .insert({
          pessoa_id: pessoaId,
          acao: 'processamento',
          status: 'sucesso',
          detalhes: {
            skills_extraidas: dados.skills?.length || 0,
            experiencias_extraidas: dados.experiencias?.length || 0,
            formacao_extraida: dados.formacao?.length || 0,
            idiomas_extraidos: dados.idiomas?.length || 0
          }
        });

      console.log('✅ Dados do CV salvos com sucesso');

    } catch (err: any) {
      console.error('Erro ao salvar dados:', err);
      // Log de erro
      await supabase
        .from('pessoa_cv_log')
        .insert({
          pessoa_id: pessoaId,
          acao: 'processamento',
          status: 'erro',
          erro_mensagem: err.message
        });
    }
  };

  // Finalizar e fechar
  const handleFinalizar = () => {
    if (resultado) {
      onProcessamentoCompleto(resultado);
    }
    onClose();
  };

  // Renderização condicional por etapa
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        
        {/* Header */}
        <div className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white p-6">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-2xl font-bold flex items-center gap-2">
                🤖 Processador de CV com IA
              </h2>
              <p className="text-indigo-200 mt-1">
                {pessoaNome}
              </p>
            </div>
            <button 
              onClick={onClose}
              className="text-white hover:text-gray-200 text-3xl leading-none"
            >
              &times;
            </button>
          </div>
          
          {/* Progress bar */}
          {(etapa === 'processando' || progresso > 0) && (
            <div className="mt-4">
              <div className="flex justify-between text-xs text-indigo-200 mb-1">
                <span>Processando...</span>
                <span>{progresso}%</span>
              </div>
              <div className="w-full bg-indigo-400 rounded-full h-2">
                <div 
                  className="bg-white rounded-full h-2 transition-all duration-300"
                  style={{ width: `${progresso}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          
          {/* Etapa 1: Upload */}
          {etapa === 'upload' && (
            <div className="text-center">
              <div 
                className="border-2 border-dashed border-gray-300 rounded-xl p-12 hover:border-indigo-500 transition-colors cursor-pointer"
                onClick={() => fileInputRef.current?.click()}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={tiposAceitos}
                  onChange={handleFileChange}
                  className="hidden"
                />
                <div className="text-6xl mb-4">📄</div>
                <p className="text-xl font-medium text-gray-700 mb-2">
                  Arraste o CV ou clique para selecionar
                </p>
                <p className="text-sm text-gray-500">
                  Formatos aceitos: PDF, DOCX, TXT (máx. 10MB)
                </p>
              </div>

              <div className="mt-6">
                <p className="text-gray-500 mb-2">Ou cole o texto do CV abaixo:</p>
                <textarea
                  value={textoCV}
                  onChange={e => setTextoCV(e.target.value)}
                  className="w-full h-40 border rounded-lg p-4 focus:ring-2 focus:ring-indigo-500"
                  placeholder="Cole aqui o conteúdo do currículo..."
                />
                {textoCV.trim() && (
                  <button
                    onClick={() => setEtapa('preview')}
                    className="mt-4 bg-indigo-600 text-white px-6 py-2 rounded-lg hover:bg-indigo-700"
                  >
                    Continuar →
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Etapa 2: Preview do texto */}
          {etapa === 'preview' && (
            <div>
              <div className="flex items-center gap-2 mb-4">
                {arquivo && (
                  <span className="bg-gray-100 px-3 py-1 rounded text-sm">
                    📎 {arquivo.name}
                  </span>
                )}
                <span className="text-gray-500 text-sm">
                  {textoCV.length} caracteres
                </span>
              </div>

              <div className="border rounded-lg p-4 bg-gray-50 max-h-80 overflow-y-auto">
                <pre className="whitespace-pre-wrap text-sm text-gray-700 font-mono">
                  {textoCV || 'Nenhum texto extraído. Cole o conteúdo manualmente.'}
                </pre>
              </div>

              <div className="mt-4">
                <textarea
                  value={textoCV}
                  onChange={e => setTextoCV(e.target.value)}
                  className="w-full h-32 border rounded-lg p-4 focus:ring-2 focus:ring-indigo-500 text-sm"
                  placeholder="Edite ou complete o texto se necessário..."
                />
              </div>

              {erro && (
                <div className="mt-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
                  {erro}
                </div>
              )}
            </div>
          )}

          {/* Etapa 3: Processando */}
          {etapa === 'processando' && (
            <div className="text-center py-12">
              <div className="inline-block animate-spin rounded-full h-16 w-16 border-b-2 border-indigo-600 mb-4"></div>
              <p className="text-xl font-medium text-gray-700">Analisando currículo com IA...</p>
              <p className="text-gray-500 mt-2">
                Extraindo skills, experiências e competências
              </p>
            </div>
          )}

          {/* Etapa 4: Resultado */}
          {etapa === 'resultado' && resultado && (
            <div className="space-y-6">
              {/* Resumo */}
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <h3 className="font-bold text-green-800 mb-2">✅ Processamento Concluído!</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                  <div>
                    <div className="text-2xl font-bold text-green-700">{resultado.skills?.length || 0}</div>
                    <div className="text-xs text-green-600">Skills</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-green-700">{resultado.experiencias?.length || 0}</div>
                    <div className="text-xs text-green-600">Experiências</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-green-700">{resultado.formacao?.length || 0}</div>
                    <div className="text-xs text-green-600">Formações</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-green-700">{resultado.idiomas?.length || 0}</div>
                    <div className="text-xs text-green-600">Idiomas</div>
                  </div>
                </div>
              </div>

              {/* Título e Senioridade sugeridos */}
              <div className="bg-indigo-50 rounded-lg p-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <span className="text-xs font-medium text-indigo-600">Título Profissional Sugerido:</span>
                    <p className="font-bold text-indigo-900">{resultado.titulo_sugerido}</p>
                  </div>
                  <div>
                    <span className="text-xs font-medium text-indigo-600">Senioridade Detectada:</span>
                    <p className="font-bold text-indigo-900 capitalize">{resultado.senioridade_detectada}</p>
                  </div>
                </div>
              </div>

              {/* Skills */}
              {resultado.skills && resultado.skills.length > 0 && (
                <div>
                  <h4 className="font-bold text-gray-800 mb-2">🎯 Skills Extraídas</h4>
                  <div className="flex flex-wrap gap-2">
                    {resultado.skills.map((skill, i) => (
                      <span 
                        key={i} 
                        className={`px-3 py-1 rounded-full text-sm ${
                          skill.categoria === 'linguagem' ? 'bg-blue-100 text-blue-800' :
                          skill.categoria === 'framework' ? 'bg-purple-100 text-purple-800' :
                          skill.categoria === 'banco' ? 'bg-green-100 text-green-800' :
                          skill.categoria === 'cloud' ? 'bg-orange-100 text-orange-800' :
                          'bg-gray-100 text-gray-800'
                        }`}
                      >
                        {skill.nome}
                        {skill.anos_experiencia > 0 && (
                          <span className="ml-1 text-xs opacity-70">({skill.anos_experiencia}a)</span>
                        )}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Experiências */}
              {resultado.experiencias && resultado.experiencias.length > 0 && (
                <div>
                  <h4 className="font-bold text-gray-800 mb-2">💼 Experiências</h4>
                  <div className="space-y-2">
                    {resultado.experiencias.slice(0, 3).map((exp, i) => (
                      <div key={i} className="bg-gray-50 rounded p-3">
                        <div className="font-medium">{exp.cargo}</div>
                        <div className="text-sm text-gray-600">{exp.empresa}</div>
                        {exp.atual && (
                          <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">Atual</span>
                        )}
                      </div>
                    ))}
                    {resultado.experiencias.length > 3 && (
                      <p className="text-sm text-gray-500">
                        + {resultado.experiencias.length - 3} outras experiências
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Resumo */}
              {resultado.resumo && (
                <div>
                  <h4 className="font-bold text-gray-800 mb-2">📝 Resumo</h4>
                  <p className="text-gray-600 text-sm bg-gray-50 rounded p-3">
                    {resultado.resumo}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t bg-gray-50 px-6 py-4 flex justify-between items-center">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-600 hover:text-gray-800"
          >
            Cancelar
          </button>
          
          <div className="flex gap-3">
            {etapa === 'preview' && (
              <>
                <button
                  onClick={() => setEtapa('upload')}
                  className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-100"
                >
                  ← Voltar
                </button>
                <button
                  onClick={processarComIA}
                  disabled={!textoCV.trim()}
                  className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  🤖 Processar com IA
                </button>
              </>
            )}
            
            {etapa === 'resultado' && (
              <button
                onClick={handleFinalizar}
                className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
              >
                ✅ Finalizar
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default CVUploadProcessor;
