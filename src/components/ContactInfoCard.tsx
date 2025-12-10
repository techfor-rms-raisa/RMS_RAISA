import React from 'react';
import { Mail, Phone, User, Briefcase } from 'lucide-react';

interface ContactInfoCardProps {
  title: string;
  name: string;
  role?: string;
  email?: string;
  celular?: string;
  variant?: 'consultant' | 'manager';
}

const ContactInfoCard: React.FC<ContactInfoCardProps> = ({
  title,
  name,
  role,
  email,
  celular,
  variant = 'consultant'
}) => {
  const bgColor = variant === 'consultant' ? 'bg-blue-50' : 'bg-purple-50';
  const borderColor = variant === 'consultant' ? 'border-blue-200' : 'border-purple-200';
  const iconColor = variant === 'consultant' ? 'text-blue-600' : 'text-purple-600';
  const titleColor = variant === 'consultant' ? 'text-blue-800' : 'text-purple-800';

  return (
    <div className={`${bgColor} ${borderColor} border-2 rounded-lg p-4 shadow-sm`}>
      <h3 className={`${titleColor} font-semibold text-sm uppercase mb-3 flex items-center gap-2`}>
        <User className="w-4 h-4" />
        {title}
      </h3>
      
      <div className="space-y-2">
        <div className="flex items-start gap-2">
          <User className={`w-5 h-5 ${iconColor} mt-0.5 flex-shrink-0`} />
          <div>
            <p className="text-gray-900 font-semibold">{name}</p>
            {role && <p className="text-gray-600 text-sm uppercase">{role}</p>}
          </div>
        </div>

        {email && (
          <div className="flex items-center gap-2">
            <Mail className={`w-5 h-5 ${iconColor} flex-shrink-0`} />
            <a 
              href={`mailto:${email}`}
              className="text-gray-700 hover:text-blue-600 transition text-sm break-all"
            >
              {email}
            </a>
          </div>
        )}

        {celular && (
          <div className="flex items-center gap-2">
            <Phone className={`w-5 h-5 ${iconColor} flex-shrink-0`} />
            <a 
              href={`https://wa.me/55${celular.replace(/\D/g, '')}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-gray-700 hover:text-green-600 transition text-sm font-mono"
              title="Abrir no WhatsApp"
            >
              {celular}
            </a>
          </div>
        )}

        {!email && !celular && (
          <p className="text-gray-500 text-sm italic">Informações de contato não disponíveis</p>
        )}
      </div>
    </div>
  );
};

export default ContactInfoCard;
