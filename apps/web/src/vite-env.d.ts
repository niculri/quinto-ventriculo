/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_USERS_SUPABASE_URL?: string;
  readonly VITE_USERS_SUPABASE_PUBLISHABLE_KEY?: string;
  /** '1' only in `npm run dev:demo`. */
  readonly VITE_DEMO: string;
  /** The creator's picture for /about ('' without it): `build/creator-photo.ts` sets it, only in `vite build`. */
  readonly VITE_CREATOR_PHOTO?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
