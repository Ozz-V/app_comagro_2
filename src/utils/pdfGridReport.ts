import * as Print from 'expo-print';
import { documentDirectory, moveAsync } from 'expo-file-system/legacy';
import { supabase } from '../supabase';
import { getTemplate, renderTemplate } from '../services/templateService';

// ============================================================================
// REESCRITO 2026-09-19: antes esta función traía TODOS los eventos crudos de
// producto_analytics para los usuarios seleccionados (paginando del lado del
// cliente) y calculaba vistas/compartidos/top productos/top marcas/hora pico
// en JavaScript. Eso duplicaba lógica que ya existe en el servidor y fue la
// causa de un bug real: un límite fijo compartido entre usuarios sin ORDER BY
// hacía que, al seleccionar "Todos", algunos usuarios salieran en cero.
//
// Ahora todo el cálculo lo hace Postgres en una sola llamada RPC
// (get_users_report_batch), que devuelve por cada usuario sus totales, top 5
// productos, top 5 marcas y hora pico ya agregados. La app no vuelve a tocar
// un evento crudo para armar este reporte.
// ============================================================================

interface UserReportRow {
  user_email: string;
  views: number;
  shares_pdf: number;
  shares_img: number;
  top_products: { sku: string; marca: string; count: number }[];
  top_brands: { marca: string; count: number }[];
  peak_hour: string;
}

function periodLabelToCode(periodLabel: string): 'today' | '7d' | '30d' | 'all' {
  if (periodLabel === 'Hoy') return 'today';
  if (periodLabel === 'Ultimos 7 dias' || periodLabel === 'Últimos 7 días') return '7d';
  if (periodLabel === 'Ultimos 30 dias' || periodLabel === 'Últimos 30 días') return '30d';
  return 'all';
}

export async function generateUserGridPdf(
  selectedEmails: string[],
  periodCode: 'today' | '7d' | '30d' | 'all' | undefined,
  directoryUsers: any[],
  periodLabel: string,
  imageMap: Record<string, string> = {},
  productBrandMap: Record<string, string> = {}
) {
  // Compatibilidad: si quien llama todavía no pasa el código de período
  // explícito, lo derivamos del label legible (mismo comportamiento previo).
  const p_period = periodCode || periodLabelToCode(periodLabel);

  // Postgres soporta miles de emails en un ANY($1), pero se trocea igual
  // por prolijidad/latencia de la llamada RPC individual.
  const chunkSize = 200;
  const rowsByEmail = new Map<string, UserReportRow>();

  for (let i = 0; i < selectedEmails.length; i += chunkSize) {
    const chunk = selectedEmails.slice(i, i + chunkSize);
    const { data, error } = await supabase.rpc('get_users_report_batch', {
      p_emails: chunk,
      p_period,
    });
    if (error) {
      console.error('Error en get_users_report_batch', error);
      throw error;
    }
    (data || []).forEach((row: UserReportRow) => rowsByEmail.set(row.user_email, row));
  }

  const usersData = selectedEmails.map(email => {
    const row = rowsByEmail.get(email);
    const profile = directoryUsers.find(u => u.email === email);
    const views = Number(row?.views || 0);
    const sharesPdf = Number(row?.shares_pdf || 0);
    const sharesImg = Number(row?.shares_img || 0);
    return {
      email,
      name: profile?.full_name || email.split('@')[0],
      stats: {
        views,
        sharesPdf,
        sharesImg,
        sharesTotal: sharesPdf + sharesImg,
        topProds: (row?.top_products || []).map(p => ({ sku: p.sku, count: Number(p.count), marca: p.marca || '' })),
        topBrands: (row?.top_brands || []).map(b => ({ marca: b.marca, count: Number(b.count) })),
        peak: row?.peak_hour || 'Sin actividad',
      },
    };
  });

  usersData.sort((a, b) => (b.stats.views + b.stats.sharesTotal) - (a.stats.views + a.stats.sharesTotal));

  let cardsHtml = '';
  const fallbackImg = 'https://comagro.com.bo/static/media/logo-comagro.84d53ed4.png';

  usersData.forEach(ud => {

    let prodsHtml = ud.stats.topProds.map((p, idx) => {
      const imgUrl = imageMap[p.sku] || fallbackImg;
      return `
      <div class="list-item">
        <span class="rank">${idx + 1}</span>
        <img src="${imgUrl}" class="item-img" onerror="this.src='${fallbackImg}'" />
        <div class="item-text">
          <div class="item-name">${p.sku}</div>
          <div class="item-sub">${p.marca}</div>
        </div>
        <div class="item-count-box">${p.count} acc.</div>
      </div>
    `}).join('');
    if (!prodsHtml) prodsHtml = '<div class="empty-state">No hay productos interactuados</div>';

    let brandsHtml = ud.stats.topBrands.map((b, idx) => {
      const logoUrl = productBrandMap[b.marca] || fallbackImg;
      return `
      <div class="list-item">
        <span class="rank">${idx + 1}</span>
        <img src="${logoUrl}" class="brand-img" onerror="this.src='${fallbackImg}'" />
        <div class="item-text">
          <div class="item-name">${b.marca}</div>
        </div>
        <div class="item-count-box">${b.count} acc.</div>
      </div>
    `}).join('');
    if (!brandsHtml) brandsHtml = '<div class="empty-state">No hay marcas interactuadas</div>';

    cardsHtml += `
      <div class="card">
        <div class="card-header">
          <div class="avatar">${ud.name.charAt(0).toUpperCase()}</div>
          <div class="user-info">
            <div class="card-name">${ud.name}</div>
            <div class="card-email">${ud.email}</div>
          </div>
          <div class="peak-badge">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#F5A623" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
            Pico: <strong>${ud.stats.peak}</strong>
          </div>
        </div>

        <div class="kpi-container">
          <div class="kpi-box views">
            <div class="kpi-val">${ud.stats.views}</div>
            <div class="kpi-label">Vistas Totales</div>
          </div>
          <div class="kpi-box shares">
            <div class="kpi-val">${ud.stats.sharesTotal}</div>
            <div class="kpi-label">Comp. Totales</div>
          </div>
          <div class="kpi-box details">
            <div class="kpi-val">${ud.stats.sharesPdf}</div>
            <div class="kpi-label">PDFs Enviados</div>
          </div>
          <div class="kpi-box details">
            <div class="kpi-val">${ud.stats.sharesImg}</div>
            <div class="kpi-label">Imágenes Env.</div>
          </div>
        </div>

        <div class="lists-wrapper">
          <div class="list-column">
            <div class="list-header">Top 5 Productos</div>
            <div class="list-body">
              ${prodsHtml}
            </div>
          </div>
          <div class="list-column">
            <div class="list-header">Top 5 Marcas</div>
            <div class="list-body">
              ${brandsHtml}
            </div>
          </div>
        </div>
      </div>
    `;
  });


  const templateObj = await getTemplate('user_grid_report');
  const html = renderTemplate(templateObj.html, {
    reportTitle: 'Reporte de Usuarios',
    periodLabel: periodLabel,
    logoUrl: 'https://www.chacomer.com.py/media/wysiwyg/comagro/ISOLOGO_COMAGRO_COLOR.png',
    cardsHtml: cardsHtml,
    footerText: `Generado automáticamente desde Comagro App | ${new Date().toLocaleString()}`
  });

  try {
    const { uri } = await Print.printToFileAsync({ html, base64: false });
    const targetPath = documentDirectory + `Reporte_Usuarios_${new Date().getTime()}.pdf`;
    await moveAsync({ from: uri, to: targetPath });
    return targetPath;
  } catch (error) {
    console.error('Print.printToFileAsync failed', error);
    throw error;
  }
}
