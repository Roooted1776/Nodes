import { DOT_FRAG, DOT_VERT, RIM_FRAG, RIM_VERT } from './shaders';
import { sceneStats } from './stats';
import { decryptVault, encryptVault, newSecrets } from './vault';

// Checks that can only be done in the real browser: GPU shaders, encryption, the content policy, storage.
export type Status = 'pass' | 'fail' | 'warn' | 'skip';
export interface Check {
  name: string;
  status: Status;
  detail: string;
}

const VP =
  '#version 300 es\n#define attribute in\n#define varying out\nprecision highp float; precision highp int;\nuniform mat4 modelMatrix; uniform mat4 modelViewMatrix; uniform mat4 projectionMatrix; uniform mat4 viewMatrix; uniform mat3 normalMatrix; uniform vec3 cameraPosition;\nattribute vec3 position; attribute vec3 normal; attribute vec2 uv;\n';
const FP =
  '#version 300 es\n#define varying in\nlayout(location = 0) out highp vec4 pc_fragColor;\n#define gl_FragColor pc_fragColor\nprecision highp float; precision highp int;\n';

export function checkShaders(doc: Document | undefined = globalThis.document): Check {
  const gl = doc?.createElement('canvas').getContext('webgl2');
  if (!gl)
    return {
      name: 'GPU shaders',
      status: 'fail',
      detail:
        'WebGL 2 is not available, so the 3D brain cannot draw. Turn on hardware acceleration in the browser settings.',
    };
  const bad: string[] = [];
  const pairs: [string, string, string][] = [
    ['dots', DOT_VERT, DOT_FRAG],
    ['outline', RIM_VERT, RIM_FRAG],
  ];
  for (const [n, v, f] of pairs) {
    const prog = gl.createProgram()!;
    for (const [type, src] of [
      [gl.VERTEX_SHADER, VP + v],
      [gl.FRAGMENT_SHADER, FP + f],
    ] as const) {
      const sh = gl.createShader(type)!;
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS))
        bad.push(`${n}: ${gl.getShaderInfoLog(sh)?.trim().slice(0, 160)}`);
      gl.attachShader(prog, sh);
    }
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS))
      bad.push(`${n} link: ${gl.getProgramInfoLog(prog)?.trim().slice(0, 160)}`);
  }
  const r = gl.getExtension('WEBGL_debug_renderer_info'),
    gpu = r ? String(gl.getParameter(r.UNMASKED_RENDERER_WEBGL)) : 'GPU name hidden by the browser';
  gl.getExtension('WEBGL_lose_context')?.loseContext();
  return bad.length
    ? { name: 'GPU shaders', status: 'fail', detail: bad.join(' | ') }
    : { name: 'GPU shaders', status: 'pass', detail: `4 shaders compiled and linked on ${gpu}` };
}

export function checkScene(s = sceneStats): Check {
  if (!s.frames)
    return {
      name: 'Brain drawing',
      status: 'warn',
      detail: 'Open the Brain view for a few seconds, then run the check again.',
    };
  if (!s.stencil)
    return {
      name: 'Brain drawing',
      status: 'fail',
      detail: 'This browser gave the 3D view no stencil buffer, so the skull could draw over the brain.',
    };
  if (!s.points || !s.lines)
    return {
      name: 'Brain drawing',
      status: 'fail',
      detail: `The view ran ${s.frames} frames but drew ${s.points} dots and ${s.lines} lines.`,
    };
  return {
    name: 'Brain drawing',
    status: s.fps >= 30 ? 'pass' : 'warn',
    detail: `${s.fps} frames a second at ${s.width}×${s.height}; ${s.calls} draw calls, ${s.points} dots, ${s.lines} line segments, ${s.triangles} outline triangles (skull ${s.skullTriangles})`,
  };
}

export async function checkVault(): Promise<Check> {
  try {
    const s = await newSecrets(),
      data = { probe: 'brain self check' },
      v = await encryptVault(s, data, 1);
    if (JSON.stringify(v).includes('brain self check'))
      return { name: 'Encryption', status: 'fail', detail: 'The sealed text still shows the data.' };
    const back = (await decryptVault(s, v)) as { probe?: string };
    let refused = false;
    try {
      await decryptVault(s, { ...v, n: 2 });
    } catch {
      refused = true;
    }
    return back.probe === data.probe && refused
      ? {
          name: 'Encryption',
          status: 'pass',
          detail: 'AES-256-GCM seal and open work, and a changed copy is refused (ECDSA P-256 signature)',
        }
      : {
          name: 'Encryption',
          status: 'fail',
          detail: refused ? 'Opened data did not match.' : 'A changed copy was not refused.',
        };
  } catch (e: any) {
    return { name: 'Encryption', status: 'fail', detail: e?.message || String(e) };
  }
}

export async function checkPolicy(
  doc: Document | undefined = globalThis.document,
  fetchImpl: typeof fetch | undefined = globalThis.fetch,
): Promise<Check> {
  const meta = doc?.querySelector('meta[http-equiv="Content-Security-Policy"]')?.getAttribute('content') || '';
  if (!meta)
    return {
      name: 'Content policy',
      status: 'fail',
      detail: 'No content policy on the page. Rebuild with npm run build.',
    };
  if (!/script-src 'sha256-/.test(meta) || !/connect-src https:\/\/api\.anthropic\.com/.test(meta))
    return {
      name: 'Content policy',
      status: 'fail',
      detail: 'The content policy is missing its script or connection rules.',
    };
  if (!fetchImpl)
    return {
      name: 'Content policy',
      status: 'warn',
      detail: 'Policy present; this browser has no fetch to test it with.',
    };
  // A request to a site outside the allowed list must be stopped by the browser before it leaves the computer.
  let blocked = false;
  try {
    await fetchImpl('https://example.com/brain-policy-check', { method: 'HEAD', cache: 'no-store' });
  } catch {
    blocked = true;
  }
  return blocked
    ? {
        name: 'Content policy',
        status: 'pass',
        detail: 'Only the page script runs, and a request to an outside site was blocked',
      }
    : { name: 'Content policy', status: 'fail', detail: 'A request to an outside site was not blocked.' };
}

export function checkStorage(
  store: Pick<Storage, 'getItem' | 'length' | 'key'> | undefined = globalThis.localStorage,
): Check {
  if (!store)
    return { name: 'Storage', status: 'fail', detail: 'This browser blocks storage, so nothing can be saved.' };
  const plain = ['brain.mem.v2', 'brain.livekeys.v1'].filter(k => store.getItem(k) !== null);
  if (plain.length)
    return {
      name: 'Storage',
      status: 'fail',
      detail: `Plain-text data found: ${plain.join(', ')}. Sign in as an admin to move it into the vault.`,
    };
  const keys: string[] = [];
  for (let i = 0; i < store.length; i++) {
    const k = store.key(i);
    if (k) keys.push(k);
  }
  const leak = keys.filter(
    k =>
      /^brain\./.test(k) &&
      ![
        'brain.vault.v1',
        'brain.auth.v1',
        'brain.audit.v1',
        'brain.live.v1',
        'brain.agegate.v1',
        'brain.keys.v1',
      ].includes(k),
  );
  const vault = store.getItem('brain.vault.v1');
  if (!vault)
    return { name: 'Storage', status: 'warn', detail: 'No vault yet. It appears after the first admin sign-in.' };
  return leak.length
    ? { name: 'Storage', status: 'warn', detail: `Unexpected keys: ${leak.join(', ')}` }
    : {
        name: 'Storage',
        status: 'pass',
        detail: `Memory is only in the encrypted vault (${(vault.length / 1024).toFixed(1)} KB); no plain-text copies`,
      };
}

export async function runAll(): Promise<Check[]> {
  return [
    checkShaders(),
    checkScene(),
    await checkVault(),
    await checkPolicy(),
    checkStorage(),
    {
      name: 'Secure context',
      status: globalThis.isSecureContext ? 'pass' : 'warn',
      detail: globalThis.isSecureContext
        ? 'Encryption functions are allowed here'
        : 'Open index.html directly from your computer, not from a preview link.',
    },
  ];
}
export const report = (list: Check[], ua = globalThis.navigator?.userAgent || '') =>
  [
    `Brain system check · ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC`,
    ua.slice(0, 140),
    ...list.map(c => `${c.status.toUpperCase().padEnd(4)} ${c.name}: ${c.detail}`),
  ].join('\n');
