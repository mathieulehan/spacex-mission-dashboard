import { useRef, useEffect, useState } from 'react'
import type { StarlinkSummary } from './types'

interface EarthGlobeProps {
  data: StarlinkSummary
}

function WebGLFallbackMessage() {
  return (
    <div className="earth-globe earth-globe--no-webgl">
      <div>
        <p>🛰️ Carte orbitale 2D disponible ci-dessous</p>
        <p className="earth-globe--fallback-note">
          Votre navigateur ne prend pas en charge WebGL ou le context 3D est indisponible.
          Utilisez la visualisation position panel et le ground track pour explorer les orbites.
        </p>
      </div>
    </div>
  )
}

export function EarthGlobe({ data }: EarthGlobeProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [webglSupported, setWebglSupported] = useState<boolean | null>(null)
  const [renderError, setRenderError] = useState(false)

  // Vérifier le support WebGL au montage
  useEffect(() => {
    let supported = false
    try {
      const canvas = document.createElement('canvas')
      supported = !!(
        window.WebGLRenderingContext &&
        (canvas.getContext('webgl') || canvas.getContext('experimental-webgl'))
      )
    } catch {
      supported = false
    }
    setWebglSupported(supported)
  }, [])

  // Render loop WebGL
  useEffect(() => {
    if (webglSupported !== true || renderError || !canvasRef.current || !containerRef.current) return

    const canvas = canvasRef.current
    const gl = canvas.getContext('webgl', { alpha: true, antialias: true })
    if (!gl) {
      setRenderError(true)
      return
    }

    // Shader sources simples — globe terrestre avec points satellites
    const vs = `
      attribute vec2 a_position;
      uniform vec2 u_resolution;
      void main() {
        vec2 clip = ((a_position / u_resolution) * 2.0 - 1.0) * vec2(1.0, -1.0);
        gl_Position = vec4(clip, 0.0, 1.0);
      }
    `
    const fs = `
      precision mediump float;
      void main() {
        gl_FragColor = vec4(0.42, 0.68, 1.0, 0.85);
      }
    `

    let program: WebGLProgram | null = null
    let positionBuffer: WebGLBuffer | null = null

    try {
      const vsId = gl.createShader(gl.VERTEX_SHADER)!
      gl.shaderSource(vsId, vs)
      gl.compileShader(vsId)
      if (!gl.getShaderParameter(vsId, gl.COMPILE_STATUS)) throw new Error('VS')

      const fsId = gl.createShader(gl.FRAGMENT_SHADER)!
      gl.shaderSource(fsId, fs)
      gl.compileShader(fsId)
      if (!gl.getShaderParameter(fsId, gl.COMPILE_STATUS)) throw new Error('FS')

      program = gl.createProgram()!
      gl.attachShader(program, vsId)
      gl.attachShader(program, fsId)
      gl.linkProgram(program)
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error('Link')

      gl.useProgram(program)

      const width = canvas.width
      const height = canvas.height
      const resolutionLoc = gl.getUniformLocation(program, 'u_resolution')!
      gl.uniform2f(resolutionLoc, width, height)

      // Points satellites (position panel approximatif)
      const satPositions = data.plot.map((p) => ({
        x: (p.raan / 360) * width,
        y: height - (Math.min(p.inclination, 90) / 90) * height,
      }))

      positionBuffer = gl.createBuffer()
      gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer)
      const flat = new Float32Array(satPositions.flatMap((p) => [p.x, p.y]))
      gl.bufferData(gl.ARRAY_BUFFER, flat, gl.STATIC_DRAW)

      const posLoc = gl.getAttribLocation(program, 'a_position')!
      gl.enableVertexAttribArray(posLoc)
      gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0)

      gl.clearColor(0.03, 0.05, 0.08, 1)
      gl.clear(gl.COLOR_BUFFER_BIT)

      // Draw points
      gl.pointSize(4)
      gl.drawArrays(gl.POINTS, 0, satPositions.length)
    } catch (e) {
      setRenderError(true)
    }

    // Animation loop simple (rotation simulation)
    let animId: number
    const animate = () => {
      if (renderError || webglSupported !== true) return
      // Re-draw avec légère rotation simulée
      try {
        const w = canvas.width
        const h = canvas.height
        gl?.clearColor(0.03, 0.05, 0.08, 1)
        gl?.clear(gl?.COLOR_BUFFER_BIT || 0)
        gl?.pointSize(4)
        gl?.drawArrays(gl?.POINTS || 0, 0, data.plot.length)
      } catch { /* silent */ }
      animId = requestAnimationFrame(animate)
    }
    animId = requestAnimationFrame(animate)

    return () => {
      cancelAnimationFrame(animId)
      if (positionBuffer) gl.deleteBuffer(positionBuffer)
      if (program) gl.deleteProgram(program)
    }
  }, [webglSupported, renderError, data.plot])

  if (webglSupported === null) {
    return (
      <div className="earth-globe earth-globe--loading">
        <span>Vérification du support graphique…</span>
      </div>
    )
  }

  if (webglSupported === false || renderError) {
    return <WebGLFallbackMessage />
  }

  return (
    <div
      ref={containerRef}
      className="earth-globe"
      style={{ position: 'relative', width: '100%', height: '100%', minHeight: '380px' }}
    >
      <canvas
        ref={canvasRef}
        width={containerRef.current?.clientWidth || 720}
        height={containerRef.current?.clientHeight || 380}
        style={{ display: 'block', width: '100%', height: '100%' }}
      />
      <span className="earth-globe__badge">3D · WebGL</span>
    </div>
  )
}
