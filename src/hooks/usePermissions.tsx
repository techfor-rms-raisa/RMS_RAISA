import { useState, useEffect, createContext, useContext, ReactNode } from 'react';
import { supabase } from '../services/supabaseClient';

// ============================================
// TIPOS
// ============================================

export interface Permissao {
    codigo_permissao: string;
    nome_permissao: string;
    modulo: string;
    acao: string;
}

export interface PerfilUsuario {
    id: number;
    nome_perfil: string;
    descricao: string | null;
    cor_badge: string;
    nivel_acesso: number;
}

export interface UsuarioAutenticado {
    id: number;
    nome_usuario: string;
    email_usuario: string;
    perfil: PerfilUsuario | null;
    permissoes: Permissao[];
}

interface PermissionsContextType {
    usuario: UsuarioAutenticado | null;
    permissoes: Permissao[];
    loading: boolean;
    pode: (codigo_permissao: string) => boolean;
    podeModulo: (modulo: string, acao: string) => boolean;
    temNivelAcesso: (nivel_minimo: number) => boolean;
    login: (email: string, senha: string) => Promise<{ success: boolean; error?: string }>;
    logout: () => void;
    recarregarPermissoes: () => Promise<void>;
}

// ============================================
// CONTEXTO
// ============================================

const PermissionsContext = createContext<PermissionsContextType | undefined>(undefined);

export const PermissionsProvider = ({ children }: { children: ReactNode }) => {
    const [usuario, setUsuario] = useState<UsuarioAutenticado | null>(null);
    const [permissoes, setPermissoes] = useState<Permissao[]>([]);
    const [loading, setLoading] = useState(true);

    // Carregar usuário e permissões
    const carregarUsuario = async (userId: number) => {
        try {
            // Buscar usuário com perfil
            const { data: userData, error: userError } = await supabase
                .from('vw_usuarios_perfis')
                .select('*')
                .eq('id', userId)
                .single();

            if (userError) throw userError;

            // Buscar permissões do usuário
            const { data: permsData, error: permsError } = await supabase
                .rpc('obter_permissoes_usuario', { p_usuario_id: userId });

            if (permsError) throw permsError;

            const usuarioCompleto: UsuarioAutenticado = {
                id: userData.id,
                nome_usuario: userData.nome_usuario,
                email_usuario: userData.email_usuario,
                perfil: userData.perfil_id ? {
                    id: userData.perfil_id,
                    nome_perfil: userData.nome_perfil,
                    descricao: userData.perfil_descricao,
                    cor_badge: userData.cor_badge,
                    nivel_acesso: userData.nivel_acesso
                } : null,
                permissoes: permsData || []
            };

            setUsuario(usuarioCompleto);
            setPermissoes(permsData || []);
        } catch (error) {
            console.error('Erro ao carregar usuário:', error);
            setUsuario(null);
            setPermissoes([]);
        } finally {
            setLoading(false);
        }
    };

    // Login
    const login = async (email: string, senha: string): Promise<{ success: boolean; error?: string }> => {
        try {
            setLoading(true);

            // Buscar usuário
            const { data: userData, error: userError } = await supabase
                .from('app_users')
                .select('id, senha_usuario, ativo_usuario')
                .eq('email_usuario', email)
                .single();

            if (userError || !userData) {
                return { success: false, error: 'Usuário não encontrado' };
            }

            if (!userData.ativo_usuario) {
                return { success: false, error: 'Usuário inativo' };
            }

            // Verificar senha (em produção, use hash!)
            if (userData.senha_usuario !== senha) {
                return { success: false, error: 'Senha incorreta' };
            }

            // Atualizar último acesso
            await supabase
                .from('app_users')
                .update({ ultimo_acesso: new Date().toISOString() })
                .eq('id', userData.id);

            // Carregar dados completos
            await carregarUsuario(userData.id);

            // Salvar no localStorage
            localStorage.setItem('userId', userData.id.toString());

            return { success: true };
        } catch (error) {
            console.error('Erro no login:', error);
            return { success: false, error: 'Erro ao fazer login' };
        } finally {
            setLoading(false);
        }
    };

    // Logout
    const logout = () => {
        setUsuario(null);
        setPermissoes([]);
        localStorage.removeItem('userId');
    };

    // Recarregar permissões
    const recarregarPermissoes = async () => {
        if (usuario) {
            await carregarUsuario(usuario.id);
        }
    };

    // Verificar permissão específica
    const pode = (codigo_permissao: string): boolean => {
        return permissoes.some(p => p.codigo_permissao === codigo_permissao);
    };

    // Verificar permissão por módulo e ação
    const podeModulo = (modulo: string, acao: string): boolean => {
        return permissoes.some(p => p.modulo === modulo && p.acao === acao);
    };

    // Verificar nível de acesso
    const temNivelAcesso = (nivel_minimo: number): boolean => {
        return (usuario?.perfil?.nivel_acesso || 0) >= nivel_minimo;
    };

    // Carregar usuário ao montar
    useEffect(() => {
        const userId = localStorage.getItem('userId');
        if (userId) {
            carregarUsuario(parseInt(userId));
        } else {
            setLoading(false);
        }
    }, []);

    return (
        <PermissionsContext.Provider
            value={{
                usuario,
                permissoes,
                loading,
                pode,
                podeModulo,
                temNivelAcesso,
                login,
                logout,
                recarregarPermissoes
            }}
        >
            {children}
        </PermissionsContext.Provider>
    );
};

// ============================================
// HOOK
// ============================================

export const usePermissions = () => {
    const context = useContext(PermissionsContext);
    if (context === undefined) {
        throw new Error('usePermissions deve ser usado dentro de PermissionsProvider');
    }
    return context;
};

// ============================================
// COMPONENTES AUXILIARES
// ============================================

interface CanProps {
    do: string; // código da permissão
    children: ReactNode;
    fallback?: ReactNode;
}

export const Can = ({ do: permissao, children, fallback = null }: CanProps) => {
    const { pode } = usePermissions();
    return pode(permissao) ? <>{children}</> : <>{fallback}</>;
};

interface CanModuleProps {
    module: string;
    action: string;
    children: ReactNode;
    fallback?: ReactNode;
}

export const CanModule = ({ module, action, children, fallback = null }: CanModuleProps) => {
    const { podeModulo } = usePermissions();
    return podeModulo(module, action) ? <>{children}</> : <>{fallback}</>;
};

interface RequireAccessLevelProps {
    level: number;
    children: ReactNode;
    fallback?: ReactNode;
}

export const RequireAccessLevel = ({ level, children, fallback = null }: RequireAccessLevelProps) => {
    const { temNivelAcesso } = usePermissions();
    return temNivelAcesso(level) ? <>{children}</> : <>{fallback}</>;
};
