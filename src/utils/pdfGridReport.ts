import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';
import { APP_CONSTANTS } from '../config/constants';

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
  // 1. Filtrar globalRawData según el periodLabel para que coincida con la UI
  let pDate = new Date();
  if (periodLabel === 'Hoy') {
    pDate.setHours(0, 0, 0, 0);
  } else if (periodLabel === 'Ultimos 7 dias' || periodLabel === 'Últimos 7 días') {
    pDate.setDate(pDate.getDate() - 7);
  } else if (periodLabel === 'Ultimos 30 dias' || periodLabel === 'Últimos 30 días') {
    pDate.setDate(pDate.getDate() - 30);
  } else {
    pDate = new Date(0); // Todo el tiempo
  }
  
  const filteredData = globalRawData.filter(r => new Date(r.created_at).getTime() >= pDate.getTime());

  // 2. Agrupar por usuario
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

  usersData.sort((a, b) => (b.stats.views + b.stats.shares) - (a.stats.views + a.stats.shares));

  // 3. Mejorar Diseño
  let cardsHtml = '';
  usersData.forEach(ud => {
    
    let prodsHtml = ud.stats.topProds.map((p, idx) => `
      <div class="list-item">
        <span class="rank">${idx + 1}</span>
        <div class="item-text"><div class="item-name">${p.sku}</div><div class="item-sub">${p.marca}</div></div>
        <span class="item-count">${p.count}</span>
      </div>
    `).join('');
    if (!prodsHtml) prodsHtml = '<div class="empty-state">No hay productos vistos</div>';

    let brandsHtml = ud.stats.topBrands.map((b, idx) => `
      <div class="list-item">
        <span class="rank">${idx + 1}</span>
        <div class="item-text"><div class="item-name">${b.marca}</div></div>
        <span class="item-count">${b.count}</span>
      </div>
    `).join('');
    if (!brandsHtml) brandsHtml = '<div class="empty-state">No hay marcas vistas</div>';

    cardsHtml += `
      <div class="card">
        <div class="card-header">
          <div class="avatar">${ud.name.charAt(0).toUpperCase()}</div>
          <div class="user-info">
            <div class="card-name">${ud.name}</div>
            <div class="card-email">${ud.email}</div>
          </div>
        </div>
        
        <div class="kpi-container">
          <div class="kpi-box views">
            <div class="kpi-val">${ud.stats.views}</div>
            <div class="kpi-label">Vistas</div>
          </div>
          <div class="kpi-box shares">
            <div class="kpi-val">${ud.stats.shares}</div>
            <div class="kpi-label">Compartidos</div>
          </div>
        </div>
        
        <div class="peak-box">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#F5A623" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
          Horario de mayor actividad: <strong>${ud.stats.peak}</strong>
        </div>

        <div class="lists-wrapper">
          <div class="list-column">
            <div class="list-header">Top Productos</div>
            ${prodsHtml}
          </div>
          <div class="list-column">
            <div class="list-header">Top Marcas</div>
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
      @page { size: A4 portrait; margin: 12mm; }
      body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; margin: 0; padding: 0; background: #fff; color: #1A2530; }
      
      .header { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2px solid #0D8A39; padding-bottom: 12px; margin-bottom: 20px; }
      .title-box h1 { margin: 0; font-size: 22px; color: #1A2530; font-weight: 800; }
      .title-box p { margin: 4px 0 0 0; font-size: 12px; color: #6B778C; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; }
      
      .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; align-items: start; }
      
      .card { background: #FFFFFF; border: 1px solid #DFE1E6; border-radius: 10px; padding: 16px; box-shadow: 0 2px 4px rgba(9, 30, 66, 0.04); page-break-inside: avoid; }
      
      .card-header { display: flex; align-items: center; gap: 10px; margin-bottom: 16px; border-bottom: 1px solid #F4F5F7; padding-bottom: 12px; }
      .avatar { width: 36px; height: 36px; border-radius: 18px; background: #0D8A39; color: #fff; display: flex; align-items: center; justify-content: center; font-size: 16px; font-weight: bold; }
      .user-info { flex: 1; min-width: 0; }
      .card-name { font-size: 15px; font-weight: 700; color: #172B4D; margin-bottom: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .card-email { font-size: 11px; color: #6B778C; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      
      .kpi-container { display: flex; gap: 12px; margin-bottom: 14px; }
      .kpi-box { flex: 1; padding: 10px; border-radius: 8px; text-align: center; }
      .kpi-box.views { background: #E6F4FB; border: 1px solid #B3DDF2; }
      .kpi-box.shares { background: #E8F5E9; border: 1px solid #C8E6C9; }
      .kpi-val { font-size: 20px; font-weight: 800; line-height: 1; margin-bottom: 4px; }
      .kpi-box.views .kpi-val { color: #007DB8; }
      .kpi-box.shares .kpi-val { color: #0D8A39; }
      .kpi-label { font-size: 10px; font-weight: 700; color: #5E6C84; text-transform: uppercase; }
      
      .peak-box { display: flex; align-items: center; justify-content: center; gap: 6px; background: #FFF9E6; border: 1px solid #FFE380; color: #42526E; font-size: 11px; padding: 8px; border-radius: 6px; margin-bottom: 16px; }
      .peak-box strong { color: #172B4D; font-weight: 700; }
      
      .lists-wrapper { display: flex; gap: 12px; }
      .list-column { flex: 1; background: #FAFBFC; border: 1px solid #DFE1E6; border-radius: 8px; padding: 10px; }
      .list-header { font-size: 10px; font-weight: 800; color: #5E6C84; text-transform: uppercase; border-bottom: 1px solid #DFE1E6; padding-bottom: 6px; margin-bottom: 8px; }
      
      .list-item { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
      .list-item:last-child { margin-bottom: 0; }
      .rank { font-size: 10px; font-weight: 700; color: #A5ADBA; width: 12px; text-align: center; }
      .item-text { flex: 1; min-width: 0; }
      .item-name { font-size: 11px; font-weight: 700; color: #172B4D; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .item-sub { font-size: 9px; color: #6B778C; margin-top: 1px; }
      .item-count { font-size: 11px; font-weight: 800; color: #0D8A39; background: #E8F5E9; padding: 2px 6px; border-radius: 10px; }
      
      .empty-state { font-size: 10px; color: #A5ADBA; text-align: center; padding: 10px 0; font-style: italic; }
      
      .footer { margin-top: 20px; text-align: center; font-size: 10px; color: #A5ADBA; border-top: 1px solid #DFE1E6; padding-top: 12px; }
    </style>
  </head>
  <body>
    <div class="header">
      <div class="title-box">
        <h1>Reporte Detallado de Usuarios</h1>
        <p>Filtrado por: ${periodLabel}</p>
      </div>
    </div>
    
    <div class="grid">
      ${cardsHtml}
    </div>
    
    <div class="footer">
      Generado automáticamente desde Comagro App | ${new Date().toLocaleDateString()}
    </div>
  </body>
  </html>
  `;

  try {
    const { uri } = await Print.printToFileAsync({ html, base64: false });
    const targetPath = FileSystem.documentDirectory + `Reporte_Usuarios_${new Date().getTime()}.pdf`;
    await FileSystem.moveAsync({ from: uri, to: targetPath });
    return targetPath;
  } catch (error) {
    console.error('Print.printToFileAsync failed', error);
    throw error;
  }
}