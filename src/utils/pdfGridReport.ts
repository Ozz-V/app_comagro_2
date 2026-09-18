import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';
import { APP_CONSTANTS } from '../config/constants';

// Helper to calculate peak hour
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

// Processing logic per user
function processUserStats(rows: any[]) {
  let views = 0;
  let shares = 0;
  const prodMap: Record<string, { count: number; marca: string }> = {};
  const brandMap: Record<string, number> = {};

  rows.forEach(r => {
    if (r.action === 'view') views++;
    else if (r.action === 'share_pdf' || r.action === 'share_image') shares++;

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
    .slice(0, 3)
    .map(x => ({ sku: x[0], count: x[1].count, marca: x[1].marca }));

  const topBrands = Object.entries(brandMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(x => ({ marca: x[0], count: x[1] }));

  return { views, shares, topProds, topBrands, peak: getPeakHour(rows) };
}

export async function generateUserGridPdf(
  selectedEmails: string[],
  globalRawData: any[],
  directoryUsers: any[],
  periodLabel: string
) {
  // 1. Group data by user
  const usersData = selectedEmails.map(email => {
    const rows = globalRawData.filter(r => r.user_email === email);
    const stats = processUserStats(rows);
    const profile = directoryUsers.find(u => u.email === email);
    return {
      email,
      name: profile?.full_name || email.split('@')[0],
      stats
    };
  });

  // Sort by activity (views + shares) descending
  usersData.sort((a, b) => (b.stats.views + b.stats.shares) - (a.stats.views + a.stats.shares));

  // 2. Build HTML
  let cardsHtml = '';
  usersData.forEach(ud => {
    
    let prodsHtml = ud.stats.topProds.map(p => 
      `<div class="stat-line"><span>${p.sku}</span> <b>${p.count}</b></div>`
    ).join('');
    if (!prodsHtml) prodsHtml = '<div class="stat-empty">Sin vistas</div>';

    let brandsHtml = ud.stats.topBrands.map(b => 
      `<div class="stat-line"><span>${b.marca}</span> <b>${b.count}</b></div>`
    ).join('');
    if (!brandsHtml) brandsHtml = '<div class="stat-empty">Sin marcas</div>';

    cardsHtml += `
      <div class="card">
        <div class="card-header">
          <div class="card-name">${ud.name}</div>
          <div class="card-email">${ud.email}</div>
        </div>
        <div class="kpi-row">
          <div class="kpi"><span class="kpi-v">${ud.stats.views}</span> Vistas</div>
          <div class="kpi"><span class="kpi-v">${ud.stats.shares}</span> Comp.</div>
        </div>
        <div class="peak-hour">Hora pico: <b>${ud.stats.peak}</b></div>
        
        <div class="lists-container">
          <div class="list-col">
            <div class="list-title">Top Productos</div>
            ${prodsHtml}
          </div>
          <div class="list-col">
            <div class="list-title">Top Marcas</div>
            ${brandsHtml}
          </div>
        </div>
      </div>
    `;
  });

  const html = `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8" />
    <style>
      @page { size: A4 portrait; margin: 10mm; }
      body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; margin: 0; padding: 0; background: #fff; }
      .header { border-bottom: 2px solid #0D8A39; padding-bottom: 10px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: flex-end; }
      .title { font-size: 20px; font-weight: bold; color: #1A2530; margin: 0; }
      .subtitle { font-size: 12px; color: #6B778C; margin: 0; }
      
      /* CSS Grid: 2 columns, max 2 rows per page approx */
      .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; }
      
      .card { border: 1px solid #DFE1E6; border-radius: 8px; padding: 12px; display: flex; flex-direction: column; background: #F8F9FA; page-break-inside: avoid; }
      .card-header { margin-bottom: 10px; border-bottom: 1px solid #DFE1E6; padding-bottom: 6px; }
      .card-name { font-size: 14px; font-weight: bold; color: #1A2530; text-transform: uppercase; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .card-email { font-size: 10px; color: #6B778C; }
      
      .kpi-row { display: flex; gap: 10px; margin-bottom: 10px; }
      .kpi { flex: 1; background: #fff; border: 1px solid #DFE1E6; border-radius: 4px; padding: 6px; text-align: center; font-size: 10px; color: #6B778C; }
      .kpi-v { display: block; font-size: 16px; font-weight: bold; color: #007DB8; }
      
      .peak-hour { font-size: 11px; color: #1A2530; text-align: center; margin-bottom: 10px; background: #E8ECF0; padding: 4px; border-radius: 4px; }
      
      .lists-container { display: flex; gap: 10px; flex: 1; }
      .list-col { flex: 1; }
      .list-title { font-size: 10px; font-weight: bold; color: #1A2530; margin-bottom: 6px; text-transform: uppercase; border-bottom: 1px solid #DFE1E6; padding-bottom: 2px; }
      .stat-line { display: flex; justify-content: space-between; font-size: 10px; color: #1A2530; margin-bottom: 4px; border-bottom: 1px dashed #DFE1E6; padding-bottom: 2px; }
      .stat-line span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 70%; }
      .stat-empty { font-size: 10px; color: #A5ADBA; font-style: italic; }
    </style>
  </head>
  <body>
    <div class="header">
      <div>
        <h1 class="title">Reporte Detallado de Usuarios</h1>
        <p class="subtitle">Perodo: ${periodLabel} | Generado automticamente</p>
      </div>
      <img src="${APP_CONSTANTS.LOGO_BASE_BRANDS_2025.replace('brands/', '')}ISOLOGO_COMAGRO_COLOR.png" style="height: 30px;" />
    </div>
    
    <div class="grid">
      ${cardsHtml}
    </div>
  </body>
  </html>
  `;

  const { uri } = await Print.printToFileAsync({ html });
  return uri;
}