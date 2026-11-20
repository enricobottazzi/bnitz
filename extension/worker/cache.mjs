const ttl = 30 * 24 * 60 * 60;

export async function openPaperCache(namespace, {arxivId, abstract, body}) {
  if (!namespace) return null;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify([abstract, body])));
  const fingerprint = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  // Maps with earlier formats or abstract recipes expire under their original keys.
  const key = `paper-map:v6:${encodeURIComponent(arxivId)}`;

  return {
    async get() {
      try {
        const {value, metadata} = await namespace.getWithMetadata(key, 'json');
        return metadata?.fingerprint === fingerprint ? value : null;
      } catch {
        return null;
      }
    },
    async put(result) {
      try {
        await namespace.put(key, JSON.stringify(result), {expirationTtl: ttl, metadata: {fingerprint}});
      } catch {
        // A cache write failure does not prevent the reader from using the result.
      }
    },
  };
}
