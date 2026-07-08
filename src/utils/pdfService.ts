import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import { ParsedProduct } from '../types/models';

// ── Constantes de página (px a 96dpi, A4 portrait = 297mm ≈ 1122px) ─────
const PX_PAGE     = 1108; // alto total usable
const PX_HDR      = 96;   // header
const PX_TMARG    = 12;   // margin-top del bloque superior
const PX_GAP      = 12;   // espacio entre bloque superior y specs
const PX_SPEC_HDR = 34;   // cabecera azul "ESPECIFICACIONES TÉCNICAS"
const PX_FOOT     = 34;   // footer
const PX_SAFETY   = 14;   // margen de seguridad
const MIN_IMG_H   = 80;   // altura mínima aceptable de la imagen
const TEXT_H      = 77;   // altura aproximada del bloque de texto

export function generarHtmlFicha(specs: [string, string][], base64Img: string, logoBase64: string, modalProd: ParsedProduct) {
  const numSpecs = specs.length;

  const fs1  = numSpecs > 22 ? '8.5pt' : numSpecs > 16 ? '9pt'  : '10pt';
  const pad1 = numSpecs > 22 ? '4px'   : numSpecs > 16 ? '5px'  : '6px';
  const row1 = numSpecs > 22 ? 26      : numSpecs > 16 ? 27     : 29; 

  const specsH1  = numSpecs > 0 ? PX_SPEC_HDR + numSpecs * row1 : 0;
  const topH1    = PX_PAGE - PX_HDR - PX_TMARG - PX_GAP - specsH1 - PX_FOOT - PX_SAFETY;
  const imgH1    = topH1 - TEXT_H;

  let doubleCols, topBlockH, specFs, specPad;

  if (imgH1 >= MIN_IMG_H) {
    doubleCols = false;
    topBlockH  = Math.max(MIN_IMG_H + TEXT_H, topH1);
    specFs     = fs1;
    specPad    = pad1;
  } else {
    doubleCols = true;
    const numRows2 = Math.ceil(numSpecs / 2);
    const fs2   = numRows2 > 18 ? '8pt'  : numRows2 > 12 ? '8.5pt' : '9.5pt';
    const pad2  = numRows2 > 18 ? '4px'  : numRows2 > 12 ? '5px'   : '6px';
    const row2  = numRows2 > 18 ? 24     : numRows2 > 12 ? 25      : 27;
    const specsH2 = numSpecs > 0 ? PX_SPEC_HDR + numRows2 * row2 : 0;
    const topH2   = PX_PAGE - PX_HDR - PX_TMARG - PX_GAP - specsH2 - PX_FOOT - PX_SAFETY;
    topBlockH  = Math.max(MIN_IMG_H + TEXT_H, topH2);
    specFs     = fs2;
    specPad    = pad2;
  }

  let rowsHtml = '';
  if (doubleCols) {
    for (let i = 0; i < numSpecs; i += 2) {
      const a = specs[i], b = specs[i + 1] || null;
      const bg = (Math.floor(i / 2)) % 2 === 0 ? '#ffffff' : '#f2f5fb';
      rowsHtml += `<tr style="background:${bg}">
        <td class="sn">${a[0]}</td><td class="sv">${a[1]}</td>
        ${b ? `<td class="sn sep">${b[0]}</td><td class="sv">${b[1]}</td>` : `<td class="sep"></td><td></td>`}
      </tr>`;
    }
  } else {
    for (let i = 0; i < numSpecs; i++) {
      const bg = i % 2 === 0 ? '#ffffff' : '#f2f5fb';
      rowsHtml += `<tr style="background:${bg}">
        <td class="sn">${specs[i][0]}</td><td class="sv">${specs[i][1]}</td>
      </tr>`;
    }
  }

  const colgroup = doubleCols
    ? `<colgroup><col style="width:22%"/><col style="width:28%"/><col style="width:22%"/><col style="width:28%"/></colgroup>`
    : `<colgroup><col style="width:34%"/><col style="width:66%"/></colgroup>`;

  const specsHtml = numSpecs > 0
    ? `<div class="stitle">ESPECIFICACIONES TÉCNICAS</div>
       <table class="stbl">${colgroup}<tbody>${rowsHtml}</tbody></table>`
    : '';

  return `
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=794, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
      <style>
        @page { margin: 0; size: A4 portrait; }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: Arial, sans-serif; -webkit-print-color-adjust: exact; color: #1a1a1a; background: #fff; margin: 0; }
        .page { width: 794px; height: 1123px; display: flex; flex-direction: column; overflow: hidden; position: relative; }
        .hdr { display: flex; align-items: center; padding: 14px 26px 0 26px; flex-shrink: 0; }
        .hdr-logo { height: 70px; display: flex; align-items: center; flex-shrink: 0; }
        .hdr-logo img { max-height: 70px; max-width: 234px; object-fit: contain; }
        .hdr-sep { width: 2px; height: 46px; background: #c4ccd8; margin: 0 16px; flex-shrink: 0; }
        .hdr-text { flex: 1; }
        .hdr-title { font-size: 19pt; font-weight: bold; color: #0a2566; letter-spacing: 1px; line-height: 1; }
        .hdr-sub { font-size: 7.5pt; color: #8492a6; letter-spacing: 2px; text-transform: uppercase; margin-top: 3px; }
        .green-line { height: 5px; background: linear-gradient(90deg, #0d8a39, #09c24f); margin-top: 10px; flex-shrink: 0; }
        .top-block { display: flex; flex-direction: column; margin: ${PX_TMARG}px 26px 0 26px; height: ${topBlockH}px; gap: 12px; flex-shrink: 0; }
        .img-box { flex: 1; min-height: 0; display: flex; align-items: center; justify-content: center; }
        .prod-img { max-width: 100%; max-height: 100%; object-fit: contain; display: block; }
        .info-box { flex-shrink: 0; display: flex; flex-direction: column; align-items: flex-start; gap: 4px; }
        .p-marca  { font-size: 11pt; font-weight: bold; color: #0d8a39; text-transform: uppercase; letter-spacing: 0.5px; }
        .p-modelo { font-size: 20pt; font-weight: bold; color: #0a2566; line-height: 1.1; width: 100%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .p-subcat { font-size: 8.5pt; color: #8492a6; text-transform: uppercase; letter-spacing: 1px; }
        .specs-block { margin: ${PX_GAP}px 26px 0 26px; flex-shrink: 0; }
        .stitle { background: #0a2566; color: #fff; font-size: 9pt; font-weight: bold; letter-spacing: 1px; padding: 6px 14px; border-radius: 6px 6px 0 0; }
        .stbl { width: 100%; border-collapse: collapse; table-layout: fixed; }
        td { vertical-align: middle; word-break: break-word; overflow-wrap: break-word; line-height: 1.25; }
        .sn  { padding: ${specPad} 8px ${specPad} 12px; font-size: ${specFs}; font-weight: bold; color: #0a2566; text-transform: uppercase; border-bottom: 1px solid #e4eaf4; }
        .sv  { padding: ${specPad} 12px ${specPad} 6px; font-size: ${specFs}; color: #2d3748; border-bottom: 1px solid #e4eaf4; }
        .sep { border-left: 2px solid #dce4f0; }
        .footer { position: absolute; bottom: 0; left: 0; right: 0; height: ${PX_FOOT}px; background: #0a2566; display: flex; align-items: center; padding: 0 26px; gap: 10px; }
        .ft { color: rgba(255,255,255,0.6); font-size: 7pt; }
        .fd { color: rgba(255,255,255,0.22); font-size: 9pt; }
      </style>
    </head>
    <body>
      <div class="page">
        <div class="hdr">
          <div class="hdr-logo"><img src="${logoBase64}" onerror="this.style.display='none'" /></div>
          <div class="hdr-sep"></div>
          <div class="hdr-text">
            <div class="hdr-title">FICHA T&#201;CNICA</div>
            <div class="hdr-sub">Especificaciones del producto</div>
          </div>
        </div>
        <div class="green-line"></div>
        <div class="top-block">
          <div class="img-box"><img id="prodImg" class="prod-img" src="${base64Img}" /></div>
          <div class="info-box">
            <div class="p-marca">${modalProd?.modelo ? 'SKU: ' + modalProd.modelo + ' | ' : ''}${modalProd?.marca ?? ''}</div>
            <div class="p-modelo">${modalProd?.modelo ?? ''}</div>
            <div class="p-subcat">${(modalProd?.subcategoria ?? 'GENERAL').toUpperCase()}</div>
          </div>
        </div>
        <div class="specs-block">${specsHtml}</div>
        <div class="footer">
          <span class="ft">${modalProd?.marca ?? ''}</span>
          <span class="fd">&#xB7;</span>
          <span class="ft">${modalProd?.modelo ?? ''}</span>
          <span class="fd">&#xB7;</span>
          <span class="ft">${(modalProd?.subcategoria ?? '').toUpperCase()}</span>
        </div>
      </div>
      <script>
        (function() {
          var img = new Image();
          img.onload = function() {
            var tmp = document.createElement('canvas');
            tmp.width = img.width; tmp.height = img.height;
            var ctx = tmp.getContext('2d');
            ctx.drawImage(img, 0, 0);
            try {
              var d = ctx.getImageData(0, 0, tmp.width, tmp.height).data;
              var w = tmp.width, h = tmp.height;
              var top = h, left = w, right = -1, bottom = -1;
              for (var y = 0; y < h; y++) {
                for (var x = 0; x < w; x++) {
                  var i4 = (y * w + x) * 4;
                  if (d[i4+3] > 10 && !(d[i4] >= 245 && d[i4+1] >= 245 && d[i4+2] >= 245)) {
                    if (x < left) left = x;  if (x > right) right = x;
                    if (y < top)  top  = y;  if (y > bottom) bottom = y;
                  }
                }
              }
              if (right < left || bottom < top) return;
              var p = 8;
              left = Math.max(0, left-p); top = Math.max(0, top-p);
              right = Math.min(w-1, right+p); bottom = Math.min(h-1, bottom+p);
              var cw = right-left+1, ch = bottom-top+1;
              var out = document.createElement('canvas');
              out.width = cw; out.height = ch;
              out.getContext('2d').drawImage(tmp, left, top, cw, ch, 0, 0, cw, ch);
              document.getElementById('prodImg').src = out.toDataURL('image/png');
            } catch(e) {}
          };
          img.src = '${base64Img}';
        })();
      </script>
    </body>
    </html>
  `;
}

export async function fetchImageBase64(url: string): Promise<string> {
  if (!url) return '';
  try {
    if (url.startsWith('file://') || url.startsWith('/')) {
      const base64 = await FileSystem.readAsStringAsync(url, { encoding: FileSystem.EncodingType.Base64 });
      return `data:image/jpeg;base64,${base64}`;
    }
    const res = await fetch(url);
    const blob = await res.blob();
    return await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.readAsDataURL(blob);
    });
  } catch {
    // console removed for strict linting compliance
    return '';
  }
}

export async function generateAndSharePdf(modalProd: ParsedProduct, pdfCache: Record<string, string> = {}, logoRefreshKey: string = String(Date.now())) {
  const specs = modalProd?.specs || [];
  let finalProdB64 = pdfCache?.prodBase64;
  let finalLogoB64 = pdfCache?.logoBase64;
  
  if (!finalProdB64) {
    const marcaSlug = modalProd?.marca?.toUpperCase().replace(/\s+/g, '_') || '';
    const logoUrl = `https://www.chacomer.com.py/media/wysiwyg/comagro/brands2025/${marcaSlug}.jpg?v=${logoRefreshKey}`;
    const imgUrl = modalProd?.imagenOriginal || modalProd?.imagen || ''; // use string, no implicit any
    
    const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 10000));
    finalProdB64 = await Promise.race([fetchImageBase64(imgUrl), timeoutPromise]).catch(() => '') as string;
    finalLogoB64 = await Promise.race([fetchImageBase64(logoUrl), timeoutPromise]).catch(() => '') as string;
  }
  
  const htmlContent = generarHtmlFicha(specs, finalProdB64, finalLogoB64, modalProd);
  const { uri } = await Print.printToFileAsync({ html: htmlContent });
  
  let finalUriToShare = uri;
  try {
    const safeMarca = (modalProd?.marca || 'marca').replace(/[^a-zA-Z0-9]/g, '_').toUpperCase();
    const safeModelo = (modalProd?.modelo || 'sku').replace(/[^a-zA-Z0-9]/g, '_').toUpperCase();
    const newFileName = `${safeMarca}_${safeModelo}.pdf`;
    const newUri = `${FileSystem.cacheDirectory}${newFileName}`;
    
    const fileInfo = await FileSystem.getInfoAsync(newUri);
    if (fileInfo.exists) {
      await FileSystem.deleteAsync(newUri);
    }
    await FileSystem.copyAsync({ from: uri, to: newUri });
    finalUriToShare = newUri;
  } catch {
    // console removed
  }
  
  await Sharing.shareAsync(finalUriToShare, {
    dialogTitle: `Ficha ${modalProd?.modelo}`,
    mimeType: 'application/pdf',
    UTI: 'com.adobe.pdf'
  });
}
