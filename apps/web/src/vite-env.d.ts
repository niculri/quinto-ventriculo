/// <reference types="vite/client" />

// The types of the web's `import.meta.env`.

interface ImportMetaEnv {
  readonly VITE_USERS_SUPABASE_URL?: string;
  readonly VITE_USERS_SUPABASE_PUBLISHABLE_KEY?: string;
  /** The OAuth client ID of Google's button (public); without it the sign-in goes by redirect through Supabase Auth. */
  readonly VITE_GOOGLE_CLIENT_ID?: string;
  /** '1' only in `npm run dev:demo`. */
  readonly VITE_DEMO: string;
  /** The creator's picture for /about ('' without it): `build/creatorPhoto.ts` sets it, only in `vite build`. */
  readonly VITE_CREATOR_PHOTO?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
