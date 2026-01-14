# 🔗 Integração Plugin LinkedIn Chrome com RMS-RAISA

## Problema Identificado

O erro "Analista não identificado. Faça login no sistema antes de importar" ocorre porque o plugin do Chrome não está enviando o `analista_id` corretamente para a API.

## Solução Implementada

O sistema agora expõe o ID do usuário logado em uma variável global `window.__RMS_USER_ID__`.

### Variáveis Expostas no Window:

```javascript
window.__RMS_USER_ID__     // ID numérico do analista logado
window.__RMS_USER_NAME__   // Nome do analista logado (opcional)
```

---

## Como Atualizar o Plugin do Chrome

O plugin precisa ler o `userId` do sistema antes de enviar dados para a API. Existem **3 formas** de fazer isso (em ordem de preferência):

### 1️⃣ Ler do `window.__RMS_USER_ID__` (Recomendado)

O Content Script do plugin pode ler a variável global:

```javascript
// content.js (Content Script do Plugin)
function getUserId() {
  // Injetar script para acessar variável do window
  return new Promise((resolve) => {
    const script = document.createElement('script');
    script.textContent = `
      window.postMessage({
        type: 'RMS_USER_ID',
        userId: window.__RMS_USER_ID__ || null
      }, '*');
    `;
    document.head.appendChild(script);
    script.remove();
    
    window.addEventListener('message', function handler(event) {
      if (event.data.type === 'RMS_USER_ID') {
        window.removeEventListener('message', handler);
        resolve(event.data.userId);
      }
    });
  });
}

// Uso:
const userId = await getUserId();
if (!userId) {
  alert('Faça login no RMS-RAISA antes de importar!');
  return;
}
```

### 2️⃣ Ler do `localStorage` (Fallback)

```javascript
// content.js
function getUserIdFromStorage() {
  const userId = localStorage.getItem('userId');
  return userId ? parseInt(userId) : null;
}
```

### 3️⃣ Injetar Script na Página

```javascript
// content.js
function injectAndGetUserId() {
  return new Promise((resolve) => {
    const script = document.createElement('script');
    script.id = 'rms-get-user';
    script.textContent = `
      (function() {
        const userId = window.__RMS_USER_ID__ || localStorage.getItem('userId');
        document.dispatchEvent(new CustomEvent('rms-user-found', { 
          detail: { userId: userId ? parseInt(userId) : null }
        }));
      })();
    `;
    
    document.addEventListener('rms-user-found', (e) => {
      resolve(e.detail.userId);
    }, { once: true });
    
    document.head.appendChild(script);
  });
}
```

---

## Atualização no Envio de Dados

O plugin deve incluir o `analista_id` no payload enviado à API:

```javascript
// Antes de enviar para a API
const userId = await getUserId();

if (!userId) {
  showError('Faça login no RMS-RAISA antes de importar!');
  return;
}

const payload = {
  nome: profileData.nome,
  headline: profileData.headline,
  linkedin_url: profileData.url,
  email: profileData.email,
  telefone: profileData.telefone,
  experiencias: profileData.experiencias,
  formacoes: profileData.formacoes,
  skills: profileData.skills,
  // ⚠️ CAMPO OBRIGATÓRIO
  analista_id: userId  
};

// Enviar para API
fetch('https://www.techfortirms.online/api/linkedin/importar', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(payload)
})
.then(res => res.json())
.then(data => {
  if (data.success) {
    showSuccess(`${data.dados.nome} importado com sucesso!`);
  } else {
    showError(data.error);
  }
});
```

---

## Verificação de Integração

Para testar se a variável está disponível, abra o Console do navegador (F12) no site RMS-RAISA logado e digite:

```javascript
console.log('User ID:', window.__RMS_USER_ID__);
console.log('User Name:', window.__RMS_USER_NAME__);
```

Se retornar `undefined`, o usuário não está logado ou precisa fazer refresh na página.

---

## Checklist de Atualização do Plugin

- [ ] Atualizar content.js para ler `window.__RMS_USER_ID__`
- [ ] Adicionar validação: se userId não encontrado, mostrar alerta
- [ ] Incluir `analista_id` no payload da API
- [ ] Testar importação com usuário logado
- [ ] Testar importação com usuário deslogado (deve mostrar erro)

---

## Arquivos Alterados no Sistema

1. **`src/App.tsx`** - Expõe `window.__RMS_USER_ID__` ao fazer login
2. A API `/api/linkedin/importar` já valida o campo `analista_id`

---

## Contato

Em caso de dúvidas sobre a integração, entre em contato com o time de desenvolvimento.
