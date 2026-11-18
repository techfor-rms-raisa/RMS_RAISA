/**
 * lib/prospect-vagas/vagas-types.ts
 *
 * CONTRATO ÚNICO do módulo "Vagas Publicadas" (Prospect Engine).
 * Toda fonte (Gupy, LinkedIn, Vagas.com, Programathor) converte o que
 * raspou para `VagaNormalizada`. O orquestrador, a persistência e o
 * endpoint só conhecem este formato — trocar/adicionar fonte não
 * toca o resto do módulo.
 *
 * REGRA DE ARQUITETURA (decisão Messias 18/10/2026):
 *   Só entram fontes que respondem a requisição ANÔNIMA (sem login,
 *   sem cookie, sem conta). Qualquer fonte que passe a exigir
 *   autenticação é removida — nunca contornada.
 *
 * Nomes de arquivo com prefixo `vagas-` por causa da colisão de sufixo
 * no bundler Vercel (api/ + src/ + lib/ no mesmo ncc).
 *
 * Versão: 1.0
 * Data:   18/10/2026
 * Autor:  Messias + Claude DEV
 */

export type Fonte = 'gupy' | 'linkedin' | 'vagascom' | 'programathor';

export type Area = 'tecnologia' | 'dados' | 'seguranca' | 'infra' | 'administrativo';

export type Modalidade = 'remoto' | 'hibrido' | 'presencial';

/** Uma vaga já no formato do banco (prospect_vagas), sem id. */
export interface VagaNormalizada {
  fonte:             Fonte;
  fonte_vaga_id:     string;
  vaga_url:          string;
  titulo:            string;
  area:              Area;
  keyword_busca:     string;
  senioridade:       string | null;
  regime:            string | null;
  stack:             string[] | null;
  cidade:            string | null;
  uf:                string | null;          // 2 letras ou null
  modalidade:        Modalidade | null;
  publicado_em:      string | null;          // 'YYYY-MM-DD'
  empresa_nome:      string | null;          // null = confidencial
  empresa_nome_norm: string | null;
  empresa_slug:      string | null;
  empresa_url:       string | null;
  empresa_dominio:   string | null;
  confidencial:      boolean;
}

/** Resultado de UMA fonte dentro de uma busca (telemetria/saúde). */
export interface SaudeFonte {
  fonte:     Fonte;
  ok:        boolean;
  qtd:       number;
  ms:        number;
  requests:  number;
  erro?:     string;
  /** true quando a fonte respondeu 200 mas 0 vagas numa keyword que sempre tem → parser possivelmente quebrado */
  degradada?: boolean;
}

/** Filtros recebidos do frontend. */
export interface FiltrosBusca {
  areas:         Area[];
  keyword_extra: string | null;
  uf:            string | null;             // 'SP' | null (null = todas + remoto)
  modalidade:    Modalidade | null;
  periodo_dias:  number | null;             // 7 | 30 | null (qualquer)
  fontes:        Fonte[];
  /** true = ignora cache 24h e raspa de novo */
  forcar:        boolean;
}

/** Como a empresa de uma vaga está em relação à base do CRM. */
export type StatusTerritorio =
  | 'nova'          // não existe na base
  | 'livre'         // existe em email_empresas mas sem dono → pode salvar (vincula)
  | 'voce'          // reservada pelo analista logado
  | 'outro'         // reservada por outro analista → bloqueado
  | 'confidencial'; // sem empresa identificável → sem ação

export interface MatchEmpresa {
  status:             StatusTerritorio;
  email_empresa_id:   number | null;
  dono_user_id:       number | null;
  dono_nome:          string | null;
  detalhe:            string | null;        // ex.: "2 leads · campanha ativa"
  score:              number | null;
  match_por:          'dominio' | 'nome' | 'salva' | 'prospect' | null;
  salva_id:           number | null;
  pode_salvar:        boolean;
}

/** Linha devolvida ao frontend. */
export interface VagaComMatch extends VagaNormalizada {
  id:                number;
  dias_publicada:    number | null;
  envelhecendo:      boolean;               // >= 30 dias
  match:             MatchEmpresa;
}

export interface ResultadoBusca {
  vagas:           VagaComMatch[];
  total_vagas:     number;
  total_empresas:  number;
  saude:           SaudeFonte[];
  cache_hit:       boolean;
  capturado_em:    string;                  // ISO da captura que alimentou a resposta
  duracao_ms:      number;
}
