import { QueryClient } from "@tanstack/react-query";
import type { AxiosError } from "axios";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error) => {
        const err = error as AxiosError | undefined;
        const status = err?.response?.status;
        if (status && [400, 401, 403].includes(status)) return false;
        return failureCount < 2;
      },
      refetchOnWindowFocus: false,
    },
  },
});
