import React, { useState } from 'react';
import { APP_TITLE, APP_VERSION, AI_MODEL_NAME } from '../constants';
import { User } from '../components/types';
import { supabase } from '../config/supabase';

interface LoginScreenProps {
  onLogin: (user: User) => void;
}

const LoginScreen: React.FC<LoginScreenProps> = ({ onLogin }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    try {
      const { data, error: queryError } = await supabase
        .from('users')
        .select('*')
        .eq('email', email)
        .eq('senha', password)
        .single();

      if (queryError) {
        setError('E-mail ou senha inválidos.');
        return;
      }

      if (data && data.ativo) {
        const user: User = {
          id: data.id,
          nome_usuario: data.nome,
          email_usuario: data.email,
          senha_usuario: data.senha,
          ativo_usuario: data.ativo,
          tipo_usuario: data.tipo,
          receber_alertas_email: data.receber_alertas_email || false,
          analista_rs_id: data.analista_rs_id || null,
        };
        onLogin(user);
      } else if (data && !data.ativo) {
        setError('Este usuário está inativo.');
      } else {
        setError('E-mail ou senha inválidos.');
      }
    } catch (err) {
      setError('Ocorreu um erro ao tentar fazer login.');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 px-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-2xl p-8 space-y-8 relative">
        <div className="text-center">
          <h2 className="mt-6 text-3xl font-extrabold text-[#4D5253]">{APP_TITLE}</h2>
          <p className="mt-2 text-xs text-[#494D51] font-normal">{APP_VERSION} • {AI_MODEL_NAME}</p>
        </div>
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          {error && <div className="p-4 mb-4 text-sm text-red-700 bg-red-100 rounded-lg">{error}</div>}
          <div className="rounded-md shadow-sm -space-y-px">
            <input type="email" required className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 rounded-t-md focus:ring-[#533738] focus:border-[#533738]" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
            <input type="password" required className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 rounded-b-md focus:ring-[#533738] focus:border-[#533738]" placeholder="Senha" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <div className="flex items-center justify-end">
            <button type="button" className="text-sm font-medium text-[#533738] hover:text-red-800 underline">Esqueci minha senha</button>
          </div>
          <button type="submit" style={{ backgroundColor: '#533738' }} className="w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white hover:bg-opacity-90">Entrar</button>
        </form>
      </div>
    </div>
  );
};

export default LoginScreen;
