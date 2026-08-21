export const FRICCION_DIAMS = ["3/4\"", "1\"", "1.1/4\"", "1.1/2\"", "2\"", "2.1/2\"", "3\"", "4\"", "5\"", "6\"", "8\"", "10\"", "12\""];

export const FRICCION_ROWS: [number, (number | null)[]][] = [
[1,[7.5,2.7,0.75,0.22,0.08,null,null,null,null,null,null,null,null]],
[1.5,[16,6,1.6,0.5,0.17,null,null,null,null,null,null,null,null]],
[2,[27,10,2.7,0.8,0.28,0.07,null,null,null,null,null,null,null]],
[3,[58,21.5,6,1.8,0.6,0.16,0.05,null,null,null,null,null,null]],
[4,[100,27,10,3,1.05,0.27,0.1,null,null,null,null,null,null]],
[5,[null,55,15.5,4.7,1.6,0.42,0.15,0.05,null,null,null,null,null]],
[6,[null,80,22,6.6,2.2,0.6,0.2,0.07,null,null,null,null,null]],
[8,[null,null,37,11.5,3.9,1,0.35,0.13,null,null,null,null,null]],
[10,[null,null,56,17,5.7,1.5,0.5,0.2,0.06,null,null,null,null]],
[12.5,[null,null,85,26,8.5,2.3,0.8,0.28,0.09,null,null,null,null]],
[15,[null,null,null,37,12.5,3.3,1.1,0.4,0.13,0.05,null,null,null]],
[17.5,[null,null,null,47,16,4.2,1.4,0.5,0.17,0.06,null,null,null]],
[20,[null,null,null,63,21.5,5.7,2,0.7,0.23,0.09,null,null,null]],
[25,[null,null,null,95,33,8.5,3,1.1,0.35,0.13,null,null,null]],
[30,[null,null,null,null,45,12,4.2,1.5,0.5,0.2,0.05,null,null]],
[35,[null,null,null,null,61,16,5.7,2,0.65,0.24,0.06,null,null]],
[40,[null,null,null,null,78,20.5,7,2.5,0.8,0.3,0.08,null,null]],
[45,[null,null,null,null,100,26,9,3.1,1,0.4,0.1,null,null]],
[50,[null,null,null,null,null,32,11,3.8,1.25,0.5,0.12,null,null]],
[60,[null,null,null,null,null,45,16,5.5,1.8,0.7,0.16,0.05,null]],
[70,[null,null,null,null,null,60,21,7.2,2.4,0.9,0.21,0.07,null]],
[80,[null,null,null,null,null,76,26.5,9.2,3.1,1.2,0.27,0.09,null]],
[90,[null,null,null,null,null,null,34,12,3.8,1.4,0.35,0.12,null]],
[100,[null,null,null,null,null,null,40,14,4.7,1.8,0.42,0.14,null]],
[120,[null,null,null,null,null,null,58,20,6.6,2.5,0.6,0.2,0.08]],
[140,[null,null,null,null,null,null,80,27,9,3.3,0.8,0.26,0.1]],
[160,[null,null,null,null,null,null,null,35,11.5,4.25,1,0.34,0.13]],
[180,[null,null,null,null,null,null,null,43,14,5.3,1.25,0.42,0.17]],
[200,[null,null,null,null,null,null,null,50,17.5,6.5,1.5,0.5,0.2]],
[250,[null,null,null,null,null,null,null,80,26.5,10,2.3,0.8,0.32]],
[300,[null,null,null,null,null,null,null,null,36,14,3.3,1.1,0.45]],
[350,[null,null,null,null,null,null,null,null,null,19,4.5,1.5,0.6]],
[400,[null,null,null,null,null,null,null,null,null,null,5.8,1.9,0.8]],
[450,[null,null,null,null,null,null,null,null,null,null,7,2.4,1]],
[500,[null,null,null,null,null,null,null,null,null,null,null,2.9,1.2]]
];

export const FIT_HEADERS = ["Codo 90°", "Codo 45°", "Llave de Paso", "Tee de Deriv.", "Válv. de Pie", "Válv. Retención"];

export const FIT_ROWS: [string, number[]][] = [
["1/2\"",[0.3,0.2,2.6,1,3.6,1.1]],
["3/4\"",[0.4,0.2,3.6,1.4,5.6,1.6]],
["1\"",[0.5,0.2,4.6,1.7,7.3,2.1]],
["1 1/4\"",[0.7,0.3,5.6,2.3,10,2.7]],
["1 1/2\"",[0.9,0.3,6.7,2.8,11.6,3.2]],
["2\"",[1.1,0.4,8.5,3.5,14,4.2]],
["2 1/2\"",[1.3,0.5,10,4.3,17,5.2]],
["3\"",[1.6,0.6,13,5.2,20,6.3]],
["4\"",[2.1,0.7,17,6.7,23,6.4]],
["5\"",[2.7,0.9,21,8.4,30,10.4]],
["6\"",[3.4,1.1,26,10,39,12.5]],
["8\"",[4.3,1.5,34,13,52,16]],
["10\"",[5.5,1.8,43,16,65,20]],
["12\"",[6.1,2.2,51,19,78,24]]
];

export interface InterpolationResult {
  value: number | null;
  status: 'ok' | 'below' | 'above' | 'sin-datos';
}

export function interpolateFriction(q: number, di: number): InterpolationResult {
  const pairs = FRICCION_ROWS.map(r => [r[0], r[1][di]] as [number, number | null])
    .filter(p => p[1] !== null && p[1] !== undefined)
    .sort((a,b) => a[0] - b[0]) as [number, number][];
    
  if (pairs.length === 0) return {value:null, status:'sin-datos'};
  if (q <= pairs[0][0]) return {value: pairs[0][1], status: (q === pairs[0][0] ? 'ok':'below')};
  if (q >= pairs[pairs.length-1][0]) return {value: pairs[pairs.length-1][1], status:(q===pairs[pairs.length-1][0]?'ok':'above')};
  
  for (let i=0; i<pairs.length-1; i++){
    const x0 = pairs[i][0], y0 = pairs[i][1], x1 = pairs[i+1][0], y1 = pairs[i+1][1];
    if (q >= x0 && q <= x1){
      const t = (q-x0)/(x1-x0);
      return {value: y0 + t*(y1-y0), status:'ok'};
    }
  }
  return {value:null, status:'sin-datos'};
}
