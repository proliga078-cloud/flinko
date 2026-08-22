// Fábrica de clientes "stripe" e "supabase" falsos para os testes das
// funções Netlify. Cada teste configura um `scenario` (objecto simples com
// funções) e passa-o para makeFakeStripe/makeFakeSupabaseAdmin — os
// métodos do cliente falso limitam-se a chamar essas funções, para que o
// próprio teste controle o que a "API externa" responde e possa verificar
// exactamente com que argumentos foi chamada.

function makeFakeStripe(scenario) {
  return function FakeStripeConstructor(_secretKey) {
    return {
      checkout: {
        sessions: {
          create: async (params) => {
            if (!scenario.checkoutSessionsCreate) throw new Error('checkout.sessions.create não configurado neste teste');
            return scenario.checkoutSessionsCreate(params);
          },
        },
      },
      billingPortal: {
        sessions: {
          create: async (params) => {
            if (!scenario.billingPortalSessionsCreate) throw new Error('billingPortal.sessions.create não configurado neste teste');
            return scenario.billingPortalSessionsCreate(params);
          },
        },
      },
      subscriptions: {
        retrieve: async (id) => {
          if (!scenario.subscriptionsRetrieve) throw new Error('subscriptions.retrieve não configurado neste teste');
          return scenario.subscriptionsRetrieve(id);
        },
        cancel: async (id) => {
          if (!scenario.subscriptionsCancel) throw new Error('subscriptions.cancel não configurado neste teste');
          return scenario.subscriptionsCancel(id);
        },
      },
      charges: {
        retrieve: async (id) => {
          if (!scenario.chargesRetrieve) throw new Error('charges.retrieve não configurado neste teste');
          return scenario.chargesRetrieve(id);
        },
        list: async (params) => {
          if (!scenario.chargesList) throw new Error('charges.list não configurado neste teste');
          return scenario.chargesList(params);
        },
      },
      refunds: {
        create: async (params) => {
          if (!scenario.refundsCreate) throw new Error('refunds.create não configurado neste teste');
          return scenario.refundsCreate(params);
        },
      },
      webhooks: {
        constructEvent: (payload, sig, secret) => {
          if (!scenario.constructEvent) throw new Error('webhooks.constructEvent não configurado neste teste');
          return scenario.constructEvent(payload, sig, secret);
        },
      },
    };
  };
}

function makeFakeSupabaseAdmin(scenario) {
  return function createClient(_url, _key) {
    return {
      auth: {
        getUser: async (token) => {
          if (!scenario.getUser) throw new Error('auth.getUser não configurado neste teste');
          return scenario.getUser(token);
        },
      },
      from: (table) => ({
        select: (cols) => ({
          eq: (col, val) => ({
            maybeSingle: async () => {
              if (!scenario.selectMaybeSingle) throw new Error('from().select().eq().maybeSingle() não configurado neste teste');
              return scenario.selectMaybeSingle({ table, cols, col, val });
            },
          }),
        }),
        update: (patch) => ({
          eq: (col, val) => {
            scenario.updateCalls = scenario.updateCalls || [];
            scenario.updateCalls.push({ table, patch, col, val });
            return Promise.resolve({ data: null, error: null });
          },
        }),
      }),
    };
  };
}

module.exports = { makeFakeStripe, makeFakeSupabaseAdmin };
