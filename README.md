# fairBill — divide la cuenta del restaurante

PWA para escanear un ticket de restaurante (OCR), repartir los artículos entre los
participantes y calcular cuánto debe pagar cada uno, con IVA, propina y descuentos
prorrateados al céntimo exacto. Construida con Next.js 16 (App Router + Turbopack),
React 19, TypeScript y Tailwind CSS v4.

La app funciona siempre sin conexión y sin backend: todo el cálculo ocurre en el
propio dispositivo, pasando el móvil de mano en mano para que cada participante marque
lo que ha consumido.

## Características

- **Captura y recorte**: foto del ticket con la cámara o desde galería, con ajuste
  manual de las cuatro esquinas y corrección de perspectiva antes del OCR.
- **OCR en el dispositivo**: [Tesseract.js](https://github.com/naptha/tesseract.js)
  corre en el navegador por defecto, sin enviar la foto a ningún servidor. Existe un
  proveedor alternativo (Google Cloud Vision) opcional, vía una API route del servidor.
- **Parser de líneas basado en reglas**: interpreta cantidad/descripción/precio y
  detecta subtotal, IVA, propina, servicio, descuento y total, con una comprobación de
  cuadre y una puntuación de confianza por línea.
- **Editor manual**: cualquier línea leída (o el ticket entero) se puede corregir o
  añadir a mano.
- **Reparto local ("pasa el móvil")**: cada participante marca en su turno qué se ha
  tomado de cada línea (entera, una parte o compartida con otros); el motor de reparto
  reparte céntimos exactos con el método del resto mayor, nunca con `float`.
- **PWA instalable**: manifest, iconos generados y service worker con app-shell
  offline (`public/sw.js`).

## Requisitos previos

- **Node.js** 20 o superior.
- **pnpm** (usa la versión fijada en `packageManager` de [package.json](package.json);
  instálalo con `corepack enable` si no lo tienes).
- (Opcional) Una **API key de Google Cloud Vision** si quieres usar el proveedor de
  OCR en la nube en lugar del OCR por defecto (Tesseract.js en el navegador).

## Puesta en marcha

```bash
git clone <url-del-repositorio>
cd mi-ticket
pnpm install
pnpm dev
```

Abre [http://localhost:3001](http://localhost:3001). Desde la portada puedes hacer
una foto del ticket (o introducir las líneas a mano), revisar/editar el ticket
leído y repartirlo entre los participantes pasando el móvil.

## Variables de entorno (opcional)

Solo hacen falta si quieres usar Google Cloud Vision en vez del OCR por defecto.
Crea un fichero `.env.local` en la raíz del proyecto:

```bash
# Por defecto se usa Tesseract.js en el navegador; no requiere configuración.
# Para usar Google Cloud Vision en su lugar, descomenta y define ambas:
# NEXT_PUBLIC_OCR_PROVIDER=google-vision
# GOOGLE_VISION_API_KEY=<tu api key de Google Vision>
```

`GOOGLE_VISION_API_KEY` solo se usa en el servidor (ruta `src/app/api/ocr/route.ts`):
nunca se expone al cliente.

## Comandos disponibles

```bash
pnpm dev      # servidor de desarrollo (Turbopack)
pnpm build    # build de producción
pnpm start    # sirve el build de producción
pnpm lint     # ESLint
pnpm test     # tests unitarios (Vitest)
pnpm format   # Prettier (con plugin de Tailwind)
pnpm exec tsc --noEmit  # comprobación de tipos
```

## Estructura del proyecto

```
src/
  app/                Rutas (App Router): landing (captura + reparto), API de OCR
  components/         Componentes de UI (captura, recorte, editor de ticket, reparto local, PWA)
  lib/
    money.ts           Helpers de céntimos <-> texto y formato de moneda
    split.ts           Motor de reparto (prorrateo exacto por céntimos, método del resto mayor)
    local-claims.ts     Estado de qué participante reclama cada línea del ticket
    ocr/                Proveedores de OCR (Tesseract.js / Google Vision) + preprocesado y perspectiva
    receipt/            Parser de líneas de ticket + estado editable del editor
scripts/
  generate-icons.mjs   Genera los iconos de la PWA y el favicon a partir de public/icon.svg
public/
  sw.js                Service worker (app shell offline, no cachea /api/*)
```

## Tests

El proyecto usa [Vitest](https://vitest.dev/) + Testing Library. La lógica de
negocio pura (reparto, reclamaciones, parser de ticket, formato de dinero) tiene
cobertura unitaria; la API route de OCR se prueba mockeando la llamada a Google
Vision.

```bash
pnpm test
```

## Notas de la PWA

La app es instalable (manifest en `src/app/manifest.ts`, iconos generados con
`scripts/generate-icons.mjs`) y registra un service worker mínimo que cachea el
app shell y sirve con estrategia stale-while-revalidate. Como no hay backend, toda
la app (captura, OCR y reparto) funciona sin conexión.

## Despliegue

No hace falta backend ni base de datos: basta con desplegar el build estático de
Next.js (por ejemplo en Vercel). Si quieres OCR en la nube, define
`NEXT_PUBLIC_OCR_PROVIDER` y `GOOGLE_VISION_API_KEY` como variables de entorno en la
plataforma elegida, y ejecuta `pnpm build && pnpm start` (o el equivalente de la
plataforma).

