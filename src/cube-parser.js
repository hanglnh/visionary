/**
 * Parses a .cube file and converts its 3D LUT data into a 2D HaldCLUT Canvas
 * which can be directly fed into the WebGL renderer.
 */
export async function parseCubeToHaldCLUT(cubeText) {
  const lines = cubeText.split('\n');
  let size = 0;
  const data = [];
  
  // 1. 讀取 .cube 檔案格式
  for (let line of lines) {
    line = line.trim();
    if (line.startsWith('LUT_3D_SIZE')) {
      size = parseInt(line.split(/\s+/)[1], 10);
    } else if (/^[\d.-]+\s+[\d.-]+\s+[\d.-]+$/.test(line)) {
      const [r, g, b] = line.split(/\s+/).map(Number);
      data.push([r, g, b]);
    }
  }

  if (size === 0 || data.length === 0) {
    throw new Error("Invalid or unsupported .cube file format.");
  }

  // 2. 建立 512x512 的 Canvas (等同於 64x64x64 的 HaldCLUT)
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  const imgData = ctx.createImageData(512, 512);

  // Helper: 邊界限制
  const clamp = (val, min, max) => Math.max(min, Math.min(max, val));

  // Helper: 從 3D 陣列中取樣 (支援 32x32x32 或 64x64x64 等任意大小)
  const getVal = (ix, iy, iz) => {
    ix = clamp(ix, 0, size - 1);
    iy = clamp(iy, 0, size - 1);
    iz = clamp(iz, 0, size - 1);
    // .cube 檔案的順序通常是 R 跑最快，接著 G，最後 B。
    const index = ix + iy * size + iz * size * size;
    return data[index] || [0, 0, 0];
  };

  const mix = (v1, v2, a) => [
    v1[0] * (1 - a) + v2[0] * a,
    v1[1] * (1 - a) + v2[1] * a,
    v1[2] * (1 - a) + v2[2] * a
  ];

  // 三線性插值 (Trilinear Interpolation)
  const sampleCube = (r, g, b) => {
    const x = r * (size - 1);
    const y = g * (size - 1);
    const z = b * (size - 1);
    
    const x0 = Math.floor(x), dx = x - x0;
    const y0 = Math.floor(y), dy = y - y0;
    const z0 = Math.floor(z), dz = z - z0;
    const x1 = x0 + 1, y1 = y0 + 1, z1 = z0 + 1;

    const c000 = getVal(x0, y0, z0), c100 = getVal(x1, y0, z0);
    const c010 = getVal(x0, y1, z0), c110 = getVal(x1, y1, z0);
    const c001 = getVal(x0, y0, z1), c101 = getVal(x1, y0, z1);
    const c011 = getVal(x0, y1, z1), c111 = getVal(x1, y1, z1);

    const c00 = mix(c000, c100, dx);
    const c10 = mix(c010, c110, dx);
    const c01 = mix(c001, c101, dx);
    const c11 = mix(c011, c111, dx);
    
    const c0 = mix(c00, c10, dy);
    const c1 = mix(c01, c11, dy);
    
    return mix(c0, c1, dz);
  };

  // 3. 填滿 512x512 的 HaldCLUT 像素資料
  let i = 0;
  for (let y = 0; y < 512; y++) {
    for (let x = 0; x < 512; x++) {
      // 根據 HaldCLUT 64 格的定義，反推原本的 R, G, B 比例 (0.0 ~ 1.0)
      const r = (x % 64) / 63.0;
      const g = (y % 64) / 63.0;
      const b = (Math.floor(x / 64) + Math.floor(y / 64) * 8) / 63.0;

      const [outR, outG, outB] = sampleCube(r, g, b);
      
      imgData.data[i++] = clamp(outR * 255, 0, 255);
      imgData.data[i++] = clamp(outG * 255, 0, 255);
      imgData.data[i++] = clamp(outB * 255, 0, 255);
      imgData.data[i++] = 255;
    }
  }
  
  ctx.putImageData(imgData, 0, 0);
  return canvas;
}
