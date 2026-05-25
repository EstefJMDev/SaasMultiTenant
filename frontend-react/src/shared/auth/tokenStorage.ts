const ACCESS_TOKEN_KEY = "access_token";

export const storeAccessToken = (token?: string | null): void => {
  if (typeof window === "undefined") return;
  const value = (token ?? "").trim();
  if (!value) return;
  window.localStorage.setItem(ACCESS_TOKEN_KEY, value);
};

export const readAccessToken = (): string | null => {
  if (typeof window === "undefined") return null;
  const value = window.localStorage.getItem(ACCESS_TOKEN_KEY);
  return value && value.trim() ? value.trim() : null;
};

export const clearAccessToken = (): void => {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(ACCESS_TOKEN_KEY);
};
