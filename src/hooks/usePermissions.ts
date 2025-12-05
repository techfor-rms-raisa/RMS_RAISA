import { useState, useEffect, createContext, useContext, ReactNode } from 'react';
import { supabase } from '../config/supabase';

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
    nome: string;
    email: string;
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
            // Buscar usuário
            const { data: userData, error: userError } = await supabase
                .from('users')
                .select('*')
                .eq('id', userId)
                .single();

            if (userError) throw userError;

            const usuarioCompleto: UsuarioAutenticado = {
                id: userData.id,
                nome: userData.nome,
                email: userData.email,
                perfil: null, // Simplificado - adicionar lógica de perfil depois se necessário
                permissoes: []
            };

            setUsuario(usuarioCompleto);
            setPermissoes([]);
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

            console.log('🔐 Tentando login com:', { email });

            // Buscar usuário
            const { data: userData, error: userError } = await supabase
                .from('users')
                .select('id, senha, email, nome')
                .eq('email', email)
                .single();

            console.log('📊 Resultado da query:', { userData, userError });

            if (userError || !userData) {
                console.error('❌ Usuário não encontrado:', userError);
                return { success: false, error: 'Usuário não encontrado' };
            }

            // Verificar senha (em produção, use hash!)
            if (userData.senha !== senha) {
                console.error('❌ Senha incorreta');
                return { success: false, error: 'Senha incorreta' };
            }

            console.log('✅ Login bem-sucedido!');

            // Carregar dados completos
            await carregarUsuario(userData.id);

            // Salvar no localStorage
            localStorage.setItem('userId', userData.id.toString());

            return { success: true };
        } catch (error) {
            console.error('❌ Erro no login:', error);
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

// ===========================================
// COMPONENTES AUXILIARES 
// ===========================================

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
