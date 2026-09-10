const lastMessage = "Busco repuesto para desmalezadora";
const r1 = /\b(repuest|accesori|pieza|parte|impulsor|filtro|bujia|carburador|cable|aceite|arnes|arn[eé]s|chaleco|correa|funda|cintur[oó]n|ats\b|tablero de transferencia|panel de transferencia|transferencia automatica)\b/i;
const r2 = /\b(repuestos?|accesorios?|piezas?|partes?|impulsor(es)?|filtros?|bujias?|carburador(es)?|cables?|aceites?|arnes|arn[eé]s|chalecos?|correas?|fundas?|cintur[oó]nes?|ats|tablero de transferencia|panel de transferencia|transferencia automatica)\b/i;

console.log(r1.test(lastMessage));
console.log(r2.test(lastMessage));
