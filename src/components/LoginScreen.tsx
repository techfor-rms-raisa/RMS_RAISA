import React, { useState } from 'react';
import { LOGO_BASE64, APP_TITLE, APP_VERSION, AI_MODEL_NAME } from '../constants';
import { User } from '../components/types';
import { sendPasswordRecoveryEmail } from '../services/emailService';

interface LoginScreenProps {
  onLogin: (user: User) => void;
  users: User[];
  updateUser: (user: User) => void;
}

const LoginScreen: React.FC<LoginScreenProps> = ({ onLogin, users, updateUser }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [showRecovery, setShowRecovery] = useState(false);
  const [recoveryEmail, setRecoveryEmail] = useState('');
  const [recoveryStatus, setRecoveryStatus] = useState<'idle' | 'sending' | 'success' | 'error'>('idle');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const user = users.find(u => u.email_usuario.toLowerCase() === email.toLowerCase() && u.senha_usuario === password);
    if (user && user.ativo_usuario) {
      setError(null);
      onLogin(user);
    } else if (user && !user.ativo_usuario) {
      setError('Este usuário está inativo.');
    } else {
      setError('E-mail ou senha inválidos.');
    }
  };

  const handleRecoverySubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      setRecoveryStatus('sending');
      const user = users.find(u => u.email_usuario.toLowerCase() === recoveryEmail.toLowerCase());
      if (user) {
          const success = await sendPasswordRecoveryEmail(user);
          if (success) {
              updateUser({ ...user, senha_usuario: 'Novo@' });
              setRecoveryStatus('success');
          } else {
              setRecoveryStatus('error');
          }
      } else {
          setError('E-mail não encontrado.');
          setRecoveryStatus('idle');
      }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 px-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-2xl p-8 space-y-8 relative">
        <div className="text-center">
          <img className="mx-auto h-12" src={LOGO_BASE64} alt="TechFor Logo" />
          <h2 className="mt-6 text-3xl font-extrabold text-[#4D5253]">{APP_TITLE}</h2>
          <p className="mt-2 text-xs text-[#494D51] font-normal">{APP_VERSION} • {AI_MODEL_NAME}</p>
        </div>

        {!showRecovery ? (
            <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
            {error && <div className="p-4 mb-4 text-sm text-red-700 bg-red-100 rounded-lg">{error}</div>}
            <div className="rounded-md shadow-sm -space-y-px">
                <input type="email" required className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 rounded-t-md focus:ring-[#533738] focus:border-[#533738]" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
                <input type="password" required className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 rounded-b-md focus:ring-[#533738] focus:border-[#533738]" placeholder="Senha" value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <div className="flex items-center justify-end">
                <button type="button" onClick={() => setShowRecovery(true)} className="text-sm font-medium text-[#533738] hover:text-red-800 underline">Esqueci minha senha</button>
            </div>
            <button type="submit" style={{ backgroundColor: '#533738' }} className="w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white hover:bg-opacity-90">Entrar</button>
            </form>
        ) : (
            <div className="mt-8 space-y-6">
                 <div className="text-center"><h3 className="text-lg font-medium text-gray-900">Recuperação de Senha</h3></div>
                 {recoveryStatus === 'success' ? (
                     <div className="bg-green-50 p-4 rounded-md text-center">
                         <p className="text-green-800 font-medium">E-mail enviado!</p>
                         <button onClick={() => { setShowRecovery(false); setRecoveryStatus('idle'); }} className="mt-4 text-sm text-green-900 underline">Voltar</button>
                     </div>
                 ) : (
                    <form onSubmit={handleRecoverySubmit} className="space-y-4">
                         {error && <div className="p-3 text-sm text-red-700 bg-red-100 rounded-lg">{error}</div>}
                         <input type="email" required className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md" placeholder="E-mail cadastrado" value={recoveryEmail} onChange={(e) => setRecoveryEmail(e.target.value)} />
                        <button type="submit" disabled={recoveryStatus === 'sending'} className="w-full py-2 px-4 rounded-md text-white bg-blue-600 hover:bg-blue-700">{recoveryStatus === 'sending' ? 'Enviando...' : 'Enviar Senha Temporária'}</button>
                        <button type="button" onClick={() => { setShowRecovery(false); setError(null); }} className="w-full text-center text-sm text-gray-600">Cancelar</button>
                    </form>
                 )}
            </div>
        )}
      </div>
    </div>
  );
};

export default LoginScreen;