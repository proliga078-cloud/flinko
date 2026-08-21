// Substitui, nos testes E2E, o SDK real "@supabase/supabase-js@2" que as
// páginas carregam via CDN (https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2).
// Em vez de tentar imitar o formato exato dos pedidos REST do Supabase (frágil
// e específico da versão), definimos aqui o MESMO objecto global `supabase`
// que o script da CDN normalmente cria, com um cliente cujo comportamento é
// controlado pelo teste através de `window.__testAuthConfig` — definido por
// `page.addInitScript` ANTES de qualquer script da própria página correr.
//
// Isto dá controlo total e determinístico sobre login/registo/sessão sem
// depender de rede real nem do formato interno da API do Supabase.
window.supabase = {
  createClient(_url, _key) {
    function cfg() { return window.__testAuthConfig || {}; }

    return {
      auth: {
        getSession: async () => ({ data: { session: cfg().session || null }, error: null }),
        getUser: async () => ({ data: { user: (cfg().session && cfg().session.user) || null }, error: null }),
        onAuthStateChange: (callback) => {
          window.__authStateChangeCallback = callback;
          return { data: { subscription: { unsubscribe() {} } } };
        },
        signInWithPassword: async ({ email, password }) => {
          window.__signInCalls = window.__signInCalls || [];
          window.__signInCalls.push({ email, password });
          if (cfg().loginError) return { data: { user: null, session: null }, error: { message: cfg().loginError } };
          return { data: { user: cfg().loginUser, session: cfg().loginSession }, error: null };
        },
        signUp: async ({ email, password }) => {
          window.__signUpCalls = window.__signUpCalls || [];
          window.__signUpCalls.push({ email, password });
          if (cfg().signUpError) return { data: { user: null, session: null }, error: { message: cfg().signUpError } };
          return { data: { user: cfg().signUpUser || null, session: cfg().signUpSession || null }, error: null };
        },
        resetPasswordForEmail: async (email, options) => {
          window.__resetPasswordCalls = window.__resetPasswordCalls || [];
          window.__resetPasswordCalls.push({ email, options });
          return { data: {}, error: cfg().resetError ? { message: cfg().resetError } : null };
        },
        updateUser: async (attrs) => {
          window.__updateUserCalls = window.__updateUserCalls || [];
          window.__updateUserCalls.push(attrs);
          return { data: {}, error: cfg().updateUserError ? { message: cfg().updateUserError } : null };
        },
        signOut: async () => ({ error: null }),
      },
      rpc: async (fnName, args) => {
        window.__rpcCalls = window.__rpcCalls || [];
        window.__rpcCalls.push({ fnName, args });
        const results = cfg().rpcResults || {};
        return { data: fnName in results ? results[fnName] : null, error: null };
      },
      from: (table) => ({
        insert: async (row) => {
          window.__insertCalls = window.__insertCalls || [];
          window.__insertCalls.push({ table, row });
          return { data: null, error: null };
        },
      }),
    };
  },
};
