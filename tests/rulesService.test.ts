import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../src/supabase';
import { fetchRemoteRules, getRules, DEFAULT_RULES } from '../src/services/rulesService';

const CACHE_KEY = '@calculadora_reglas_cache_v1';

describe('rulesService', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  // ── fetchRemoteRules ───────────────────────────────────────────────
  describe('fetchRemoteRules', () => {
    it('devuelve las reglas remotas y las cachea si la consulta es exitosa', async () => {
      const reglasRemotas = { version: '2.0', matematica: {} };
      (supabase.from as jest.Mock).mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: { reglas: reglasRemotas }, error: null }),
      });

      const result = await fetchRemoteRules();

      expect(result).toEqual(reglasRemotas);
      const cached = await AsyncStorage.getItem(CACHE_KEY);
      expect(JSON.parse(cached as string)).toEqual(reglasRemotas);
    });

    it('devuelve null y no cachea nada si Supabase responde con error', async () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      (supabase.from as jest.Mock).mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: null, error: { message: 'boom' } }),
      });

      const result = await fetchRemoteRules();

      expect(result).toBeNull();
      expect(await AsyncStorage.getItem(CACHE_KEY)).toBeNull();
      expect(warnSpy).toHaveBeenCalledWith('No se pudieron cargar reglas remotas:', 'boom');
    });

    it('devuelve null si la respuesta no trae data.reglas', async () => {
      (supabase.from as jest.Mock).mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: null, error: null }),
      });

      const result = await fetchRemoteRules();

      expect(result).toBeNull();
    });

    it('devuelve null y loguea si supabase.from tira una excepción', async () => {
      const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      (supabase.from as jest.Mock).mockImplementationOnce(() => {
        throw new Error('network down');
      });

      const result = await fetchRemoteRules();

      expect(result).toBeNull();
      expect(errorSpy).toHaveBeenCalledWith('Error inesperado fetchRemoteRules:', expect.any(Error));
    });
  });

  // ── getRules ─────────────────────────────────────────────────────
  describe('getRules', () => {
    it('devuelve las reglas cacheadas si existen', async () => {
      const cacheadas = { version: '1.5', matematica: {} };
      await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(cacheadas));

      const result = await getRules();

      expect(result).toEqual(cacheadas);
    });

    it('devuelve DEFAULT_RULES si no hay nada cacheado', async () => {
      const result = await getRules();

      expect(result).toEqual(DEFAULT_RULES);
    });

    it('devuelve DEFAULT_RULES si la caché tiene JSON corrupto', async () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      await AsyncStorage.setItem(CACHE_KEY, '{json-invalido');

      const result = await getRules();

      expect(result).toEqual(DEFAULT_RULES);
      expect(warnSpy).toHaveBeenCalled();
    });
  });
});
