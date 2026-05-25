import React from "react";

interface NotificationButtonProps {
  isDarkMode: boolean;
  buttonBorder: string;
  buttonBgIdle: string;
  buttonBgHover: string;
  notificationCount: number;
  onClick: () => void;
  icon: React.ReactNode;
}

export const NotificationButton: React.FC<NotificationButtonProps> = ({
  isDarkMode,
  buttonBorder,
  buttonBgIdle,
  buttonBgHover,
  notificationCount,
  onClick,
  icon,
}) => {
  return (
    <button
      onClick={onClick}
      title="Notificaciones"
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
        color: isDarkMode ? "rgba(255,255,255,0.70)" : "#6b7280",
        position: "relative",
        transition: "all 0.15s",
      }}
      onMouseEnter={(event) => {
        event.currentTarget.style.background = buttonBgHover;
      }}
      onMouseLeave={(event) => {
        event.currentTarget.style.background = buttonBgIdle;
      }}
    >
      {icon}
      {notificationCount > 0 && (
        <span
          style={{
            position: "absolute",
            top: -2,
            right: -2,
            minWidth: 16,
            height: 16,
            padding: "0 4px",
            borderRadius: 8,
            background: "#ef4444",
            border: "1.5px solid rgba(255,255,255,0.9)",
            fontSize: 9,
            fontWeight: 700,
            color: "white",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            lineHeight: 1,
            boxSizing: "border-box",
          }}
        >
          {notificationCount > 99 ? "99+" : notificationCount}
        </span>
      )}
    </button>
  );
};
