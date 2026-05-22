import React, { useMemo } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";

import { AppTopbar, type Tenant } from "./AppTopbar";
import { useCurrentUser } from "@hooks/useCurrentUser";
import { useEffectiveTenantId } from "@hooks/useEffectiveTenantId";
import { fetchAllTenants } from "@api/users";
import { fetchBranding } from "@api/branding";
import { parseTenantId, readTenantId, writeTenantId } from "@shared/api/tenant";
import { apiClient } from "@shared/api/client";
import {
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type NotificationItem,
} from "@api/notifications";
import { setContractDeepLink } from "@widgets/contracts/contractDeepLink";

interface ConnectedTopbarProps {
  pageTitle: string;
  pageSubtitle?: string;
  pageBreadcrumb?: string;
  pageBreadcrumbCrumbs?: { label: string; to?: string }[];
  pageIcon?: React.ReactNode;
}

const isUnauthorizedError = (error: unknown): boolean =>
  Boolean(
    error &&
      typeof error === "object" &&
      "response" in error &&
      (error as { response?: { status?: number } }).response?.status === 401,
  );

const hasQueryError = (error: unknown): boolean => Boolean(error);

const resolveNotificationTarget = (notification: NotificationItem): string => {
  const meta = notification.meta ?? null;

  // Preferimos meta estructurado (nuevo flujo) sobre reference textual (legado).
  if (meta && typeof meta === "object") {
    if (meta.entity === "comparative" && meta.contract_id) {
      // Eventos de flujo de aprobación → panel de aprobaciones del comparativo.
      if (
        meta.event === "COMPARATIVE_PENDING_APPROVAL" ||
        meta.event === "COMPARATIVE_APPROVED" ||
        meta.event === "COMPARATIVE_AUTO_APPROVED" ||
        meta.event === "COMPARATIVE_REJECTED"
      ) {
        return `/comparatives/${meta.contract_id}/aprobaciones`;
      }
      return `/comparatives/${meta.contract_id}/info`;
    }
    if (meta.entity === "contract" && meta.contract_id) {
      const parts = [`contractId=${meta.contract_id}`];
      parts.push(`view=${meta.view || "contrato-form"}`);
      parts.push("mode=ver");
      if (meta.doc) parts.push(`doc=${meta.doc}`);
      return `/contracts?${parts.join("&")}`;
    }
    if (meta.entity === "ticket" && meta.ticket_id) {
      return `/support?ticketId=${meta.ticket_id}`;
    }
    if (meta.entity === "task" && meta.task_id) {
      return `/tasks?taskId=${meta.task_id}`;
    }
    if (meta.entity === "project" && meta.project_id) {
      const docQs = meta.document_id ? `?documentId=${meta.document_id}` : "";
      return `/works/${meta.project_id}/documents${docQs}`;
    }
  }

  // Fallback: parseo del campo reference legado.
  const ref = (notification.reference || "").trim();
  const type = typeof notification.type === "string" ? notification.type : "";
  const viewMatch = ref.match(/(?:^|[?&,\s])view=([a-z0-9_-]+)/i);
  const view = viewMatch?.[1];

  const ticketMatch = ref.match(/(?:^|[?&,\s])ticket_id=(\d+)/i);
  if (ticketMatch?.[1]) {
    return `/support?ticketId=${ticketMatch[1]}`;
  }

  const docMatch = ref.match(/(?:^|[?&,\s])doc=([A-Z_]+)/);
  const doc = docMatch?.[1];

  const contractMatch = ref.match(/(?:^|[?&,\s])contract_id=(\d+)/i);
  if (contractMatch?.[1]) {
    const id = contractMatch[1];
    if (view === "comparativo-review") {
      return `/comparatives/${id}/info`;
    }
    const parts = [`contractId=${id}`];
    parts.push(`view=${view || "contrato-form"}`);
    parts.push("mode=ver");
    if (doc) parts.push(`doc=${doc}`);
    return `/contracts?${parts.join("&")}`;
  }

  const comparativeMatch = ref.match(/(?:^|[?&,\s])comparative_id=(\d+)/i);
  if (comparativeMatch?.[1]) {
    return `/comparatives/${comparativeMatch[1]}/info`;
  }

  const projectMatch = ref.match(/(?:^|[?&,\s])project_id=(\d+)/i);
  const documentMatch = ref.match(/(?:^|[?&,\s])document_id=(\d+)/i);
  if (projectMatch?.[1]) {
    const docQs = documentMatch?.[1] ? `?documentId=${documentMatch[1]}` : "";
    return `/works/${projectMatch[1]}/documents${docQs}`;
  }

  const taskMatch = ref.match(/(?:^|[?&,\s])task_id=(\d+)/i);
  if (taskMatch?.[1]) {
    return `/tasks?taskId=${taskMatch[1]}`;
  }

  if (type.startsWith("ticket_")) {
    return "/support";
  }

  return "/dashboard";
};

export const ConnectedTopbar: React.FC<ConnectedTopbarProps> = ({
  pageTitle,
  pageSubtitle,
  pageBreadcrumb,
  pageBreadcrumbCrumbs,
  pageIcon,
}) => {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: currentUser } = useCurrentUser();
  const { tenantId, isSuperAdmin } = useEffectiveTenantId();

  const storedTenantId = parseTenantId(readTenantId());

  const tenantsQuery = useQuery({
    queryKey: ["tenants-switcher"],
    queryFn: fetchAllTenants,
    enabled: isSuperAdmin,
  });

  const brandingQuery = useQuery({
    queryKey: ["tenant-branding-topbar", tenantId],
    queryFn: () => fetchBranding(tenantId as number),
    enabled: Boolean(tenantId) && !isSuperAdmin,
  });

  const notificationsQuery = useQuery({
    queryKey: ["notifications", { onlyUnread: false }],
    queryFn: () => fetchNotifications(false, 10),
    enabled: Boolean(currentUser),
    retry: false,
    refetchInterval: (query) => {
      if (!currentUser) return false;
      if (isUnauthorizedError(query.state.error)) return false;
      if (hasQueryError(query.state.error)) return false;
      return 30000;
    },
  });

  const markReadMutation = useMutation({
    mutationFn: (id: number) => markNotificationRead(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  const markAllReadMutation = useMutation({
    mutationFn: () => markAllNotificationsRead(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  const tenants = useMemo<Tenant[]>(() => {
    if (isSuperAdmin) {
      return (tenantsQuery.data ?? []).map((tenant) => ({
        id: String(tenant.id),
        name: tenant.name,
        plan: tenant.subdomain,
      }));
    }

    if (tenantId) {
      const name =
        brandingQuery.data?.company_name ??
        currentUser?.tenant_id?.toString() ??
        "Tenant";
      return [
        {
          id: String(tenantId),
          name,
        },
      ];
    }

    return [];
  }, [
    brandingQuery.data?.company_name,
    currentUser?.tenant_id,
    isSuperAdmin,
    tenantId,
    tenantsQuery.data,
  ]);

  const currentTenant = useMemo<Tenant | null>(() => {
    if (isSuperAdmin) {
      return tenants.find((tenant) => tenant.id === storedTenantId) ?? null;
    }
    return tenants[0] ?? null;
  }, [isSuperAdmin, storedTenantId, tenants]);

  const handleTenantChange = (tenant: Tenant) => {
    if (!isSuperAdmin) return;
    if (tenant.id === storedTenantId) return;
    queryClient.cancelQueries();
    writeTenantId(tenant.id);
    queryClient.clear();
    router.history.push("/dashboard");
  };

  const handleLogout = () => {
    void apiClient.post("/api/v1/auth/logout").catch(() => undefined);
    queryClient.clear();
    router.history.push("/");
  };

  const handleNotificationClick = async (notification: NotificationItem) => {
    try {
      await markReadMutation.mutateAsync(notification.id);
    } finally {
      // Caso especial: contratos no tienen ruta /contracts/$id, el contrato
      // "abierto" es estado interno de ContractsModule. Pasamos el deep link
      // via store global (CustomEvent) y navegamos al listado.
      const meta = notification.meta ?? null;
      if (
        meta &&
        typeof meta === "object" &&
        meta.entity === "contract" &&
        meta.contract_id
      ) {
        setContractDeepLink({
          contractId: meta.contract_id,
          view: meta.view || "contrato-form",
          mode: (meta.mode as "ver" | "editar") || "ver",
          doc: meta.doc,
        });
        void router.navigate({ to: "/contracts" });
        return;
      }
      const target = resolveNotificationTarget(notification);
      // history.push respeta paths dinámicos (p.ej. /comparatives/219/aprobaciones).
      // router.navigate({to}) requiere matchear ruta tipada con params.
      router.history.push(target);
    }
  };

  const fullName = currentUser?.full_name ?? currentUser?.email ?? "Usuario";
  const userInitials = fullName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("");

  const notifications = (notificationsQuery.data?.items ?? []).map((item) => ({
    id: item.id,
    title: item.title,
    body: item.body,
    is_read: item.is_read,
    type: item.type,
    reference: item.reference,
    meta: item.meta,
  }));

  const notificationCount =
    notificationsQuery.data?.items.filter((item) => !item.is_read).length ?? 0;

  return (
    <AppTopbar
      pageTitle={pageTitle}
      pageSubtitle={pageSubtitle}
      pageBreadcrumb={pageBreadcrumb}
      pageBreadcrumbCrumbs={pageBreadcrumbCrumbs}
      pageIcon={pageIcon}
      tenants={tenants}
      currentTenant={currentTenant}
      onTenantChange={handleTenantChange}
      showTenantSwitcher={isSuperAdmin}
      userName={fullName}
      userEmail={currentUser?.email ?? undefined}
      userInitials={userInitials}
      userAvatar={currentUser?.avatar_data ?? currentUser?.avatar_url ?? undefined}
      onLogout={handleLogout}
      onNotifications={() => undefined}
      onNotificationClick={(notification) =>
        handleNotificationClick(notification as NotificationItem)
      }
      onMarkAllRead={() => markAllReadMutation.mutate()}
      isMarkingAllRead={markAllReadMutation.isPending}
      notifications={notifications}
      notificationCount={notificationCount}
      showDarkMode={false}
      isDarkMode={false}
    />
  );
};
