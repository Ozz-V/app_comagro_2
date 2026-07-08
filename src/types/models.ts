export type SpecTuple = [string, string];

export interface Product {
  sku: string;
  marca: string;
  subcategoria: string;
  imagen: string;
  imagenOriginal: string;
  specs_json: string;
  search_text: string;
  sales_pitch: string;
  [key: string]: unknown; // Allow generic keys for raw DB row
}

export interface ParsedProduct {
  modelo: string;
  marca: string;
  subcategoria: string;
  imagen: string;
  imagenOriginal: string;
  specs: SpecTuple[];
  sales_pitch: string;
}

export interface CalcProduct extends ParsedProduct {
  calcVal: number;
}

export interface CompareItem extends ParsedProduct {}

export interface PumpWizardState {
  step: number;
  type: string;
  appType: string;
  waterType: string;
  params: Record<string, unknown>;
}

export interface Profile {
  id: string;
  nombre: string;
  apellidos: string;
  email: string;
  telefono?: string;
  whatsapp?: string;
  empresa?: string;
  cargo?: string;
  vendedor_asignado?: string;
  estado?: string;
  updated_at?: string;
  created_at?: string;
}

export interface WizardState {
  hasCompletedWizard: boolean;
  role: 'sales' | 'customer' | 'admin' | null;
  preferences: string[];
}

export interface AnalyticsRPCItem {
  marca: string;
  sku: string;
  count: number;
  [key: string]: unknown;
}

export interface AnalyticsRankItem {
  marca?: string;
  modelo?: string;
  sku?: string;
  count: number;
}
