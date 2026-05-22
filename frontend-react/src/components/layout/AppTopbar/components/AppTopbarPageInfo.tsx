import React from "react";
import { Link } from "@tanstack/react-router";

export interface BreadcrumbCrumb {
  label: string;
  to?: string;
}

interface AppTopbarPageInfoProps {
  pageTitle: string;
  pageSubtitle?: string;
  pageBreadcrumb?: string;
  pageBreadcrumbCrumbs?: BreadcrumbCrumb[];
  pageIcon?: React.ReactNode;
  textPrimary: string;
  textMuted: string;
}

export const AppTopbarPageInfo: React.FC<AppTopbarPageInfoProps> = ({
  pageTitle,
  pageSubtitle,
  pageBreadcrumb,
  pageBreadcrumbCrumbs,
  pageIcon,
  textPrimary,
  textMuted,
}) => {
  if (!pageTitle.trim()) {
    return <div />;
  }

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        minWidth: 0,
      }}
    >
      {pageIcon && (
        <div
          style={{
            width: 34,
            height: 34,
            borderRadius: 8,
            background: "rgba(55,176,111,0.12)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            color: "#37b06f",
          }}
        >
          {pageIcon}
        </div>
      )}
      <div style={{ minWidth: 0 }}>
        {pageBreadcrumbCrumbs && pageBreadcrumbCrumbs.length > 0 ? (
          <div
            style={{
              fontSize: 11,
              color: textMuted,
              fontWeight: 400,
              marginBottom: 1,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {pageBreadcrumbCrumbs.map((crumb, idx) => {
              const isLast = idx === pageBreadcrumbCrumbs.length - 1;
              return (
                <React.Fragment key={`${crumb.to ?? crumb.label}-${idx}`}>
                  {idx > 0 && (
                    <span style={{ margin: "0 6px", opacity: 0.6 }}>›</span>
                  )}
                  {crumb.to && !isLast ? (
                    <Link
                      to={crumb.to}
                      style={{
                        color: "inherit",
                        textDecoration: "none",
                      }}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLAnchorElement).style.textDecoration = "underline";
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLAnchorElement).style.textDecoration = "none";
                      }}
                    >
                      {crumb.label}
                    </Link>
                  ) : (
                    <span style={{ opacity: isLast ? 1 : 0.85 }}>
                      {crumb.label}
                    </span>
                  )}
                </React.Fragment>
              );
            })}
          </div>
        ) : pageBreadcrumb ? (
          <div
            style={{
              fontSize: 11,
              color: textMuted,
              fontWeight: 400,
              marginBottom: 1,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {pageBreadcrumb}
          </div>
        ) : null}
        <div
          style={{
            fontSize: pageBreadcrumb ? 13 : 14,
            fontWeight: 700,
            color: textPrimary,
            letterSpacing: "-0.02em",
            lineHeight: 1.2,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {pageTitle}
        </div>
        {pageSubtitle && !pageBreadcrumb && (
          <div
            style={{
              fontSize: 11.5,
              color: textMuted,
              fontWeight: 400,
              marginTop: 1,
              whiteSpace: "nowrap",
            }}
          >
            {pageSubtitle}
          </div>
        )}
      </div>
    </div>
  );
};
