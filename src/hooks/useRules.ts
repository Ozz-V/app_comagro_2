import { useState, useEffect } from 'react';
import { getRules, fetchRemoteRules, DEFAULT_RULES } from '../services/rulesService';

export function useRules() {
  const [rules, setRules] = useState(DEFAULT_RULES);

  useEffect(() => {
    // 1. Cargar cache al instante (offline first)
    getRules().then(cachedRules => {
      setRules(cachedRules);
      
      // 2. Preguntar a Supabase si hay versión más nueva de fondo
      fetchRemoteRules().then(remoteRules => {
         if (remoteRules && JSON.stringify(remoteRules) !== JSON.stringify(cachedRules)) {
            setRules(remoteRules);
         }
      });
    });
  }, []);

  return rules;
}
