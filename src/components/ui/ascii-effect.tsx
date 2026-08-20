"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

const DEFAULT_RAMP = " .:-=+*#%@"

export interface AsciiEffectProps extends React.ComponentProps<"div"> {
  /** Rendering behavior for the effect. */
  variant?: "static" | "flow"
  /** Source image to sample brightness from. */
  imageSrc: string
  /** Characters used from darkest to brightest. */
  ramp?: string
  /** Size in pixels of each ASCII cell. */
  cellSize?: number
  /** Font color of the characters. */
  color?: string
  /** Background color behind the characters. */
  backgroundColor?: string
  /** Speed of the flow-field animation (variant="flow" only). */
  flowSpeed?: number
  /** Strength/amplitude of the flow-field distortion (variant="flow" only). */
  flowStrength?: number
  /** Radius in pixels of the mouse's area of influence. */
  mouseRadius?: number
  /** Strength of the mouse's displacement effect. */
  mouseStrength?: number
}

function AsciiEffect({
  variant = "static",
  imageSrc,
  ramp = DEFAULT_RAMP,
  cellSize = 8,
  color = "#e5e5e5",
  backgroundColor = "#0a0a0a",
  flowSpeed = 0.2,
  flowStrength = 10,
  mouseRadius = 140,
  mouseStrength = 20,
  className,
  ...props
}: AsciiEffectProps) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null)
  const containerRef = React.useRef<HTMLDivElement>(null)
  const mouseRef = React.useRef({ x: -9999, y: -9999 })

  React.useEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    let raf = 0
    let width = 0
    let height = 0
    let cols = 0
    let rows = 0
    let brightness: Float32Array | null = null
    let startTime = performance.now()

    const sampleImage = new Image()
    sampleImage.crossOrigin = "anonymous"
    sampleImage.src = imageSrc

    const offscreen = document.createElement("canvas")
    const offscreenCtx = offscreen.getContext("2d", {
      willReadFrequently: true,
    })

    function resize() {
      if (!canvas || !container) return
      width = container.clientWidth
      height = container.clientHeight
      canvas.width = width
      canvas.height = height
      cols = Math.max(1, Math.floor(width / cellSize))
      rows = Math.max(1, Math.floor(height / cellSize))
      sampleImageToBrightness()
    }

    function sampleImageToBrightness() {
      if (!offscreenCtx || cols === 0 || rows === 0) return
      offscreen.width = cols
      offscreen.height = rows

      const imgRatio = sampleImage.width / sampleImage.height || 1
      const gridRatio = cols / rows

      let sx = 0
      let sy = 0
      let sw = sampleImage.width
      let sh = sampleImage.height

      if (imgRatio > gridRatio) {
        sw = sampleImage.height * gridRatio
        sx = (sampleImage.width - sw) / 2
      } else {
        sh = sampleImage.width / gridRatio
        sy = (sampleImage.height - sh) / 2
      }

      offscreenCtx.clearRect(0, 0, cols, rows)
      if (sampleImage.complete && sampleImage.naturalWidth > 0) {
        offscreenCtx.drawImage(sampleImage, sx, sy, sw, sh, 0, 0, cols, rows)
      }

      const data = offscreenCtx.getImageData(0, 0, cols, rows).data
      const next = new Float32Array(cols * rows)
      for (let i = 0; i < cols * rows; i++) {
        const r = data[i * 4]
        const g = data[i * 4 + 1]
        const b = data[i * 4 + 2]
        const a = data[i * 4 + 3]
        next[i] = a === 0 ? 0 : (0.299 * r + 0.587 * g + 0.114 * b) / 255
      }
      brightness = next
    }

    function handlePointerMove(e: PointerEvent) {
      const rect = canvas!.getBoundingClientRect()
      mouseRef.current = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      }
    }

    function handlePointerLeave() {
      mouseRef.current = { x: -9999, y: -9999 }
    }

    function draw(now: number) {
      if (!ctx || !brightness) {
        raf = requestAnimationFrame(draw)
        return
      }

      const t = (now - startTime) / 1000

      ctx.fillStyle = backgroundColor
      ctx.fillRect(0, 0, width, height)
      ctx.font = `${cellSize}px monospace`
      ctx.fillStyle = color
      ctx.textBaseline = "top"

      const { x: mx, y: my } = mouseRef.current

      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const idx = row * cols + col
          let value = brightness[idx]
          if (value <= 0) continue

          let px = col * cellSize
          let py = row * cellSize

          if (variant === "flow") {
            const angle =
              Math.sin(col * 0.15 + t * flowSpeed) *
                Math.cos(row * 0.15 - t * flowSpeed) *
              Math.PI * 2
            px += Math.cos(angle) * flowStrength
            py += Math.sin(angle) * flowStrength
          }

          const dx = px - mx
          const dy = py - my
          const dist = Math.sqrt(dx * dx + dy * dy)
          if (dist < mouseRadius) {
            const force = (1 - dist / mouseRadius) * mouseStrength
            const nx = dist === 0 ? 0 : dx / dist
            const ny = dist === 0 ? 0 : dy / dist
            px += nx * force
            py += ny * force
            value = Math.min(1, value + (1 - dist / mouseRadius) * 0.4)
          }

          const charIndex = Math.min(
            ramp.length - 1,
            Math.floor(value * (ramp.length - 1))
          )
          const char = ramp[charIndex]
          if (char === " ") continue

          ctx.fillText(char, px, py)
        }
      }

      raf = requestAnimationFrame(draw)
    }

    const resizeObserver = new ResizeObserver(resize)
    resizeObserver.observe(container)

    sampleImage.onload = () => {
      resize()
    }

    canvas.addEventListener("pointermove", handlePointerMove)
    canvas.addEventListener("pointerleave", handlePointerLeave)

    resize()
    raf = requestAnimationFrame(draw)

    return () => {
      cancelAnimationFrame(raf)
      resizeObserver.disconnect()
      canvas.removeEventListener("pointermove", handlePointerMove)
      canvas.removeEventListener("pointerleave", handlePointerLeave)
    }
  }, [
    variant,
    imageSrc,
    ramp,
    cellSize,
    color,
    backgroundColor,
    flowSpeed,
    flowStrength,
    mouseRadius,
    mouseStrength,
  ])

  return (
    <div
      ref={containerRef}
      data-slot="ascii-effect"
      className={cn("relative h-full w-full", className)}
      {...props}
    >
      <canvas ref={canvasRef} className="h-full w-full" />
    </div>
  )
}

export { AsciiEffect }
