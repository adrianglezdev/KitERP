/**
 * Estructura abreviada de las cuentas anuales del PGC PYMES (3ª parte, modelos abreviados).
 * Cada partida lista los prefijos de cuenta que la forman; cada cuenta se asigna a la partida
 * con el prefijo más largo que coincide. Activo: saldo deudor (debe − haber). Patrimonio neto
 * y pasivo: saldo acreedor (haber − debe). Las cuentas correctoras (amortizaciones, deterioros)
 * restan solas porque su saldo tiene el signo contrario.
 */
export interface Partida {
  id: string;
  titulo: string;
  prefijos?: string[];
  hijos?: Partida[];
}

export const BALANCE_ACTIVO: Partida[] = [
  {
    id: 'A',
    titulo: 'A) ACTIVO NO CORRIENTE',
    hijos: [
      { id: 'A.I', titulo: 'I. Inmovilizado intangible', prefijos: ['20', '280', '290'] },
      { id: 'A.II', titulo: 'II. Inmovilizado material', prefijos: ['21', '23', '281', '291'] },
      { id: 'A.III', titulo: 'III. Inversiones inmobiliarias', prefijos: ['22', '282', '292'] },
      { id: 'A.IV', titulo: 'IV. Inversiones en empresas del grupo y asociadas a largo plazo', prefijos: ['2403', '2404', '2413', '2414', '2423', '2424', '2493', '2494', '293'] },
      { id: 'A.V', titulo: 'V. Inversiones financieras a largo plazo', prefijos: ['24', '25', '26', '259', '29'] },
      { id: 'A.VI', titulo: 'VI. Activos por impuesto diferido', prefijos: ['474'] },
    ],
  },
  {
    id: 'B',
    titulo: 'B) ACTIVO CORRIENTE',
    hijos: [
      { id: 'B.I', titulo: 'I. Existencias', prefijos: ['30', '31', '32', '33', '34', '35', '36', '39', '407'] },
      {
        id: 'B.II',
        titulo: 'II. Deudores comerciales y otras cuentas a cobrar',
        hijos: [
          { id: 'B.II.1', titulo: '1. Clientes por ventas y prestaciones de servicios', prefijos: ['430', '431', '432', '433', '434', '435', '436', '437', '490', '493'] },
          { id: 'B.II.2', titulo: '2. Accionistas (socios) por desembolsos exigidos', prefijos: ['5580'] },
          { id: 'B.II.3', titulo: '3. Otros deudores', prefijos: ['44', '460', '470', '471', '472', '473', '544'] },
        ],
      },
      { id: 'B.III', titulo: 'III. Inversiones en empresas del grupo y asociadas a corto plazo', prefijos: ['53'] },
      { id: 'B.IV', titulo: 'IV. Inversiones financieras a corto plazo', prefijos: ['54', '565', '566', '59'] },
      { id: 'B.V', titulo: 'V. Periodificaciones a corto plazo', prefijos: ['480', '567'] },
      { id: 'B.VI', titulo: 'VI. Efectivo y otros activos líquidos equivalentes', prefijos: ['57'] },
    ],
  },
];

export const BALANCE_PASIVO: Partida[] = [
  {
    id: 'PN',
    titulo: 'A) PATRIMONIO NETO',
    hijos: [
      {
        id: 'PN.1',
        titulo: 'A-1) Fondos propios',
        hijos: [
          { id: 'PN.1.I', titulo: 'I. Capital', prefijos: ['100', '101', '102', '103', '104'] },
          { id: 'PN.1.II', titulo: 'II. Prima de emisión', prefijos: ['110'] },
          { id: 'PN.1.III', titulo: 'III. Reservas', prefijos: ['112', '113', '114', '115', '119'] },
          { id: 'PN.1.IV', titulo: 'IV. (Acciones y participaciones en patrimonio propias)', prefijos: ['108', '109'] },
          { id: 'PN.1.V', titulo: 'V. Resultados de ejercicios anteriores', prefijos: ['120', '121'] },
          { id: 'PN.1.VI', titulo: 'VI. Otras aportaciones de socios', prefijos: ['118'] },
          { id: 'PN.1.VII', titulo: 'VII. Resultado del ejercicio', prefijos: ['129', '6', '7'] },
          { id: 'PN.1.VIII', titulo: 'VIII. (Dividendo a cuenta)', prefijos: ['557'] },
        ],
      },
      { id: 'PN.2', titulo: 'A-2) Subvenciones, donaciones y legados recibidos', prefijos: ['13'] },
    ],
  },
  {
    id: 'PNC',
    titulo: 'B) PASIVO NO CORRIENTE',
    hijos: [
      { id: 'PNC.I', titulo: 'I. Provisiones a largo plazo', prefijos: ['14'] },
      {
        id: 'PNC.II',
        titulo: 'II. Deudas a largo plazo',
        hijos: [
          { id: 'PNC.II.1', titulo: '1. Deudas con entidades de crédito', prefijos: ['1605', '170'] },
          { id: 'PNC.II.2', titulo: '2. Acreedores por arrendamiento financiero', prefijos: ['1625', '174'] },
          { id: 'PNC.II.3', titulo: '3. Otras deudas a largo plazo', prefijos: ['15', '1615', '1635', '171', '172', '173', '175', '176', '177', '179', '180', '185', '189'] },
        ],
      },
      { id: 'PNC.III', titulo: 'III. Deudas con empresas del grupo y asociadas a largo plazo', prefijos: ['1603', '1604', '1613', '1614', '1623', '1624', '1633', '1634'] },
      { id: 'PNC.IV', titulo: 'IV. Pasivos por impuesto diferido', prefijos: ['479'] },
      { id: 'PNC.V', titulo: 'V. Periodificaciones a largo plazo', prefijos: ['181'] },
    ],
  },
  {
    id: 'PC',
    titulo: 'C) PASIVO CORRIENTE',
    hijos: [
      { id: 'PC.I', titulo: 'I. Provisiones a corto plazo', prefijos: ['499', '529'] },
      {
        id: 'PC.II',
        titulo: 'II. Deudas a corto plazo',
        hijos: [
          { id: 'PC.II.1', titulo: '1. Deudas con entidades de crédito', prefijos: ['5105', '520', '527'] },
          { id: 'PC.II.2', titulo: '2. Acreedores por arrendamiento financiero', prefijos: ['5125', '524'] },
          { id: 'PC.II.3', titulo: '3. Otras deudas a corto plazo', prefijos: ['50', '51', '521', '522', '523', '525', '526', '528', '551', '552', '555', '556', '560', '561', '569', '190', '192', '194'] },
        ],
      },
      { id: 'PC.III', titulo: 'III. Deudas con empresas del grupo y asociadas a corto plazo', prefijos: ['5103', '5104', '5113', '5114', '5123', '5124', '5133', '5134', '5143', '5144', '5523', '5524', '5563', '5564'] },
      {
        id: 'PC.IV',
        titulo: 'IV. Acreedores comerciales y otras cuentas a pagar',
        hijos: [
          { id: 'PC.IV.1', titulo: '1. Proveedores', prefijos: ['400', '401', '403', '404', '405', '406'] },
          { id: 'PC.IV.2', titulo: '2. Otros acreedores', prefijos: ['41', '438', '465', '466', '475', '476', '477'] },
        ],
      },
      { id: 'PC.V', titulo: 'V. Periodificaciones a corto plazo', prefijos: ['485', '568'] },
    ],
  },
];

/** Cuenta de pérdidas y ganancias abreviada PYMES. Importe = haber − debe (ingresos en positivo). */
export interface PartidaPyG {
  id: string;
  titulo: string;
  prefijos?: string[];
  /** Subtotal: suma de las partidas indicadas. */
  suma?: string[];
}

export const PYG: PartidaPyG[] = [
  { id: '1', titulo: '1. Importe neto de la cifra de negocios', prefijos: ['700', '701', '702', '703', '704', '705', '706', '708', '709'] },
  { id: '2', titulo: '2. Variación de existencias de productos terminados y en curso de fabricación', prefijos: ['6930', '71', '7930'] },
  { id: '3', titulo: '3. Trabajos realizados por la empresa para su activo', prefijos: ['73'] },
  { id: '4', titulo: '4. Aprovisionamientos', prefijos: ['600', '601', '602', '606', '607', '608', '609', '61', '6931', '6932', '6933', '7931', '7932', '7933'] },
  { id: '5', titulo: '5. Otros ingresos de explotación', prefijos: ['74', '75'] },
  { id: '6', titulo: '6. Gastos de personal', prefijos: ['64', '7950', '7957'] },
  { id: '7', titulo: '7. Otros gastos de explotación', prefijos: ['62', '631', '634', '636', '639', '65', '694', '695', '794', '7954'] },
  { id: '8', titulo: '8. Amortización del inmovilizado', prefijos: ['68'] },
  { id: '9', titulo: '9. Imputación de subvenciones de inmovilizado no financiero y otras', prefijos: ['746'] },
  { id: '10', titulo: '10. Excesos de provisiones', prefijos: ['7951', '7952', '7955', '7956'] },
  { id: '11', titulo: '11. Deterioro y resultado por enajenaciones del inmovilizado', prefijos: ['670', '671', '672', '690', '691', '692', '770', '771', '772', '790', '791', '792'] },
  { id: '12', titulo: '12. Otros resultados', prefijos: ['678', '778'] },
  { id: 'A', titulo: 'A) RESULTADO DE EXPLOTACIÓN (1 a 12)', suma: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'] },
  { id: '13', titulo: '13. Ingresos financieros', prefijos: ['760', '761', '762', '767', '769'] },
  { id: '14', titulo: '14. Gastos financieros', prefijos: ['660', '661', '662', '664', '665', '669'] },
  { id: '15', titulo: '15. Variación de valor razonable en instrumentos financieros', prefijos: ['663', '763'] },
  { id: '16', titulo: '16. Diferencias de cambio', prefijos: ['668', '768'] },
  { id: '17', titulo: '17. Deterioro y resultado por enajenaciones de instrumentos financieros', prefijos: ['666', '667', '673', '675', '696', '697', '698', '699', '766', '773', '775', '796', '797', '798', '799'] },
  { id: 'B', titulo: 'B) RESULTADO FINANCIERO (13 a 17)', suma: ['13', '14', '15', '16', '17'] },
  { id: 'C', titulo: 'C) RESULTADO ANTES DE IMPUESTOS (A + B)', suma: ['A', 'B'] },
  { id: '18', titulo: '18. Impuestos sobre beneficios', prefijos: ['6300', '6301', '633', '638'] },
  { id: 'D', titulo: 'D) RESULTADO DEL EJERCICIO (C + 18)', suma: ['C', '18'] },
];

/** Asigna cada cuenta a la partida hoja con el prefijo más largo. */
export function asignador(arboles: Partida[][]) {
  const pref: { p: string; id: string }[] = [];
  const walk = (ps: Partida[]) => {
    for (const p of ps) {
      for (const x of p.prefijos ?? []) pref.push({ p: x, id: p.id });
      if (p.hijos) walk(p.hijos);
    }
  };
  arboles.forEach(walk);
  pref.sort((a, b) => b.p.length - a.p.length);
  return (codigo: string) => pref.find((x) => codigo.startsWith(x.p))?.id ?? null;
}
