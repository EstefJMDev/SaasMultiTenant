import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useRouter } from "@tanstack/react-router";
import { AppTopbarPageInfo } from "./components/AppTopbarPageInfo";
import { NotificationButton } from "./components/NotificationButton";
import { TenantDropdownPanel } from "./components/TenantDropdownPanel";
import { TenantSwitcherButton } from "./components/TenantSwitcherButton";
import { UserMenuButton } from "./components/UserMenuButton";

/**
 * Icono SVG reutilizable.
 * - Acepta un path (string) o varios paths (string[]).
 * - size controla el ancho/alto.
 */
const Svg = ({ d, size = 15 }: { d: string | string[]; size?: number }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    width={size}
    height={size}
  >
    {Array.isArray(d) ? (
      d.map((path, index) => <path key={index} d={path} />)
    ) : (
      <path d={d} />
    )}
  </svg>
);

/**
 * Paths de iconos (tipo lucide) para evitar dependencias extra en el topbar.
 */
const ic = {
  chevronDown: ["M6 9l6 6 6-6"],
  bell: [
    "M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9",
    "M13.73 21a2 2 0 01-3.46 0",
  ],
  moon: ["M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"],
  sun: [
    "M12 3v1M12 20v1M4.22 4.22l.7.7M18.36 18.36l.7.7M3 12H4M20 12h1M4.22 19.78l.7-.7M18.36 5.64l.7-.7",
    "M12 8a4 4 0 100 8 4 4 0 000-8z",
  ],
  logout: [
    "M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4",
    "M16 17l5-5-5-5",
    "M21 12H9",
  ],
  building: ["M3 21h18M3 7l9-4 9 4M4 7v14M20 7v14M8 21v-4h8v4M8 11h8M8 15h8"],
  check: ["M20 6L9 17l-5-5"],
  user: [
    "M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2",
    "M12 3a4 4 0 100 8 4 4 0 000-8z",
  ],
  settings: [
    "M12 1v2",
    "M12 21v2",
    "M4.22 4.22l1.42 1.42",
    "M18.36 18.36l1.42 1.42",
    "M1 12h2",
    "M21 12h2",
    "M4.22 19.78l1.42-1.42",
    "M18.36 5.64l1.42-1.42",
    "M12 8a4 4 0 100 8 4 4 0 000-8z",
  ],
  search: ["M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"],
};

export interface Tenant {
  id: string;
  name: string;
  plan?: string;
}

export interface AppNotificationItem {
  id: number;
  title: string;
  body?: string | null;
  is_read: boolean;
  type?: string;
  reference?: string | null;
  meta?: Record<string, unknown> | null;
}

export interface AppTopbarProps {
  pageTitle: string;
  pageSubtitle?: string;
  pageBreadcrumb?: string;
  pageBreadcrumbCrumbs?: { label: string; to?: string }[];
  pageIcon?: React.ReactNode;
  tenants: Tenant[];
  currentTenant: Tenant | null;
  onTenantChange: (tenant: Tenant) => void;
  showTenantSwitcher?: boolean;
  userName: string;
  userEmail?: string;
  userInitials?: string;
  userAvatar?: string;
  onLogout?: () => void;
  onNotifications?: () => void;
  onNotificationClick?: (notification: AppNotificationItem) => void;
  onMarkAllRead?: () => void;
  isMarkingAllRead?: boolean;
  notifications?: AppNotificationItem[];
  notificationCount?: number;
  showDarkMode?: boolean;
  onDarkModeToggle?: () => void;
  isDarkMode?: boolean;
}

/**
 * Hook simple para dropdowns:
 * - open: visible / hidden
 * - ref: detecta click fuera para cerrar
 */
function useDropdown() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return { open, setOpen, ref };
}

/**
 * Topbar principal (Tenant switcher + dark mode + notifs + user menu).
 *
 * Cambio aplicado aquí:
 * - El contenedor raíz ahora es estilo "glass" (semi-transparente con blur)
 *   para que NO se vea como un "recuadro/caja" encima del contenido.
 * - Se mantienen los dropdowns tal cual para no romper UX.
 * - Ajuste leve en botones: backgrounds más integrados cuando están cerrados.
 */
export const AppTopbar: React.FC<AppTopbarProps> = ({
  pageTitle,
  pageSubtitle,
  pageBreadcrumb,
  pageBreadcrumbCrumbs,
  pageIcon,
  tenants,
  currentTenant,
  onTenantChange,
  showTenantSwitcher = true,
  userName,
  userEmail,
  userInitials = "U",
  userAvatar,
  onLogout,
  onNotifications,
  onNotificationClick,
  onMarkAllRead,
  isMarkingAllRead = false,
  notifications = [],
  notificationCount = 0,
  showDarkMode = true,
  onDarkModeToggle,
  isDarkMode = false,
}) => {
  const router = useRouter();
  const { t } = useTranslation();
  const tenantDd = useDropdown();
  const userDd = useDropdown();
  const notifDd = useDropdown();
  const [tenantSearch, setTenantSearch] = useState("");

  const filteredTenants = tenants.filter((tenant) =>
    tenant.name.toLowerCase().includes(tenantSearch.toLowerCase()),
  );

  // Helpers de estilo para que el topbar "integre" con el fondo
  const glassBg = isDarkMode ? "rgba(10,10,10,0.55)" : "rgba(255,255,255,0.75)";
  const glassBorder = isDarkMode
    ? "1px solid rgba(255,255,255,0.10)"
    : "1px solid rgba(0,0,0,0.06)";
  const textPrimary = isDarkMode ? "rgba(255,255,255,0.92)" : "#111827";
  const textMuted = isDarkMode ? "rgba(255,255,255,0.55)" : "#9ca3af";
  const buttonBorder = isDarkMode
    ? "1px solid rgba(255,255,255,0.12)"
    : "1px solid rgba(0,0,0,0.08)";
  const buttonBgIdle = "transparent";
  const buttonBgHover = isDarkMode
    ? "rgba(255,255,255,0.06)"
    : "rgba(0,0,0,0.03)";
  const panelBg = isDarkMode ? "rgba(20,20,20,0.96)" : "white";
  const panelBorder = isDarkMode
    ? "1px solid rgba(255,255,255,0.10)"
    : "1px solid #e4ebe5";

  const hasRichHeader = Boolean(
    pageBreadcrumb ||
      (pageBreadcrumbCrumbs && pageBreadcrumbCrumbs.length > 0) ||
      pageIcon,
  );

  return (
    <div
      style={{
        height: hasRichHeader ? 72 : 56,
        background: glassBg,
        backdropFilter: "blur(10px)",
        borderBottom: glassBorder,
        padding: "0 24px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexShrink: 0,
        gap: 16,
        position: "relative",
        zIndex: 50,
      }}
    >
      <AppTopbarPageInfo
        pageTitle={pageTitle}
        pageSubtitle={pageSubtitle}
        pageBreadcrumb={pageBreadcrumb}
        pageBreadcrumbCrumbs={pageBreadcrumbCrumbs}
        pageIcon={pageIcon}
        textPrimary={textPrimary}
        textMuted={textMuted}
      />

      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {/* TENANT DROPDOWN */}
        {showTenantSwitcher && (
          <div ref={tenantDd.ref} style={{ position: "relative" }}>
            <TenantSwitcherButton
              open={tenantDd.open}
              isDarkMode={isDarkMode}
              buttonBgIdle={buttonBgIdle}
              buttonBgHover={buttonBgHover}
              buttonBorder={buttonBorder}
              textPrimary={textPrimary}
              currentTenantName={currentTenant?.name}
              onClick={() => tenantDd.setOpen((value) => !value)}
              icon={<Svg d={ic.chevronDown} size={13} />}
            />

            {tenantDd.open && (
              <TenantDropdownPanel
                tenants={tenants}
                filteredTenants={filteredTenants}
                currentTenantId={currentTenant?.id}
                tenantSearch={tenantSearch}
                setTenantSearch={setTenantSearch}
                onTenantChange={onTenantChange}
                onClose={() => tenantDd.setOpen(false)}
                isDarkMode={isDarkMode}
                panelBg={panelBg}
                panelBorder={panelBorder}
                textPrimary={textPrimary}
                textMuted={textMuted}
                searchIcon={<Svg d={ic.search} size={12} />}
                buildingIcon={<Svg d={ic.building} size={13} />}
                checkIcon={<Svg d={ic.check} size={13} />}
              />
            )}
          </div>
        )}

        {/* DARK MODE */}
        {showDarkMode && (
          <button
            onClick={onDarkModeToggle}
            title={isDarkMode ? t('topbar.lightMode') : t('topbar.darkMode')}
            style={{
              width: 34,
              height: 34,
              borderRadius: 8,
              border: buttonBorder,
              background: buttonBgIdle,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: isDarkMode
                ? "#f59e0b"
                : isDarkMode
                  ? "rgba(255,255,255,0.65)"
                  : "#6b7280",
              transition: "all 0.15s",
            }}
            onMouseEnter={(event) => {
              event.currentTarget.style.background = buttonBgHover;
            }}
            onMouseLeave={(event) => {
              event.currentTarget.style.background = buttonBgIdle;
            }}
          >
            <Svg d={isDarkMode ? ic.sun : ic.moon} size={14} />
          </button>
        )}

        {/* NOTIFICATIONS */}
        <div ref={notifDd.ref} style={{ position: "relative" }}>
          <NotificationButton
            isDarkMode={isDarkMode}
            buttonBorder={buttonBorder}
            buttonBgIdle={buttonBgIdle}
            buttonBgHover={buttonBgHover}
            notificationCount={notificationCount}
            onClick={() => {
              notifDd.setOpen((value) => !value);
              onNotifications?.();
            }}
            icon={<Svg d={ic.bell} size={14} />}
          />

          {notifDd.open && (
            <div
              style={{
                position: "absolute",
                top: "calc(100% + 6px)",
                right: 0,
                width: 440,
                background: panelBg,
                borderRadius: 10,
                border: panelBorder,
                boxShadow:
                  "0 8px 24px rgba(0,0,0,0.1), 0 2px 6px rgba(0,0,0,0.06)",
                overflow: "hidden",
                zIndex: 100,
              }}
            >
              <div
                style={{
                  padding: "12px 14px",
                  borderBottom: isDarkMode
                    ? "1px solid rgba(255,255,255,0.06)"
                    : "1px solid var(--chakra-colors-brand-50)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 8,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: "0.08em",
                    color: textMuted,
                    textTransform: "uppercase",
                  }}
                >
                  <span>{t('topbar.notifications')}</span>
                  {notificationCount > 0 && (
                    <span
                      style={{
                        background: "#ef4444",
                        color: "white",
                        borderRadius: 10,
                        padding: "1px 7px",
                        fontSize: 10,
                        fontWeight: 700,
                        letterSpacing: 0,
                      }}
                    >
                      {notificationCount > 99 ? "99+" : notificationCount}
                    </span>
                  )}
                </div>
                {notificationCount > 0 && onMarkAllRead && (
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      if (!isMarkingAllRead) onMarkAllRead();
                    }}
                    disabled={isMarkingAllRead}
                    style={{
                      background: "transparent",
                      border: "none",
                      padding: 0,
                      fontSize: 11,
                      fontWeight: 600,
                      color: isMarkingAllRead
                        ? textMuted
                        : "var(--chakra-colors-brand-500)",
                      cursor: isMarkingAllRead ? "not-allowed" : "pointer",
                      textTransform: "none",
                      letterSpacing: 0,
                      textDecoration: "underline",
                    }}
                  >
                    {isMarkingAllRead
                      ? t('topbar.markingAllRead', { defaultValue: 'Marcando…' })
                      : t('topbar.markAllRead', { defaultValue: 'Marcar todas como leídas' })}
                  </button>
                )}
              </div>
              <div style={{ maxHeight: 520, overflowY: "auto" }}>
                {notifications.length === 0 ? (
                  <div
                    style={{
                      padding: "14px 16px",
                      fontSize: 12,
                      color: textMuted,
                      textAlign: "center",
                    }}
                  >
                    {t('topbar.noNotifications')}
                  </div>
                ) : (
                  notifications.map((notification) => (
                    <button
                      key={notification.id}
                      onClick={() => {
                        onNotificationClick?.(notification);
                        notifDd.setOpen(false);
                      }}
                      style={{
                        width: "100%",
                        border: "none",
                        textAlign: "left",
                        padding: "10px 12px",
                        display: "flex",
                        flexDirection: "column",
                        gap: 4,
                        background: notification.is_read
                          ? "transparent"
                          : isDarkMode
                            ? "rgba(55,176,111,0.16)"
                            : "var(--chakra-colors-brand-50)",
                        cursor: "pointer",
                        transition: "background 0.12s",
                      }}
                      onMouseEnter={(event) => {
                        event.currentTarget.style.background = isDarkMode
                          ? "rgba(255,255,255,0.05)"
                          : "#f8faf9";
                      }}
                      onMouseLeave={(event) => {
                        event.currentTarget.style.background =
                          notification.is_read
                            ? "transparent"
                            : isDarkMode
                              ? "rgba(55,176,111,0.16)"
                              : "var(--chakra-colors-brand-50)";
                      }}
                    >
                      <div
                        style={{
                          fontSize: 12,
                          fontWeight: notification.is_read ? 500 : 700,
                          color: textPrimary,
                        }}
                      >
                        {notification.title}
                      </div>
                      {notification.body && (
                        <div
                          style={{
                            fontSize: 11,
                            lineHeight: 1.5,
                            color: isDarkMode
                              ? "rgba(255,255,255,0.60)"
                              : "#6b7280",
                            whiteSpace: "pre-line",
                          }}
                        >
                          {notification.body}
                        </div>
                      )}
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* USER MENU */}
        <div ref={userDd.ref} style={{ position: "relative" }}>
          <UserMenuButton
            open={userDd.open}
            userName={userName}
            userEmail={userEmail}
            userInitials={userInitials}
            userAvatar={userAvatar}
            textPrimary={textPrimary}
            textMuted={textMuted}
            buttonBgHover={buttonBgHover}
            buttonBorder={buttonBorder}
            isDarkMode={isDarkMode}
            onClick={() => userDd.setOpen((value) => !value)}
          />

          {userDd.open && (
            <div
              style={{
                position: "absolute",
                top: "calc(100% + 6px)",
                right: 0,
                width: 200,
                background: panelBg,
                borderRadius: 10,
                border: panelBorder,
                boxShadow:
                  "0 8px 24px rgba(0,0,0,0.1), 0 2px 6px rgba(0,0,0,0.06)",
                overflow: "hidden",
                zIndex: 100,
              }}
            >
              <div
                style={{
                  padding: "12px 14px",
                  borderBottom: isDarkMode
                    ? "1px solid rgba(255,255,255,0.06)"
                    : "1px solid var(--chakra-colors-brand-50)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                  <div
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: "50%",
                      background: "var(--chakra-colors-brand-500)",
                      flexShrink: 0,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <span
                      style={{ fontSize: 12, fontWeight: 700, color: "white" }}
                    >
                      {userInitials}
                    </span>
                  </div>
                  <div style={{ overflow: "hidden" }}>
                    <div
                      style={{
                        fontSize: 12.5,
                        fontWeight: 600,
                        color: textPrimary,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {userName}
                    </div>
                    {userEmail && (
                      <div
                        style={{
                          fontSize: 10.5,
                          color: textMuted,
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          marginTop: 1,
                        }}
                      >
                        {userEmail}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div style={{ padding: "4px 0" }}>
                <button
                  onClick={() => {
                    userDd.setOpen(false);
                    router.history.push("/user-settings");
                  }}
                  style={{
                    width: "100%",
                    border: "none",
                    textAlign: "left",
                    padding: "8px 14px",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    background: "transparent",
                    cursor: "pointer",
                    transition: "background 0.12s",
                    fontSize: 12.5,
                    color: isDarkMode ? "#e5e7eb" : "#111827",
                    fontWeight: 500,
                  }}
                  onMouseEnter={(event) => {
                    event.currentTarget.style.background = isDarkMode
                      ? "rgba(255,255,255,0.05)"
                      : "#f9fafb";
                  }}
                  onMouseLeave={(event) => {
                    event.currentTarget.style.background = "transparent";
                  }}
                >
                  <Svg d={ic.settings} size={13} />
                  {t('topbar.userSettings')}
                </button>
                <div style={{ height: 1, background: "var(--chakra-colors-brand-50)", margin: "4px 0" }} />
                <button
                  onClick={() => {
                    userDd.setOpen(false);
                    onLogout?.();
                  }}
                  style={{
                    width: "100%",
                    border: "none",
                    textAlign: "left",
                    padding: "8px 14px",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    background: "transparent",
                    cursor: "pointer",
                    transition: "background 0.12s",
                    fontSize: 12.5,
                    color: "#ef4444",
                    fontWeight: 500,
                  }}
                  onMouseEnter={(event) => {
                    event.currentTarget.style.background = isDarkMode
                      ? "rgba(239,68,68,0.12)"
                      : "#fff5f5";
                  }}
                  onMouseLeave={(event) => {
                    event.currentTarget.style.background = "transparent";
                  }}
                >
                  <Svg d={ic.logout} size={13} />
                  {t('topbar.logout')}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

