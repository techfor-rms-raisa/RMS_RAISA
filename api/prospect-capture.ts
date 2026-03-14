/**
 * api/prospect-capture.ts
 *
 * Recebe leads capturados pela Prospect Extension (Chrome)
 * a partir de páginas de resultados do Google Search.
 *
 * Os leads chegam com: nome, cargo, empresa, linkedin_url, localização.
 * Este endpoint normaliza, valida e devolve para o frontend do
 * Prospect Engine exibir na lista de seleção — sem salvar ainda.
 * O analista seleciona quais enriquecer e salvar.
 *
 * Versão: 1.0
 * Data: 14/03/2026
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';

// ─── Timeout: operação leve, sem IA ───────────────────────────────────
export const config = {
  maxDuration: 10,
};

// ─── Tipo de lead recebido pela Extension ─────────────────────────────
interface LeadCapturado {
  nome_completo:  string;
  primeiro_nome:  string;
  ultimo_nome:    string;
  cargo:          string;
  empresa_nome:   string;
  linkedin_url:   string;
  localizacao:    string | null;
  fonte:          string;
  capturado_em:   string;
}

// ─── Tipo normalizado para o Prospect Engine ──────────────────────────
interface ProspectNormalizado {
  gemini_id:        string;
  nome_completo:    string;
  primeiro_nome:    string;
  ultimo_nome:      string;
  cargo:            string;
  nivel:            string;
  departamento:     string;
  linkedin_url:     string | null;
  email:            null;
  email_status:     null;
  foto_url:         null;
  empresa_nome:     string;
  empresa_dominio:  string;
  empresa_setor:    null;
  empresa_porte:    null;
  empresa_linkedin: null;
  empresa_website:  null;
  cidade:           string | null;
  estado:           string | null;
  pais:             string | null;
  senioridade:      string | null;
  departamentos:    string[];
  fonte:            'extension';
  enriquecido:      false;
}

// ─── Inferência de nível a partir do cargo ────────────────────────────
function inferirNivel(cargo: string): string {
  if (!cargo) return 'não informado';
  const c = cargo.toLowerCase();

  if (/\b(ceo|cto|cio|coo|cfo|ciso|cpo|chro|cmo|chief|presidente)\b/.test(c)) return 'C-Level';
  if (/\b(vice.presidente|vp|vice president)\b/.test(c)) return 'VP';
  if (/\b(diretor|diretora|director|managing director)\b/.test(c)) return 'Diretor';
  if (/\b(head of|head de|head)\b/.test(c)) return 'Superintendente';
  if (/\b(superintendente)\b/.test(c)) return 'Superintendente';
  if (/\b(gerente.geral|gerente.executivo|gerente.s[eê]nior|gerente|manager|general manager)\b/.test(c)) return 'Gerente';
  if (/\b(coordenador|coordenadora|coordinator)\b/.test(c)) return 'Coordenador';
  if (/\b(analista|analyst|especialista|specialist|consultor|consultant)\b/.test(c)) return 'Especialista';

  return 'não informado';
}

// ─── Inferência de departamento a partir do cargo ─────────────────────
function inferirDepartamento(cargo: string): string {
  if (!cargo) return '';
  const c = cargo.toLowerCase();

  if (/\b(ti|tecnologia|technology|it\b|cto|cio|sistemas|digital|dados|data|software|infraestrutura|cloud|devops|segurança|cybersecurity)\b/.test(c)) return 'TI / Tecnologia';
  if (/\b(rh|recursos humanos|people|talent|gente|chro|hrbp)\b/.test(c)) return 'RH';
  if (/\b(financeiro|finance|cfo|controladoria|tesouraria|contábil)\b/.test(c)) return 'Financeiro';
  if (/\b(comercial|vendas|sales|revenue|business development|cso)\b/.test(c)) return 'Comercial';
  if (/\b(compras|procurement|suprimentos|aquisições|cpo)\b/.test(c)) return 'Compras';
  if (/\b(marketing|comunicação|brand)\b/.test(c)) return 'Marketing';
  if (/\b(operações|operations|coo|supply chain|logística)\b/.test(c)) return 'Operações';
  if (/\b(jurídico|legal|compliance|governança)\b/.test(c)) return 'Jurídico / Compliance';

  return '';
}

// ─── Extrair cidade/estado da localização ────────────────────────────
function parsearLocalizacao(localizacao: string | null): { cidade: string | null; estado: string | null; pais: string | null } {
  if (!localizacao) return { cidade: null, estado: null, pais: null };

  // Formato: "São Paulo, SP, Brasil" ou "São Paulo, SP" ou "Brasil"
  const partes = localizacao.split(',').map(p => p.trim());

  let cidade: string | null = null;
  let estado: string | null = null;
  let pais: string | null = null;

  // Detectar país
  const ultimaParte = partes[partes.length - 1];
  if (/\b(brasil|brazil|estados unidos|united states|portugal|argentina|chile|mexico)\b/i.test(ultimaParte)) {
    pais = ultimaParte;
    partes.pop();
  } else {
    pais = 'Brasil'; // assumir Brasil por padrão para este produto
  }

  // Detectar estado (sigla de 2 letras BR ou nome)
  const estadosBR = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];
  if (partes.length > 0) {
    const possibleEstado = partes[partes.length - 1];
    if (estadosBR.includes(possibleEstado.toUpperCase())) {
      estado = possibleEstado.toUpperCase();
      partes.pop();
    }
  }

  if (partes.length > 0) {
    cidade = partes[0];
  }

  return { cidade, estado, pais };
}

// ─── Normalizar um lead capturado para o formato do Prospect Engine ───
function normalizarLead(lead: LeadCapturado, index: number): ProspectNormalizado | null {
  // Validações mínimas
  if (!lead.nome_completo || lead.nome_completo.trim().length < 4) return null;
  if (!lead.linkedin_url || !lead.linkedin_url.includes('linkedin.com/in/')) return null;

  const nome = lead.nome_completo.trim();
  const cargo = (lead.cargo || '').trim();
  const empresa = (lead.empresa_nome || '').trim();
  const { cidade, estado, pais } = parsearLocalizacao(lead.localizacao);

  // Gerar ID único baseado no URL do LinkedIn (mais estável que nome)
  const linkedinSlug = lead.linkedin_url.split('/in/')[1]?.replace(/\/$/, '') || '';
  const geminiId = `ext_${linkedinSlug || index}`;

  return {
    gemini_id:        geminiId,
    nome_completo:    nome,
    primeiro_nome:    lead.primeiro_nome || nome.split(' ')[0] || '',
    ultimo_nome:      lead.ultimo_nome   || nome.split(' ').slice(1).join(' ') || '',
    cargo:            cargo,
    nivel:            inferirNivel(cargo),
    departamento:     inferirDepartamento(cargo),
    linkedin_url:     lead.linkedin_url,
    email:            null,
    email_status:     null,
    foto_url:         null,
    empresa_nome:     empresa,
    empresa_dominio:  '',      // analista preenche ou vem do contexto da busca
    empresa_setor:    null,
    empresa_porte:    null,
    empresa_linkedin: null,
    empresa_website:  null,
    cidade,
    estado,
    pais,
    senioridade:      inferirNivel(cargo),
    departamentos:    inferirDepartamento(cargo) ? [inferirDepartamento(cargo)] : [],
    fonte:            'extension',
    enriquecido:      false,
  };
}

// ─── HANDLER ──────────────────────────────────────────────────────────
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS — permitir requisições da Extension Chrome
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Use POST.' });
  }

  const { leads, query, pagina_url } = req.body as {
    leads:       LeadCapturado[];
    query:       string;
    pagina_url:  string;
  };

  if (!Array.isArray(leads) || leads.length === 0) {
    return res.status(400).json({ error: 'Nenhum lead recebido.' });
  }

  if (leads.length > 50) {
    return res.status(400).json({ error: 'Máximo de 50 leads por captura.' });
  }

  try {
    console.log(`📥 [prospect-capture] Recebendo ${leads.length} leads — query: "${query}"`);

    // Normalizar e filtrar leads inválidos
    const normalizados: ProspectNormalizado[] = [];
    const descartados: string[] = [];

    leads.forEach((lead, i) => {
      const normalizado = normalizarLead(lead, i);
      if (normalizado) {
        normalizados.push(normalizado);
      } else {
        descartados.push(lead.nome_completo || `lead_${i}`);
      }
    });

    // Deduplicar por linkedin_url
    const vistos = new Set<string>();
    const deduplicados = normalizados.filter(l => {
      const key = l.linkedin_url || l.nome_completo;
      if (vistos.has(key)) return false;
      vistos.add(key);
      return true;
    });

    console.log(`✅ [prospect-capture] ${deduplicados.length} válidos, ${descartados.length} descartados`);

    return res.status(200).json({
      success:     true,
      resultados:  deduplicados,
      total:       deduplicados.length,
      descartados: descartados.length,
      query:       query,
      motor:       'extension',
      creditos_consumidos: 0,
    });

  } catch (error: any) {
    console.error('❌ [prospect-capture] Erro:', error.message);
    return res.status(500).json({
      success: false,
      error:   error.message || 'Erro interno ao processar leads',
    });
  }
}
