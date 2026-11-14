// The content database's RPCs over plain HTTP, for the reads the Worker passes on as a stream.

/** An RPC called as supabase-js calls it, but returning the response body unparsed. */
export function rawRpcOf(url: string, serviceKey: string, schema: 'public' | 'draft' = 'public') {
  return async (fn: string, args: Record<string, unknown>) => {
    const r = await fetch(`${url.replace(/\/+$/, '')}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(schema === 'public' ? {} : { 'Content-Profile': schema }),
      },
      body: JSON.stringify(args),
    });
    if (!r.ok || !r.body) {
      const detail = await r.text().catch(() => '');
      throw new Error(`Content database (${fn}): ${r.status} ${detail.slice(0, 300)}`);
    }
    return r.body;
  };
}
