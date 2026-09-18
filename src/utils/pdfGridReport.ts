import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { documentDirectory, moveAsync } from 'expo-file-system';
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
  } else if (periodLabel === 'Ultimos 7 dias' || periodLabel === 'ÃƒÅ¡ltimos 7 dÃƒÂ­as') {
    pDate.setDate(pDate.getDate() - 7);
  } else if (periodLabel === 'Ultimos 30 dias' || periodLabel === 'ÃƒÅ¡ltimos 30 dÃƒÂ­as') {
    pDate.setDate(pDate.getDate() - 30);
  } else {
    pDate = new Date(0);
  }
  
  const filteredData = globalRawData.filter(r => new Date(r.created_at).getTime() >= pDate.getTime());

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
            <div class="kpi-label">ImÃƒÂ¡genes Env.</div>
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

  const html = `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8" />
    <style>
      @page { size: A4 portrait; margin: 15mm; }
      body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; margin: 0; padding: 0; background: #FAFBFC; color: #1A2530; }
      
      .header { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 3px solid #0D8A39; padding-bottom: 15px; margin-bottom: 25px; }
      .title-box h1 { margin: 0; font-size: 26px; color: #1A2530; font-weight: 800; letter-spacing: -0.5px; }
      .title-box p { margin: 6px 0 0 0; font-size: 13px; color: #6B778C; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; }
      .logo { max-height: 40px; object-fit: contain; }
      
      .cards-container { display: flex; flex-direction: column; gap: 24px; }
      
      .card { background: #FFFFFF; border: 1px solid #DFE1E6; border-radius: 12px; padding: 20px; box-shadow: 0 4px 12px rgba(9, 30, 66, 0.05); page-break-inside: avoid; }
      
      .card-header { display: flex; align-items: center; gap: 14px; margin-bottom: 20px; border-bottom: 1px solid #F4F5F7; padding-bottom: 16px; position: relative; }
      .avatar { width: 44px; height: 44px; border-radius: 22px; background: #0D8A39; color: #fff; display: flex; align-items: center; justify-content: center; font-size: 20px; font-weight: 800; }
      .user-info { flex: 1; min-width: 0; }
      .card-name { font-size: 18px; font-weight: 800; color: #172B4D; margin-bottom: 3px; }
      .card-email { font-size: 13px; color: #6B778C; }
      
      .peak-badge { display: flex; align-items: center; gap: 6px; background: #FFF9E6; border: 1px solid #FFE380; color: #42526E; font-size: 12px; padding: 6px 12px; border-radius: 20px; position: absolute; right: 0; top: 0; }
      
      .kpi-container { display: flex; gap: 16px; margin-bottom: 20px; }
      .kpi-box { flex: 1; padding: 14px 10px; border-radius: 10px; text-align: center; }
      .kpi-box.views { background: #E6F4FB; border: 1px solid #B3DDF2; }
      .kpi-box.shares { background: #E8F5E9; border: 1px solid #C8E6C9; }
      .kpi-box.details { background: #F4F5F7; border: 1px solid #DFE1E6; }
      
      .kpi-val { font-size: 24px; font-weight: 900; line-height: 1; margin-bottom: 6px; }
      .kpi-box.views .kpi-val { color: #007DB8; }
      .kpi-box.shares .kpi-val { color: #0D8A39; }
      .kpi-box.details .kpi-val { color: #42526E; }
      .kpi-label { font-size: 11px; font-weight: 800; color: #5E6C84; text-transform: uppercase; letter-spacing: 0.5px; }
      
      .lists-wrapper { display: flex; gap: 20px; }
      .list-column { flex: 1; border: 1px solid #DFE1E6; border-radius: 10px; overflow: hidden; }
      .list-header { background: #F4F5F7; font-size: 12px; font-weight: 800; color: #172B4D; text-transform: uppercase; padding: 10px 14px; border-bottom: 1px solid #DFE1E6; }
      
      .list-body { padding: 10px 14px; }
      .list-item { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; border-bottom: 1px dashed #EBECF0; padding-bottom: 12px; }
      .list-item:last-child { margin-bottom: 0; border-bottom: none; padding-bottom: 0; }
      
      .rank { font-size: 14px; font-weight: 900; color: #B3BAC5; width: 16px; text-align: center; }
      .item-img { width: 36px; height: 36px; border-radius: 6px; object-fit: cover; border: 1px solid #DFE1E6; background: #fff; }
      .brand-img { width: 44px; height: 28px; border-radius: 4px; object-fit: contain; background: #fff; padding: 2px; border: 1px solid #DFE1E6; }
      
      .item-text { flex: 1; min-width: 0; }
      .item-name { font-size: 13px; font-weight: 800; color: #172B4D; margin-bottom: 2px; }
      .item-sub { font-size: 11px; color: #6B778C; }
      
      .item-count-box { font-size: 12px; font-weight: 800; color: #0D8A39; background: #E8F5E9; padding: 4px 8px; border-radius: 6px; border: 1px solid #C8E6C9; }
      
      .empty-state { font-size: 12px; color: #A5ADBA; text-align: center; padding: 20px 0; font-style: italic; }
      
      .footer { margin-top: 30px; text-align: center; font-size: 11px; color: #8993A4; border-top: 1px solid #DFE1E6; padding-top: 16px; }
    </style>
  </head>
  <body>
    <div class="header">
      <div class="title-box">
        <h1>Reporte de Actividad por Usuario</h1>
        <p>Periodo Analizado: ${periodLabel}</p>
      </div>
      <img class="logo" src="https://comagro.com.bo/static/media/logo-comagro.84d53ed4.png" onerror="this.style.display='none'" />
    </div>
    
    <div class="cards-container">
      ${cardsHtml}
    </div>
    
    <div class="footer">
      Generado automÃƒÂ¡ticamente desde Comagro App | ${new Date().toLocaleString()}
    </div>
  </body>
  </html>
  `;

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