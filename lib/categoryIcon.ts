// Icono y color de cada categoría (por palabras del nombre), para las listas de movimientos
const RULES: [RegExp, string, string][] = [
  [/super|aliment|mercad|compra/i, "🛒", "45 204 205"],
  [/restaur|bar|cafe|comida fuera|ocio|cena/i, "🍽️", "240 150 20"],
  [/gasol|coche|transp|parking|peaje|taxi|uber/i, "⛽", "25 115 184"],
  [/ropa|moda|zapat/i, "👕", "190 90 200"],
  [/salud|farmac|medic|dent|gym|gimnas|deporte/i, "💊", "214 55 70"],
  [/casa|hogar|mueble|bricol|limpieza/i, "🏠", "2 132 104"],
  [/viaj|hotel|vuelo|vacacion/i, "✈️", "0 150 220"],
  [/regal/i, "🎁", "230 90 130"],
  [/suscrip|netflix|spotify|digital|tecnol|movil|internet/i, "📱", "100 110 230"],
  [/niñ|hij|cole|educa|libro/i, "🎒", "250 178 25"],
  [/mascota|perro|gato/i, "🐾", "150 110 60"],
  [/bizum|transfer/i, "↔️", "125 138 160"],
];

export function categoryIcon(name: string | null | undefined): { emoji: string; rgb: string } {
  const n = name ?? "";
  for (const [re, emoji, rgb] of RULES) if (re.test(n)) return { emoji, rgb };
  return { emoji: "•", rgb: "125 138 160" };
}
