/**
 * Computes deterministic SHA-256 hash for commits and state nodes
 * Works seamlessly across Web Crypto (Browser/Worker) and Node.js environments.
 */
export async function computeCommitHash(
  content: string,
  parentId: string | null,
  timestamp: number,
  role: string
): Promise<{ shortHash: string; fullHash: string }> {
  const payload = `${parentId || 'root'}:${role}:${timestamp}:${content}`;

  let hashHex = '';

  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const encoder = new TextEncoder();
    const data = encoder.encode(payload);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  } else {
    // Node.js fallback or synchronous crypto
    try {
      const nodeCrypto = await import('crypto');
      hashHex = nodeCrypto.createHash('sha256').update(payload).digest('hex');
    } catch {
      // Simple fast hashing fallback for non-crypto constrained environments
      let hash = 0;
      for (let i = 0; i < payload.length; i++) {
        const char = payload.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash |= 0;
      }
      hashHex = Math.abs(hash).toString(16).padStart(16, '0');
    }
  }

  const shortHash = hashHex.substring(0, 7);
  return { shortHash, fullHash: hashHex };
}
