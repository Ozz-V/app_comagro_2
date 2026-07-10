import { useState, useCallback } from 'react';
import { fetchAiPitch } from '../services/catalogService';

const MSG_NO_SKU    = 'Texto inteligente en preparación.';
const MSG_NO_NET    = 'ℹ️ El Asistente IA requiere conexión a internet para descargar este texto por primera vez. Cuando tengas red, se guardará aquí.';
const MSG_SLOW_NET  = 'ℹ️ Sin conexión o red lenta. El Asistente IA requiere internet para descargar este texto por primera vez. Cuando vuelva la conexión, se mostrará aquí.';

export function useAiData() {
  const [aiData, setAiData] = useState<string | null>(null);
  const [loadingAi, setLoadingAi] = useState(false);

  const fetchAiData = useCallback(async (sku: string | null, offlinePitch?: string | null) => {
    if (!sku) {
      setAiData(MSG_NO_SKU);
      return;
    }

    if (offlinePitch && offlinePitch.trim().length > 0) {
      setAiData(offlinePitch);
      return;
    }

    setLoadingAi(true);
    try {
      const result = await fetchAiPitch(sku);
      setAiData(result.pitch ?? MSG_NO_NET);
    } catch {
      setAiData(MSG_SLOW_NET);
    } finally {
      setLoadingAi(false);
    }
  }, []);

  return { aiData, setAiData, loadingAi, fetchAiData };
}
