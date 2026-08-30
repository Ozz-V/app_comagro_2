// @ts-nocheck
Object.defineProperty(global, 'Deno', {
  value: { env: { get: () => 'mock-key' } },
  writable: true
});
const { extractIntent, getEmbedding, vectorSearch } = require('../supabase/functions/chat/search');

describe('Edge Function: search', () => {
  let originalFetch: any;

  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.clearAllMocks();
  });

  describe('extractIntent', () => {
    it('returns parsed intent from Gemini', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          candidates: [{ content: { parts: [{ text: '["bomba de agua"]' }] } }]
        })
      });

      const res = await extractIntent('Quiero una bomba de agua');
      // Contrato nuevo: cada grupo es { terms, target } (antes era un array
      // plano de strings). extractIntent sigue aceptando el formato viejo
      // de Gemini (array de strings sueltos, sin 'quantity') por
      // compatibilidad -- lo envuelve como { terms: [...], target: null }.
      expect(res).toEqual([{ terms: ['bomba de agua'], target: null }]);
    });

    it('returns null on fetch error or invalid json', async () => {
      global.fetch = jest.fn().mockResolvedValue({ ok: false, text: async () => 'error' });
      const res = await extractIntent('bad request');
      expect(res).toBeNull();
    });

    it('converts amperios a kVA monofásico para un pedido residencial (caso de regresión: antes ofrecía generadores trifásicos de 45-88 kVA para una casa)', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          candidates: [{
            content: {
              parts: [{
                text: JSON.stringify([
                  {
                    terms: ['generador', 'generadores', 'grupo electrogeno', 'planta electrica'],
                    quantity: { value: 50, unit: 'amperios' }
                  }
                ])
              }]
            }
          }]
        })
      });

      const res = await extractIntent(
        'user: Necesito alimentar con energia mi casa y me dijeron que necesito mas o menos 50 A'
      );

      expect(res).toHaveLength(1);
      const [group] = res;

      // El target debe quedar en kVA monofásico (50A * 220V / 1000 = 11kVA),
      // NO trifásico -- porque el contexto dice "mi casa" (residencial) y
      // no menciona nada de fábrica/industria/trifásico.
      expect(group.target).toEqual({ value: 11, unit: 'kva' });

      // Las variantes de texto para la búsqueda deben incluir el valor
      // convertido, y NO deben inventar una rama trifásica sin que el
      // contexto la pida.
      expect(group.terms).toEqual(expect.arrayContaining(['generador 11 kva']));
      expect(group.terms.some((t: string) => t.includes('trifasico'))).toBe(false);
    });

    it('usa trifásico 380V cuando el contexto es explícitamente industrial', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          candidates: [{
            content: {
              parts: [{
                text: JSON.stringify([
                  {
                    terms: ['generador', 'generadores'],
                    quantity: { value: 50, unit: 'amperios' }
                  }
                ])
              }]
            }
          }]
        })
      });

      const res = await extractIntent(
        'user: Necesito un generador de 50 A para mi fabrica, es trifasico'
      );

      const [group] = res;
      // 50A * 380V * sqrt(3) / 1000 ≈ 32.9 kVA
      expect(group.target.unit).toBe('kva');
      expect(group.target.value).toBeCloseTo(32.9, 1);
    });
  });

  describe('getEmbedding', () => {
    it('returns from cache if found', async () => {
      const supaAdmin = {
        from: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({ data: { embedding: [0.1, 0.2, 0.3] } })
            })
          })
        })
      };

      const res = await getEmbedding('bomba', supaAdmin);
      expect(res.cacheHit).toBe(true);
      expect(res.embedding).toEqual([0.1, 0.2, 0.3]);
    });

    it('fetches from Gemini if not in cache', async () => {
      const supaAdmin = {
        from: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              single: jest.fn().mockRejectedValue(new Error('not found'))
            })
          }),
          insert: jest.fn().mockResolvedValue({ catch: jest.fn() })
        })
      };

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ embedding: { values: [0.9, 0.8] } })
      });

      const res = await getEmbedding('bomba', supaAdmin);
      expect(res.cacheHit).toBe(false);
      expect(res.embedding).toEqual([0.9, 0.8]);
      expect(supaAdmin.from).toHaveBeenCalledWith('search_embeddings_cache');
    });
  });

  describe('vectorSearch', () => {
    it('returns products and knowledge', async () => {
      const supabase = {
        rpc: jest.fn().mockImplementation((name) => {
          if (name === 'buscar_productos_ia') return Promise.resolve({ data: [{ sku: 'P1' }] });
          if (name === 'buscar_conocimiento_ia') return Promise.resolve({ data: [{ rule: 'R1' }] });
        })
      };

      const res = await vectorSearch(supabase, [0.1]);
      expect(res.products).toHaveLength(1);
      expect(res.products[0].sku).toBe('P1');
      expect(res.knowledge).toHaveLength(1);
    });

    it('returns empty arrays on error', async () => {
      const supabase = {
        rpc: jest.fn().mockRejectedValue(new Error('DB error'))
      };

      const consoleError = console.error;
      console.error = jest.fn();

      const res = await vectorSearch(supabase, [0.1]);
      expect(res.products).toHaveLength(0);
      expect(res.knowledge).toHaveLength(0);

      console.error = consoleError;
    });
  });
});
