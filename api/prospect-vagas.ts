/**
 * api/prospect-vagas.ts — Endpoint HTTP do módulo "Vagas Publicadas"
 *   (Prospect Engine › menu "Vagas Publicadas")
 *
 * CASCA FINA: toda a lógica vive em lib/prospect-vagas/* (padrão do projeto —
 * evita fetch cross-function bloqueado pelo Deployment Protection em Preview).
 *
 * AÇÕES
 *   GET  ?action=buscar&user_id=&areas=tecnologia,dados&keyword=&uf=&modalidade=
 *        &periodo_dias=7&fontes=gupy,linkedin,vagascom,programathor&forcar=0
 *        → ResultadoBusca (vagas + match de território + saúde das fontes)
 *
 *   GET  ?action=salvas&user_id=
 *        → empresas salvas do analista (Admin: todas)
 *
 *   POST { action:'salvar_empresa', user_id, vaga_id, empresa_nome, empresa_dominio?,
 *          empresa_url?, observacao?, resolver_dominio? }
 *        → HTTP 200 { success:true, ... } | { success:false, motivo:'territorio'|'ja_salva'|..., mensagem, dono_nome }
 *          (bloqueio devolve 200 + success:false: useCrmApi.parseResponse descarta body em não-OK)
 *
 *   POST { action:'atualizar_salva', user_id, id, status:'salva'|'prospectando'|'descartada' }
 *
 * RBAC: user_id obrigatório; perfil deve ser Administrador | Gestão Comercial | SDR
 *       (mesmo conjunto do item de menu). Validado server-side em app_users.
 *
 * FONTES: apenas as que respondem SEM LOGIN (regra de arquitetura, Messias 18/10/2026).
 *
 * Pré-requisito SQL: 2026-10-18_vagas_publicadas_02_schema.sql
 *
 * Versão: 1.0
 * Data:   18/10/2026
 * Autor:  Messias + Claude DEV
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { Area, FiltrosBusca, Fonte, Modalidade } from '../lib/prospect-vagas/vagas-types.js';
import { isArea } from '../lib/prospect-vagas/vagas-areas.js';
import { isFonte } from '../lib/prospect-vagas/vagas-orquestrador.js';
import {
  atualizarStatusSalva, buscarVagas, carregarUsuario, listarSalvas, salvarEmpresa, PERFIS_PERMITIDOS,
  type UsuarioAtual,
} from '../lib/prospect-vagas/vagas-persistencia.js';

// 4 fontes em paralelo + LinkedIn sequencial com pausa → folga ampla dentro de 300s (vercel.json)
export const config = { maxDuration: 120 };

const UFS = new Set(['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO']);

function str(v: unknown): string | null {
  if (Array.isArray(v)) v = v[0];
  const s = typeof v === 'string' ? v.trim() : '';
  return s ? s : null;
}

function lista<T extends string>(v: unknown, guard: (x: string) => x is T): T[] {
  const s = str(v);
  if (!s) return [];
  return s.split(',').map(x => x.trim().toLowerCase()).filter(guard);
}

async function autenticar(req: VercelRequest, res: VercelResponse): Promise<UsuarioAtual | null> {
  const raw = req.method === 'GET' ? str(req.query.user_id) : str(req.body?.user_id);
  const userId = Number(raw);
  if (!raw || !Number.isInteger(userId) || userId <= 0) {
    res.status(400).json({ success: false, error: 'user_id obrigatório' });
    return null;
  }
  const u = await carregarUsuario(userId);
  if (!u) { res.status(401).json({ success: false, error: 'Usuário não encontrado' }); return null; }
  if (!PERFIS_PERMITIDOS.includes(u.tipo_usuario)) {
    res.status(403).json({ success: false, error: `Perfil ${u.tipo_usuario} sem acesso a Vagas Publicadas` });
    return null;
  }
  return u;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    // ─── GET ────────────────────────────────────────────────────────────
    if (req.method === 'GET') {
      const action = str(req.query.action) || 'buscar';
      const u = await autenticar(req, res);
      if (!u) return;

      if (action === 'salvas') {
        const salvas = await listarSalvas(u);
        return res.status(200).json({ success: true, salvas, total: salvas.length });
      }

      if (action === 'buscar') {
        const areas = lista<Area>(req.query.areas, isArea);
        if (!areas.length) return res.status(400).json({ success: false, error: 'Informe ao menos uma área (areas=tecnologia,dados,...)' });

        const ufRaw = (str(req.query.uf) || '').toUpperCase();
        const modRaw = (str(req.query.modalidade) || '').toLowerCase();
        const periodo = Number(str(req.query.periodo_dias) || 0);

        const filtros: FiltrosBusca = {
          areas,
          keyword_extra: (str(req.query.keyword) || '').slice(0, 60) || null,
          uf:            UFS.has(ufRaw) ? ufRaw : null,
          modalidade:    (['remoto','hibrido','presencial'] as const).includes(modRaw as Modalidade) ? (modRaw as Modalidade) : null,
          periodo_dias:  periodo > 0 && periodo <= 365 ? periodo : null,
          fontes:        lista<Fonte>(req.query.fontes, isFonte),
          forcar:        str(req.query.forcar) === '1' || str(req.query.forcar) === 'true',
        };

        const resultado = await buscarVagas(filtros, u);
        return res.status(200).json({ success: true, filtros, ...resultado });
      }

      return res.status(400).json({ success: false, error: `action desconhecida: ${action}` });
    }

    // ─── POST ───────────────────────────────────────────────────────────
    if (req.method === 'POST') {
      const body = req.body || {};
      const u = await autenticar(req, res);
      if (!u) return;

      if (body.action === 'salvar_empresa') {
        const nome = str(body.empresa_nome);
        if (!nome) return res.status(400).json({ success: false, error: 'empresa_nome obrigatório' });
        const r = await salvarEmpresa({
          vaga_id:          Number.isInteger(Number(body.vaga_id)) && Number(body.vaga_id) > 0 ? Number(body.vaga_id) : null,
          empresa_nome:     nome,
          empresa_dominio:  str(body.empresa_dominio),
          empresa_url:      str(body.empresa_url),
          observacao:       (str(body.observacao) || '').slice(0, 500) || null,
          resolver_dominio: body.resolver_dominio === true,
        }, u);
        // HTTP 200 sempre — success:false carrega motivo/dono para a UI
        return res.status(200).json(r);
      }

      if (body.action === 'atualizar_salva') {
        const id = Number(body.id);
        const status = str(body.status) as 'salva' | 'prospectando' | 'descartada' | null;
        if (!id || !status || !['salva','prospectando','descartada'].includes(status)) {
          return res.status(400).json({ success: false, error: 'id e status válidos são obrigatórios' });
        }
        const ok = await atualizarStatusSalva(id, status, u);
        return res.status(200).json({ success: ok, error: ok ? undefined : 'Registro não encontrado ou sem permissão' });
      }

      return res.status(400).json({ success: false, error: `action desconhecida: ${body.action}` });
    }

    return res.status(405).json({ success: false, error: 'Método não permitido' });
  } catch (err: any) {
    console.error('❌ [prospect-vagas]', err?.message || err);
    return res.status(500).json({ success: false, error: err?.message || 'Erro interno' });
  }
}
