// Cliente Supabase falso com query-builder encadeável (thenable), para testar
// funções que fazem consultas mais ricas do que select().eq().maybeSingle().
//
// Cada consulta é registada em scenario.log como
//   { table, calls: [{ method, args }, ...] }
// e o resultado vem de scenario.queries[table](calls, log) — o teste decide o
// que a "base de dados" responde e depois inspeciona os filtros usados.
// Também suporta rpc() através de scenario.rpc[nome](args).
const METHODS = ['select', 'eq', 'neq', 'in', 'gte', 'lte', 'lt', 'gt', 'is', 'order', 'range', 'limit', 'update', 'insert', 'delete', 'not', 'ilike', 'or'];

function makeQueryableSupabase(scenario) {
  return function createClient() {
    return {
      auth: {
        getUser: async (token) => {
          if (!scenario.getUser) throw new Error('auth.getUser não configurado neste teste');
          return scenario.getUser(token);
        },
      },
      rpc: async (name, args) => {
        const fn = scenario.rpc && scenario.rpc[name];
        return fn ? fn(args) : { data: [], error: null };
      },
      from(table) {
        const calls = [];
        const entry = { table, calls };
        (scenario.log = scenario.log || []).push(entry);
        const builder = {};
        METHODS.forEach((method) => {
          builder[method] = (...args) => { calls.push({ method, args }); return builder; };
        });
        const run = () => {
          const handler = scenario.queries && scenario.queries[table];
          return Promise.resolve(handler ? handler(calls, entry) : { data: [], error: null });
        };
        builder.maybeSingle = async () => {
          const r = await run();
          return { data: Array.isArray(r.data) ? (r.data[0] || null) : r.data, error: r.error || null };
        };
        builder.then = (resolve, reject) => run().then(resolve, reject);
        return builder;
      },
    };
  };
}

module.exports = { makeQueryableSupabase };
