// The third-party packages of `/third-party-licenses.json`, which the build generates from node_modules
// (apps/web/build/licenses.ts): the list, or whether it is loading or failed.
import { useEffect, useState } from 'react';

export interface ThirdParty {
  name: string;
  version: string;
  license: string;
  repository: string | null;
  usedBy: ('web' | 'server')[];
}

export function useThirdParty() {
  const [packages, setPackages] = useState<ThirdParty[] | 'loading' | 'error'>('loading');
  useEffect(() => {
    let live = true;
    const request = new AbortController();
    fetch('/third-party-licenses.json', { signal: request.signal })
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json() as Promise<ThirdParty[]>;
      })
      .then((list) => live && setPackages(list))
      .catch(() => live && setPackages('error'));
    return () => {
      live = false;
      request.abort();
    };
  }, []);
  return packages;
}
