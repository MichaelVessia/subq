import type * as React from 'react'
import {
  Bar,
  BarChart as RechartsBarChart,
  Cell,
  Legend,
  Pie,
  PieChart as RechartsPieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { cn } from '../../lib/utils.js'

// ============================================
// Chart Config Types
// ============================================

export type ChartConfig = Record<
  string,
  {
    label: string
    color: string
  }
>

// ============================================
// Chart Container
// ============================================

interface ChartContainerProps extends React.HTMLAttributes<HTMLDivElement> {
  config: ChartConfig
  children: React.ReactNode
}

export function ChartContainer({ config, children, className, ...props }: ChartContainerProps) {
  return (
    <div
      className={cn('w-full', className)}
      style={
        {
          ...Object.entries(config).reduce(
            (acc, [key, value]) => {
              acc[`--color-${key}`] = value.color
              return acc
            },
            {} as Record<string, string>,
          ),
        } as React.CSSProperties
      }
      {...props}
    >
      <ResponsiveContainer width="100%" height="100%">
        {children as React.ReactElement}
      </ResponsiveContainer>
    </div>
  )
}

// ============================================
// Simple Pie Chart
// ============================================

export interface PieChartData {
  name: string
  value: number
  [key: string]: string | number
}

interface SimplePieChartProps {
  data: PieChartData[]
  colors: string[]
  className?: string
  innerRadius?: number
  outerRadius?: number
  showLabels?: boolean
}

export function SimplePieChart({
  data,
  colors,
  className,
  innerRadius = 50,
  outerRadius = 80,
  showLabels = true,
}: SimplePieChartProps) {
  if (data.length === 0) {
    return <div className="text-muted-foreground h-[200px] flex items-center justify-center">No data available</div>
  }

  return (
    <div className={cn('h-[250px] w-full', className)}>
      <ResponsiveContainer width="100%" height="100%">
        <RechartsPieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={innerRadius}
            outerRadius={outerRadius}
            paddingAngle={2}
            dataKey="value"
            label={showLabels ? ({ value }) => (value > 0 ? value : '') : false}
            labelLine={false}
          >
            {data.map((item, index) => (
              <Cell key={item.name} fill={colors[index % colors.length]} stroke="rgb(var(--card))" strokeWidth={2} />
            ))}
          </Pie>
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null
              const item = payload[0]
              return (
                <div className="bg-foreground text-background px-3 py-2 rounded-md text-xs shadow-md">
                  <div className="font-semibold">{item?.name}</div>
                  <div className="opacity-70">{item?.value}</div>
                </div>
              )
            }}
          />
          <Legend
            layout="vertical"
            align="right"
            verticalAlign="middle"
            formatter={(value, entry) => (
              <span className="text-xs text-muted-foreground">
                {value} ({(entry.payload as PieChartData & { value: number }).value})
              </span>
            )}
            iconType="square"
            iconSize={12}
          />
        </RechartsPieChart>
      </ResponsiveContainer>
    </div>
  )
}

// ============================================
// Horizontal Bar Chart
// ============================================

export interface BarChartData {
  name: string
  value: number
  [key: string]: string | number
}

interface SimpleHorizontalBarChartProps {
  data: BarChartData[]
  colors: string[]
  className?: string
}

export function SimpleHorizontalBarChart({ data, colors, className }: SimpleHorizontalBarChartProps) {
  if (data.length === 0) {
    return <div className="text-muted-foreground h-[100px] flex items-center justify-center">No data available</div>
  }

  const height = Math.max(data.length * 50 + 20, 120)

  return (
    <div className={cn('w-full', className)} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <RechartsBarChart
          data={data}
          layout="vertical"
          margin={{ top: 5, right: 30, left: 80, bottom: 5 }}
          barCategoryGap="20%"
        >
          <XAxis type="number" hide />
          <YAxis
            type="category"
            dataKey="name"
            axisLine={false}
            tickLine={false}
            tick={{ fill: 'rgb(var(--foreground))', fontSize: 12 }}
            width={75}
          />
          <Tooltip
            cursor={false}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null
              const item = payload[0]
              return (
                <div className="bg-foreground text-background px-3 py-2 rounded-md text-xs shadow-md">
                  <div className="font-semibold">{item?.payload?.name}</div>
                  <div className="opacity-70">{item?.value}</div>
                </div>
              )
            }}
          />
          <Bar
            dataKey="value"
            radius={[0, 4, 4, 0]}
            barSize={24}
            label={{ position: 'right', fill: 'rgb(var(--muted-foreground))', fontSize: 12 }}
          >
            {data.map((item, index) => (
              <Cell key={item.name} fill={colors[index % colors.length]} />
            ))}
          </Bar>
        </RechartsBarChart>
      </ResponsiveContainer>
    </div>
  )
}

export { RechartsPieChart as PieChart, Pie, Cell, Tooltip as ChartTooltip, Legend as ChartLegend }
