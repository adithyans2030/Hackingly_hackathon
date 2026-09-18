/**
 * BrickWall Hero 3D Scene
 * Brick color palette: terracotta reds, warm oranges, mortar neutrals
 * Pattern: Layered Separation (Three.js alpha canvas + CSS/React UI overlay)
 */
import * as THREE from 'three'

export function initHeroScene(canvas) {
  const W = canvas.clientWidth || window.innerWidth
  const H = canvas.clientHeight || window.innerHeight

  // ── Renderer ──────────────────────────────────────────────────────────
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    powerPreference: 'high-performance',
  })
  renderer.setSize(W, H)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setClearColor(0x000000, 0)

  // ── Scene & Camera ─────────────────────────────────────────────────────
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(60, W / H, 0.1, 1000)
  camera.position.set(0, 0, 18)

  // ── Mouse Parallax ─────────────────────────────────────────────────────
  const mouse = { x: 0, y: 0 }
  const target = { x: 0, y: 0 }

  // ── Lighting — warm brick kiln tones ──────────────────────────────────
  scene.add(new THREE.AmbientLight(0xe8924a, 0.5))

  const dirLight = new THREE.DirectionalLight(0xfdf0e8, 1.0)
  dirLight.position.set(5, 10, 8)
  scene.add(dirLight)

  // Warm brick point light
  const pointLight = new THREE.PointLight(0xB5451B, 2.5, 40)
  pointLight.position.set(-8, 4, 6)
  scene.add(pointLight)

  // Amber fill light
  const fillLight = new THREE.PointLight(0xE8924A, 1.2, 35)
  fillLight.position.set(10, -2, 4)
  scene.add(fillLight)

  // ── Primary Shield / Brick "B" Icosahedron ─────────────────────────────
  const icoGeo = new THREE.IcosahedronGeometry(3.6, 1)

  // Solid glowing brick interior
  const icoMat = new THREE.MeshPhongMaterial({
    color: 0xB5451B,
    emissive: 0x5c1a07,
    emissiveIntensity: 0.5,
    shininess: 80,
    transparent: true,
    opacity: 0.2,
    side: THREE.DoubleSide,
  })
  const icoMesh = new THREE.Mesh(icoGeo, icoMat)
  icoMesh.position.set(4, 0, 0)
  scene.add(icoMesh)

  // Wireframe — terracotta orange
  const wireMat = new THREE.MeshBasicMaterial({
    color: 0xC9613A,
    wireframe: true,
    transparent: true,
    opacity: 0.4,
  })
  const wireMesh = new THREE.Mesh(icoGeo, wireMat)
  wireMesh.position.copy(icoMesh.position)
  scene.add(wireMesh)

  // ── Glowing Core ───────────────────────────────────────────────────────
  const coreGeo = new THREE.IcosahedronGeometry(1.8, 0)
  const coreMat = new THREE.MeshPhongMaterial({
    color: 0xE8924A,
    emissive: 0xB5451B,
    emissiveIntensity: 0.7,
    shininess: 160,
    transparent: true,
    opacity: 0.6,
  })
  const coreMesh = new THREE.Mesh(coreGeo, coreMat)
  coreMesh.position.copy(icoMesh.position)
  scene.add(coreMesh)

  // ── Floating Ring — mortar color ───────────────────────────────────────
  const ringGeo = new THREE.TorusGeometry(5.4, 0.06, 16, 80)
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0xD4A484,
    transparent: true,
    opacity: 0.25,
  })
  const ringMesh = new THREE.Mesh(ringGeo, ringMat)
  ringMesh.position.copy(icoMesh.position)
  ringMesh.rotation.x = Math.PI / 2.4
  scene.add(ringMesh)

  // Second tilted ring
  const ring2Geo = new THREE.TorusGeometry(5.0, 0.04, 16, 80)
  const ring2Mat = new THREE.MeshBasicMaterial({
    color: 0xB5451B,
    transparent: true,
    opacity: 0.18,
  })
  const ring2Mesh = new THREE.Mesh(ring2Geo, ring2Mat)
  ring2Mesh.position.copy(icoMesh.position)
  ring2Mesh.rotation.x = Math.PI / 3.5
  ring2Mesh.rotation.z = Math.PI / 5
  scene.add(ring2Mesh)

  // ── Particle Cloud — brick + mortar palette ────────────────────────────
  const PARTICLE_COUNT = 900
  const positions = new Float32Array(PARTICLE_COUNT * 3)
  const colors = new Float32Array(PARTICLE_COUNT * 3)

  const colorBrick   = new THREE.Color(0xB5451B)   // brick red
  const colorTerra   = new THREE.Color(0xC9613A)   // terracotta
  const colorAmber   = new THREE.Color(0xE8924A)   // amber
  const colorMortar  = new THREE.Color(0xD4C5B0)   // mortar

  const colorPool = [colorBrick, colorTerra, colorAmber, colorMortar]

  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const theta = Math.random() * Math.PI * 2
    const phi = Math.acos(2 * Math.random() - 1)
    const r = 9 + Math.random() * 6

    positions[i * 3]     = r * Math.sin(phi) * Math.cos(theta)
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta) * 0.5
    positions[i * 3 + 2] = r * Math.cos(phi)

    const c = colorPool[Math.floor(Math.random() * colorPool.length)]
    colors[i * 3]     = c.r
    colors[i * 3 + 1] = c.g
    colors[i * 3 + 2] = c.b
  }

  const particleGeo = new THREE.BufferGeometry()
  particleGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  particleGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3))

  const particleMat = new THREE.PointsMaterial({
    size: 0.13,
    vertexColors: true,
    transparent: true,
    opacity: 0.6,
    sizeAttenuation: true,
  })

  const particles = new THREE.Points(particleGeo, particleMat)
  particles.position.set(0, 0, -2)
  scene.add(particles)

  // ── Floating Document Cards ─────────────────────────────────────────────
  const cardGroup = new THREE.Group()
  const cardDefs = [
    { pos: [-7, 2.5, -1], rot: [0, 0.25, 0.18] },
    { pos: [-5.5, -2, 1], rot: [0, -0.2, -0.15] },
    { pos: [9.5, 2.2, -2], rot: [0, -0.3, 0.12] },
    { pos: [8.5, -2, 1.5], rot: [0, 0.2, -0.1] },
  ]

  cardDefs.forEach(({ pos, rot }) => {
    const cGeo = new THREE.PlaneGeometry(1.7, 1.1)
    const cMat = new THREE.MeshBasicMaterial({
      color: 0x2a0d06,
      transparent: true,
      opacity: 0.45,
      side: THREE.DoubleSide,
    })
    const card = new THREE.Mesh(cGeo, cMat)
    card.position.set(...pos)
    card.rotation.set(...rot)

    const edgesGeo = new THREE.EdgesGeometry(cGeo)
    const edgesMat = new THREE.LineBasicMaterial({
      color: 0xB5451B,
      transparent: true,
      opacity: 0.55,
    })
    card.add(new THREE.LineSegments(edgesGeo, edgesMat))
    cardGroup.add(card)
  })
  scene.add(cardGroup)

  // ── Timer (replaces deprecated THREE.Clock) ───────────────────────────
  const startTime = performance.now()
  let animFrameId = null

  // ── Handlers ──────────────────────────────────────────────────────────
  function onMouseMove(e) {
    mouse.x = (e.clientX / window.innerWidth) * 2 - 1
    mouse.y = -(e.clientY / window.innerHeight) * 2 + 1
  }
  window.addEventListener('mousemove', onMouseMove)

  function onResize() {
    const w = canvas.clientWidth || window.innerWidth
    const h = canvas.clientHeight || window.innerHeight
    camera.aspect = w / h
    camera.updateProjectionMatrix()
    renderer.setSize(w, h)
  }
  window.addEventListener('resize', onResize)

  // ── Animation Loop ─────────────────────────────────────────────────────
  function animate() {
    animFrameId = requestAnimationFrame(animate)
    const elapsed = (performance.now() - startTime) / 1000

    // Mouse parallax
    target.x += (mouse.x * 1.5 - target.x) * 0.04
    target.y += (mouse.y * 1.0 - target.y) * 0.04
    camera.position.x = target.x
    camera.position.y = target.y
    camera.lookAt(0, 0, 0)

    // Shield
    icoMesh.rotation.y = elapsed * 0.3
    icoMesh.rotation.x = Math.sin(elapsed * 0.2) * 0.14
    wireMesh.rotation.y = elapsed * 0.3
    wireMesh.rotation.x = Math.sin(elapsed * 0.2) * 0.14

    // Core
    coreMesh.rotation.y = -elapsed * 0.45
    coreMesh.rotation.x = elapsed * 0.22

    // Rings
    ringMesh.rotation.y = elapsed * 0.15
    ringMesh.rotation.z = Math.sin(elapsed * 0.22) * 0.07
    ring2Mesh.rotation.y = -elapsed * 0.12
    ring2Mesh.rotation.z = Math.cos(elapsed * 0.18) * 0.06

    // Particles
    particles.rotation.y = elapsed * 0.04
    particles.rotation.x = Math.sin(elapsed * 0.055) * 0.025

    // Cards bob
    cardGroup.children.forEach((card, i) => {
      card.position.y += Math.sin(elapsed * 0.55 + i * 1.4) * 0.0018
    })

    // Pulsing warm lights
    pointLight.intensity = 2.2 + Math.sin(elapsed * 1.1) * 0.5
    fillLight.intensity  = 1.0 + Math.cos(elapsed * 0.8) * 0.3

    renderer.render(scene, camera)
  }
  animate()

  // ── Cleanup ────────────────────────────────────────────────────────────
  function dispose() {
    cancelAnimationFrame(animFrameId)
    window.removeEventListener('mousemove', onMouseMove)
    window.removeEventListener('resize', onResize)
    ;[icoGeo, coreGeo, ringGeo, ring2Geo, particleGeo].forEach(g => g.dispose())
    ;[icoMat, wireMat, coreMat, ringMat, ring2Mat, particleMat].forEach(m => m.dispose())
    cardGroup.children.forEach(card => {
      card.geometry.dispose()
      card.material.dispose()
    })
    renderer.dispose()
  }

  return { dispose, scene, camera, renderer }
}
