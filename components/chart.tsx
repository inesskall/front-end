"use client"

import { createChart, ColorType, type IChartApi, type ISeriesApi, type Time } from "lightweight-charts"
import type React from "react"
import { useEffect, useRef } from "react"

interface MarketTick {
  timestamp: string
  open: number
  high: number
  low: number
  close: number
  volume?: number
}

interface ChartComponentProps {
  data: MarketTick[]
  colors?: {
    backgroundColor?: string
    lineColor?: string
    textColor?: string
    areaTopColor?: string
    areaBottomColor?: string
  }
}

export const ChartComponent: React.FC<ChartComponentProps> = (props) => {
  const {
    data,
    colors: {
      backgroundColor = "white",
      textColor = "black",
      areaTopColor = "#2962FF", // пока не используем, но оставим в пропах
      areaBottomColor = "rgba(41, 98, 255, 0.28)",
    } = {},
  } = props

  const chartContainerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null)

  useEffect(() => {
    if (!chartContainerRef.current) return

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: backgroundColor },
        textColor,
      },
      width: chartContainerRef.current.clientWidth,
      height: chartContainerRef.current.clientHeight,
      grid: {
        vertLines: { color: "#1f2937" },
        horzLines: { color: "#1f2937" },
      },
      timeScale: {
        timeVisible: true,
        secondsVisible: true,
        borderColor: "#1f2937",
      },
      rightPriceScale: {
        borderColor: "#1f2937",
        textColor: "#9ca3af",
      },
      leftPriceScale: {
        visible: false,
      },
    })

    chartRef.current = chart

    const candlestickSeries = chart.addCandlestickSeries({
      upColor: "#00ff41",
      downColor: "#ef4444",
      borderVisible: false,
      wickUpColor: "#00ff41",
      wickDownColor: "#ef4444",
    })

    seriesRef.current = candlestickSeries

    const handleResize = () => {
      if (chartContainerRef.current && chartRef.current) {
        chartRef.current.applyOptions({
          width: chartContainerRef.current.clientWidth,
          height: chartContainerRef.current.clientHeight,
        })
      }
    }

    window.addEventListener("resize", handleResize)

    return () => {
      window.removeEventListener("resize", handleResize)
      chart.remove()
    }
  }, [backgroundColor, textColor])

  useEffect(() => {
    if (!seriesRef.current || data.length === 0) return

    const chartData = data
        .map((tick) => {
          const ts = new Date(tick.timestamp).getTime()
          if (Number.isNaN(ts)) return null

          return {
            time: Math.floor(ts / 1000) as Time,
            open: tick.open,
            high: tick.high,
            low: tick.low,
            close: tick.close,
          }
        })
        .filter(
            (
                d,
            ): d is {
              time: Time
              open: number
              high: number
              low: number
              close: number
            } => d !== null,
        )

    if (chartData.length === 0) return

    const uniqueData = Array.from(
        new Map(chartData.map((d) => [d.time, d])).values(),
    ).sort((a, b) => (a.time as number) - (b.time as number))

    if (uniqueData.length === 0) return

    seriesRef.current.setData(uniqueData)

    if (uniqueData.length <= 20 && chartRef.current) {
      chartRef.current.timeScale().fitContent()
    }
  }, [data])

  return <div ref={chartContainerRef} className="w-full h-full" />
}
