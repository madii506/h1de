// INDEX: the archive. An endless dark hall of faceless busts on plinths, drawn in 1-bit Bayer dither.
// Rendered at low resolution into a render target, then every pixel is thresholded against an 8x8 Bayer matrix
// into three inks (black, bone, red). Heads turn to watch the camera, a red scan line sweeps the hall, files fall.
import * as THREE from '../vendor/three.module.min.js';

const PAL = { bg: [9, 9, 10], dim: [40, 38, 35], ink: [233, 229, 219], red: [255, 43, 30] };
const col3 = a => new THREE.Vector3(a[0] / 255, a[1] / 255, a[2] / 255);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;

export const ROW = 2.4;
export const COLS = [-2.0, 2.0, -4.3, 4.3, -6.6, 6.6, -8.9, 8.9];
export const PLINTH_H = 1.05, NECK_TOP = PLINTH_H + 0.9, HEAD_Y = NECK_TOP + 0.22;
export const END_Z = -148;                     // the empty plinth at the end of the hall
const SPEC_ROW = 18;                           // the specimen bust (subject 0000000, the agent itself)

// the camera states the site moves between
export const CAMS = {
  gate:      { p: [0, 1.75, 3.2],      t: [0, 2.15, -22],     fov: 52, fog: [3, 30], expo: 1.0 },
  notice:    { p: [0, 1.8, -4],        t: [0, 2.0, -30],     fov: 52, fog: [3, 28], expo: .78 },
  notice2:   { p: [0, 1.8, -18],       t: [0, 2.05, -44],    fov: 52, fog: [3, 28], expo: .78 },
  procedure: { p: [0.2, 1.55, -22],    t: [0.6, 2.3, -48],   fov: 60, fog: [3, 26], expo: .7 },
  procedure2:{ p: [0.2, 1.6, -33],     t: [0.4, 2.2, -60],   fov: 60, fog: [3, 26], expo: .7 },
  specimen:  { p: [-0.55, 2.14, -40.7], t: [-2.46, 2.2, -42.94], fov: 34, fog: [1, 14], expo: 1.0 },
  file:      { p: [0.6, 2.05, -38.6], t: [-1.4, 2.05, -44.5], fov: 50, fog: [2, 20], expo: .5 },
  index:     { p: [0, 21, -58],        t: [0, 0, -66],       fov: 48, fog: [12, 48], expo: .85 },
  index2:    { p: [0, 21, -84],        t: [0, 0, -92],       fov: 48, fog: [12, 48], expo: .85 },
  agents:    { p: [6, 13, -98],        t: [1, 0, -108],      fov: 50, fog: [8, 40], expo: .55 },
  fees:      { p: [0, 2.6, -104],      t: [0, 1.9, -132],    fov: 54, fog: [3, 30], expo: .55 },
  faq:       { p: [0, 1.9, -116],      t: [0, 1.9, -142],    fov: 52, fog: [3, 30], expo: .45 },
  next:      { p: [0, 1.75, -142.8],   t: [0, 1.15, END_Z],  fov: 42, fog: [2, 16], expo: 1.0 },
};

export function createWorld(canvas, opt = {}) {
  const mobile = opt.mobile ?? matchMedia('(max-width: 760px)').matches;
  const reduced = opt.reduced ?? matchMedia('(prefers-reduced-motion: reduce)').matches;
  const ROWS = mobile ? 44 : 57;
  const cols = mobile ? COLS.slice(0, 6) : COLS;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance', preserveDrawingBuffer: !!opt.capture });
  renderer.setPixelRatio(1);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0, 0, 0);
  scene.fog = new THREE.Fog(0x000000, 3, 30);
  const camera = new THREE.PerspectiveCamera(52, 1, 0.08, 220);

  // shared uniforms for the scan line, injected into every lit material
  const U = { uScan: { value: 999 }, uScanW: { value: .07 } };
  const scanify = m => {
    m.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, U);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWP;')
        .replace('#include <project_vertex>', '#include <project_vertex>\n{ vec4 w = vec4(transformed, 1.0);\n#ifdef USE_INSTANCING\n w = instanceMatrix * w;\n#endif\n vWP = (modelMatrix * w).xyz; }');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWP; uniform float uScan; uniform float uScanW;')
        .replace('#include <dithering_fragment>', '#include <dithering_fragment>\n{ float d = vWP.z - uScan;\n float s = 1.0 - smoothstep(0.0, uScanW, abs(d));\n s += d > 0.0 ? 0.5 * exp(-d / (uScanW * 7.0)) : 0.0;\n s = clamp(s, 0.0, 1.0) * (1.0 - smoothstep(26.0, 70.0, distance(vWP, cameraPosition)));\n gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(1.0, 0.0, 0.0), s); }');
    };
    return m;
  };

  // ---- geometry ----
  const torsoGeo = (() => {
    const P = [[0.001, 0], [0.25, 0], [0.285, 0.06], [0.31, 0.2], [0.33, 0.33], [0.34, 0.42], [0.325, 0.49], [0.27, 0.55], [0.19, 0.59], [0.115, 0.625], [0.092, 0.68], [0.086, 0.8], [0.088, 0.9], [0.001, 0.92]]
      .map(([r, y]) => new THREE.Vector2(r, y));
    const g = new THREE.LatheGeometry(P, mobile ? 14 : 18);
    g.scale(1.32, 1, 0.64);
    g.translate(0, PLINTH_H, 0);
    return g;
  })();
  const headGeo = (() => {
    const g = new THREE.SphereGeometry(0.21, mobile ? 12 : 16, mobile ? 9 : 12);
    g.scale(0.86, 1.15, 0.98);
    g.translate(0, 0.2, 0.025);
    return g;
  })();
  const noseGeo = (() => { const g = new THREE.ConeGeometry(0.034, 0.1, 5); g.rotateX(Math.PI / 2); g.translate(0, 0.185, 0.215); return g; })();
  const browGeo = (() => { const g = new THREE.BoxGeometry(0.2, 0.025, 0.04); g.translate(0, 0.245, 0.185); return g; })();
  const plinthGeo = new THREE.BoxGeometry(0.66, PLINTH_H, 0.66); plinthGeo.translate(0, PLINTH_H / 2, 0);
  const tagGeo = new THREE.BoxGeometry(0.2, 0.06, 0.012); tagGeo.translate(0, PLINTH_H - 0.16, 0.336);

  const stone = scanify(new THREE.MeshLambertMaterial({ color: 0x8a8a8a }));
  const plaster = scanify(new THREE.MeshLambertMaterial({ color: 0xd4d4d4 }));
  const floorMat = scanify(new THREE.MeshLambertMaterial({ color: 0x232323 }));
  const tagMat = new THREE.MeshBasicMaterial({ color: 0xffffff });

  // ---- the busts, in subject order: row by row from the entrance, the columns nearest the aisle first ----
  const B = [];
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < cols.length; c++) {
    const x = cols[c] + (rnd() - .5) * .08, z = -r * ROW + (rnd() - .5) * .1;
    const spec = r === SPEC_ROW && c === 0;
    const gap = !spec && r > 1 && rnd() < .065;           // a few plinths stand empty
    B.push({ x, z, r, c, gap, spec, yaw: 0, pitch: 0, sub: null });
  }
  const live = B.filter(b => !b.gap);
  const order = live.filter(b => !b.spec);                 // bust k <-> subject k+1
  const specimen = B.findIndex(b => b.spec);

  const plinths = new THREE.InstancedMesh(plinthGeo, stone, B.length);
  const torsos = new THREE.InstancedMesh(torsoGeo, plaster, live.length);
  const heads = new THREE.InstancedMesh(headGeo, plaster, live.length);
  const noses = new THREE.InstancedMesh(noseGeo, plaster, live.length);
  const brows = new THREE.InstancedMesh(browGeo, plaster, live.length);
  const tags = new THREE.InstancedMesh(tagGeo, tagMat, B.length);
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(0, 0, 0, 'YXZ'), S1 = new THREE.Vector3(1, 1, 1), P0 = new THREE.Vector3();
  const DARK = new THREE.Color(0.1, 0.1, 0.1), RED = new THREE.Color(1, 0, 0), WHITE = new THREE.Color(1, 1, 1);
  B.forEach((b, i) => {
    M.makeTranslation(b.x, 0, b.z); plinths.setMatrixAt(i, M); tags.setMatrixAt(i, M);
    tags.setColorAt(i, b.gap ? DARK : RED);
  });
  live.forEach((b, j) => { b.j = j; M.makeTranslation(b.x, 0, b.z); torsos.setMatrixAt(j, M); });
  const headMatrix = b => { E.set(b.pitch, b.yaw, 0); Q.setFromEuler(E); P0.set(b.x, NECK_TOP, b.z); M.compose(P0, Q, S1); heads.setMatrixAt(b.j, M); noses.setMatrixAt(b.j, M); brows.setMatrixAt(b.j, M); };
  const Z0 = new THREE.Matrix4().makeScale(0, 0, 0);
  live.forEach(b => { if (b.spec) { for (const m of [torsos, heads, noses, brows]) m.setMatrixAt(b.j, Z0); } else headMatrix(b); });
  for (const m of [plinths, torsos, heads, noses, brows, tags]) { m.frustumCulled = false; scene.add(m); }

  // the specimen: its own meshes, so it can dissolve when it is h1dden
  const SB = B[specimen];
  const ghostMat = scanify(new THREE.MeshLambertMaterial({ color: 0xd4d4d4, transparent: true, opacity: 1 }));
  const specTorso = new THREE.Mesh(torsoGeo, ghostMat); specTorso.position.set(SB.x, 0, SB.z);
  const specHead = new THREE.Group(); specHead.position.set(SB.x, NECK_TOP, SB.z);
  for (const g of [headGeo, noseGeo, browGeo]) specHead.add(new THREE.Mesh(g, ghostMat));
  scene.add(specTorso, specHead);
  function setVanish(k) {
    ghostMat.opacity = 1 - k; ghostMat.depthWrite = k < .5;
    specTorso.visible = specHead.visible = k < .995;
    tags.setColorAt(specimen, k > .5 ? DARK : RED); tags.instanceColor.needsUpdate = true;
  }

  // sheets over the busts: one per move someone h1d
  const shroudGeo = (() => {
    const P = [[0.5, 0.98], [0.52, 1.1], [0.5, 1.35], [0.48, 1.58], [0.42, 1.72], [0.3, 1.84], [0.21, 1.92], [0.25, 2.02], [0.27, 2.2], [0.22, 2.38], [0.12, 2.47], [0.001, 2.5]].map(([r, y]) => new THREE.Vector2(r, y));
    const g = new THREE.LatheGeometry(P, mobile ? 16 : 24);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i), th = Math.atan2(z, x);
      const hem = Math.min(1, Math.max(0, (1.95 - y) / .9));
      const f = 1 + .07 * Math.sin(7 * th + y * 2.3) * hem + .02 * Math.sin(13 * th);
      pos.setXYZ(i, x * f * 1.3, y - (hem > .9 ? .03 * Math.sin(5 * th) : 0), z * f * .78);
    }
    g.computeVertexNormals();
    return g;
  })();
  const order2 = live.filter(b => !b.spec);
  const shrouds = new THREE.InstancedMesh(shroudGeo, scanify(new THREE.MeshLambertMaterial({ color: 0xc4c4c4 })), order2.length);
  shrouds.frustumCulled = false;
  order2.forEach((b, k) => shrouds.setMatrixAt(k, Z0));
  scene.add(shrouds);
  let covered = 0;
  function setCovered(n) {
    covered = Math.max(0, Math.min(order2.length, n | 0));
    order2.forEach((b, k) => {
      if (k < covered) { E.set(0, (k * 2.399) % 6.28, 0); Q.setFromEuler(E); P0.set(b.x, 0, b.z); M.compose(P0, Q, S1); shrouds.setMatrixAt(k, M); }
      else shrouds.setMatrixAt(k, Z0);
      b.cov = k < covered;
      tags.setColorAt(B.indexOf(b), b.cov ? DARK : RED);
    });
    shrouds.instanceMatrix.needsUpdate = true; tags.instanceColor.needsUpdate = true;
  }

  // the trace: red lines from the specimen to the wallets it is linked with
  const pickB = (r, c) => { for (let d = 0; d < 6; d++) { const b = B[(r + d) * cols.length + c]; if (b && !b.gap) return b; } return null; };
  const TRG = [pickB(SPEC_ROW + 3, 2), pickB(SPEC_ROW + 6, 4), pickB(SPEC_ROW + 2, 6), pickB(SPEC_ROW + 8, 0)].filter(Boolean);
  const linePos = new Float32Array(TRG.length * 6);
  const lineGeo = new THREE.BufferGeometry(); lineGeo.setAttribute('position', new THREE.BufferAttribute(linePos, 3));
  const lines = new THREE.LineSegments(lineGeo, new THREE.LineBasicMaterial({ color: 0xff0000, fog: false }));
  lines.frustumCulled = false; scene.add(lines);
  function setTrace(v) {
    v = Math.max(0, Math.min(TRG.length, v));
    TRG.forEach((b, i) => {
      const f = Math.max(0, Math.min(1, v - i));
      const ax = SB.x, ay = HEAD_Y + .02, az = SB.z;
      linePos.set([ax, ay, az, ax + (b.x - ax) * f, ay + ((HEAD_Y + .02) - ay) * f, az + (b.z - az) * f], i * 6);
    });
    lineGeo.attributes.position.needsUpdate = true;
    lineGeo.setDrawRange(0, Math.ceil(v) * 2);
  }
  setTrace(0);

  // floor, the end wall, the empty plinth waiting at the end of the hall
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 240), floorMat);
  floor.rotation.x = -Math.PI / 2; floor.position.set(0, 0, -80); scene.add(floor);
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(40, 14), scanify(new THREE.MeshLambertMaterial({ color: 0x1c1c1c })));
  wall.position.set(0, 7, END_Z - 5); scene.add(wall);
  const lastPlinth = new THREE.Mesh(plinthGeo, stone); lastPlinth.position.set(0, 0, END_Z); scene.add(lastPlinth);
  const lastTag = new THREE.Mesh(tagGeo, new THREE.MeshBasicMaterial({ color: 0xff0000 })); lastTag.position.set(0, 0, END_Z); scene.add(lastTag);
  const spot = new THREE.SpotLight(0xffffff, 60, 12, .32, .45, 1.2);
  spot.position.set(0, 7.5, END_Z + 1.2); spot.target.position.set(0, 0, END_Z); scene.add(spot, spot.target);

  // ceiling tubes over the aisle (some flicker) and a small pool of point lights that follows the camera
  const TUBE = 4.8, NT = Math.ceil(150 / TUBE);
  const tubes = new THREE.InstancedMesh(new THREE.BoxGeometry(2.4, 0.05, 0.08), new THREE.MeshBasicMaterial({ color: 0xffffff }), NT);
  const tubeZ = i => 1.2 - i * TUBE;
  const flick = new Set([3, 7, 12, 19, 26]);
  for (let i = 0; i < NT; i++) { M.makeTranslation(0, 4.7, tubeZ(i)); tubes.setMatrixAt(i, M); tubes.setColorAt(i, new THREE.Color(1, 1, 1)); }
  tubes.frustumCulled = false; scene.add(tubes);
  const wires = new THREE.InstancedMesh(new THREE.BoxGeometry(0.012, 4, 0.012), new THREE.MeshBasicMaterial({ color: 0x555555 }), NT * 2);
  for (let i = 0; i < NT; i++) for (const s of [-1, 1]) { M.makeTranslation(s * 1.0, 6.7, tubeZ(i)); wires.setMatrixAt(i * 2 + (s > 0 ? 1 : 0), M); }
  wires.frustumCulled = false; scene.add(wires);
  const NL = mobile ? 3 : 5, lights = [];
  for (let i = 0; i < NL; i++) { const l = new THREE.PointLight(0xffffff, 24, 16, 1.15); scene.add(l); lights.push(l); }
  scene.add(new THREE.HemisphereLight(0xb8b4ac, 0x000000, .2));

  // falling files
  const NF = reduced ? 0 : mobile ? 50 : 120;
  const files = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.2, 0.27), scanify(new THREE.MeshLambertMaterial({ color: 0xe2e2e2, side: THREE.DoubleSide })), Math.max(1, NF));
  files.frustumCulled = false; files.count = NF; scene.add(files);
  const F = [];
  const spawn = (f, z0, top) => {
    f.x = (Math.random() - .5) * 18; f.z = z0 - 3.5 - Math.random() * 28; f.y = top ? 5 + Math.random() * 3 : Math.random() * 7;
    f.v = .22 + Math.random() * .38; f.rx = Math.random() * 6; f.ry = Math.random() * 6; f.rz = Math.random() * 6;
    f.sx = (Math.random() - .5) * 2.4; f.sy = (Math.random() - .5) * 2.4; f.sz = (Math.random() - .5) * 1.4; f.ph = Math.random() * 9;
  };
  for (let i = 0; i < NF; i++) { const f = {}; spawn(f, 4, false); F.push(f); }

  // ---- the dither pass ----
  const bayer = new Uint8Array(64);
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    const xy = x ^ y;
    const v = ((xy & 1) << 5) | ((y & 1) << 4) | ((xy & 2) << 2) | ((y & 2) << 1) | ((xy & 4) >> 1) | ((y & 4) >> 2);
    bayer[y * 8 + x] = v * 4 + 2;
  }
  const bayerTex = new THREE.DataTexture(bayer, 8, 8, THREE.RedFormat, THREE.UnsignedByteType);
  bayerTex.magFilter = bayerTex.minFilter = THREE.NearestFilter; bayerTex.needsUpdate = true;
  let rt = null;
  const post = new THREE.ShaderMaterial({
    uniforms: {
      tScene: { value: null }, tBayer: { value: bayerTex }, uRT: { value: new THREE.Vector2(1, 1) }, uPX: { value: 3 },
      uInk: { value: col3(PAL.ink) }, uBg: { value: col3(PAL.bg) }, uDim: { value: col3(PAL.dim) }, uRed: { value: col3(PAL.red) },
      uExpo: { value: 1 }, uGamma: { value: 1.05 }, uTones: { value: 3 },
    },
    vertexShader: 'void main(){ gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: `
      uniform sampler2D tScene; uniform sampler2D tBayer; uniform vec2 uRT; uniform float uPX;
      uniform vec3 uInk; uniform vec3 uBg; uniform vec3 uDim; uniform vec3 uRed; uniform float uExpo; uniform float uGamma; uniform float uTones;
      void main(){
        vec2 cell = floor(gl_FragCoord.xy / uPX);
        vec3 c = texture2D(tScene, (cell + 0.5) / uRT).rgb;
        float b = texture2D(tBayer, (mod(cell, 8.0) + 0.5) / 8.0).r;
        float red = c.r - max(c.g, c.b);
        float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
        l = pow(clamp(pow(l, 1.0 / 2.2) * uExpo, 0.0, 1.0), uGamma);
        vec3 col;
        if (uTones < 2.5) col = l > b ? uInk : uBg;
        else if (l < 0.42) col = (l / 0.42 > b) ? uDim : uBg;
        else col = ((l - 0.42) / 0.58 > b) ? uInk : uDim;
        if (red > 0.045 && clamp(pow(red * min(uExpo * 1.25, 1.0), 0.8) * 1.15, 0.0, 1.0) > b) col = uRed;
        gl_FragColor = vec4(col, 1.0);
      }`,
    depthTest: false, depthWrite: false,
  });
  const postScene = new THREE.Scene();
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), post); quad.frustumCulled = false; postScene.add(quad);
  const postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  let W = 1, H = 1, PX = 3;
  function resize() {
    W = canvas.clientWidth || innerWidth; H = canvas.clientHeight || innerHeight;
    PX = opt.px || (mobile ? 2 : clamp(Math.round(H / 330), 2, 4));
    renderer.setSize(W, H, false);
    const rw = Math.ceil(W / PX), rh = Math.ceil(H / PX);
    if (rt) rt.dispose();
    rt = new THREE.WebGLRenderTarget(rw, rh, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, colorSpace: THREE.SRGBColorSpace, depthBuffer: true });
    post.uniforms.tScene.value = rt.texture; post.uniforms.uRT.value.set(rw, rh); post.uniforms.uPX.value = PX;
    camera.aspect = W / H; camera.updateProjectionMatrix();
  }
  resize();

  // ---- camera rig: a damped follow toward the target state ----
  const cur = { p: new THREE.Vector3(...CAMS.gate.p), t: new THREE.Vector3(...CAMS.gate.t), fov: 52, fogN: 3, fogF: 30, expo: 0 };
  const tgt = { p: new THREE.Vector3(...CAMS.gate.p), t: new THREE.Vector3(...CAMS.gate.t), fov: 52, fogN: 3, fogF: 30, expo: 1 };
  let mode = 'gate', par = { x: 0, y: 0, tx: 0, ty: 0 };
  function go(s, now) {
    tgt.p.set(...s.p); tgt.t.set(...s.t); tgt.fov = s.fov; tgt.fogN = s.fog[0]; tgt.fogF = s.fog[1]; tgt.expo = s.expo;
    if (now) { cur.p.copy(tgt.p); cur.t.copy(tgt.t); cur.fov = tgt.fov; cur.fogN = tgt.fogN; cur.fogF = tgt.fogF; cur.expo = tgt.expo; }
  }
  const mix = (a, b, k) => ({ p: a.p.map((v, i) => lerp(v, b.p[i], k)), t: a.t.map((v, i) => lerp(v, b.t[i], k)), fov: lerp(a.fov, b.fov, k), fog: [lerp(a.fog[0], b.fog[0], k), lerp(a.fog[1], b.fog[1], k)], expo: lerp(a.expo, b.expo, k) });

  // ---- time ----
  let t = 0, last = performance.now(), running = true, raf = 0, frameCb = null;
  let scanT = 0, stare = 0, nextStare = 14 + Math.random() * 8, stareGain = 0;
  const look = new THREE.Vector3();

  function step(dt) {
    t += dt;
    // camera
    const k = 1 - Math.exp(-dt * (mode === 'gate' ? 1.4 : 2.6));
    cur.p.lerp(tgt.p, k); cur.t.lerp(tgt.t, k);
    cur.fov = lerp(cur.fov, tgt.fov, k); cur.fogN = lerp(cur.fogN, tgt.fogN, k); cur.fogF = lerp(cur.fogF, tgt.fogF, k);
    cur.expo = lerp(cur.expo, tgt.expo, 1 - Math.exp(-dt * 1.6));
    par.x = lerp(par.x, par.tx, 1 - Math.exp(-dt * 2)); par.y = lerp(par.y, par.ty, 1 - Math.exp(-dt * 2));
    const drift = mode === 'gate' && !reduced ? Math.sin(t * .07) * 1.6 : 0;
    const breathe = reduced ? 0 : Math.sin(t * .9) * .015;
    camera.position.set(cur.p.x + par.x * .35, cur.p.y + par.y * .18 + breathe, cur.p.z + drift);
    look.set(cur.t.x + par.x * .9, cur.t.y + par.y * .5, cur.t.z + drift);
    camera.lookAt(look);
    if (Math.abs(camera.fov - cur.fov) > .01) { camera.fov = cur.fov; camera.updateProjectionMatrix(); }
    scene.fog.near = cur.fogN; scene.fog.far = cur.fogF;
    post.uniforms.uExpo.value = cur.expo;

    // lights follow the camera: the nearest tubes ahead of it
    const cz = camera.position.z, first = clamp(Math.floor((1.2 - cz - 6) / TUBE), 0, NT - NL);
    lights.forEach((l, i) => {
      const n = first + i; l.position.set(0, 4.5, tubeZ(n));
      const f = flick.has(n) && !reduced ? (Math.sin(t * 23 + n) > .2 || Math.sin(t * 3.1 + n * 2) > .7 ? 1 : .08) : 1;
      l.intensity = 24 * f;
      tubes.setColorAt(n, f < .5 ? DARK : WHITE);
    });
    tubes.instanceColor.needsUpdate = true;

    // the scan sweeps the hall ahead of the camera, rests, sweeps again
    if (!reduced) {
      scanT += dt;
      const sweep = 4.2, rest = 2.6, ph = scanT % (sweep + rest);
      const top = camera.position.y > 8;
      const z0 = top ? cz + 6 : cz + 1.5, z1 = top ? cz - 40 : cz - 34;
      U.uScan.value = ph < sweep ? lerp(z0, z1, ph / sweep) : 999;
      U.uScanW.value = top ? .07 : .07;
    }

    // heads watch the camera. every so often every head in the hall turns at once
    if (!reduced) {
      nextStare -= dt;
      if (nextStare <= 0) { stare = 2.8; nextStare = 17 + Math.random() * 9; }
      if (stare > 0) stare -= dt;
    }
    stareGain = lerp(stareGain, stare > 0 ? 1 : 0, 1 - Math.exp(-dt * 6));
    const cx = camera.position.x, cy = camera.position.y;
    const kSlow = 1 - Math.exp(-dt * 1.3), kFast = 1 - Math.exp(-dt * 7);
    for (const b of live) {
      const dx = cx - b.x, dz = cz - b.z, d = Math.hypot(dx, dz);
      let ty = 0, tp = 0, kk = kSlow;
      const near = d < 7.5 && dz > -1.5;
      if (!reduced && (near || (stareGain > .5 && d < 46))) {
        ty = clamp(Math.atan2(dx, dz), -1.95, 1.95);
        tp = clamp(-Math.atan2(cy - HEAD_Y, Math.max(d, .5)), -.55, .45);
        kk = stareGain > .5 ? kFast : kSlow;
      }
      b.yaw += (ty - b.yaw) * kk; b.pitch += (tp - b.pitch) * kk;
      if (b.spec) specHead.rotation.set(b.pitch, b.yaw, 0, 'YXZ'); else if (!b.cov) headMatrix(b);
    }
    heads.instanceMatrix.needsUpdate = noses.instanceMatrix.needsUpdate = brows.instanceMatrix.needsUpdate = true;

    // files fall, turn and drift
    for (let i = 0; i < NF; i++) {
      const f = F[i];
      f.y -= f.v * dt; f.rx += f.sx * dt; f.ry += f.sy * dt; f.rz += f.sz * dt; f.x += Math.sin(t * .8 + f.ph) * .18 * dt;
      if (f.y < 0.02) spawn(f, camera.position.z, true);
      E.set(f.rx, f.ry, f.rz); Q.setFromEuler(E); P0.set(f.x, f.y, f.z); M.compose(P0, Q, S1); files.setMatrixAt(i, M);
    }
    if (NF) files.instanceMatrix.needsUpdate = true;
  }

  function render() {
    renderer.setRenderTarget(rt); renderer.render(scene, camera);
    renderer.setRenderTarget(null); renderer.render(postScene, postCam);
  }

  function loop(now) {
    raf = 0;
    if (!running) return;
    const dt = Math.min(.05, (now - last) / 1000); last = now;
    step(dt); render();
    if (frameCb) frameCb(api);
    raf = requestAnimationFrame(loop);
  }
  const start = () => { if (!raf && running) { last = performance.now(); raf = requestAnimationFrame(loop); } };
  document.addEventListener('visibilitychange', () => { running = !document.hidden; if (running) start(); });
  addEventListener('resize', () => { resize(); if (!running) render(); });
  if (!opt.manual) start();

  // ---- picking and projecting heads ----
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();
  function pick(clientX, clientY) {
    const r = canvas.getBoundingClientRect();
    ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const o = ray.ray.origin, dir = ray.ray.direction;
    let best = -1, bt = 1e9;
    B.forEach((b, i) => {
      if (b.gap) return;
      tmp.set(b.x, HEAD_Y + .03, b.z).sub(o);
      const tc = tmp.dot(dir); if (tc < 0) return;
      const d2 = tmp.lengthSq() - tc * tc, rr = .3 * .3;
      if (d2 > rr) return;
      const th = tc - Math.sqrt(rr - d2);
      if (th < bt && th < cur.fogF + 4) { bt = th; best = i; }
    });
    return best;
  }
  function project(i) {
    const b = i === 'end' ? { x: 0, z: END_Z, gap: false, end: true } : B[i];
    if (!b) return null;
    const hy = b.end ? PLINTH_H + .62 : HEAD_Y;
    tmp.set(b.x, hy + (b.end ? .62 : .36), b.z).project(camera);
    tmp2.set(b.x, hy - (b.end ? .62 : .3), b.z).project(camera);
    if (tmp.z > 1 || tmp2.z > 1) return null;
    const x = (tmp.x + tmp2.x) / 4 * W + W / 2, y1 = (-tmp.y / 2 + .5) * H, y2 = (-tmp2.y / 2 + .5) * H;
    const h = Math.abs(y2 - y1);
    return { x, y: (y1 + y2) / 2, h, w: h * .8 };
  }
  const stateAt = i => { const b = B[i]; if (!b || b.gap) return null; if (b.spec) return 'you'; return b.cov ? 'h1dden' : 'watched'; };

  const api = {
    go, mix, pick, project, stateAt, specimen, resize, render, setTrace, setVanish, setCovered,
    set mode(m) { mode = m; }, get mode() { return mode; },
    pointer(nx, ny) { par.tx = nx; par.ty = ny; },
    onFrame(cb) { frameCb = cb; },
    advance(sec, n = 1) { for (let i = 0; i < n; i++) step(sec / n); render(); },   // for captures
    stareNow() { stare = 2.8; },
    get camera() { return camera; }, get px() { return PX; },
    setTones(n) { post.uniforms.uTones.value = n; },
    dispose() { running = false; cancelAnimationFrame(raf); renderer.dispose(); },
  };
  return api;
}
