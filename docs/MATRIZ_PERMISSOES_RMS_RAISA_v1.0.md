# 📋 MATRIZ DE PERMISSÕES E ACESSOS
## Sistema RMS-RAISA - TechForti

---

**Versão:** 1.0  
**Data:** 11/01/2026  
**Responsável:** Equipe de Desenvolvimento  
**Status:** Aprovado para Implementação

---

## 1. VISÃO GERAL

Este documento define a matriz oficial de permissões e acessos para todos os perfis de usuário do sistema RMS-RAISA. As permissões controlam:

- Acesso aos menus laterais (RMS e RAISA)
- Funcionalidades de CRUD em cada módulo
- Gerenciamento de usuários
- Inserção de dados (Candidatos, Vagas, etc.)

---

## 2. PERFIS DO SISTEMA

| ID | Perfil | Descrição |
|----|--------|-----------|
| 1 | Administrador | Acesso total ao sistema |
| 2 | Gestão de R&S | Gestão de Recrutamento e Seleção |
| 3 | Analista de R&S | Operação de Recrutamento e Seleção |
| 4 | Gestão de Pessoas | Gestão de Consultores e RH |
| 5 | Gestão Comercial | Gestão Comercial e Clientes |
| 6 | Consulta | Acesso somente leitura |
| 7 | Cliente | Portal do Cliente |

---

## 3. MATRIZ DE PERMISSÕES - VISÃO CONSOLIDADA

| Perfil | Menu RMS | Menu RAISA | Config. Priorização | Gerenc. Usuários | Inserir Candidatos |
|--------|----------|------------|---------------------|------------------|-------------------|
| **Administrador** | ✅ Total | ✅ Total | ✅ Sim | CRUD Total | ✅ Sim |
| **Gestão de R&S** | ✅ Total | ✅ Total | ❌ Não | CRUD (exceto Admin/Gestão Comercial) | ✅ Sim |
| **Analista de R&S** | 👁️ Parcial | ✅ Total | ❌ Não | Só próprio perfil | ✅ Sim |
| **Gestão de Pessoas** | ✅ Total | ❌ Nenhum | ❌ Não | Só próprio perfil | N/A |
| **Gestão Comercial** | ✅ Total | 👁️ Read-only | ❌ Não | Só próprio perfil | ❌ Não |
| **Consulta** | 👁️ Read-only | ❌ Nenhum | ❌ Não | Só próprio perfil | ❌ Não |
| **Cliente** | 👁️ Parcial | ❌ Nenhum | ❌ Não | N/A | ❌ Não |

---

## 4. DETALHAMENTO POR PERFIL

### 4.1 ADMINISTRADOR

**Descrição:** Acesso irrestrito a todas as funcionalidades do sistema.

#### Menu RMS
| Módulo | Acesso |
|--------|--------|
| Dashboard | ✅ Total |
| Quarentena | ✅ Total |
| Recomendações | ✅ Total |
| Usuários | ✅ Total |
| Clientes | ✅ Total |
| Consultores | ✅ Total |
| Analytics | ✅ Total |
| Importar/Exportar | ✅ Total |
| Templates | ✅ Total |
| Campanhas | ✅ Total |

#### Menu RAISA
| Módulo | Acesso |
|--------|--------|
| Vagas | ✅ Total |
| Candidaturas | ✅ Total |
| Banco de Talentos | ✅ Total |
| Controle de Envios | ✅ Total |
| Entrevista Técnica | ✅ Total |
| LinkedIn Import | ✅ Total |
| Distribuição IA | ✅ Total |
| Config. Priorização | ✅ Total |
| Dashboards RAISA | ✅ Total |

#### Gerenciamento de Usuários
- **Visualizar:** Todos os perfis
- **Criar:** Todos os perfis
- **Editar:** Todos os perfis
- **Excluir:** Todos os perfis

---

### 4.2 GESTÃO DE R&S

**Descrição:** Supervisão completa das operações de Recrutamento e Seleção.

#### Menu RMS
| Módulo | Acesso |
|--------|--------|
| Dashboard | ✅ Total |
| Quarentena | ✅ Total |
| Recomendações | ✅ Total |
| Usuários | ✅ Total (com restrições) |
| Clientes | ✅ Total |
| Consultores | ✅ Total |
| Analytics | ✅ Total |
| Importar/Exportar | ✅ Total |
| Templates | ✅ Total |
| Campanhas | ✅ Total |

#### Menu RAISA
| Módulo | Acesso |
|--------|--------|
| Vagas | ✅ Total |
| Candidaturas | ✅ Total |
| Banco de Talentos | ✅ Total |
| Controle de Envios | ✅ Total |
| Entrevista Técnica | ✅ Total |
| LinkedIn Import | ✅ Total |
| Distribuição IA | ✅ Total |
| Config. Priorização | ❌ Sem Acesso |
| Dashboards RAISA | ✅ Total |

#### Gerenciamento de Usuários
- **Visualizar:** Gestão de R&S, Gestão de Pessoas, Analista de R&S, Consulta, Cliente
- **Criar:** Gestão de R&S, Gestão de Pessoas, Analista de R&S, Consulta, Cliente
- **Editar:** Gestão de R&S, Gestão de Pessoas, Analista de R&S, Consulta, Cliente
- **Excluir:** Gestão de R&S, Gestão de Pessoas, Analista de R&S, Consulta, Cliente
- **NÃO pode acessar:** Administrador, Gestão Comercial

#### Funcionalidades Especiais
- ✅ Inserir Candidatos (Manual e LinkedIn)
- ✅ Liberar/Transferir Exclusividade de Candidatos
- ✅ Gerenciar equipe de Analistas

---

### 4.3 ANALISTA DE R&S

**Descrição:** Operação diária de recrutamento e seleção.

#### Menu RMS (Acesso Parcial - READ-ONLY)
| Módulo | Acesso |
|--------|--------|
| Dashboard | 👁️ Somente Leitura |
| Quarentena | 👁️ Somente Leitura |
| Recomendações | ❌ Sem Acesso |
| Usuários | ❌ Sem Acesso |
| Clientes | 👁️ Somente Leitura |
| Consultores | 👁️ Somente Leitura |
| Analytics | ❌ Sem Acesso |
| Importar/Exportar | ❌ Sem Acesso |
| Templates | ❌ Sem Acesso |
| Campanhas | ❌ Sem Acesso |

#### Menu RAISA (Acesso Total)
| Módulo | Acesso |
|--------|--------|
| Vagas | ✅ Total |
| Candidaturas | ✅ Total |
| Banco de Talentos | ✅ Total |
| Controle de Envios | ✅ Total |
| Entrevista Técnica | ✅ Total |
| LinkedIn Import | ✅ Total |
| Distribuição IA | ✅ Total |
| Config. Priorização | ❌ Sem Acesso |
| Dashboards RAISA | ✅ Total |

#### Gerenciamento de Usuários
- **Visualizar:** Apenas próprio perfil
- **Editar:** Apenas próprio perfil (dados pessoais, senha)
- **NÃO pode:** Ver outros usuários, criar ou excluir usuários

#### Funcionalidades Especiais
- ✅ Inserir Candidatos (Manual e LinkedIn)
- ✅ Inserir Candidaturas
- ✅ Realizar Entrevistas Técnicas
- ✅ Renovar Exclusividade de seus candidatos
- ❌ NÃO pode liberar/transferir exclusividade

---

### 4.4 GESTÃO DE PESSOAS

**Descrição:** Gestão de consultores alocados e recursos humanos.

#### Menu RMS (Acesso Total)
| Módulo | Acesso |
|--------|--------|
| Dashboard | ✅ Total |
| Quarentena | ✅ Total |
| Recomendações | ✅ Total |
| Usuários | ❌ Sem Acesso |
| Clientes | ✅ Total |
| Consultores | ✅ Total |
| Analytics | ✅ Total |
| Importar/Exportar | ✅ Total |
| Templates | ✅ Total |
| Campanhas | ✅ Total |

#### Menu RAISA
| Módulo | Acesso |
|--------|--------|
| Todos os módulos | ❌ Sem Acesso |

#### Gerenciamento de Usuários
- **Visualizar:** Apenas próprio perfil
- **Editar:** Apenas próprio perfil (dados pessoais, senha)
- **NÃO pode:** Ver outros usuários, criar ou excluir usuários

---

### 4.5 GESTÃO COMERCIAL

**Descrição:** Gestão comercial, relacionamento com clientes e vagas.

#### Menu RMS (Acesso Total)
| Módulo | Acesso |
|--------|--------|
| Dashboard | ✅ Total |
| Quarentena | ✅ Total |
| Recomendações | ✅ Total |
| Usuários | ❌ Sem Acesso |
| Clientes | ✅ Total |
| Consultores | ✅ Total |
| Analytics | ✅ Total |
| Importar/Exportar | ✅ Total |
| Templates | ✅ Total |
| Campanhas | ✅ Total |

#### Menu RAISA (Somente Leitura)
| Módulo | Acesso |
|--------|--------|
| Vagas | ✅ Total (pode inserir) |
| Candidaturas | 👁️ Somente Leitura |
| Banco de Talentos | 👁️ Somente Leitura |
| Controle de Envios | 👁️ Somente Leitura |
| Entrevista Técnica | 👁️ Somente Leitura |
| LinkedIn Import | ❌ Sem Acesso |
| Distribuição IA | 👁️ Somente Leitura |
| Config. Priorização | ❌ Sem Acesso |
| Dashboards RAISA | 👁️ Somente Leitura |

#### Gerenciamento de Usuários
- **Visualizar:** Apenas próprio perfil
- **Editar:** Apenas próprio perfil (dados pessoais, senha)
- **NÃO pode:** Ver outros usuários, criar ou excluir usuários

#### Funcionalidades Especiais
- ✅ Inserir Vagas
- ❌ NÃO pode inserir Candidatos (nem manual, nem LinkedIn)

---

### 4.6 CONSULTA

**Descrição:** Acesso somente leitura para consultas e relatórios.

#### Menu RMS (Somente Leitura)
| Módulo | Acesso |
|--------|--------|
| Dashboard | 👁️ Somente Leitura |
| Quarentena | 👁️ Somente Leitura |
| Recomendações | 👁️ Somente Leitura |
| Usuários | ❌ Sem Acesso |
| Clientes | 👁️ Somente Leitura |
| Consultores | 👁️ Somente Leitura |
| Analytics | 👁️ Somente Leitura |
| Importar/Exportar | ❌ Sem Acesso |
| Templates | 👁️ Somente Leitura |
| Campanhas | 👁️ Somente Leitura |

#### Menu RAISA
| Módulo | Acesso |
|--------|--------|
| Todos os módulos | ❌ Sem Acesso |

#### Gerenciamento de Usuários
- **Visualizar:** Apenas próprio perfil
- **Editar:** Apenas próprio perfil (dados pessoais, senha)

---

### 4.7 CLIENTE

**Descrição:** Portal do cliente com acesso restrito aos próprios dados.

#### Menu RMS (Acesso Parcial - Próprios Dados)
| Módulo | Acesso |
|--------|--------|
| Dashboard | 👁️ Somente Leitura (próprios dados) |
| Recomendações | 👁️ Somente Leitura (próprios dados) |
| Demais módulos | ❌ Sem Acesso |

#### Menu RAISA
| Módulo | Acesso |
|--------|--------|
| Todos os módulos | ❌ Sem Acesso |

#### Restrições de Dados
- **IMPORTANTE:** Cliente visualiza APENAS dados relacionados ao seu cadastro
- Não tem acesso a dados de outros clientes
- Não tem acesso a informações internas da TechForti

---

## 5. REGRAS DE NEGÓCIO

### 5.1 Hierarquia de Permissões
```
Administrador
    └── Gestão de R&S
            └── Analista de R&S
    └── Gestão Comercial
    └── Gestão de Pessoas
    └── Consulta
    └── Cliente
```

### 5.2 Exclusividade de Candidatos
| Perfil | Pode Renovar | Pode Liberar | Pode Transferir |
|--------|--------------|--------------|-----------------|
| Administrador | ✅ Todos | ✅ Todos | ✅ Todos |
| Gestão de R&S | ✅ Todos | ✅ Todos | ✅ Todos |
| Analista de R&S | ✅ Próprios | ❌ Não | ❌ Não |
| Demais | ❌ Não | ❌ Não | ❌ Não |

### 5.3 Config. Priorização
Acesso **exclusivo** para perfil **Administrador**.

---

## 6. CHANGELOG

| Versão | Data | Alteração | Responsável |
|--------|------|-----------|-------------|
| 1.0 | 11/01/2026 | Documento inicial | Equipe Dev |

---

## 7. APROVAÇÕES

| Função | Nome | Data | Assinatura |
|--------|------|------|------------|
| Gestor de Projeto | _________________ | ___/___/______ | _________ |
| Gestor de TI | _________________ | ___/___/______ | _________ |
| Gestor de R&S | _________________ | ___/___/______ | _________ |

---

*Documento gerado automaticamente pelo sistema RMS-RAISA*
*TechForti - Todos os direitos reservados*
