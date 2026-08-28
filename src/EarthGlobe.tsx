import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { positionToCartesian } from './earth-geometry'
import type { StarlinkSummary } from './types'

type Coordinate = [longitude: number, latitude: number]

const CONTINENTS: Coordinate[][] = [
  [[-168, 66], [-145, 70], [-125, 55], [-105, 50], [-82, 25], [-97, 16], [-117, 29], [-130, 48], [-168, 66]],
  [[-82, 12], [-70, 8], [-50, -5], [-36, -22], [-54, -55], [-72, -40], [-80, -5], [-82, 12]],
  [[-73, 82], [-18, 80], [-22, 60], [-48, 58], [-60, 70], [-73, 82]],
  [[-18, 36], [4, 37], [34, 31], [52, 12], [42, -12], [20, -35], [5, -34], [-12, 5], [-18, 36]],
  [[-10, 36], [8, 58], [35, 70], [70, 75], [120, 61], [146, 47], [140, 30], [105, 6], [76, 8], [57, 25], [35, 31], [16, 42], [-10, 36]],
  [[112, -10], [154, -12], [151, -39], [130, -44], [114, -30], [112, -10]],
  [[47, -13], [51, -17], [49, -26], [44, -24], [43, -16], [47, -13]],
]

function createEarthTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = 1_024
  canvas.height = 512
  const context = canvas.getContext('2d')
  if (!context) return null

  const ocean = context.createLinearGradient(0, 0, 0, canvas.height)
  ocean.addColorStop(0, '#123d68')
  ocean.addColorStop(0.5, '#082747')
  ocean.addColorStop(1, '#051a32')
  context.fillStyle = ocean
  context.fillRect(0, 0, canvas.width, canvas.height)

  for (const continent of CONTINENTS) {
    context.beginPath()
    continent.forEach(([longitude, latitude], index) => {
      const x = ((longitude + 180) / 360) * canvas.width
      const y = ((90 - latitude) / 180) * canvas.height
      if (index === 0) context.moveTo(x, y)
      else context.lineTo(x, y)
    })
    context.closePath()
    context.fillStyle = '#2a6a5a'
    context.fill()
    context.strokeStyle = '#61a887'
    context.lineWidth = 2
    context.stroke()
  }

  context.strokeStyle = 'rgba(135, 191, 230, .13)'
  context.lineWidth = 1
  for (let longitude = -150; longitude <= 150; longitude += 30) {
    const x = ((longitude + 180) / 360) * canvas.width
    context.beginPath()
    context.moveTo(x, 0)
    context.lineTo(x, canvas.height)
    context.stroke()
  }
  for (let latitude = -60; latitude <= 60; latitude += 30) {
    const y = ((90 - latitude) / 180) * canvas.height
    context.beginPath()
    context.moveTo(0, y)
    context.lineTo(canvas.width, y)
    context.stroke()
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

export function EarthGlobe({ data }: { data: StarlinkSummary }) {
  const hostRef = useRef<HTMLDivElement>(null)
  const [renderError, setRenderError] = useState(false)

  useEffect(() => {
    if (import.meta.env.MODE === 'test' || !hostRef.current) return
    const host = hostRef.current
    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    } catch {
      setRenderError(true)
      return
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    host.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100)
    camera.position.set(0, 0, 4.1)

    const globe = new THREE.Group()
    globe.rotation.x = -0.12
    globe.rotation.y = -0.45
    scene.add(globe)

    const texture = createEarthTexture()
    const earth = new THREE.Mesh(
      new THREE.SphereGeometry(1, 64, 64),
      new THREE.MeshStandardMaterial({
        map: texture,
        color: texture ? 0xffffff : 0x0a4775,
        roughness: 0.78,
        metalness: 0.05,
      }),
    )
    globe.add(earth)

    const atmosphere = new THREE.Mesh(
      new THREE.SphereGeometry(1.055, 48, 48),
      new THREE.MeshBasicMaterial({
        color: 0x5ba8ff,
        transparent: true,
        opacity: 0.1,
        side: THREE.BackSide,
      }),
    )
    globe.add(atmosphere)

    const positions = new Float32Array(data.positions.length * 3)
    data.positions.forEach((position, index) => {
      const radius = 1 + Math.max(0.045, position.altitudeKm / 6_378)
      const point = positionToCartesian(
        position.latitude,
        position.longitude,
        radius,
      )
      positions[index * 3] = point.x
      positions[index * 3 + 1] = point.y
      positions[index * 3 + 2] = point.z
    })
    const markerGeometry = new THREE.BufferGeometry()
    markerGeometry.setAttribute(
      'position',
      new THREE.BufferAttribute(positions, 3),
    )
    const markers = new THREE.Points(
      markerGeometry,
      new THREE.PointsMaterial({
        color: 0x78f4b5,
        size: 0.055,
        sizeAttenuation: true,
      }),
    )
    globe.add(markers)

    scene.add(new THREE.AmbientLight(0x8abfff, 1.25))
    const sunlight = new THREE.DirectionalLight(0xffffff, 2.6)
    sunlight.position.set(-3, 2, 4)
    scene.add(sunlight)
    const rimLight = new THREE.DirectionalLight(0x2f8cff, 1.5)
    rimLight.position.set(3, -1, -3)
    scene.add(rimLight)

    let dragging = false
    let previousX = 0
    let previousY = 0
    const pointerDown = (event: PointerEvent) => {
      dragging = true
      previousX = event.clientX
      previousY = event.clientY
      renderer.domElement.setPointerCapture(event.pointerId)
    }
    const pointerMove = (event: PointerEvent) => {
      if (!dragging) return
      globe.rotation.y += (event.clientX - previousX) * 0.008
      globe.rotation.x = Math.max(
        -1.15,
        Math.min(1.15, globe.rotation.x + (event.clientY - previousY) * 0.006),
      )
      previousX = event.clientX
      previousY = event.clientY
    }
    const pointerUp = () => {
      dragging = false
    }
    renderer.domElement.addEventListener('pointerdown', pointerDown)
    renderer.domElement.addEventListener('pointermove', pointerMove)
    renderer.domElement.addEventListener('pointerup', pointerUp)

    const resize = () => {
      const width = host.clientWidth
      const height = host.clientHeight
      renderer.setSize(width, height, false)
      camera.aspect = width / Math.max(height, 1)
      camera.updateProjectionMatrix()
    }
    const resizeObserver = new ResizeObserver(resize)
    resizeObserver.observe(host)
    resize()

    let frame = 0
    const animate = () => {
      if (!dragging) globe.rotation.y += 0.0012
      renderer.render(scene, camera)
      frame = requestAnimationFrame(animate)
    }
    animate()

    return () => {
      cancelAnimationFrame(frame)
      resizeObserver.disconnect()
      renderer.domElement.removeEventListener('pointerdown', pointerDown)
      renderer.domElement.removeEventListener('pointermove', pointerMove)
      renderer.domElement.removeEventListener('pointerup', pointerUp)
      texture?.dispose()
      earth.geometry.dispose()
      earth.material.dispose()
      atmosphere.geometry.dispose()
      atmosphere.material.dispose()
      markerGeometry.dispose()
      markers.material.dispose()
      renderer.dispose()
      renderer.domElement.remove()
    }
  }, [data.positions])

  return (
    <div
      className="earth-globe"
      ref={hostRef}
      role="img"
      aria-label={`Interactive 3D Earth with ${data.positions.length} calculated Starlink positions`}
    >
      {renderError && (
        <p>3D rendering is unavailable in this browser. Orbital metrics remain available below.</p>
      )}
      <span>Drag to rotate</span>
    </div>
  )
}
