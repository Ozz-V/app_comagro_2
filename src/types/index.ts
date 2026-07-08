export interface Product {
  sku: string;
  sales_pitch?: string;
  embedding?: number[];
  [key: string]: any; // Allow dynamic fields from CSV (like "Nombre del Producto")
}

export interface ParsedProduct {
  modelo: string;
  marca: string;
  subcategoria: string;
  imagen: string;
  imagenOriginal: string;
  specs: [string, string][];
  sales_pitch: string;
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
