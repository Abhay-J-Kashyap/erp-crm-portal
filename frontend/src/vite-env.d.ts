/// <reference types="vite/client" />

/**
 * Types for import.meta.env. Without this, TypeScript doesn't know
 * `import.meta.env` exists — it's a Vite-specific global injected at
 * build time. Declaring the shape also gives autocomplete on your
 * own VITE_ variables.
 */
interface ImportMetaEnv {
  readonly VITE_API_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
