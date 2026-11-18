/**
 * lib/prospect-vagas/vagas-areas.ts
 *
 * Mapa ÁREA → palavras-chave de busca + regex de classificação.
 *
 *   • `keywords`  — termos enviados às fontes que aceitam busca
 *                   (Gupy jobName, LinkedIn keywords, Vagas.com slug).
 *                   Poucos e fortes: cada termo = 1 request por fonte.
 *   • `regex`     — classifica um TÍTULO numa área. Usado para:
 *                   (a) Programathor, que não aceita busca (lista tudo);
 *                   (b) revalidar que a vaga devolvida pela fonte pertence
 *                       mesmo à área (Gupy às vezes devolve ruído).
 *
 * Prioridade de produto (Messias 18/10/2026): tecnologia, dados,
 * segurança e infra são o foco; administrativo é "eventual".
 *
 * Versão: 1.0 — 18/10/2026
 */

import type { Area } from './vagas-types.js';

export interface AreaConfig {
  label:    string;
  keywords: string[];
  regex:    RegExp;
}

export const AREAS: Record<Area, AreaConfig> = {
  tecnologia: {
    label:    'Tecnologia / Desenvolvimento',
    keywords: ['desenvolvedor', 'engenheiro de software', 'programador'],
    regex:    /desenvolvedor|developer|programador|engenheir[oa]\s+de\s+software|software\s+engineer|full\s*stack|front[\s-]*end|back[\s-]*end|mobile|flutter|react|angular|java|\.net|python|node|php|golang|kotlin|swift|arquitet[oa]\s+de\s+(software|solu|sistemas)|analista\s+de\s+sistemas|qa\b|quality|test(er|es)\b|scrum|product\s+owner|tech\s*lead|sap\b|abap|salesforce|low[\s-]*code|rpa\b/i,
  },
  dados: {
    label:    'Ciência de Dados / IA',
    keywords: ['cientista de dados', 'engenheiro de dados', 'analista de dados'],
    regex:    /dados|data\s+(scientist|engineer|analyst|science)|cientista|machine\s+learning|\bml\b|\bia\b|\bai\b|intelig[êe]ncia\s+artificial|\bbi\b|business\s+intelligence|analytics|llm|genai|power\s*bi|etl\b/i,
  },
  seguranca: {
    label:    'Segurança da Informação',
    keywords: ['segurança da informação', 'cybersecurity', 'analista de segurança'],
    regex:    /seguran[çc]a\s+da\s+informa|cyber|ciberseguran|infosec|\bsoc\b|pentest|red\s+team|blue\s+team|\biam\b|\bgrc\b|vulnerabilidad|security/i,
  },
  infra: {
    label:    'Infraestrutura / Cloud / DevOps',
    keywords: ['infraestrutura', 'devops', 'cloud'],
    regex:    /infra|devops|\bsre\b|cloud|aws|azure|gcp|kubernetes|k8s|docker|redes?\b|network|suporte\s+t[ée]cnico|help\s*desk|service\s*desk|sysadmin|administrador\s+de\s+(sistemas|redes|banco)|\bdba\b|linux|windows\s+server|observabilidade|platform\s+engineer/i,
  },
  administrativo: {
    label:    'Administrativo',
    keywords: ['analista administrativo', 'assistente administrativo'],
    regex:    /administrativ|financeir|contas\s+a\s+(pagar|receber)|faturamento|compras|recursos\s+humanos|\brh\b|departamento\s+pessoal|secret[áa]ri|recep[çc]|assistente|auxiliar\s+admin/i,
  },
};

export const TODAS_AREAS = Object.keys(AREAS) as Area[];

/** Classifica um título em uma das áreas pedidas; null se não casar. */
export function classificarArea(titulo: string, areasPermitidas: Area[]): Area | null {
  for (const area of areasPermitidas) {
    if (AREAS[area].regex.test(titulo)) return area;
  }
  return null;
}

/** Valida string vinda do querystring. */
export function isArea(v: string): v is Area {
  return (TODAS_AREAS as string[]).includes(v);
}
