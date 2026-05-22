import React, { Suspense } from "react";

import { SimpleGrid, Skeleton } from "@chakra-ui/react";
import type { TFunction } from "i18next";

import {
  ChartCard,
  EmptyState,
  ErrorBanner,
  SkeletonTable,
} from "@shared/ui";

const CHART_COLORS = {
  balance: "green.500",
  headcount: "blue.500",
} as const;

interface BalanceTotalsChartRow {
  year: string;
  total: number;
}

interface HeadcountChartRow {
  department: string;
  total: number;
}

interface DashboardChartsSectionProps {
  t: TFunction;
  balanceTotalsChartData: BalanceTotalsChartRow[];
  headcountChartData: HeadcountChartRow[];
  headcountIsError: boolean;
  headcountIsLoading: boolean;
  onRetryHeadcount: () => void;
  LineChartWidget: React.ElementType;
  BarChartWidget: React.ElementType;
}

export const DashboardChartsSection: React.FC<
  DashboardChartsSectionProps
> = ({
  t,
  balanceTotalsChartData,
  headcountChartData,
  headcountIsError,
  headcountIsLoading,
  onRetryHeadcount,
  LineChartWidget,
  BarChartWidget,
}) => {
  return (
    <SimpleGrid columns={{ base: 1, xl: 2 }} spacing={6} mb={8}>
      <ChartCard
        title={t("dashboard.balanceHistory.chartTitle", "Balance anual")}
        subtitle={t("dashboard.balanceHistory.subtitle")}
      >
        {balanceTotalsChartData.length === 0 ? (
          <EmptyState
            title={t("dashboard.balanceHistory.empty", "Sin datos")}
            description={t(
              "dashboard.balanceHistory.emptyDescription",
              "Selecciona proyectos para ver la evolución.",
            )}
          />
        ) : (
          <Suspense fallback={<SkeletonTable rows={3} cols={1} />}>
            <LineChartWidget
              data={balanceTotalsChartData}
              xKey="year"
              series={[
                { key: "total", label: "Total", color: CHART_COLORS.balance },
              ]}
            />
          </Suspense>
        )}
      </ChartCard>

      <ChartCard
        title={t("dashboard.hr.headcountTitle", "Headcount por departamento")}
        subtitle={t("dashboard.hr.headcountSubtitle", "Plantilla activa")}
      >
        {headcountIsError ? (
          <ErrorBanner
            title={t("dashboard.hr.headcountError", "No se pudo cargar")}
            onRetry={onRetryHeadcount}
          />
        ) : headcountIsLoading ? (
          <Skeleton height="220px" borderRadius="lg" />
        ) : headcountChartData.length === 0 ? (
          <EmptyState
            title={t("dashboard.hr.headcountEmpty", "Sin datos")}
            description={t(
              "dashboard.hr.headcountEmptyDescription",
              "No hay empleados activos en este momento.",
            )}
          />
        ) : (
          <Suspense fallback={<SkeletonTable rows={3} cols={1} />}>
            <BarChartWidget
              data={headcountChartData}
              xKey="department"
              series={[
                {
                  key: "total",
                  label: "Empleados",
                  color: CHART_COLORS.headcount,
                },
              ]}
            />
          </Suspense>
        )}
      </ChartCard>
    </SimpleGrid>
  );
};
