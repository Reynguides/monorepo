/**
 * Standard-base64 → bytes (as a fresh `ArrayBuffer`). Workers have no
 * node:buffer; `atob` covers standard base64 (the wire format for image
 * uploads). Throws on invalid input so the handler can map it to a 400.
 */
export function base64ToArrayBuffer(input: string): ArrayBuffer {
  const binary = atob(input);
  const buffer = new ArrayBuffer(binary.length);
  const view = new Uint8Array(buffer);
  for (let i = 0; i < binary.length; i++) {
    view[i] = binary.charCodeAt(i);
  }
  return buffer;
}
