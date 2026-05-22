import React, { useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import type { NavSection, NavItem } from "./nav";

const ChevronRight = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    width="13"
    height="13"
  >
    <path d="M9 18l6-6-6-6" />
  </svg>
);

function useActiveRoute() {
  const state = useRouterState();
  return state.location.pathname;
}

function isRouteActive(
  pathname: string,
  to?: string,
  matchPrefix?: boolean,
): boolean {
  if (!to) return false;
  if (matchPrefix) return pathname.startsWith(to);
  return pathname === to;
}

interface NavChildProps {
  item: NavItem;
  pathname: string;
}

const NavChild: React.FC<NavChildProps> = ({ item, pathname }) => {
  const active = isRouteActive(pathname, item.to, item.matchPrefix);

  return (
    <Link
      to={item.to ?? "#"}
      style={{
        width: "calc(100% - 14px)",
        margin: "0 7px 1px",
        background: active ? "rgba(255,255,255,0.08)" : "transparent",
        border: "none",
        borderRadius: 6,
        padding: "5.5px 10px 5.5px 14px",
        display: "flex",
        alignItems: "center",
        gap: 8,
        cursor: "pointer",
        position: "relative",
        textDecoration: "none",
        transition: "background 0.15s",
      }}
      onMouseEnter={(event) => {
        if (!active) {
          event.currentTarget.style.background = "rgba(255,255,255,0.05)";
        }
      }}
      onMouseLeave={(event) => {
        if (!active) {
          event.currentTarget.style.background = "transparent";
        }
      }}
    >
      {active && (
        <div
          style={{
            position: "absolute",
            left: 0,
            top: "50%",
            transform: "translateY(-50%)",
            width: 2,
            height: 13,
            background: "var(--chakra-colors-brand-300)",
            borderRadius: 99,
          }}
        />
      )}

      <div
        style={{
          width: 5,
          height: 5,
          borderRadius: "50%",
        flexShrink: 0,
        background: active
          ? "var(--chakra-colors-brand-300)"
          : "rgba(255,255,255,0.18)",
        transition: "background 0.15s",
      }}
      />

      {item.icon && (
        <span
          style={{
            color: active ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.35)",
            display: "flex",
          }}
        >
          <item.icon size={12} />
        </span>
      )}

      <span
        style={{
          fontSize: 11.5,
          fontWeight: active ? 500 : 400,
          color: active ? "white" : "rgba(255,255,255,0.48)",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          transition: "color 0.15s",
        }}
      >
        {item.label}
      </span>
    </Link>
  );
};

interface NavRowProps {
  item: NavItem;
  pathname: string;
  expanded: string[];
  onToggle: (id: string) => void;
}

const NavRow: React.FC<NavRowProps> = ({
  item,
  pathname,
  expanded,
  onToggle,
}) => {
  const hasChildren = Boolean(item.children?.length);
  const isExpanded = expanded.includes(item.id);

  const directActive = isRouteActive(pathname, item.to, item.matchPrefix);
  const childActive =
    hasChildren &&
    (item.children ?? []).some((child) =>
      isRouteActive(pathname, child.to, child.matchPrefix),
    );
  const isActive = directActive || childActive;

  const handleClick = () => {
    if (hasChildren) {
      onToggle(item.id);
    }
  };

  const Wrapper = hasChildren || !item.to ? "button" : Link;
  const wrapperProps =
    hasChildren || !item.to
      ? { type: "button" as const, onClick: handleClick }
      : { to: item.to };

  return (
    <div style={{ marginBottom: 1 }}>
      <Wrapper
        {...(wrapperProps as any)}
        style={{
          width: "calc(100% - 14px)",
          margin: "0 7px",
          background: isActive || isExpanded ? "rgba(255,255,255,0.09)" : "transparent",
          border: "none",
          borderRadius: 7,
          padding: "6.5px 10px",
          display: "flex",
          alignItems: "center",
          gap: 9,
          cursor: "pointer",
          position: "relative",
          transition: "background 0.15s",
          textAlign: "left",
          textDecoration: "none",
        }}
        onMouseEnter={(event: React.MouseEvent<HTMLElement>) => {
          if (!isActive && !isExpanded) {
            event.currentTarget.style.background = "rgba(255,255,255,0.055)";
          }
        }}
        onMouseLeave={(event: React.MouseEvent<HTMLElement>) => {
          if (!isActive && !isExpanded) {
            event.currentTarget.style.background = "transparent";
          }
        }}
      >
        {isActive && !hasChildren && (
          <div
            style={{
              position: "absolute",
              left: 0,
              top: "50%",
              transform: "translateY(-50%)",
              width: 2,
              height: 16,
              background: "var(--chakra-colors-brand-300)",
              borderRadius: 99,
            }}
          />
        )}

        <div
          style={{
            width: 26,
            height: 26,
            borderRadius: 6,
            flexShrink: 0,
            background: isActive || isExpanded ? "rgba(255,255,255,0.1)" : "transparent",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: isActive || isExpanded ? "white" : "rgba(255,255,255,0.38)",
            transition: "all 0.15s",
          }}
        >
          {item.icon && <item.icon size={14} />}
        </div>

        <span
          style={{
            flex: 1,
            fontSize: 12.5,
            fontWeight: isActive || isExpanded ? 500 : 400,
            color: isActive || isExpanded ? "white" : "rgba(255,255,255,0.55)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            transition: "color 0.15s",
          }}
        >
          {item.label}
        </span>

        {hasChildren && (
          <span
            style={{
              color: "rgba(255,255,255,0.25)",
              display: "flex",
              transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)",
              transition: "transform 0.2s ease",
            }}
          >
            <ChevronRight />
          </span>
        )}
      </Wrapper>

      {hasChildren && (
        <div
          style={{
            overflow: "hidden",
            maxHeight: isExpanded ? 400 : 0,
            opacity: isExpanded ? 1 : 0,
            transition: "max-height 0.25s ease, opacity 0.2s ease",
          }}
        >
          <div style={{ paddingTop: 2, paddingBottom: 4 }}>
            {(item.children ?? []).map((child) => (
              <NavChild key={child.id} item={child} pathname={pathname} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

interface AppSidebarProps {
  sections: NavSection[];
  companyName?: string;
  companyPlan?: string;
  onNotifications?: () => void;
}

export const AppSidebar: React.FC<AppSidebarProps> = ({
  sections,
  companyName = "Mi Empresa",
  companyPlan = "Plan Enterprise",
  onNotifications,
}) => {
  const pathname = useActiveRoute();

  const defaultExpanded = sections
    .flatMap((section) => section.items)
    .filter((item) =>
      (item.children ?? []).some((child) =>
        isRouteActive(pathname, child.to, child.matchPrefix),
      ),
    )
    .map((item) => item.id);

  const [expanded, setExpanded] = useState<string[]>(defaultExpanded);

  const toggle = (id: string) =>
    setExpanded((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );

  return (
    <div
      style={{
        width: 236,
        height: "100vh",
        background: "var(--chakra-colors-brand-900)",
        display: "flex",
        flexDirection: "column",
        position: "relative",
        overflow: "hidden",
        flexShrink: 0,
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          zIndex: 0,
          background:
            "radial-gradient(ellipse at 30% 0%, color-mix(in srgb, var(--chakra-colors-brand-600) 28%, transparent) 0%, transparent 60%)",
        }}
      />
      <div
        style={{
          position: "absolute",
          right: 0,
          top: 0,
          bottom: 0,
          width: 1,
          zIndex: 1,
          background:
            "linear-gradient(to bottom, transparent, rgba(255,255,255,0.06) 20%, rgba(255,255,255,0.06) 80%, transparent)",
        }}
      />

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          flex: 1,
          zIndex: 1,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: "18px 14px 12px",
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              background: "var(--chakra-colors-brand-500)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="white"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              width="15"
              height="15"
            >
              <path d="M3 21h18M3 7l9-4 9 4M4 7v14M20 7v14M8 21v-4h8v4M8 11h8M8 15h8" />
            </svg>
          </div>
          <div style={{ flex: 1, overflow: "hidden" }}>
            <div
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: "white",
                letterSpacing: "-0.01em",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {companyName}
            </div>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", marginTop: 1 }}>
              {companyPlan}
            </div>
          </div>
          <button
            onClick={onNotifications}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "rgba(255,255,255,0.3)",
              display: "flex",
              padding: 4,
              borderRadius: 6,
              transition: "color 0.15s",
            }}
            onMouseEnter={(event) => {
              event.currentTarget.style.color = "rgba(255,255,255,0.7)";
            }}
            onMouseLeave={(event) => {
              event.currentTarget.style.color = "rgba(255,255,255,0.3)";
            }}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              width="15"
              height="15"
            >
              <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0" />
            </svg>
          </button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", paddingBottom: 8, scrollbarWidth: "none" }}>
          {sections.map((section, sectionIndex) => (
            <div key={section.id} style={{ marginBottom: 4 }}>
              {sectionIndex > 0 && (
                <div
                  style={{
                    margin: "8px 14px 8px",
                    height: 1,
                    background: "rgba(255,255,255,0.07)",
                  }}
                />
              )}

              {section.label && (
                <div
                  style={{
                    fontSize: 9.5,
                    fontWeight: 600,
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                    color: "rgba(255,255,255,0.22)",
                    padding: "2px 18px 6px",
                  }}
                >
                  {section.label}
                </div>
              )}

              {section.items.map((item) => (
                <NavRow
                  key={item.id}
                  item={item}
                  pathname={pathname}
                  expanded={expanded}
                  onToggle={toggle}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
