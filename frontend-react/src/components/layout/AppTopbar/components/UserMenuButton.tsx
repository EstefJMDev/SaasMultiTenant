import React from "react";

interface UserMenuButtonProps {
  open: boolean;
  userName: string;
  userEmail?: string;
  userInitials: string;
  userAvatar?: string;
  textPrimary: string;
  textMuted: string;
  buttonBgHover: string;
  buttonBorder: string;
  isDarkMode: boolean;
  onClick: () => void;
}

export const UserMenuButton: React.FC<UserMenuButtonProps> = ({
  open,
  userName,
  userEmail,
  userInitials,
  userAvatar,
  textPrimary,
  textMuted,
  buttonBgHover,
  buttonBorder,
  isDarkMode,
  onClick,
}) => {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        height: 34,
        padding: "0 4px 0 8px",
        background: open ? buttonBgHover : "transparent",
        border: open ? buttonBorder : "1px solid transparent",
        borderRadius: 8,
        cursor: "pointer",
        transition: "all 0.15s",
      }}
      onMouseEnter={(event) => {
        if (!open) {
          event.currentTarget.style.background = buttonBgHover;
          event.currentTarget.style.border = buttonBorder;
        }
      }}
      onMouseLeave={(event) => {
        if (!open) {
          event.currentTarget.style.background = "transparent";
          event.currentTarget.style.border = "1px solid transparent";
        }
      }}
    >
      <div style={{ textAlign: "right" }}>
        <div
          style={{
            fontSize: 12.5,
            fontWeight: 600,
            color: textPrimary,
            letterSpacing: "-0.01em",
            lineHeight: 1.2,
          }}
        >
          {userName}
        </div>
        {userEmail && (
          <div
            style={{
              fontSize: 10.5,
              color: textMuted,
              lineHeight: 1.2,
              marginTop: 1,
            }}
          >
            {userEmail}
          </div>
        )}
      </div>

      <div
        style={{
          width: 30,
          height: 30,
          borderRadius: "50%",
          flexShrink: 0,
          background: userAvatar ? "transparent" : "var(--chakra-colors-brand-500)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
          boxShadow: isDarkMode
            ? "0 0 0 2px rgba(10,10,10,0.55), 0 0 0 3px rgba(55,176,111,0.35)"
            : "0 0 0 2px rgba(255,255,255,0.9), 0 0 0 3px var(--chakra-colors-brand-100)",
        }}
      >
        {userAvatar ? (
          <img
            src={userAvatar}
            alt={userName}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : (
          <span style={{ fontSize: 11, fontWeight: 700, color: "white" }}>
            {userInitials}
          </span>
        )}
      </div>
    </button>
  );
};
