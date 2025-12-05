// ============================================
// TIPOS PARA SISTEMA DE PERFIS DINÂMICOS
// ============================================

export interface PerfilUsuario {
    id: number;
    nome_perfil: string;
    descricao: string | null;
    cor_badge: string;
    icone: string | null;
    nivel_acesso: number;
    ativo: boolean;
    sistema: boolean;
    criado_em: string;
    atualizado_em: string;
}

export interface Permissao {
    id: number;
    codigo_permissao: string;
    nome_permissao: string;
    descricao: string | null;
    modulo: string;
    acao: 'criar' | 'ler' | 'editar' | 'excluir' | 'executar';
    ativo: boolean;
    criado_em: string;
}

export interface PerfilPermissao {
    id: number;
    perfil_id: number;
    permissao_id: number;
    concedido_em: string;
    concedido_por: number | null;
}

export interface User {
    id: number;
    nome_usuario: string;
    email_usuario: string;
    senha_usuario: string;
    ativo_usuario: boolean;
    receber_alertas_email: boolean;
    perfil_id: number | null;
    gestor_rs_id: number | null;
    foto_url: string | null;
    telefone: string | null;
    ultimo_acesso: string | null;
    criado_em?: string;
    atualizado_em?: string;
    
    // Campos computados (carregados via JOIN)
    perfil?: PerfilUsuario;
    nome_perfil?: string;
    cor_badge?: string;
    nivel_acesso?: number;
}

export interface UserWithProfile extends User {
    perfil: PerfilUsuario;
    permissoes?: Permissao[];
}

// ============================================
// TIPOS EXISTENTES (mantidos para compatibilidade)
// ============================================

export interface Client {
    id: number;
    razao_social_cliente: string;
    nome_fantasia?: string;
    cnpj?: string;
    ativo_cliente: boolean;
    vip?: boolean;
    id_gestao_comercial: number | null;
    id_gestao_de_pessoas: number | null;
    id_gestor_rs: number | null;
    endereco?: string;
    telefone?: string;
    email_contato?: string;
    observacoes?: string;
}

export interface UsuarioCliente {
    id: number;
    id_cliente: number;
    nome_gestor_cliente: string;
    cargo_gestor: string;
    email_gestor?: string;
    telefone_gestor?: string;
    ativo: boolean;
    gestor_rs_id: number | null;
}

export interface CoordenadorCliente {
    id: number;
    id_gestor_cliente: number;
    nome_coordenador_cliente: string;
    cargo_coordenador_cliente: string;
    email_coordenador?: string;
    telefone_coordenador?: string;
    ativo: boolean;
}

export interface Consultant {
    id: number;
    ano_vigencia: number;
    nome_consultores: string;
    email_consultor: string | null;
    cargo_consultores: string;
    data_inclusao_consultores: string;
    status: 'Ativo' | 'Perdido' | 'Encerrado';
    motivo_desligamento: string | null;
    valor_faturamento: number | null;
    gestor_imediato_id: number | null;
    coordenador_id: number | null;
    gestor_rs_id: number | null;
    id_gestao_de_pessoas: number | null;
    parecer_final_consultor: string | null;
    reports: any[];
}

// ============================================
// HELPER TYPES
// ============================================

export interface PermissaoDetalhada extends Permissao {
    perfil_id: number;
    nome_perfil: string;
    concedido_em: string;
}

export interface PerfilComPermissoes extends PerfilUsuario {
    permissoes: Permissao[];
    total_permissoes: number;
}

export interface UsuarioComPermissoes extends UserWithProfile {
    permissoes: Permissao[];
    pode: (codigo_permissao: string) => boolean;
}

// ============================================
// FUNÇÕES AUXILIARES DE TIPO
// ============================================

export const verificarPermissao = (
    usuario: UsuarioComPermissoes,
    codigo_permissao: string
): boolean => {
    return usuario.permissoes?.some(p => p.codigo_permissao === codigo_permissao) || false;
};

export const obterCoresPerfilPadrao = (): Record<string, string> => ({
    'Administrador': '#EF4444',
    'Gestão Comercial': '#3B82F6',
    'Gestão de Pessoas': '#10B981',
    'Analista de R&S': '#8B5CF6',
    'Consulta': '#6B7280',
    'Cliente': '#F59E0B'
});

export const obterNivelAcessoPorPerfil = (nome_perfil: string): number => {
    const niveis: Record<string, number> = {
        'Administrador': 10,
        'Gestão Comercial': 8,
        'Gestão de Pessoas': 8,
        'Analista de R&S': 6,
        'Cliente': 3,
        'Consulta': 2
    };
    return niveis[nome_perfil] || 1;
};
