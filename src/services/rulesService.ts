import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../supabase';

const RULES_CACHE_KEY = '@calculadora_reglas_cache_v1';

export const DEFAULT_RULES = {
  version: '1.0',
  matematica: {
    divisorHpTeorico: 1915.2,
    divisorHpBomba: 3150.0,
    margenSeguridadMotor: 1.25
  },
  filtros: {
    vivienda: {
      maxHp: 3,
      maxCaudalLpm: 165
    },
    industrial: {
      minHp: 3
    }
  },
  toleranciasBusqueda: {
    rangoCaudalMin: 0.75,
    rangoCaudalMax: 1.50,
    rangoAlturaMin: 0.75,
    rangoAlturaMax: 1.50,
    penalizacionFaseIncorrecta: 0.15,
    bonificacionMarcaPreferida: 0.30
  },
  palabrasClave: {
    ejeLibre: ['EJE LIBRE', 'SIN MOTOR', 'CUERPO SUMERGIBLE'],
    combustion: ['NAFTA', 'DIESEL', 'DIÉSEL', 'GASOLINA', 'COMBUSTIÓN']
  },
  categorias: [
    {
      id: 'vivienda',
      title: 'Vivienda / uso general',
      subtitle: 'Hogares, presurización, piletas y pozos domésticos.',
      tipos: ['BOMBA DE AGUA', 'MOTOBOMBA CENTRÍFUGA', 'MOTOBOMBA AUTOCEBANTE', 'BOMBAS ELECTRICAS CON INVERSOR', 'MOTOBOMBA VIBRATORIA', 'BOMBA PARA PISCINA', 'MOTOBOMBA RECIRCULADORA', 'ELECTROBOMBA SUMERGIBLE MONOBLOQUE']
    },
    {
      id: 'riego_presion',
      title: 'Alta presión / industrial',
      subtitle: 'Procesos industriales, sistemas de gran caudal y riego agrícola.',
      tipos: ['BOMBA DE AGUA', 'MOTOBOMBA CENTRÍFUGA', 'MOTOBOMBA AUTOCEBANTE', 'BOMBA A COMBUSTIÓN', 'MOTOBOMBA VIBRATORIA', 'CUERPO SUMERGIBLE', 'ELECTROBOMBAS SUMERGIDAS MULTIETAPAS'],
      pref: ['MULTIETAPAS', 'MEGANORM', 'SPY', 'BIROTOR', 'CENTRÍFUGA EJE LIBRE']
    },
    {
      id: 'pozo',
      title: 'Pozo / napa subterránea',
      subtitle: 'Extracción profunda de napas, desde artesianos hasta usos industriales.',
      tipos: ['ELECTROBOMBA SUMERGIBLE MONOBLOQUE', 'ELECTROBOMBAS SUMERGIDAS MULTIETAPAS', 'MOTOBOMBA SUMERGIBLE DE TORNILLO', 'MOTOBOMBA INYECTORA', 'BOMBA SUMERGIBLE SOLAR', 'CUERPO SUMERGIBLE']
    },
    {
      id: 'drenaje',
      title: 'Agua sucia / desagote',
      subtitle: 'Drenaje de sótanos, aguas servidas y achique de obras.',
      tipos: ['BOMBA DE DRENAJE', 'BOMBA DE ACHIQUE']
    },
    {
      id: 'combustion',
      title: 'Sin electricidad en el lugar',
      subtitle: 'Equipos a combustión para zonas sin red eléctrica.',
      tipos: ['BOMBA A COMBUSTIÓN'],
      forzarCombustible: true
    }
  ]
};

export async function fetchRemoteRules() {
  try {
    const { data, error } = await supabase
      .from('calculadora_config')
      .select('reglas')
      .eq('id_regla', 'reglas_maestras')
      .single();
      
    if (error) {
      console.warn('No se pudieron cargar reglas remotas:', error.message);
      return null;
    }
    if (data && data.reglas) {
      await AsyncStorage.setItem(RULES_CACHE_KEY, JSON.stringify(data.reglas));
      return data.reglas;
    }
  } catch (err) {
    console.error('Error inesperado fetchRemoteRules:', err);
  }
  return null;
}

export async function getRules() {
  try {
    const cached = await AsyncStorage.getItem(RULES_CACHE_KEY);
    if (cached) {
      return JSON.parse(cached);
    }
  } catch (err) {
    console.warn('Error leyendo cache de reglas:', err);
  }
  return DEFAULT_RULES;
}
