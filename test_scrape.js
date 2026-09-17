const cheerio = require('cheerio');
fetch('https://www.comagro.com.py/catalogsearch/result/?q=GAEH50')
  .then(r => r.text())
  .then(html => {
    const $ = cheerio.load(html);
    const items = $('.product-item-info').map((i, el) => {
      const skuForm = $(el).find('form[data-product-sku]').attr('data-product-sku');
      const name = $(el).find('.product-item-link').text().trim();
      return { skuForm, name };
    }).get();
    console.log(items);
  });
