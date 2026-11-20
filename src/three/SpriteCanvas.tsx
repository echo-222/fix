import { Canvas, useThree } from '@react-three/fiber'
import { useEffect } from 'react'
import { Box3, Mesh, Vector3, type OrthographicCamera } from 'three'
import { SPRITE_ANCHOR } from '../community/plaza'
import { RealLighting } from './manual/ModelView'
import { StillContent } from './Scene'

/**
 * 广场上的模型图：正交相机，水平 45°、俯角 30°（2:1 等轴），和首页地砖的菱形对齐。
 * 每张图里模型的地面中心固定在 SPRITE_ANCHOR，广场按这个点把图放到底座中心。
 */
const MARGIN = 0.05
const DIR = new Vector3(1, Math.SQRT2 * Math.tan(Math.PI / 6), 1).normalize()

export interface SpriteMeta {
  /** 模型最高点在图里的位置（从上往下，占画面比例），广场用它放名牌 */
  top: number
  /** 模型左右边缘（占画面比例） */
  left: number
  right: number
}

/** 只量看得见的实体面：线条的缓冲区里有没用到的 0 坐标，会把包围盒拉到原点 */
function visibleBox(root: import('three').Object3D) {
  const box = new Box3()
  const b = new Box3()
  root.updateMatrixWorld(true)
  root.traverseVisible((o) => {
    const m = o as Mesh & { isLineSegments2?: boolean }
    if (!m.isMesh || m.isLineSegments2 || !m.geometry) return
    const mat = Array.isArray(m.material) ? m.material[0] : m.material
    if (mat && mat.transparent && mat.depthWrite === false) return
    if (!m.geometry.boundingBox) m.geometry.computeBoundingBox()
    b.copy(m.geometry.boundingBox!).applyMatrix4(m.matrixWorld)
    if (!b.isEmpty()) box.union(b)
  })
  return box
}

function Fit() {
  const { camera, scene, size, invalidate } = useThree()
  useEffect(() => {
    const cam = camera as OrthographicCamera & { manual?: boolean }
    cam.manual = true
    const fit = (): SpriteMeta | null => {
      const box = visibleBox(scene)
      if (box.isEmpty()) return null
      const ground = new Vector3((box.min.x + box.max.x) / 2, box.min.y, (box.min.z + box.max.z) / 2)
      cam.position.copy(ground).addScaledVector(DIR, 50000)
      cam.up.set(0, 1, 0)
      cam.lookAt(ground)
      cam.updateMatrixWorld(true)
      const right = new Vector3().setFromMatrixColumn(cam.matrixWorld, 0)
      const up = new Vector3().setFromMatrixColumn(cam.matrixWorld, 1)
      let minX = 0, maxX = 0, minY = 0, maxY = 0
      const p = new Vector3()
      for (let i = 0; i < 8; i++) {
        p.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).sub(ground)
        const x = p.dot(right)
        const y = p.dot(up)
        minX = Math.min(minX, x); maxX = Math.max(maxX, x)
        minY = Math.min(minY, y); maxY = Math.max(maxY, y)
      }
      const W = size.width
      const H = size.height
      const { x: ax, y: ay } = SPRITE_ANCHOR
      // 每世界单位多少像素：四个方向都不出边
      const k = Math.min(
        minX < 0 ? ((ax - MARGIN) * W) / -minX : Infinity,
        maxX > 0 ? ((1 - ax - MARGIN) * W) / maxX : Infinity,
        maxY > 0 ? ((ay - MARGIN) * H) / maxY : Infinity,
        minY < 0 ? ((1 - ay - MARGIN) * H) / -minY : Infinity,
      )
      cam.left = (-ax * W) / k
      cam.right = ((1 - ax) * W) / k
      cam.top = (ay * H) / k
      cam.bottom = (-(1 - ay) * H) / k
      cam.near = 1
      cam.far = 200000
      cam.zoom = 1
      cam.updateProjectionMatrix()
      invalidate()
      return { top: ay - (maxY * k) / H, left: ax + (minX * k) / W, right: ax + (maxX * k) / W }
    }
    const w = window as unknown as { __spriteFit?: typeof fit }
    w.__spriteFit = fit
    fit()
    return () => {
      delete w.__spriteFit
    }
  }, [camera, scene, size, invalidate])
  return null
}

export function SpriteCanvas() {
  return (
    <Canvas
      className="sprite-canvas"
      orthographic
      flat
      dpr={[1, 2]}
      camera={{ position: [5000, 4000, 5000], near: 1, far: 200000, zoom: 1 }}
      gl={{ antialias: true, alpha: true, preserveDrawingBuffer: true }}
      onCreated={({ gl, scene }) => {
        gl.setClearColor(0x000000, 0)
        scene.environmentIntensity = 0.55
      }}
    >
      <RealLighting />
      {/* 光从画面左上方来（和首页新拟物的阴影方向一致）：顶面最亮，左侧面次之，右侧面暗 */}
      <directionalLight position={[-400, 1700, 1300]} intensity={1.5} />
      <ambientLight intensity={0.12} />
      <StillContent />
      <Fit />
    </Canvas>
  )
}
