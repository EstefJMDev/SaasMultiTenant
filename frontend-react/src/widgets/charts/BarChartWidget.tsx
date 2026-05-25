import React from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface BarSeries {
  key: string;
  label?: string;
  color?: string;
}

interface BarChartWidgetProps<T extends Record<string, any>> {
  data: T[];
  xKey: string;
  series: BarSeries[];
  height?: number;
}

export function BarChartWidget<T extends Record<string, any>>({
  data,
  xKey,
  series,
  height = 260,
}: BarChartWidgetProps<T>) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 10, right: 24, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey={xKey} tickLine={false} axisLine={false} />
        <YAxis tickLine={false} axisLine={false} />
        <Tooltip />
        {series.map((item) => (
          <Bar
            key={item.key}
            dataKey={item.key}
            name={item.label ?? item.key}
            fill={item.color ?? "#10b981"}
            radius={[6, 6, 0, 0]}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
