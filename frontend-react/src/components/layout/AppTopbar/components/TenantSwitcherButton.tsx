import React from "react";

interface TenantSwitcherButtonProps {
  open: boolean;
  isDarkMode: boolean;
  buttonBgIdle: string;
  buttonBgHover: string;
  buttonBorder: string;
  textPrimary: string;
  currentTenantName?: string;
  onClick: () => void;
  icon: React.ReactNode;
}

export const TenantSwitcherButton: React.FC<TenantSwitcherButtonProps> = ({
  open,
  isDarkMode,
  buttonBgIdle,
  buttonBgHover,
  buttonBorder,
  textPrimary,
  currentTenantName,
  onClick,
  icon,
}) => {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 7,
        height: 34,
        padding: "0 12px",
        background: open
          ? isDarkMode
            ? "rgba(55,176,111,0.18)"
            : "var(--chakra-colors-brand-50)"
          : buttonBgIdle,
        border: open
          ? isDarkMode
            ? "1px solid rgba(55,176,111,0.45)"
            : "1px solid var(--chakra-colors-brand-300)"
          : buttonBorder,
        borderRadius: 8,
        cursor: "pointer",
        transition: "all 0.15s",
      }}
      onMouseEnter={(event) => {
        if (!open) {
          event.currentTarget.style.background = buttonBgHover;
        }
      }}
      onMouseLeave={(event) => {
        if (!open) {
          event.currentTarget.style.background = buttonBgIdle;
        }
      }}
    >
      <div
        style={{
          width: 7,
          height: 7,
          borderRadius: "50%",
          background: "var(--chakra-colors-brand-400)",
          boxShadow: "0 0 0 2px rgba(55,176,111,0.2)",
          flexShrink: 0,
        }}
      />

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
        }}
      >
        <span
          style={{
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: "0.07em",
            color: "var(--chakra-colors-brand-400)",
            textTransform: "uppercase",
            lineHeight: 1,
          }}
        >
          Tenant
        </span>
        <span
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: textPrimary,
            letterSpacing: "-0.01em",
            lineHeight: 1.2,
            marginTop: 1,
            maxWidth: 120,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {currentTenantName ?? "Seleccionar"}
        </span>
      </div>

      <span
        style={{
          color: isDarkMode ? "rgba(255,255,255,0.65)" : "#6b7280",
          display: "flex",
          transform: open ? "rotate(180deg)" : "none",
          transition: "transform 0.2s",
        }}
      >
        {icon}
      </span>
    </button>
  );
};
