import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import {
  Color, DoubleSide, Matrix4, Mesh, MeshDepthMaterial, OrthographicCamera, PlaneGeometry, Scene, ShaderMaterial, WebGLRenderTarget,
  type BufferAttribute, type InterleavedBufferAttribute, type Material, type Object3D, type WebGLRenderer,
} from 'three'
import { LIGHT_DIR } from './LineArt'

/** 每格边上的虚线段数，和首页地面一样，交点处落在线段中间 */
const DASHES = 17

/**
 * 两层投影，都是从地面往上看、把零件压到地上（离地越近越深）再模糊：
 * contact 竖直往下、只看贴地的一小段高度，模糊得开，是落地的那圈暗；
 * cast 沿线稿明暗的同一个光向斜着压，浓度按离地高度平方衰减，抬高的零件只留淡影、不会甩出一块远远的灰。
 * px：贴图边长；reach：多高以内参与（× 场景范围）；falloff：浓度 = (1 - 高度 / reach)^falloff；
 * blur：模糊步长（贴图像素），一项一轮横竖模糊。
 */
const PASSES = [
  { px: 512, slant: [0, 0], reach: 0.08, falloff: 1, blur: [1, 2, 3] },
  { px: 1024, slant: [LIGHT_DIR.x / LIGHT_DIR.y, LIGHT_DIR.z / LIGHT_DIR.y], reach: 0.6, falloff: 2, blur: [1, 2, 3] },
]

export interface FloorLook {
  /** 网格线色 */
  line: string
  /** 网格线宽（CSS 像素） */
  width: number
  /** 两层投影的浓度 0~1 */
  contact: number
  cast: number
}

/** 不参与投影：线（LineSegments2 / Line2 / Line）、半透明的东西（虚影、灯光晕、自带投影贴图）、标了 noShadow 的 */
function skips(o: Object3D) {
  const x = o as Object3D & { isLineSegments2?: boolean; isLine?: boolean; isPoints?: boolean; isSprite?: boolean; isMesh?: boolean; material?: Material | Material[] }
  if (o.userData.noShadow || x.isLineSegments2 || x.isLine || x.isPoints || x.isSprite) return true
  if (!x.isMesh || !x.material) return false
  return Array.isArray(x.material) ? x.material.some((m) => m.transparent) : x.material.transparent
}

/** 顶点数据的指纹：整份换掉（折纸每帧 new 一份）换编号，原地改（线缆 needsUpdate）加版本 */
const attrIds = new WeakMap<object, number>()
let nextAttrId = 1
function attrSig(a: BufferAttribute | InterleavedBufferAttribute | undefined) {
  if (!a) return 0
  const data = 'isInterleavedBufferAttribute' in a ? a.data : a
  let id = attrIds.get(data)
  if (id === undefined) attrIds.set(data, (id = nextAttrId++))
  return id * 1e4 + data.version
}

const blurMaterial = () => new ShaderMaterial({
  uniforms: { map: { value: null }, step: { value: [0, 0] } },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
  fragmentShader: `
    uniform sampler2D map; uniform vec2 step; varying vec2 vUv;
    void main() {
      vec4 s = texture2D(map, vUv) * 0.2270270270;
      s += (texture2D(map, vUv + step * 1.3846153846) + texture2D(map, vUv - step * 1.3846153846)) * 0.3162162162;
      s += (texture2D(map, vUv + step * 3.2307692308) + texture2D(map, vUv - step * 3.2307692308)) * 0.0702702703;
      gl_FragColor = s;
    }`,
  depthTest: false,
  depthWrite: false,
})

interface Pass {
  a: WebGLRenderTarget
  b: WebGLRenderTarget
  cam: OrthographicCamera
  px: number
  falloff: number
  blur: readonly number[]
}

function makePass({ px, falloff, blur }: { px: number; falloff: number; blur: readonly number[] }): Pass {
  const cam = new OrthographicCamera()
  cam.matrixAutoUpdate = false
  cam.matrixWorldAutoUpdate = false
  return { a: new WebGLRenderTarget(px, px), b: new WebGLRenderTarget(px, px), cam, px, falloff, blur }
}

/** 世界 → 投影空间：x、-z 沿光线斜着压到地面（y = 0），深度是离地高度 */
function aim(p: Pass, [cx, cz]: readonly number[], half: number, [kx, kz]: readonly number[], reach: number) {
  p.cam.matrixWorldInverse.copy(new Matrix4().set(
    1, -kx, 0, -cx,
    0, kz, -1, cz,
    0, -1, 0, 0,
    0, 0, 0, 1,
  ))
  p.cam.matrixWorld.copy(p.cam.matrixWorldInverse).invert()
  Object.assign(p.cam, { left: -half, right: half, top: half, bottom: -half, near: 0, far: reach })
  p.cam.updateProjectionMatrix()
}

function blurPass(gl: WebGLRenderer, p: Pass, blur: ShaderMaterial, quad: Scene) {
  const texel = 1 / p.px
  for (const k of p.blur) {
    blur.uniforms.map.value = p.a.texture
    blur.uniforms.step.value = [texel * k, 0]
    gl.setRenderTarget(p.b)
    gl.render(quad, p.cam)
    blur.uniforms.map.value = p.b.texture
    blur.uniforms.step.value = [0, texel * k]
    gl.setRenderTarget(p.a)
    gl.render(quad, p.cam)
  }
}

/**
 * 演示舞台的地面：白底上的灰色虚线方格（首页地面的样子），加零件落在地上的软投影。
 * center / span：投影覆盖的那块地（mm）；size：场景大致范围（mm），投影的高度范围按它取；
 * fade：网格从场景中心往外多远淡完（mm），离镜头 2.5 倍远处也淡掉，免得地平线上一片摩尔纹。
 */
export function StageFloor({ center = [0, 0], span, size, cell, fade, look }: {
  center?: [number, number]
  span: number
  size: number
  cell: number
  fade: number
  look: FloorLook
}) {
  const { gl, scene } = useThree()
  const r = useMemo(() => {
    const falloff = { value: 1 }
    const depth = new MeshDepthMaterial({ side: DoubleSide })
    depth.onBeforeCompile = (s) => {
      s.uniforms.falloff = falloff
      s.fragmentShader = s.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float falloff;')
        .replace('gl_FragColor = vec4( vec3( 1.0 - fragCoordZ ), opacity );', 'gl_FragColor = vec4( vec3( 0.0 ), pow( 1.0 - fragCoordZ, falloff ) );')
    }
    const blur = blurMaterial()
    const quad = new Mesh(new PlaneGeometry(2, 2), blur)
    quad.frustumCulled = false
    const floor = new ShaderMaterial({
      uniforms: {
        contactMap: { value: null },
        castMap: { value: null },
        shadowRect: { value: [0, 0, 1] },
        strength: { value: [0, 0] },
        shadowColor: { value: new Color('#1c1c1a') },
        cell: { value: 100 },
        lineColor: { value: new Color() },
        lineHalf: { value: 0.5 },
        fadeDistance: { value: 1 },
      },
      vertexShader: 'varying vec3 vWorld; void main() { vec4 w = modelMatrix * vec4(position, 1.0); vWorld = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
      fragmentShader: `
        uniform sampler2D contactMap; uniform sampler2D castMap; uniform vec3 shadowRect; uniform vec2 strength; uniform vec3 shadowColor;
        uniform float cell; uniform vec3 lineColor; uniform float lineHalf; uniform float fadeDistance;
        varying vec3 vWorld;
        float lineFade(float d, float r) { return 1.0 - smoothstep(0.35 * r, r, d); }
        float dashMask(float t, float w) {
          float p = fract(t + 0.25);
          float sd = p < 0.5 ? min(p, 0.5 - p) : -min(p - 0.5, 1.0 - p);
          return mix(clamp(sd / w + 0.5, 0.0, 1.0), 0.5, smoothstep(0.15, 0.35, w));
        }
        void main() {
          vec2 g = vWorld.xz / cell;
          vec2 gw = fwidth(g);
          vec2 d = abs(fract(g + 0.5) - 0.5) / gw;
          vec2 on = (1.0 - smoothstep(lineHalf - 0.5, lineHalf + 0.5, d)) * (1.0 - smoothstep(0.12, 0.35, gw));
          vec2 t = g * ${DASHES}.0;
          vec2 tw = fwidth(t);
          float line = max(on.x * dashMask(t.y, tw.y), on.y * dashMask(t.x, tw.x));
          float a = line * lineFade(distance(shadowRect.xy, vWorld.xz), fadeDistance) * lineFade(distance(cameraPosition.xz, vWorld.xz), fadeDistance * 2.5);
          vec2 uv = vec2(vWorld.x - shadowRect.x, shadowRect.y - vWorld.z) / (2.0 * shadowRect.z) + 0.5;
          vec2 edge = smoothstep(0.0, 0.04, uv) * smoothstep(0.0, 0.04, 1.0 - uv);
          float sc = texture2D(contactMap, uv).a * strength.x;
          float sk = texture2D(castMap, uv).a * strength.y;
          float s = (1.0 - (1.0 - sc) * (1.0 - sk)) * edge.x * edge.y;
          float alpha = s + a * (1.0 - s);
          vec3 col = (shadowColor * s + lineColor * a * (1.0 - s)) / max(alpha, 1e-4);
          gl_FragColor = vec4(col, alpha);
          #include <colorspace_fragment>
        }`,
      transparent: true,
      depthWrite: false,
    })
    const plane = new Mesh(new PlaneGeometry(20000, 20000).rotateX(-Math.PI / 2), floor)
    plane.position.y = -0.5
    plane.renderOrder = -1
    plane.userData.noShadow = true
    const passes = PASSES.map(makePass)
    floor.uniforms.contactMap.value = passes[0].a.texture
    floor.uniforms.castMap.value = passes[1].a.texture
    return { passes, depth, falloff, blur, quad, quadScene: new Scene().add(quad), floor, plane, hidden: [] as Object3D[], clear: new Color(), sig: NaN }
  }, [])

  useEffect(() => () => {
    for (const p of r.passes) {
      p.a.dispose()
      p.b.dispose()
    }
    r.depth.dispose()
    r.blur.dispose()
    r.quad.geometry.dispose()
    r.floor.dispose()
    r.plane.geometry.dispose()
  }, [r])

  useEffect(() => {
    PASSES.forEach((p, i) => aim(r.passes[i], center, span / 2, p.slant, p.reach * size))
    r.sig = NaN
    const u = r.floor.uniforms
    u.shadowRect.value = [center[0], center[1], span / 2]
    u.cell.value = cell
    u.fadeDistance.value = fade
  }, [r, center[0], center[1], span, size, cell, fade])

  useEffect(() => {
    const u = r.floor.uniforms
    ;(u.lineColor.value as Color).set(look.line)
    u.strength.value = [look.contact, look.cast]
  }, [r, look.line, look.contact, look.cast])

  useFrame(() => {
    r.floor.uniforms.lineHalf.value = (look.width * gl.getPixelRatio()) / 2
    if (look.contact <= 0 && look.cast <= 0) return
    // 投影只跟零件有关、和镜头无关：零件的位置、显隐、顶点都没变就不重画。
    // 先把 matrixWorld 更新到这一帧（零件姿态在 priority -1 里刚写进 matrix）
    scene.updateMatrixWorld()
    const { hidden } = r
    hidden.length = 0
    let sig = 0
    let n = 0
    scene.traverseVisible((o) => {
      if (skips(o)) return void hidden.push(o)
      const m = o as Mesh
      if (!m.isMesh) return
      const e = m.matrixWorld.elements
      n++
      sig += n * (e[0] + e[1] + e[2] + e[4] + e[5] + e[6] + e[8] + e[9] + e[10]) + (n + 0.5) * (e[12] + 2 * e[13] + 3 * e[14])
        + 1e-3 * n * attrSig(m.geometry.attributes.position)
    })
    if (sig === r.sig) return
    r.sig = sig
    for (const o of hidden) o.visible = false
    const prevTarget = gl.getRenderTarget()
    const prevAlpha = gl.getClearAlpha()
    gl.getClearColor(r.clear)
    const prevOverride = scene.overrideMaterial
    const prevBackground = scene.background
    scene.overrideMaterial = r.depth
    scene.background = null
    gl.setClearColor(0x000000, 0)
    for (const p of r.passes) {
      r.falloff.value = p.falloff
      gl.setRenderTarget(p.a)
      gl.render(scene, p.cam)
    }
    scene.overrideMaterial = prevOverride
    scene.background = prevBackground
    for (const o of hidden) o.visible = true
    for (const p of r.passes) blurPass(gl, p, r.blur, r.quadScene)
    gl.setRenderTarget(prevTarget)
    gl.setClearColor(r.clear, prevAlpha)
  })

  return <primitive object={r.plane} />
}
