import React from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface LineSeries {
  key: string;
  label?: string;
  color?: string;
}

interface LineChartWidgetProps<T extends Record<string, any>> {
  data: T[];
  xKey: string;
  series: LineSeries[];
  height?: number;
}

export function LineChartWidget<T extends Record<string, any>>({
  data,
  xKey,
  series,
  height = 260,
}: LineChartWidgetProps<T>) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 10, right: 24, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey={xKey} tickLine={false} axisLine={false} />
        <YAxis tickLine={false} axisLine={false} />
        <Tooltip />
        {series.map((item) => (
          <Line
            key={item.key}
            type="monotone"
            dataKey={item.key}
            name={item.label ?? item.key}
            stroke={item.color ?? "#22c55e"}
            strokeWidth={3}
            dot={false}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
