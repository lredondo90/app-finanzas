# Mis Finanzas

App web de presupuesto y gastos personales basada en el Excel `Presupuesto_2026.xlsx`.
Next.js 15 + Supabase (base de datos y login) + Vercel (hosting). Se puede instalar en el móvil como app (PWA).

## Pantallas

| Pantalla | Equivale en el Excel | Qué hace |
|---|---|---|
| **Dashboard** | Mensual | Resumen del mes: ingresos, gastos, resultado, resultado tras inversión, gasto variable real vs previsto, gasto por categoría, gastos fijos, gráfico del año y últimos gastos. Permite apuntar un gasto rápido. |
| **Gastos** | Variables | Lista de gastos variables por mes, filtro por categoría, alta/edición/borrado. |
| **Presupuesto** | Fijos + Ajustes + Mensual | Tabla de 12 meses. Modo *Plan fijo* (lo previsto) y modo *Mensual + ajustes* (importe real del mes que se desvía, en naranja). Botón «¿Mes cerrado?» por mes. |
| **Anuales** | Anuales | Recibos anuales, cuota mensual y saldo del fondo mes a mes. |
| **Inversión** | Planes + Inversiones + Cartera | Planes de ahorro periódico (fijo + extras por mes), operaciones puntuales y posición por activo. |
| **Patrimonio** | Patrimonio | Saldos por banco, fondos, reserva de efectivo en meses e histórico. |
| **Ajustes** | Listas | Importar el Excel, año activo, categorías y métodos de pago. |

Los cálculos replican las fórmulas del Excel (por ejemplo, el gasto variable considerado es la provisión mientras el mes está abierto y el gasto real cuando lo cierras).

## Puesta en marcha

### 1. Supabase
1. Crea un proyecto en [supabase.com](https://supabase.com) (o usa el que ya está preparado).
2. En **SQL Editor**, pega y ejecuta el contenido de [`supabase/schema.sql`](supabase/schema.sql). Crea las tablas y la seguridad (cada usuario solo ve sus datos).
3. En **Project Settings → API** copia la *Project URL* y la *Publishable key* (o la *anon key*).
4. Opcional: en **Authentication → Sign In / Providers → Email** puedes desactivar «Confirm email» para no tener que confirmar el correo al registrarte. Cuando ya tengas tu cuenta, puedes desactivar «Allow new users to sign up» para que nadie más pueda registrarse.

### 2. Vercel
1. Sube este código a un repositorio de GitHub (privado).
2. En [vercel.com/new](https://vercel.com/new) importa el repositorio (Vercel detecta Next.js solo).
3. En **Environment Variables** añade:
   - `NEXT_PUBLIC_SUPABASE_URL` = la Project URL
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` = la publishable/anon key
4. Pulsa **Deploy**.
5. En Supabase → **Authentication → URL Configuration** pon la URL de Vercel (`https://tu-app.vercel.app`) como *Site URL*.

### 3. Primer uso
1. Abre la app, **regístrate** con tu email y contraseña.
2. Ve a **Ajustes → Importar desde Excel** y sube `Presupuesto_2026.xlsx`. Se cargan todos tus datos.
3. **iPhone**: abre la URL de Vercel en **Safari** → botón **Compartir** → **«Añadir a pantalla de inicio»**. Se instala con su icono y se abre a pantalla completa, sin barra del navegador. La propia app muestra este aviso la primera vez que la abres en el iPhone.

## Desarrollo local

```bash
cp .env.example .env.local   # y rellena las dos variables
npm install
npm run dev                  # http://localhost:3000
```

## Estructura

- `app/(app)/…` páginas (Dashboard en `page.tsx`)
- `app/actions.ts` acciones de servidor (guardar, borrar, importar)
- `lib/finance.ts` cálculos (réplica de las fórmulas del Excel)
- `lib/importExcel.ts` lector del Excel
- `supabase/schema.sql` tablas y políticas de seguridad
