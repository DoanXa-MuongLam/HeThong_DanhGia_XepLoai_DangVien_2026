/**
 * Pure-JS Multi-Sheet .xlsx (OOXML) Exporter
 * Zero external dependencies, works 100% offline with full Vietnamese UTF-8 support.
 */
(function (global) {
  'use strict';

  const CRC_TABLE = (function () {
    const t = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let k = 0; k < 8; k++) {
        c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      }
      t[i] = c >>> 0;
    }
    return t;
  })();

  function crc32(bytes) {
    let crc = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) {
      crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  function encodeUtf8(str) {
    if (typeof TextEncoder !== 'undefined') {
      return new TextEncoder().encode(str);
    }
    const s = unescape(encodeURIComponent(str));
    const arr = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) arr[i] = s.charCodeAt(i);
    return arr;
  }

  function escXml(val) {
    return String(val == null ? '' : val)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  function colLetters(colIdxZero) {
    let n = colIdxZero + 1;
    let s = '';
    while (n > 0) {
      const rem = (n - 1) % 26;
      s = String.fromCharCode(65 + rem) + s;
      n = Math.floor((n - 1) / 26);
    }
    return s;
  }

  function buildSheetXml(sheet) {
    const cols = sheet.cols || [];
    let colsXml = '';
    if (cols.length) {
      colsXml = '<cols>';
      for (let i = 0; i < cols.length; i++) {
        colsXml += '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + cols[i] + '" customWidth="1"/>';
      }
      colsXml += '</cols>';
    }

    let rowsXml = '';
    const rows = sheet.rows || [];
    for (let r = 0; r < rows.length; r++) {
      const row = rows[r];
      const rowNum = r + 1;
      rowsXml += '<row r="' + rowNum + '">';
      for (let c = 0; c < row.length; c++) {
        const cell = row[c];
        const ref = colLetters(c) + rowNum;
        let val = cell;
        let style = 0;
        if (cell && typeof cell === 'object' && !Array.isArray(cell)) {
          val = cell.v;
          style = cell.s || 0;
        }
        if (val === null || val === undefined || val === '') {
          rowsXml += '<c r="' + ref + '" s="' + style + '"/>';
        } else if (typeof val === 'number' && isFinite(val)) {
          rowsXml += '<c r="' + ref + '" s="' + style + '" t="n"><v>' + val + '</v></c>';
        } else {
          rowsXml += '<c r="' + ref + '" s="' + style + '" t="inlineStr"><is><t>' + escXml(val) + '</t></is></c>';
        }
      }
      rowsXml += '</row>';
    }

    return (
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      colsXml +
      '<sheetData>' + rowsXml + '</sheetData>' +
      '</worksheet>'
    );
  }

  function buildStylesXml() {
    // s=0: normal, s=1: title bold red, s=2: table header bold white on red, s=3: bordered cell, s=4: bold bordered, s=5: highlight gold bold bordered
    return (
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      '<fonts count="4">' +
      '<font><sz val="11"/><name val="Times New Roman"/></font>' +
      '<font><b/><sz val="13"/><color rgb="FF991B1B"/><name val="Times New Roman"/></font>' +
      '<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Times New Roman"/></font>' +
      '<font><b/><sz val="11"/><color rgb="FF111827"/><name val="Times New Roman"/></font>' +
      '</fonts>' +
      '<fills count="4">' +
      '<fill><patternFill patternType="none"/></fill>' +
      '<fill><patternFill patternType="gray125"/></fill>' +
      '<fill><patternFill patternType="solid"><fgColor rgb="FFB91C1C"/></patternFill></fill>' +
      '<fill><patternFill patternType="solid"><fgColor rgb="FFFEF3C7"/></patternFill></fill>' +
      '</fills>' +
      '<borders count="2">' +
      '<border><left/><right/><top/><bottom/><diagonal/></border>' +
      '<border><left style="thin"><color rgb="FFD1D5DB"/></left><right style="thin"><color rgb="FFD1D5DB"/></right><top style="thin"><color rgb="FFD1D5DB"/></top><bottom style="thin"><color rgb="FFD1D5DB"/></bottom><diagonal/></border>' +
      '</borders>' +
      '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
      '<cellXfs count="6">' +
      '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
      '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0"/>' +
      '<xf numFmtId="0" fontId="2" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>' +
      '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>' +
      '<xf numFmtId="0" fontId="3" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>' +
      '<xf numFmtId="0" fontId="3" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>' +
      '</cellXfs>' +
      '</styleSheet>'
    );
  }

  function createStoredZip(files) {
    // files: [{ name: string, data: Uint8Array }]
    const localParts = [];
    const centralParts = [];
    let offset = 0;

    function writeU16(view, pos, val) { view.setUint16(pos, val, true); }
    function writeU32(view, pos, val) { view.setUint32(pos, val, true); }

    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const nameBytes = encodeUtf8(f.name);
      const data = f.data;
      const crc = crc32(data);

      const lh = new Uint8Array(30 + nameBytes.length);
      const lhv = new DataView(lh.buffer);
      writeU32(lhv, 0, 0x04034b50);
      writeU16(lhv, 4, 20);
      writeU16(lhv, 6, 0x0800); // UTF-8 flag
      writeU16(lhv, 8, 0); // Store (no compression)
      writeU16(lhv, 10, 0);
      writeU16(lhv, 12, 0);
      writeU32(lhv, 14, crc);
      writeU32(lhv, 18, data.length);
      writeU32(lhv, 22, data.length);
      writeU16(lhv, 26, nameBytes.length);
      writeU16(lhv, 28, 0);
      lh.set(nameBytes, 30);

      localParts.push(lh, data);

      const ch = new Uint8Array(46 + nameBytes.length);
      const chv = new DataView(ch.buffer);
      writeU32(chv, 0, 0x02014b50);
      writeU16(chv, 4, 20);
      writeU16(chv, 6, 20);
      writeU16(chv, 8, 0x0800);
      writeU16(chv, 10, 0);
      writeU16(chv, 12, 0);
      writeU16(chv, 14, 0);
      writeU32(chv, 16, crc);
      writeU32(chv, 20, data.length);
      writeU32(chv, 24, data.length);
      writeU16(chv, 28, nameBytes.length);
      writeU16(chv, 30, 0);
      writeU16(chv, 32, 0);
      writeU16(chv, 34, 0);
      writeU16(chv, 36, 0);
      writeU32(chv, 38, 0);
      writeU32(chv, 42, offset);
      ch.set(nameBytes, 46);

      centralParts.push(ch);
      offset += lh.length + data.length;
    }

    let centralSize = 0;
    for (let i = 0; i < centralParts.length; i++) centralSize += centralParts[i].length;

    const eocd = new Uint8Array(22);
    const eocdv = new DataView(eocd.buffer);
    writeU32(eocdv, 0, 0x06054b50);
    writeU16(eocdv, 4, 0);
    writeU16(eocdv, 6, 0);
    writeU16(eocdv, 8, files.length);
    writeU16(eocdv, 10, files.length);
    writeU32(eocdv, 12, centralSize);
    writeU32(eocdv, 16, offset);
    writeU16(eocdv, 20, 0);

    return new Blob([].concat(localParts, centralParts, [eocd]), {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });
  }

  function exportWorkbook(filename, sheets) {
    const cleanSheets = sheets.map(function (s, idx) {
      const safeName = String(s.name || ('Sheet' + (idx + 1)))
        .replace(/[:\\/?*\[\]]/g, '_')
        .slice(0, 31);
      return Object.assign({}, s, { name: safeName });
    });

    const contentTypes =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
      cleanSheets.map(function (_, i) {
        return '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>';
      }).join('') +
      '</Types>';

    const rootRels =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
      '</Relationships>';

    const workbookXml =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
      '<sheets>' +
      cleanSheets.map(function (s, i) {
        return '<sheet name="' + escXml(s.name) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>';
      }).join('') +
      '</sheets>' +
      '</workbook>';

    const wbRels =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      cleanSheets.map(function (_, i) {
        return '<Relationship Id="rId' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>';
      }).join('') +
      '<Relationship Id="rId' + (cleanSheets.length + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
      '</Relationships>';

    const zipEntries = [
      { name: '[Content_Types].xml', data: encodeUtf8(contentTypes) },
      { name: '_rels/.rels', data: encodeUtf8(rootRels) },
      { name: 'xl/workbook.xml', data: encodeUtf8(workbookXml) },
      { name: 'xl/_rels/workbook.xml.rels', data: encodeUtf8(wbRels) },
      { name: 'xl/styles.xml', data: encodeUtf8(buildStylesXml()) }
    ];

    cleanSheets.forEach(function (s, i) {
      zipEntries.push({
        name: 'xl/worksheets/sheet' + (i + 1) + '.xml',
        data: encodeUtf8(buildSheetXml(s))
      });
    });

    const blob = createStoredZip(zipEntries);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 500);
  }

  global.XlsxExport = {
    exportWorkbook: exportWorkbook
  };
})(window);
