import * as FileSystem from 'expo-file-system/legacy';
import { supabase } from '../supabase';
import * as Sentry from '@sentry/react-native';

export class TemplateManager {
  private static TEMPLATE_DIR = FileSystem.documentDirectory + 'templates/';

  /**
   * Initializes the directory and syncs templates from Supabase.
   */
  public static async syncTemplates(): Promise<void> {
    try {
      const dirInfo = await FileSystem.getInfoAsync(this.TEMPLATE_DIR);
      if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(this.TEMPLATE_DIR, { intermediates: true });
      }

      // Fetch from Supabase (assuming a 'pdf_templates' table exists with 'name' and 'html_content')
      // For now, fail silently offline, but update cache if online.
      const { data, error } = await supabase.from('pdf_templates').select('name, html_content');
      
      if (!error && data) {
        for (const template of data) {
          const filePath = this.TEMPLATE_DIR + template.name + '.html';
          await FileSystem.writeAsStringAsync(filePath, template.html_content, { encoding: FileSystem.EncodingType.UTF8 });
        }
      }
    } catch (error) {
      Sentry.captureException(error);
      console.log('Offline or error syncing templates', error);
    }
  }

  /**
   * Gets a template from the local cache. 
   * If it doesn't exist, returns a fallback default string.
   */
  public static async getTemplate(templateName: string, fallbackHtml: string): Promise<string> {
    try {
      const filePath = this.TEMPLATE_DIR + templateName + '.html';
      const fileInfo = await FileSystem.getInfoAsync(filePath);
      if (fileInfo.exists) {
        return await FileSystem.readAsStringAsync(filePath, { encoding: FileSystem.EncodingType.UTF8 });
      }
    } catch (error) {
      Sentry.captureException(error);
    }
    return fallbackHtml; // Default if completely offline and not cached yet
  }
}
