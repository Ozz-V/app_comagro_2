declare module 'expo-sqlite' {
  export interface SQLiteDatabase {
    getAllAsync<T = any>(query: string, params?: any[]): Promise<T[]>;
    getFirstAsync<T = any>(query: string, params?: any[]): Promise<T | null>;
    execAsync(query: string): Promise<void>;
    closeAsync(): Promise<void>;
    withTransactionAsync(callback: () => Promise<void>): Promise<void>;
    runAsync(query: string, params?: any[]): Promise<any>;
  }
  export function openDatabaseSync(name: string): SQLiteDatabase;
  export function openDatabaseAsync(name: string): Promise<SQLiteDatabase>;
  export function deleteDatabaseAsync(name: string): Promise<void>;
}

declare module 'expo-notifications' {
  export function setNotificationHandler(handler: any): void;
  export function requestPermissionsAsync(): Promise<{ status: string }>;
  export function getPermissionsAsync(): Promise<{ status: string }>;
  export function getExpoPushTokenAsync(options?: any): Promise<{ data: string }>;
  export function clearLastNotificationResponseAsync(): Promise<void>;
  export function getLastNotificationResponseAsync(): Promise<any>;
  export function addNotificationResponseReceivedListener(listener: (response: any) => void): { remove: () => void };
  export function setNotificationChannelAsync(channelId: string, channel: any): Promise<void>;
  export const AndroidImportance: { MAX: number, HIGH: number, DEFAULT: number, LOW: number, MIN: number };
}