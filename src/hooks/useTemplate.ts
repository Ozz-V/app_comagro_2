import { useState, useEffect } from 'react';
import { getTemplate, fetchRemoteTemplate, DEFAULT_TEMPLATES, TemplateId, PdfTemplate } from '../services/templateService';

export function useTemplate(id: TemplateId): PdfTemplate {
  const [tpl, setTpl] = useState<PdfTemplate>(DEFAULT_TEMPLATES[id]);

  useEffect(() => {
    // 1. Cargar cache al instante (offline first)
    getTemplate(id).then(cachedTpl => {
      setTpl(cachedTpl);

      // 2. Preguntar a Supabase si hay versión más nueva de fondo
      fetchRemoteTemplate(id).then(remoteTpl => {
        if (remoteTpl && remoteTpl.version !== cachedTpl.version) {
          setTpl(remoteTpl);
        }
      });
    });
  }, [id]);

  return tpl;
}
