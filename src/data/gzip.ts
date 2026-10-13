/**
 * The single-file build (scripts/build-standalone.mjs) stores its big data files gzipped and base64-encoded,
 * which keeps the 1800–2000 borders far below the 16 MB limit without dropping any detail. The browser's own
 * DecompressionStream opens them (every current browser has it); no library is involved.
 */
export async function gunzipBase64(base64: string): Promise<string> {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('Bu tarayıcı sıkıştırılmış veriyi açamıyor (DecompressionStream yok).');
  }
  const binary = atob(base64.trim());
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).text();
}
