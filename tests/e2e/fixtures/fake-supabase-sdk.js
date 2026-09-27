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
      // Mínimo necessário para páginas que chamam db.channel(...).on(...).subscribe()
      // (Realtime) sem que isso rebente o resto do init() da página — não
      // simula eventos reais, só evita "db.channel is not a function".
      channel: (_name) => {
        const chan = {
          on() { return chan; },
          subscribe() { return chan; },
          unsubscribe() { return chan; },
        };
        return chan;
      },
      removeChannel: () => {},
      // Mínimo necessário para páginas que fazem upload de ficheiros
      // (Storage) — não guarda bytes nenhuns, só regista o upload (nome,
      // tipo e tamanho do ficheiro realmente enviado) em
      // window.__uploadCalls, para os testes poderem confirmar, por
      // exemplo, que uma foto grande foi redimensionada/comprimida ANTES
      // de chegar aqui (assets/resize-image.js corre no browser real do
      // Playwright, não é mockado).
      storage: {
        from: (bucket) => ({
          upload: async (path, file, opts) => {
            window.__uploadCalls = window.__uploadCalls || [];
            window.__uploadCalls.push({
              bucket, path, opts,
              file: { name: file.name, type: file.type, size: file.size },
            });
            return { data: { path }, error: null };
          },
          getPublicUrl: (path) => ({
            data: { publicUrl: 'https://fake.supabase.co/storage/v1/object/public/' + path },
          }),
          // Links temporários (fotos privadas das mensagens): cfg().signedUrls
          // pode mapear caminho -> URL; por omissão devolve um URL falso.
          createSignedUrls: async (paths) => ({
            data: paths.map((p) => ({ path: p, signedUrl: (cfg().signedUrls || {})[p] || 'https://fake.supabase.co/signed/' + p, error: null })),
            error: null,
          }),
        }),
      },
      rpc: async (fnName, args) => {
        window.__rpcCalls = window.__rpcCalls || [];
        window.__rpcCalls.push({ fnName, args });
        const results = cfg().rpcResults || {};
        return { data: fnName in results ? results[fnName] : null, error: null };
      },
      from: (table) => {
        // Generic chainable query builder: ignores the actual filter values
        // (eq/not/gte/in/order/limit all just return `this`) and resolves,
        // when awaited/then-ed, using a canned response configured per table
        // via window.__testAuthConfig.tableData = { [table]: {data, count} }.
        // Good enough for pages that just read data to render — not a real
        // query engine.
        const builder = {
          _wantsCount: false,
          _headOnly: false,
          _singleMode: null, // null | 'maybe' | 'strict' — set by .maybeSingle()/.single()
          select(_cols, opts) {
            if (opts && opts.count) this._wantsCount = true;
            if (opts && opts.head) this._headOnly = true; // head:true = no rows, just the count
            return this;
          },
          eq() { return this; },
          neq() { return this; },
          not() { return this; },
          or() { return this; },
          gte() { return this; },
          gt() { return this; },
          lte() { return this; },
          lt() { return this; },
          in() { return this; },
          ilike() { return this; },
          order() { return this; },
          limit() { return this; },
          range() { return this; },
          // Como o SDK real: devolvem UMA linha (ou null), não o array
          // completo. Sem isto, código como
          // `const{data}=await db.from(x).select(...).maybeSingle(); if(data)...`
          // recebia sempre um array (mesmo vazio, que é truthy em JS) em vez
          // de null quando não há resultado — mascarando bugs reais e
          // testes que passavam sem exercer o caminho "não encontrado".
          maybeSingle() { this._singleMode = 'maybe'; return this; },
          single() { this._singleMode = 'strict'; return this; },
          // Encadeável como o SDK real (insert(...).select('id').single()) e
          // também "await"-ável diretamente. Devolve cfg().insertReturn (ou um
          // id falso) e cfg().insertError, se definidos.
          insert(row) {
            window.__insertCalls = window.__insertCalls || [];
            window.__insertCalls.push({ table, row });
            this._inserted = true;
            return this;
          },
          upsert(row, opts) {
            window.__upsertCalls = window.__upsertCalls || [];
            window.__upsertCalls.push({ table, row, opts });
            this._inserted = true;
            return this;
          },
          delete() {
            window.__deleteCalls = window.__deleteCalls || [];
            window.__deleteCalls.push({ table });
            return this;
          },
          update(patch) {
            // Não muta de facto `tableData` (seria uma query engine real) —
            // só regista a chamada para os testes verificarem o payload, e
            // continua a cadeia (.eq(...).then(...)) como as outras queries.
            window.__updateCalls = window.__updateCalls || [];
            window.__updateCalls.push({ table, patch });
            return this;
          },
          then(resolve, reject) {
            const scenario = (cfg().tableData || {})[table] || {};
            const rows = scenario.data || [];
            const count = scenario.count != null ? scenario.count : rows.length;
            let result;
            if (this._inserted) {
              result = cfg().insertError
                ? { data: null, error: { message: cfg().insertError } }
                : { data: this._singleMode ? (cfg().insertReturn || { id: 'fake-insert-id' }) : null, error: null };
            } else if (this._headOnly) {
              result = { data: null, count, error: null };
            } else if (this._wantsCount) {
              result = { data: rows, count, error: null };
            } else if (this._singleMode === 'maybe') {
              result = { data: rows[0] || null, error: null };
            } else if (this._singleMode === 'strict') {
              result = rows.length === 1
                ? { data: rows[0], error: null }
                : { data: null, error: { message: rows.length === 0 ? 'No rows found' : 'Multiple rows found' } };
            } else {
              result = { data: rows, error: null };
            }
            return Promise.resolve(result).then(resolve, reject);
          },
        };
        return builder;
      },
    };
  },
};
