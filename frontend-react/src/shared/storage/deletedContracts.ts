// Almacén persistente de IDs de contratos eliminados localmente.
// Workaround porque el backend remoto hace soft-delete pero el listado
// no filtra `deleted_at` y `ContractRead` no expone el campo.
// Persistir en localStorage permite que la eliminación sobreviva refresh.

const STORAGE_KEY = "saas:deleted-contracts";

const read = (): Set<number> => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(
      parsed
        .map((v) => Number(v))
        .filter((v) => Number.isInteger(v) && v > 0),
    );
  } catch {
    return new Set();
  }
};

const write = (set: Set<number>) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...set]));
  } catch {
    // ignore quota errors
  }
};

export const getDeletedContractIds = (): Set<number> => read();

export const addDeletedContractId = (id: number): void => {
  const set = read();
  set.add(id);
  write(set);
};

export const isContractDeleted = (id: number): boolean =>
  read().has(id);
