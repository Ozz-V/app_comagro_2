insert into public.pdf_templates (id_template, html, version, updated_by)
values (
  'product_sheet',
  $tpl$
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
    .hdr { display: flex; align-items: center; justify-content: space-between; padding: 14px 26px 0 26px; flex-shrink: 0; gap: 16px; }
    .hdr-logo { height: 96px; display: flex; align-items: center; flex-shrink: 0; }
    .hdr-logo img { max-height: 96px; max-width: 320px; object-fit: contain; }
    .hdr-text { text-align: right; min-width: 0; }
    .hdr-name { font-size: 15pt; font-weight: bold; color: #0a2566; text-transform: uppercase; letter-spacing: 0.5px; line-height: 1.15; word-break: break-word; }
    .hdr-sku { font-size: 9pt; color: #8492a6; letter-spacing: 1.5px; margin-top: 4px; }
    .green-line { height: 5px; background: linear-gradient(90deg, #0d8a39, #09c24f); margin: 10px 26px 0 26px; flex-shrink: 0; }
    .top-block { display: flex; flex-direction: row; margin: 12px 26px 0 26px; height: {{topBlockH}}px; gap: 12px; flex-shrink: 0; }
    .img-col { flex: 1; min-height: 0; display: flex; flex-direction: column; align-items: flex-start; justify-content: center; }
    .img-box { width: 100%; flex: 1; min-height: 0; display: flex; align-items: center; justify-content: center; gap: 8px; flex-wrap: wrap; align-content: center; }
    .prod-img { max-width: 100%; max-height: 100%; object-fit: contain; display: block; }
    .img-grid-item { flex: 1 1 {{imgGridBasis}}; min-width: 0; height: {{imgGridHeight}}; display: flex; align-items: center; justify-content: center; }
    .img-grid-item img { max-width: 100%; max-height: 100%; object-fit: contain; display: block; }
    .curve-col { flex: 1; display: flex; flex-direction: column; padding: 10px; }
    .curve-title { font-size: 10pt; font-weight: bold; color: #0a2566; text-align: center; margin-bottom: 6px; }
    .curve-wrapper { flex: 1; position: relative; }
    .curve-disclaimer { font-size: 6pt; color: #8492a6; text-align: center; margin-top: 4px; line-height: 1.1; }
    .specs-block { margin: 12px 26px 0 26px; flex-shrink: 0; }
    .stitle { background: #0a2566; color: #fff; font-size: 9pt; font-weight: bold; letter-spacing: 1px; padding: 6px 14px; border-radius: 6px 6px 0 0; }
    .stbl { width: 100%; border-collapse: collapse; table-layout: fixed; }
    td { vertical-align: middle; word-break: break-word; overflow-wrap: break-word; line-height: 1.25; }
    .sn  { padding: {{specPad}} 8px {{specPad}} 12px; font-size: {{specFs}}; font-weight: bold; color: #0a2566; text-transform: uppercase; border-bottom: 1px solid #e4eaf4; }
    .sv  { padding: {{specPad}} 12px {{specPad}} 6px; font-size: {{specFs}}; color: #2d3748; border-bottom: 1px solid #e4eaf4; }
    .sep { border-left: 2px solid #dce4f0; }
    .footer { position: absolute; bottom: 0; left: 0; right: 0; height: 34px; background: #0a2566; display: flex; align-items: center; padding: 0 26px; gap: 10px; }
    .ft { color: rgba(255,255,255,0.6); font-size: 7pt; }
    .fd { color: rgba(255,255,255,0.22); font-size: 9pt; }
  </style>
</head>
<body>
  <div class="page">
    <div class="hdr">
      <div class="hdr-logo"><img src="{{logoBase64}}" onerror="this.style.display='none'" /></div>
      <div class="hdr-text">
        <div class="hdr-name">{{hdrName}}</div>
        <div class="hdr-sku">SKU: {{sku}}</div>
      </div>
    </div>
    <div class="green-line"></div>
    <div class="top-block">
      <div class="img-col">
        <div class="img-box">
          {{imgGridItemsHtml}}
        </div>
      </div>
      {{curveColHtml}}
    </div>
    <div class="specs-block">{{specsBlockHtml}}</div>
    <div class="footer">
      <span class="ft">{{footerMarca}}</span>
      <span class="fd">&#xB7;</span>
      <span class="ft">{{footerModelo}}</span>
      <span class="fd">&#xB7;</span>
      <span class="ft">{{footerSubcat}}</span>
    </div>
  </div>
  <script>
    (function(){
      var imgs = document.querySelectorAll('.prod-img');
      imgs.forEach(function(imgEl) {
        var img = new Image();
        img.onload = function() {
          try {
            var tmp = document.createElement('canvas');
            var w = img.width, h = img.height;
            tmp.width = w; tmp.height = h;
            var ctx = tmp.getContext('2d');
            ctx.drawImage(img, 0, 0);
            var idata = ctx.getImageData(0,0,w,h);
            var d = idata.data;
            var top = h, bottom = 0, left = w, right = 0;
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
            imgEl.src = out.toDataURL('image/png');
          } catch(e) {}
        };
        img.src = imgEl.src;
      });
    })();
  </script>
</body>
</html>
$tpl$,
  '1.0',
  'migracion_inicial'
)
on conflict (id_template) do update
  set html = excluded.html, version = excluded.version, updated_by = excluded.updated_by;
