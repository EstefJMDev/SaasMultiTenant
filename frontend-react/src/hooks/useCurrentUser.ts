import { useQuery } from "@tanstack/react-query";

import { fetchCurrentUser, type CurrentUser } from "@api/users";

export const currentUserQueryOptions = {
  queryKey: ["current-user"] as const,
  queryFn: fetchCurrentUser,
  retry: false,
  staleTime: 0,
  refetchOnMount: "always" as const,
  refetchOnReconnect: true,
  refetchOnWindowFocus: true,
};

// Siempre obtiene el usuario desde el backend para evitar confiar en el cliente.
export const useCurrentUser = () => {
  const query = useQuery<CurrentUser>({
    ...currentUserQueryOptions,
    enabled: typeof window !== "undefined",
  });

  return query;
};
