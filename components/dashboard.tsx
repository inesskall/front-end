"use client"

import { useEffect, useState, useRef } from "react"
import { Client } from "@stomp/stompjs"
import SockJS from "sockjs-client"
import { ArrowUp, ArrowDown, RefreshCw, Zap, Terminal, TrendingUp } from "lucide-react"
import { ChartComponent } from "./chart"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface MarketTick {
  symbol: string
  timestamp: string
  open: number
  high: number
  low: number
  close: number
  volume: number
}

interface AgentDecision {
  action: string
  symbol: string
  quantity: number | null
  price: number | null
  reason: string
  balance: number
  equity: number
  realizedPnl: number | null
  roiPct: number | null
  positionSide?: "LONG" | "NONE"
  positionSize?: number | null

  // новые поля от бэка
  positionOpenTime?: string | null
  takeProfitPrice?: number | null
  stopLossPrice?: number | null
  positionNotional?: number | null
  avgEntryPrice?: number | null
}

const formatNumber = (value: number | null | undefined, digits = 2, empty = "---") =>
    value == null ? empty : value.toFixed(digits)

export default function Dashboard() {
  const [isConnected, setIsConnected] = useState(false)
  const [currentTick, setCurrentTick] = useState<MarketTick | null>(null)
  const [agentDecision, setAgentDecision] = useState<AgentDecision | null>(null)
  const [logs, setLogs] = useState<string[]>([])
  const [chartData, setChartData] = useState<MarketTick[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const stompClientRef = useRef<Client | null>(null)

  const addLog = (msg: string) => {
    const timestamp = new Date().toLocaleTimeString()
    setLogs((prev) => [`[${timestamp}] ${msg}`, ...prev.slice(0, 99)])
  }

  const fetchInitialMarketData = async () => {
    try {
      addLog("Fetching initial market data...")
      const res = await fetch("http://localhost:8081/api/market/current")
      if (!res.ok) throw new Error("Failed to fetch market data")
      const data: MarketTick = await res.json()
      setCurrentTick(data)
      setChartData([data])
      addLog(`Market: ${data.symbol} @ ${data.close.toFixed(2)}`)
    } catch (error) {
      addLog(`ERROR: Market data fetch failed - ${String(error).slice(0, 40)}`)
    }
  }

  const fetchLastAgentDecision = async () => {
    try {
      addLog("Fetching last agent decision...")
      const res = await fetch("http://localhost:8081/api/market/last-decision")
      if (!res.ok) throw new Error("Failed to fetch decision")
      const data: AgentDecision = await res.json()
      setAgentDecision(data)

      const balanceText = data.balance.toFixed(2)
      const equityText = data.equity.toFixed(2)
      const roiText = data.roiPct != null ? data.roiPct.toFixed(2) : "0.00"

      addLog(`Agent: balance=$${balanceText} equity=$${equityText} roi=${roiText}%`)
    } catch (error) {
      addLog(`ERROR: Agent decision fetch failed - ${String(error).slice(0, 40)}`)
    }
  }

  const handleForceUpdate = async () => {
    try {
      addLog("Requesting force update...")
      const res = await fetch("http://localhost:8081/api/market/force-update", { method: "POST" })
      if (!res.ok) throw new Error("Force update failed")
      addLog("Force update requested successfully")
    } catch (error) {
      addLog(`ERROR: Force update failed - ${String(error).slice(0, 40)}`)
    }
  }

  useEffect(() => {
    setIsLoading(true)

    Promise.all([fetchInitialMarketData(), fetchLastAgentDecision()]).finally(() => {
      setIsLoading(false)
    })

    const socket = new SockJS("http://localhost:8081/ws-market")
    const client = new Client({
      webSocketFactory: () => socket,
      reconnectDelay: 5000,
      debug: (str) => console.log("[STOMP]", str),
      onConnect: () => {
        setIsConnected(true)
        addLog("WebSocket connected")

        client.subscribe("/topic/market", (message) => {
          try {
            const tick: MarketTick = JSON.parse(message.body)
            setCurrentTick(tick)
            setChartData((prev) => {
              const deduplicated = prev.filter((d) => d.timestamp !== tick.timestamp)
              return [...deduplicated, tick]
            })
          } catch (e) {
            console.error("[v0] Market parse error:", e)
          }
        })

        client.subscribe("/topic/agent/decision", (message) => {
          try {
            const decision: AgentDecision = JSON.parse(message.body)
            setAgentDecision(decision)

            const qtyText = decision.quantity != null ? decision.quantity.toFixed(4) : "---"
            const priceText = decision.price != null ? decision.price.toFixed(2) : "---"
            const roiText = decision.roiPct != null ? decision.roiPct.toFixed(2) : "0.00"

            addLog(
                `AGENT: ${decision.action} qty=${qtyText} price=${priceText} roi=${roiText}% reason=${decision.reason}`,
            )
          } catch (e) {
            console.error("[v0] Decision parse error:", e)
          }
        })
      },

      onDisconnect: () => {
        setIsConnected(false)
        addLog("WebSocket disconnected")
      },

      onStompError: (frame) => {
        addLog(`ERROR: ${frame.headers["message"] || "STOMP error"}`)
      },
    })

    client.activate()
    stompClientRef.current = client

    return () => {
      const c = stompClientRef.current
      if (c) {
        c.deactivate()
      }
    }
  }, [])

  const priceChange = currentTick ? currentTick.close - currentTick.open : 0
  const percentChange =
      currentTick && currentTick.open !== 0 ? (priceChange / currentTick.open) * 100 : 0
  const isPositive = priceChange >= 0

  const hasOpenPosition =
      agentDecision?.positionSide === "LONG" && (agentDecision.positionSize ?? 0) > 0
  const isInProfit = agentDecision != null && (agentDecision.roiPct ?? 0) > 0
  const isInLoss = agentDecision != null && (agentDecision.roiPct ?? 0) < 0

  const backgroundTint = hasOpenPosition
      ? isInProfit
          ? "bg-gradient-to-br from-emerald-950/50 to-transparent"
          : isInLoss
              ? "bg-gradient-to-br from-red-950/50 to-transparent"
              : "bg-[#0d1117]"
      : "bg-[#0d1117]"

  const symbolText = currentTick?.symbol ?? "---"
  const priceText = formatNumber(currentTick?.close)
  const openText = formatNumber(currentTick?.open)
  const highText = formatNumber(currentTick?.high)
  const lowText = formatNumber(currentTick?.low)
  const volumeText = formatNumber(currentTick?.volume)

  const balanceText = formatNumber(agentDecision?.balance)
  const equityText = formatNumber(agentDecision?.equity)
  const roiValue = agentDecision?.roiPct ?? 0
  const roiText = roiValue.toFixed(2)

  const realizedPnlValue = agentDecision?.realizedPnl
  const realizedPnlText =
      realizedPnlValue == null ? "---" : `${realizedPnlValue > 0 ? "+" : ""}$${realizedPnlValue.toFixed(2)}`

  const realizedPnlClass = cn(
      "font-mono font-bold",
      realizedPnlValue != null && realizedPnlValue > 0
          ? "text-bloomberg-green"
          : realizedPnlValue != null && realizedPnlValue < 0
              ? "text-red-500"
              : "text-gray-500",
  )

  // ===== новые тексты для блока Position =====
  const positionOpenText =
      agentDecision?.positionOpenTime != null
          ? new Date(agentDecision.positionOpenTime).toLocaleTimeString()
          : "---"

  const tpText = formatNumber(agentDecision?.takeProfitPrice)
  const slText = formatNumber(agentDecision?.stopLossPrice)
  const notionalText = formatNumber(agentDecision?.positionNotional)
  const entryText = formatNumber(agentDecision?.avgEntryPrice)

  return (
      <div className="min-h-screen bg-bloomberg-bg text-bloomberg-text font-mono flex flex-col overflow-hidden">
        {/* ===== HEADER ===== */}
        <header className="border-b border-bloomberg-gray bg-black/30 px-6 py-4 flex items-center justify-between shrink-0 gap-6">
          {/* Left: Logo and title */}
          <div className="flex items-center gap-3">
            <Terminal className="w-6 h-6 text-bloomberg-green flex-shrink-0" />
            <div className="flex flex-col gap-0">
              <h1 className="text-lg font-bold tracking-wider text-bloomberg-green uppercase">
                Trading Bot
              </h1>

            </div>
          </div>

          {/* Center: Key metrics (Symbol, Price, ROI) */}
          <div className="flex items-center gap-8 text-xs flex-1 justify-center">
            {/* Symbol */}
            <div className="flex flex-col gap-1 border-r border-bloomberg-gray pr-8">
              <span className="text-gray-600 uppercase tracking-widest font-semibold">Symbol</span>
              <span className="text-bloomberg-green font-bold text-sm">{symbolText}</span>
            </div>

            {/* Price */}
            <div className="flex flex-col gap-1 border-r border-bloomberg-gray pr-8">
              <span className="text-gray-600 uppercase tracking-widest font-semibold">Price</span>
              <span className={cn("font-bold text-sm", isPositive ? "text-bloomberg-green" : "text-red-500")}>
              ${priceText}
            </span>
            </div>

            {/* ROI % */}
            <div className="flex flex-col gap-1">
              <span className="text-gray-600 uppercase tracking-widest font-semibold">ROI %</span>
              <span
                  className={cn(
                      "font-bold text-sm",
                      agentDecision && (agentDecision.roiPct ?? 0) > 0
                          ? "text-bloomberg-green"
                          : agentDecision && (agentDecision.roiPct ?? 0) < 0
                              ? "text-red-500"
                              : "text-gray-500",
                  )}
              >
              {roiText}%
            </span>
            </div>
          </div>

          <div className="flex items-center gap-2 px-3 py-1.5 bg-black/40 border border-bloomberg-gray rounded text-xs shrink-0">
            <div
                className={cn("w-2 h-2 rounded-full", isConnected ? "bg-bloomberg-green animate-pulse" : "bg-red-500")}
            />
            <span className={cn(isConnected ? "text-bloomberg-green" : "text-red-500")}>
            {isConnected ? "Connected" : "Disconnected"}
          </span>
          </div>
        </header>

        <div className="flex-1 flex overflow-hidden gap-0">
          <aside className="w-96 border-r border-bloomberg-gray bg-black/20 flex flex-col shrink-0 overflow-y-auto">
            <div className="px-6 py-8 border-b border-bloomberg-gray/60">
              <h2 className="text-xs text-gray-600 mb-3 uppercase tracking-widest font-semibold">Current Price</h2>
              <div
                  className={cn(
                      "text-5xl font-bold mb-4 leading-none",
                      isPositive ? "text-bloomberg-green" : "text-red-500",
                  )}
              >
                {priceText}
              </div>
              <div
                  className={cn(
                      "flex items-center gap-2 text-sm mb-8",
                      isPositive ? "text-bloomberg-green" : "text-red-500",
                  )}
              >
                {isPositive ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />}
                <span>
                {Math.abs(priceChange).toFixed(2)} ({Math.abs(percentChange).toFixed(2)}%)
              </span>
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="bg-black/40 p-3 rounded border border-bloomberg-gray/40">
                  <div className="text-xs text-gray-600 uppercase tracking-widest mb-1">Open</div>
                  <div className="font-bold text-white">{openText}</div>
                </div>
                <div className="bg-black/40 p-3 rounded border border-bloomberg-gray/40">
                  <div className="text-xs text-gray-600 uppercase tracking-widest mb-1">High</div>
                  <div className="font-bold text-bloomberg-green">{highText}</div>
                </div>
                <div className="bg-black/40 p-3 rounded border border-bloomberg-gray/40">
                  <div className="text-xs text-gray-600 uppercase tracking-widest mb-1">Low</div>
                  <div className="font-bold text-red-500">{lowText}</div>
                </div>
                <div className="bg-black/40 p-3 rounded border border-bloomberg-gray/40">
                  <div className="text-xs text-gray-600 uppercase tracking-widest mb-1">Volume</div>
                  <div className="font-bold text-white">{volumeText}</div>
                </div>
              </div>
            </div>

            <div className="px-6 py-6 border-b border-bloomberg-gray/60">
              <h3 className="text-xs font-bold uppercase tracking-widest text-gray-600 mb-4">
                Account & Bot Status
              </h3>

              <div className="space-y-3">
                <div className="flex justify-between items-center p-2.5 bg-black/30 rounded border border-bloomberg-gray/40">
                  <span className="text-xs text-gray-600 uppercase tracking-widest">Balance</span>
                  <span className="font-mono font-bold text-white">${balanceText}</span>
                </div>

                <div className="flex justify-between items-center p-2.5 bg-black/30 rounded border border-bloomberg-gray/40">
                  <span className="text-xs text-gray-600 uppercase tracking-widest">Equity</span>
                  <span className="font-mono font-bold text-bloomberg-green">${equityText}</span>
                </div>
                <div className="flex justify-between items-center p-2.5 bg-black/30 rounded border border-bloomberg-gray/40">
                  <span className="text-xs text-gray-600 uppercase tracking-widest">Realized P&L</span>
                  <span className={realizedPnlClass}>{realizedPnlText}</span>
                </div>
                <div
                    className={cn(
                        "flex justify-between items-center p-3 rounded border font-bold text-lg",
                        agentDecision && (agentDecision.roiPct ?? 0) > 0
                            ? "bg-emerald-950/40 border-emerald-700/60 text-bloomberg-green"
                            : agentDecision && (agentDecision.roiPct ?? 0) < 0
                                ? "bg-red-950/40 border-red-700/60 text-red-500"
                                : "bg-black/30 border-bloomberg-gray/40 text-gray-500",
                    )}
                >
                  <span className="text-xs font-bold uppercase tracking-widest">ROI %</span>
                  <span>{roiText}%</span>
                </div>
                <div className="mt-4 pt-4 border-t border-bloomberg-gray/40">
                  <div className="text-xs font-bold uppercase tracking-widest text-gray-600 mb-2">Position</div>
                  {hasOpenPosition ? (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-sm font-bold p-2 rounded border bg-emerald-950/30 border-emerald-700/40 text-bloomberg-green">
                          <TrendingUp className="w-4 h-4" />
                          <span>
                        LONG {(agentDecision?.positionSize ?? 0).toFixed(4)} {symbolText}
                      </span>
                        </div>

                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div className="bg-black/30 rounded border border-bloomberg-gray/40 px-2 py-1.5">
                            <div className="text-[10px] text-gray-500 uppercase tracking-widest">Entry</div>
                            <div className="font-mono text-sm">${entryText}</div>
                          </div>
                          <div className="bg-black/30 rounded border border-bloomberg-gray/40 px-2 py-1.5">
                            <div className="text-[10px] text-gray-500 uppercase tracking-widest">Notional</div>
                            <div className="font-mono text-sm">${notionalText}</div>
                          </div>
                          <div className="bg-black/30 rounded border border-bloomberg-gray/40 px-2 py-1.5">
                            <div className="text-[10px] text-gray-500 uppercase tracking-widest">Take Profit</div>
                            <div className="font-mono text-sm">${tpText}</div>
                          </div>
                          <div className="bg-black/30 rounded border border-bloomberg-gray/40 px-2 py-1.5">
                            <div className="text-[10px] text-gray-500 uppercase tracking-widest">Stop Loss</div>
                            <div className="font-mono text-sm">${slText}</div>
                          </div>
                          <div className="bg-black/30 rounded border border-bloomberg-gray/40 px-2 py-1.5 col-span-2">
                            <div className="text-[10px] text-gray-500 uppercase tracking-widest">Opened At</div>
                            <div className="font-mono text-sm">{positionOpenText}</div>
                          </div>
                        </div>
                      </div>
                  ) : (
                      <div className="flex items-center gap-2 text-sm font-bold p-2 rounded border bg-black/30 border-bloomberg-gray/40 text-gray-500">
                        <div className="w-4 h-4" />
                        <span>No open position</span>
                      </div>
                  )}
                </div>
              </div>
            </div>

            <div className="px-6 py-4 border-b border-bloomberg-gray/60 shrink-0">
              <Button
                  onClick={handleForceUpdate}
                  className="w-full bg-black/40 hover:bg-black/60 text-bloomberg-green border border-bloomberg-green/40 hover:border-bloomberg-green/60 uppercase tracking-wider text-xs font-bold h-10 transition-all"
              >
                <RefreshCw className="w-3.5 h-3.5 mr-2" />
                Force Update
              </Button>
            </div>
            <div className="flex-1 flex flex-col min-h-[300px] overflow-hidden">
              <div className="px-6 py-3 bg-black/30 text-xs uppercase font-bold text-gray-600 border-b border-bloomberg-gray/60 shrink-0 tracking-widest">
                System Logs
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-1.5 font-mono text-xs bg-black/10">
                {logs.length > 0 ? (
                    logs.map((log, i) => (
                        <div
                            key={i}
                            className="text-gray-400 hover:text-gray-300 transition-colors cursor-default break-all leading-relaxed"
                        >
                          <span className="text-bloomberg-green mr-2 flex-shrink-0">{">"}</span>
                          <span>{log}</span>
                        </div>
                    ))
                ) : (
                    <div className="text-gray-700 italic p-2">Waiting for activity...</div>
                )}
              </div>
            </div>
          </aside>

          <main className="flex-1 flex flex-col bg-[#0d1117] min-w-0 relative overflow-hidden">
            <div
                className={cn("absolute inset-0 pointer-events-none z-0 transition-colors duration-500", backgroundTint)}
            />

            <div className="flex-1 relative z-10 overflow-hidden">
              <ChartComponent
                  data={chartData}
                  colors={{
                    backgroundColor: "#0d1117",
                    lineColor: "#00ff41",
                    textColor: "#d1d5db",
                    areaTopColor: "rgba(0, 255, 65, 0.2)",
                    areaBottomColor: "rgba(0, 255, 65, 0.05)",
                  }}
              />

              {/* Live data indicator */}
              <div className="absolute top-4 right-4 flex items-center gap-2 px-3 py-2 bg-black/60 backdrop-blur border border-bloomberg-green/50 rounded text-xs text-bloomberg-green pointer-events-none z-20">
                <Zap className="w-3 h-3 animate-pulse" />
                <span className="tracking-widest font-bold">LIVE DATA</span>
              </div>
            </div>
            {isLoading && (
                <div className="absolute inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center">
                  <div className="flex flex-col items-center gap-2">
                    <div className="w-8 h-8 border-2 border-bloomberg-green/30 border-t-bloomberg-green rounded-full animate-spin" />
                    <span className="text-xs text-gray-400 uppercase tracking-widest">Loading data...</span>
                  </div>
                </div>
            )}
          </main>
        </div>
      </div>
  )
}
