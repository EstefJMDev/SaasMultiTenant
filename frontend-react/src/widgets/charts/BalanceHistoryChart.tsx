import React from "react";
import { Box } from "@chakra-ui/react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { LegendProps } from "recharts";

interface BalanceSeriesItem {
  project: {
    id: number | string;
    name: string;
  };
  color: string;
}

interface BalanceHistoryChartProps {
  balanceSeries: BalanceSeriesItem[];
  balanceChartData: Array<Record<string, number | string>>;
  balanceLegendPayload: NonNullable<LegendProps["payload"]>;
  balanceKeyById: Map<string, string>;
  balanceTableBorderColor: string;
  balanceTableYearText: string;
  formatCompact: (value: number) => string;
  formatFull: (value: number) => string;
}

export const BalanceHistoryChart: React.FC<BalanceHistoryChartProps> = ({
  balanceSeries,
  balanceChartData,
  balanceLegendPayload,
  balanceKeyById,
  balanceTableBorderColor,
  balanceTableYearText,
  formatCompact,
  formatFull,
}) => {
  return (
    <Box
      w="100%"
      h="380px"
      borderRadius="16px"
      bg="white"
      boxShadow="inset 0 0 0 1px rgba(15,23,42,0.04)"
      px={3}
      py={2}
    >
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={balanceChartData}
          margin={{ top: 20, right: 30, left: 10, bottom: 10 }}
        >
          <defs>
            {balanceSeries.map((series) => (
              <linearGradient
                key={`grad-${series.project.id}`}
                id={`balance-grad-${series.project.id}`}
                x1="0"
                y1="0"
                x2="0"
                y2="1"
              >
                <stop offset="5%" stopColor={series.color} stopOpacity={0.35} />
                <stop
                  offset="95%"
                  stopColor={series.color}
                  stopOpacity={0.05}
                />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid
            stroke={balanceTableBorderColor}
            strokeDasharray="4 4"
          />
          <XAxis
            dataKey="year"
            tick={{ fill: balanceTableYearText, fontSize: 12 }}
            axisLine={{ stroke: balanceTableBorderColor }}
            tickLine={{ stroke: balanceTableBorderColor }}
          />
          <YAxis
            tickFormatter={(value: number) => formatCompact(value)}
            tick={{ fill: balanceTableYearText, fontSize: 12 }}
            axisLine={{ stroke: balanceTableBorderColor }}
            tickLine={{ stroke: balanceTableBorderColor }}
          />
          <Tooltip
            contentStyle={{
              background: "#0f172a",
              borderRadius: 10,
              border: "none",
              color: "#f8fafc",
            }}
            formatter={(value: number, name: string) => {
              const label = balanceKeyById.get(name) ?? name;
              return [formatFull(Number(value)), label];
            }}
            labelFormatter={(label) => `Año ${label}`}
          />
          <Legend
            verticalAlign="top"
            align="left"
            height={36}
            wrapperStyle={{ paddingLeft: 8 }}
            payload={balanceLegendPayload}
          />
          {balanceSeries.map((series) => (
            <Area
              key={`area-${series.project.id}`}
              type="monotone"
              dataKey={`${series.project.id}`}
              stroke={series.color}
              strokeWidth={3}
              fill={`url(#balance-grad-${series.project.id})`}
              dot={{ r: 3, stroke: "#0f172a", strokeWidth: 1 }}
              activeDot={{
                r: 6,
                stroke: "#0f172a",
                strokeWidth: 2,
              }}
              name={series.project.name}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </Box>
  );
};
