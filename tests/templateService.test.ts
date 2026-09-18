import { renderTemplate, DEFAULT_TEMPLATES } from '../src/services/templateService';

describe('renderTemplate', () => {
  it('replaces every occurrence of a placeholder', () => {
    const out = renderTemplate('<b>{{x}}</b> - {{x}} again', { x: 'hola' });
    expect(out).toBe('<b>hola</b> - hola again');
  });

  it('replaces an explicit undefined/null value with an empty string', () => {
    const out = renderTemplate('<b>{{x}}</b>', { x: undefined as unknown as string });
    expect(out).toBe('<b></b>');
  });

  it('does not touch placeholders that were not provided', () => {
    const out = renderTemplate('{{a}}-{{b}}', { a: '1' });
    expect(out).toBe('1-{{b}}');
  });
});

describe('DEFAULT_TEMPLATES.stats_report', () => {
  it('contains every placeholder the component fills in', () => {
    const html = DEFAULT_TEMPLATES.stats_report.html;
    const required = [
      '{{reportTitle}}', '{{periodLabel}}', '{{logoUrl}}',
      '{{viewsTotal}}', '{{sharesTotal}}', '{{usersKpiCardHtml}}',
      '{{listsGridHtml}}', '{{footerText}}',
    ];
    required.forEach(p => expect(html).toContain(p));
  });

  it('renders into valid-looking HTML with no leftover placeholders once all keys are provided', () => {
    const rendered = renderTemplate(DEFAULT_TEMPLATES.stats_report.html, {
      reportTitle: 'Reporte de Estadísticas - Mi Actividad',
      periodLabel: 'Hoy',
      logoUrl: 'https://example.com/logo.png',
      viewsTotal: '10',
      sharesTotal: '2',
      usersKpiCardHtml: '',
      listsGridHtml: '<div class="list-card"></div>',
      footerText: 'Generado automáticamente desde Comagro App',
    });
    expect(rendered).not.toContain('{{');
    expect(rendered).toContain('<img src="https://example.com/logo.png"');
  });
});
