import { extractIntent, getEmbedding, vectorSearch } from '../supabase/functions/chat/search';

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

      const res = await extractIntent('Quiero una bomba de agua', 'dummy-key');
      expect(res).toEqual(['bomba de agua']);
    });

    it('returns null on fetch error or invalid json', async () => {
      global.fetch = jest.fn().mockResolvedValue({ ok: false });
      const res = await extractIntent('bad request', 'dummy-key');
      expect(res).toBeNull();
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

      const res = await getEmbedding('bomba', 'dummy-key', supaAdmin);
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

      const res = await getEmbedding('bomba', 'dummy-key', supaAdmin);
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
