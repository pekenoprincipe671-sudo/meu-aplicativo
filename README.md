# R_Sejamosluz — MVP + Supabase

Expo/React Native com autenticação e sincronização preparadas para produção.

## O que entrou nesta versão

- Cadastro com nome, e-mail, senha e objetivo.
- Login com Supabase Auth.
- Persistência da sessão no aparelho.
- Recuperação de senha por e-mail.
- Perfil sincronizado na tabela `profiles`.
- Progresso do plano de 7 dias sincronizado na tabela `progress`.
- Diário sincronizado na tabela `journal_entries`.
- RLS (Row Level Security) para que cada usuário acesse apenas os próprios dados.
- Modo de demonstração local continua disponível quando o Supabase não está configurado.
- Nenhuma `service_role key` é usada no aplicativo.

## Configuração do Supabase

1. Crie um projeto no Supabase.
2. No SQL Editor, execute o arquivo `supabase_schema.sql`.
3. No projeto, obtenha a URL e a chave **anon/public**.
4. O pacote já inclui um `.env` configurado com a URL do projeto. Se você estiver usando outro computador, recrie o `.env` a partir de `.env.example`:

```env
EXPO_PUBLIC_SUPABASE_URL=https://fvkefosxcxdtkgmoqmoe.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=
# Use aqui a Publishable key do projeto (a chave pública).
```

5. Instale as dependências e execute:

```bash
npm install
npx expo start
```

### Confirmação de e-mail

Se a confirmação de e-mail estiver habilitada no Supabase Auth, o cadastro exibirá uma mensagem para o usuário confirmar o endereço antes de entrar.

### Segurança

A chave `anon/public` pode ser usada no cliente quando as políticas RLS estão configuradas corretamente. **Nunca** coloque uma `service_role key` no app, no `.env` distribuído ao cliente ou em código público.

Os registros do diário podem conter informações pessoais. Antes de colocar o produto em produção, defina política de privacidade, retenção/exclusão, exportação de dados e demais requisitos aplicáveis à LGPD.
