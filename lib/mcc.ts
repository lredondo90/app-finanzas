/** Tipo de comercio según el código de la tarjeta (MCC) */
export function mccLabel(mcc: string | null | undefined): string | null {
  if (!mcc) return null;
  const n = Number(mcc);
  if (!n) return null;
  const ranges: [number, number, string][] = [
    [5411, 5412, "Supermercado"], [5422, 5499, "Alimentación"], [5811, 5814, "Restaurante / bar"],
    [5541, 5542, "Gasolinera"], [7523, 7523, "Parking"], [7531, 7549, "Taller"], [4784, 4784, "Peaje"],
    [5912, 5912, "Farmacia"], [8011, 8099, "Salud"], [5122, 5122, "Farmacia"],
    [5611, 5699, "Ropa"], [5311, 5311, "Grandes almacenes"], [5310, 5310, "Tienda descuento"], [5940, 5949, "Tienda"],
    [3000, 3350, "Aerolínea"], [3501, 3999, "Hotel"], [7011, 7011, "Hotel"], [4111, 4131, "Transporte"], [4121, 4121, "Taxi / VTC"],
    [4511, 4511, "Aerolínea"], [4722, 4722, "Agencia de viajes"],
    [5200, 5251, "Bricolaje / hogar"], [5712, 5719, "Hogar"], [5722, 5732, "Electrónica"],
    [5815, 5818, "Suscripción digital"], [4812, 4816, "Telecomunicaciones"], [4900, 4900, "Suministros"],
    [7832, 7832, "Cine"], [7991, 7999, "Ocio"], [5992, 5992, "Floristería"], [5945, 5945, "Juguetería"],
    [6010, 6011, "Retirada de efectivo"], [5960, 5969, "Venta online"], [5399, 5399, "Tienda"],
  ];
  return ranges.find(([a, b]) => n >= a && n <= b)?.[2] ?? null;
}
