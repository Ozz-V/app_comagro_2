import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { documentDirectory, moveAsync } from 'expo-file-system/legacy';
import { APP_CONSTANTS } from '../config/constants';
import { supabase } from '../supabase';
import { getTemplate, renderTemplate } from '../services/templateService';

function getPeakHour(rows: any[]) {
  if (!rows || rows.length === 0) return 'Sin actividad';
  const hours = new Array(24).fill(0);
  rows.forEach(r => {
    if (r.created_at) {
      const h = new Date(r.created_at).getHours();
      hours[h]++;
    }
  });
  let maxH = 0;
  for (let i = 1; i < 24; i++) {
    if (hours[i] > hours[maxH]) maxH = i;
  }
  if (hours[maxH] === 0) return 'Sin actividad';
  const hEnd = (maxH + 1) % 24;
  return `${maxH.toString().padStart(2, '0')}:00 - ${hEnd.toString().padStart(2, '0')}:00`;
}

function processUserStats(rows: any[]) {
  let views = 0;
  let sharesPdf = 0;
  let sharesImg = 0;
  const prodMap: Record<string, { count: number; marca: string }> = {};
  const brandMap: Record<string, number> = {};

  rows.forEach(r => {
    if (r.action === 'view') views++;
    else if (r.action === 'share_pdf') sharesPdf++;
    else if (r.action === 'share_image') sharesImg++;

    const mSku = r.modelo || r.sku || r.marca;
    if (mSku) {
      if (!prodMap[mSku]) prodMap[mSku] = { count: 0, marca: r.marca || '' };
      prodMap[mSku].count++;
    }
    if (r.marca) {
      brandMap[r.marca] = (brandMap[r.marca] || 0) + 1;
    }
  });

  const topProds = Object.entries(prodMap)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 5)
    .map(x => ({ sku: x[0], count: x[1].count, marca: x[1].marca }));

  const topBrands = Object.entries(brandMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(x => ({ marca: x[0], count: x[1] }));

  return { views, sharesPdf, sharesImg, sharesTotal: sharesPdf + sharesImg, topProds, topBrands, peak: getPeakHour(rows) };
}

export async function generateUserGridPdf(
  selectedEmails: string[],
  globalRawData: any[],
  directoryUsers: any[],
  periodLabel: string,
  imageMap: Record<string, string> = {},
  productBrandMap: Record<string, string> = {}
) {
  let pDate = new Date();
  if (periodLabel === 'Hoy') {
    pDate.setHours(0, 0, 0, 0);
  } else if (periodLabel === 'Ultimos 7 dias' || periodLabel === 'Últimos 7 días') {
    pDate.setDate(pDate.getDate() - 7);
  } else if (periodLabel === 'Ultimos 30 dias' || periodLabel === 'Últimos 30 días') {
    pDate.setDate(pDate.getDate() - 30);
  } else {
    pDate = new Date(0);
  }
  
  // Fetch fresh data directly for these users
  const chunkSize = 50;
  let allRawData: any[] = [];
  
  for (let i = 0; i < selectedEmails.length; i += chunkSize) {
    const chunk = selectedEmails.slice(i, i + chunkSize);
    const { data, error } = await supabase
      .from('producto_analytics')
      .select('modelo,marca,sku,action,user_email,created_at')
      .in('user_email', chunk)
      .gte('created_at', pDate.toISOString())
      .limit(20000); // safety limit per chunk
      
    if (!error && data) {
      allRawData = allRawData.concat(data);
    }
  }
  
  const filteredData = allRawData;

  const usersData = selectedEmails.map(email => {
    const rows = filteredData.filter(r => r.user_email === email);
    const stats = processUserStats(rows);
    const profile = directoryUsers.find(u => u.email === email);
    return {
      email,
      name: profile?.full_name || email.split('@')[0],
      stats
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