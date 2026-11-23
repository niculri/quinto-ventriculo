// What makes old every read of the material, in both caches of the site: app/Providers.tsx provides it; publishing,
// undoing and changing what the site shows call it.
import { createContext, use } from 'react';

export const RefreshContentContext = createContext<() => void>(() => undefined);

export const useRefreshContent = () => use(RefreshContentContext);
