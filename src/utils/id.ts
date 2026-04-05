export const createId = () => {
  if (typeof globalThis !== "undefined" && "crypto" in globalThis) {
    const cryptoObj = globalThis.crypto as Crypto | undefined;
    if (cryptoObj?.randomUUID) {
      return cryptoObj.randomUUID();
    }
  }
  return `id_${Math.random().toString(36).slice(2, 10)}`;
};
