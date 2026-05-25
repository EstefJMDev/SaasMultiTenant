import React from "react";

import type { Tenant } from "../AppTopbar";

interface TenantDropdownPanelProps {
  tenants: Tenant[];
  filteredTenants: Tenant[];
  currentTenantId?: string;
  tenantSearch: string;
  setTenantSearch: (value: string) => void;
  onTenantChange: (tenant: Tenant) => void;
  onClose: () => void;
  isDarkMode: boolean;
  panelBg: string;
  panelBorder: string;
  textPrimary: string;
  textMuted: string;
  searchIcon: React.ReactNode;
  buildingIcon: React.ReactNode;
  checkIcon: React.ReactNode;
}

export const TenantDropdownPanel: React.FC<TenantDropdownPanelProps> = ({
  tenants,
  filteredTenants,
  currentTenantId,
  tenantSearch,
  setTenantSearch,
  onTenantChange,
  onClose,
  isDarkMode,
  panelBg,
  panelBorder,
  textPrimary,
  textMuted,
  searchIcon,
  buildingIcon,
  checkIcon,
}) => {
  return (
    <div
      style={{
        position: "absolute",
        top: "calc(100% + 6px)",
        right: 0,
        width: 240,
        background: panelBg,
        borderRadius: 10,
        border: panelBorder,
        boxShadow: "0 8px 24px rgba(0,0,0,0.1), 0 2px 6px rgba(0,0,0,0.06)",
        overflow: "hidden",
        zIndex: 100,
      }}
    >
      <div
        style={{
          padding: "10px 12px 8px",
          borderBottom: isDarkMode
            ? "1px solid rgba(255,255,255,0.06)"
            : "1px solid var(--chakra-colors-brand-50)",
        }}
      >
        <div
          style={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: "0.08em",
            color: textMuted,
            textTransform: "uppercase",
            marginBottom: 6,
          }}
        >
          Cambiar tenant
        </div>
        {tenants.length > 4 && (
          <div style={{ position: "relative" }}>
            <div
              style={{
                position: "absolute",
                left: 8,
                top: "50%",
                transform: "translateY(-50%)",
                color: textMuted,
              }}
            >
              {searchIcon}
            </div>
            <input
              autoFocus
              value={tenantSearch}
              onChange={(event) => setTenantSearch(event.target.value)}
              placeholder="Buscar tenant"
              style={{
                width: "100%",
                border: isDarkMode
                  ? "1px solid rgba(255,255,255,0.12)"
                  : "1px solid #e5e7eb",
                borderRadius: 6,
                padding: "5px 8px 5px 26px",
                fontSize: 12,
                outline: "none",
                background: isDarkMode ? "rgba(255,255,255,0.05)" : "#fafafa",
                color: textPrimary,
              }}
            />
          </div>
        )}
      </div>

      <div style={{ maxHeight: 220, overflowY: "auto", padding: "4px 0" }}>
        {filteredTenants.length === 0 ? (
          <div
            style={{
              padding: "12px 16px",
              fontSize: 12,
              color: textMuted,
              textAlign: "center",
            }}
          >
            Sin resultados
          </div>
        ) : (
          filteredTenants.map((tenant) => {
            const isSelected = currentTenantId === tenant.id;
            return (
              <button
                key={tenant.id}
                onClick={() => {
                  onTenantChange(tenant);
                  onClose();
                  setTenantSearch("");
                }}
                style={{
                  width: "100%",
                  border: "none",
                  textAlign: "left",
                  padding: "8px 12px",
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  background: isSelected
                    ? isDarkMode
                      ? "rgba(55,176,111,0.16)"
                      : "var(--chakra-colors-brand-50)"
                    : "transparent",
                  cursor: "pointer",
                  transition: "background 0.12s",
                }}
                onMouseEnter={(event) => {
                  if (!isSelected) {
                    event.currentTarget.style.background = isDarkMode
                      ? "rgba(255,255,255,0.05)"
                      : "#f8faf9";
                  }
                }}
                onMouseLeave={(event) => {
                  if (!isSelected) {
                    event.currentTarget.style.background = "transparent";
                  }
                }}
              >
                <div
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 7,
                    flexShrink: 0,
                    background: isSelected
                      ? isDarkMode
                        ? "rgba(55,176,111,0.20)"
                        : "var(--chakra-colors-brand-100)"
                      : isDarkMode
                        ? "rgba(255,255,255,0.06)"
                        : "#f3f4f6",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: isSelected
                      ? "var(--chakra-colors-brand-400)"
                      : isDarkMode
                        ? "rgba(255,255,255,0.65)"
                        : "#6b7280",
                  }}
                >
                  {buildingIcon}
                </div>

                <div style={{ flex: 1, overflow: "hidden" }}>
                  <div
                    style={{
                      fontSize: 12.5,
                      fontWeight: isSelected ? 600 : 400,
                      color: isSelected
                        ? "var(--chakra-colors-brand-400)"
                        : textPrimary,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {tenant.name}
                  </div>
                  {tenant.plan && (
                    <div
                      style={{
                        fontSize: 10.5,
                        color: textMuted,
                        marginTop: 1,
                      }}
                    >
                      {tenant.plan}
                    </div>
                  )}
                </div>

                {isSelected && (
                  <span
                    style={{
                      color: "var(--chakra-colors-brand-400)",
                      display: "flex",
                      flexShrink: 0,
                    }}
                  >
                    {checkIcon}
                  </span>
                )}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
};
