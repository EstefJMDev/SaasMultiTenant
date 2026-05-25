// Deep link pendiente para abrir un contrato directamente desde una notificacion.
// Se evita usar la URL porque el HashRouter de TanStack descarta query params
// no declarados en el route schema.

export type ContractDeepLink = {
  contractId: number;
  view?: string;
  mode?: "ver" | "editar";
  doc?: string;
};

const EVENT_NAME = "contract-deep-link";
const STORAGE_KEY = "contract-deep-link";

function readStorage(): ContractDeepLink | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as ContractDeepLink;
  } catch {
    return null;
  }
}

export function setContractDeepLink(link: ContractDeepLink): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(link));
  } catch {}
  window.dispatchEvent(new CustomEvent(EVENT_NAME));
}

export function consumeContractDeepLink(): ContractDeepLink | null {
  const link = readStorage();
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {}
  return link;
}

export function peekContractDeepLink(): ContractDeepLink | null {
  return readStorage();
}

export function subscribeContractDeepLink(listener: () => void): () => void {
  window.addEventListener(EVENT_NAME, listener);
  return () => window.removeEventListener(EVENT_NAME, listener);
}
