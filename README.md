# Quiniela Mundial (Vite + React)

Proyecto migrado a Vite para desarrollo local y build profesional.

## Requisitos

- `pnpm` (recomendado)
- Node.js 18+

## Instalación

```bash
pnpm install
```

## Variables de entorno

Copia `.env.example` a `.env.local` en la raíz del proyecto y reemplaza los valores con tus credenciales de Supabase:

```bash
cp .env.example .env.local
```

Luego edita `.env.local` con:

```env
VITE_SUPABASE_URL=https://<tu-proyecto>.supabase.co
VITE_SUPABASE_ANON_KEY=<tu-anon-key>
```

## Ejecutar en desarrollo

```bash
pnpm run dev
```

Abre `http://localhost:5173`.

## Build de producción

```bash
pnpm run build
```

## Qué incluye esta migración

- App migrada a React 18 + Vite
- Autenticación con Supabase
- Páginas de partidos, ranking y admin
- Manejo de partidas, predicciones y resultados
- Estilos compartidos en `src/styles.css`
- `.gitignore` para `node_modules`, `dist` y archivos de entorno

## Notas adicionales

- Se conserva `quiniela-mundial.html` como referencia del HTML original.
- Si quieres, puedo seguir y refactorizar la aplicación en componentes separados (`src/components/`).
