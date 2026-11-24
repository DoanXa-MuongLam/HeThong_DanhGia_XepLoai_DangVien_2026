/**
 * Pure-JS ISO/IEC 18004 QR Code Generator (Byte mode, EC Level L, Versions 1..10)
 * Offline-first, zero external dependencies.
 */
(function (global) {
  'use strict';

  const EXP = new Uint8Array(512);
  const LOG = new Uint8Array(256);
  (function initGF() {
    let x = 1;
    for (let i = 0; i < 255; i++) {
      EXP[i] = x;
      LOG[x] = i;
      x <<= 1;
      if (x & 0x100) x ^= 0x11d;
    }
    for (let i = 255; i < 512; i++) {
      EXP[i] = EXP[i - 255];
    }
  })();

  function gfMul(a, b) {
    if (a === 0 || b === 0) return 0;
    return EXP[LOG[a] + LOG[b]];
  }

  function rsGeneratorPoly(degree) {
    let poly = [1];
    for (let i = 0; i < degree; i++) {
      const next = new Array(poly.length + 1).fill(0);
      const factor = EXP[i];
      for (let j = 0; j < poly.length; j++) {
        next[j] ^= poly[j];
        next[j + 1] ^= gfMul(poly[j], factor);
      }
      poly = next;
    }
    return poly;
  }

  function rsEncode(data, ecCount) {
    const gen = rsGeneratorPoly(ecCount);
    const res = new Uint8Array(data.length + ecCount);
    res.set(data, 0);
    for (let i = 0; i < data.length; i++) {
      const coef = res[i];
      if (coef !== 0) {
        for (let j = 0; j < gen.length; j++) {
          res[i + j] ^= gfMul(gen[j], coef);
        }
      }
    }
    return res.slice(data.length);
  }

  // Version 1..10, EC Level L (01)
  // [version, ecPerBlock, g1Count, g1Data, g2Count, g2Data, alignCoords]
  const VERSIONS = [
    null,
    [1, 7, 1, 19, 0, 0, []],
    [2, 10, 1, 34, 0, 0, [6, 18]],
    [3, 15, 1, 55, 0, 0, [6, 22]],
    [4, 20, 1, 80, 0, 0, [6, 26]],
    [5, 26, 1, 108, 0, 0, [6, 30]],
    [6, 18, 2, 68, 0, 0, [6, 34]],
    [7, 20, 2, 78, 0, 0, [6, 22, 38]],
    [8, 24, 2, 97, 0, 0, [6, 24, 42]],
    [9, 30, 2, 116, 0, 0, [6, 26, 46]],
    [10, 18, 2, 68, 2, 69, [6, 28, 50]]
  ];

  function toUtf8Bytes(text) {
    if (typeof TextEncoder !== 'undefined') {
      return Array.from(new TextEncoder().encode(text));
    }
    const utf8 = unescape(encodeURIComponent(text));
    const arr = [];
    for (let i = 0; i < utf8.length; i++) arr.push(utf8.charCodeAt(i));
    return arr;
  }

  function buildDataCodewords(bytes, versionSpec) {
    const version = versionSpec[0];
    const totalData = versionSpec[2] * versionSpec[3] + versionSpec[4] * versionSpec[5];
    const bits = [];

    function pushBits(val, len) {
      for (let i = len - 1; i >= 0; i--) {
        bits.push((val >> i) & 1);
      }
    }

    // Mode indicator: Byte (0100)
    pushBits(0b0100, 4);
    // Char count indicator: 8 bits for V1..9, 16 bits for V10..26
    pushBits(bytes.length, version <= 9 ? 8 : 16);
    for (let i = 0; i < bytes.length; i++) {
      pushBits(bytes[i], 8);
    }

    const maxBits = totalData * 8;
    const terminatorLen = Math.min(4, maxBits - bits.length);
    pushBits(0, terminatorLen);

    while (bits.length % 8 !== 0) bits.push(0);

    const codewords = [];
    for (let i = 0; i < bits.length; i += 8) {
      let b = 0;
      for (let j = 0; j < 8; j++) b = (b << 1) | bits[i + j];
      codewords.push(b);
    }

    const pads = [0xec, 0x11];
    let padIdx = 0;
    while (codewords.length < totalData) {
      codewords.push(pads[padIdx % 2]);
      padIdx++;
    }
    return codewords;
  }

  function interleaveAndAddEC(codewords, spec) {
    const ecLen = spec[1];
    const g1Count = spec[2];
    const g1Data = spec[3];
    const g2Count = spec[4];
    const g2Data = spec[5];

    const dataBlocks = [];
    const ecBlocks = [];
    let offset = 0;

    for (let i = 0; i < g1Count; i++) {
      const blk = codewords.slice(offset, offset + g1Data);
      offset += g1Data;
      dataBlocks.push(blk);
      ecBlocks.push(rsEncode(blk, ecLen));
    }
    for (let i = 0; i < g2Count; i++) {
      const blk = codewords.slice(offset, offset + g2Data);
      offset += g2Data;
      dataBlocks.push(blk);
      ecBlocks.push(rsEncode(blk, ecLen));
    }

    const out = [];
    const maxDataLen = Math.max(g1Data, g2Data);
    for (let i = 0; i < maxDataLen; i++) {
      for (let b = 0; b < dataBlocks.length; b++) {
        if (i < dataBlocks[b].length) out.push(dataBlocks[b][i]);
      }
    }
    for (let i = 0; i < ecLen; i++) {
      for (let b = 0; b < ecBlocks.length; b++) {
        out.push(ecBlocks[b][i]);
      }
    }
    return out;
  }

  function createMatrix(version, alignCoords) {
    const size = version * 4 + 17;
    const modules = Array.from({ length: size }, function () { return new Int8Array(size); });
    const isFunc = Array.from({ length: size }, function () { return new Uint8Array(size); });

    function setFunc(r, c, val) {
      modules[r][c] = val ? 1 : 0;
      isFunc[r][c] = 1;
    }

    function drawFinder(r0, c0) {
      for (let dr = -1; dr <= 7; dr++) {
        for (let dc = -1; dc <= 7; dc++) {
          const r = r0 + dr;
          const c = c0 + dc;
          if (r < 0 || r >= size || c < 0 || c >= size) continue;
          const inOuter = dr >= 0 && dr <= 6 && dc >= 0 && dc <= 6;
          const onBorder = dr === 0 || dr === 6 || dc === 0 || dc === 6;
          const inInner = dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4;
          setFunc(r, c, inOuter && (onBorder || inInner));
        }
      }
    }

    function drawAlign(r0, c0) {
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          const onBorder = Math.abs(dr) === 2 || Math.abs(dc) === 2;
          const isCenter = dr === 0 && dc === 0;
          setFunc(r0 + dr, c0 + dc, onBorder || isCenter);
        }
      }
    }

    drawFinder(0, 0);
    drawFinder(0, size - 7);
    drawFinder(size - 7, 0);

    // Alignment patterns
    for (let i = 0; i < alignCoords.length; i++) {
      for (let j = 0; j < alignCoords.length; j++) {
        const r = alignCoords[i];
        const c = alignCoords[j];
        if (isFunc[r][c]) continue;
        drawAlign(r, c);
      }
    }

    // Timing patterns
    for (let i = 8; i < size - 8; i++) {
      if (!isFunc[6][i]) setFunc(6, i, i % 2 === 0);
      if (!isFunc[i][6]) setFunc(i, 6, i % 2 === 0);
    }

    // Dark module
    setFunc(size - 8, 8, true);

    // Reserve format info cells
    for (let i = 0; i < 9; i++) {
      if (!isFunc[8][i]) isFunc[8][i] = 1;
      if (!isFunc[i][8]) isFunc[i][8] = 1;
    }
    for (let i = 0; i < 8; i++) {
      if (!isFunc[8][size - 1 - i]) isFunc[8][size - 1 - i] = 1;
      if (!isFunc[size - 1 - i][8]) isFunc[size - 1 - i][8] = 1;
    }

    // Reserve & draw version info for V7+
    if (version >= 7) {
      let rem = version << 12;
      for (let i = 17; i >= 12; i--) {
        if ((rem >> i) & 1) rem ^= (0x1f25 << (i - 12));
      }
      const verBits = (version << 12) | rem;
      for (let i = 0; i < 18; i++) {
        const bit = ((verBits >> i) & 1) === 1;
        const a = Math.floor(i / 3);
        const b = (i % 3) + size - 11;
        setFunc(a, b, bit);
        setFunc(b, a, bit);
      }
    }

    return { size: size, modules: modules, isFunc: isFunc };
  }

  function placeData(mat, codewords) {
    const size = mat.size;
    const bits = [];
    for (let i = 0; i < codewords.length; i++) {
      for (let b = 7; b >= 0; b--) {
        bits.push((codewords[i] >> b) & 1);
      }
    }

    let bitIdx = 0;
    let upward = true;
    for (let col = size - 1; col >= 1; col -= 2) {
      if (col === 6) col = 5;
      for (let i = 0; i < size; i++) {
        const r = upward ? size - 1 - i : i;
        for (let dc = 0; dc < 2; dc++) {
          const c = col - dc;
          if (!mat.isFunc[r][c]) {
            mat.modules[r][c] = bitIdx < bits.length ? bits[bitIdx++] : 0;
          }
        }
      }
      upward = !upward;
    }
  }

  function applyMask(mat, maskId) {
    const size = mat.size;
    const masked = mat.modules.map(function (row) { return Int8Array.from(row); });
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (mat.isFunc[r][c]) continue;
        let invert = false;
        switch (maskId) {
          case 0: invert = (r + c) % 2 === 0; break;
          case 1: invert = r % 2 === 0; break;
          case 2: invert = c % 3 === 0; break;
          case 3: invert = (r + c) % 3 === 0; break;
          case 4: invert = (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0; break;
          case 5: invert = ((r * c) % 2 + (r * c) % 3) === 0; break;
          case 6: invert = (((r * c) % 2 + (r * c) % 3) % 2) === 0; break;
          case 7: invert = (((r + c) % 2 + (r * c) % 3) % 2) === 0; break;
        }
        if (invert) masked[r][c] ^= 1;
      }
    }

    // Write format info (EC Level L = 01)
    const d = (0b01 << 3) | maskId;
    let rem = d << 10;
    for (let i = 14; i >= 10; i--) {
      if ((rem >> i) & 1) rem ^= (0x537 << (i - 10));
    }
    const fmt = ((d << 10) | rem) ^ 0x5412;

    for (let i = 0; i <= 5; i++) masked[8][i] = (fmt >> i) & 1;
    masked[8][7] = (fmt >> 6) & 1;
    masked[8][8] = (fmt >> 7) & 1;
    masked[7][8] = (fmt >> 8) & 1;
    for (let i = 9; i < 15; i++) masked[14 - i][8] = (fmt >> i) & 1;

    for (let i = 0; i < 8; i++) masked[8][size - 1 - i] = (fmt >> i) & 1;
    for (let i = 8; i < 15; i++) masked[size - 15 + i][8] = (fmt >> i) & 1;

    return masked;
  }

  function penaltyScore(grid) {
    const n = grid.length;
    let score = 0;

    // Rule 1: 5+ same color in row/col
    for (let r = 0; r < n; r++) {
      let run = 1;
      for (let c = 1; c < n; c++) {
        if (grid[r][c] === grid[r][c - 1]) run++;
        else {
          if (run >= 5) score += 3 + (run - 5);
          run = 1;
        }
      }
      if (run >= 5) score += 3 + (run - 5);
    }
    for (let c = 0; c < n; c++) {
      let run = 1;
      for (let r = 1; r < n; r++) {
        if (grid[r][c] === grid[r - 1][c]) run++;
        else {
          if (run >= 5) score += 3 + (run - 5);
          run = 1;
        }
      }
      if (run >= 5) score += 3 + (run - 5);
    }

    // Rule 2: 2x2 blocks
    for (let r = 0; r < n - 1; r++) {
      for (let c = 0; c < n - 1; c++) {
        const v = grid[r][c];
        if (v === grid[r][c + 1] && v === grid[r + 1][c] && v === grid[r + 1][c + 1]) {
          score += 3;
        }
      }
    }

    return score;
  }

  function generateMatrix(text) {
    const bytes = toUtf8Bytes(text);
    let spec = null;
    for (let v = 1; v < VERSIONS.length; v++) {
      const s = VERSIONS[v];
      const totalData = s[2] * s[3] + s[4] * s[5];
      const headerBytes = v <= 9 ? 2 : 3;
      if (bytes.length + headerBytes <= totalData) {
        spec = s;
        break;
      }
    }
    if (!spec) {
      throw new Error('Nội dung URL quá dài để tạo mã QR (tối đa ~270 ký tự).');
    }

    const dataCW = buildDataCodewords(bytes, spec);
    const allCW = interleaveAndAddEC(dataCW, spec);
    const mat = createMatrix(spec[0], spec[6]);
    placeData(mat, allCW);

    let bestGrid = null;
    let bestScore = Infinity;
    for (let m = 0; m < 8; m++) {
      const candidate = applyMask(mat, m);
      const sc = penaltyScore(candidate);
      if (sc < bestScore) {
        bestScore = sc;
        bestGrid = candidate;
      }
    }
    return bestGrid;
  }

  function renderSVG(text, sizePx) {
    const grid = generateMatrix(text);
    const n = grid.length;
    const quiet = 4;
    const total = n + quiet * 2;
    const px = sizePx || 240;

    let paths = '';
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (grid[r][c]) {
          paths += '<rect x="' + (c + quiet) + '" y="' + (r + quiet) + '" width="1" height="1"/>';
        }
      }
    }

    return (
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + total + ' ' + total + '" ' +
      'width="' + px + '" height="' + px + '" shape-rendering="crispEdges" role="img" aria-label="Mã QR truy cập nhanh">' +
      '<rect width="' + total + '" height="' + total + '" fill="#FFFFFF"/>' +
      '<g fill="#7F1D1D">' + paths + '</g>' +
      '</svg>'
    );
  }

  global.QRGen = {
    generateMatrix: generateMatrix,
    renderSVG: renderSVG
  };
})(window);
