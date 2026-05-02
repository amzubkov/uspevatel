import JSZip from 'jszip';

/**
 * Minimal XLSX reader using JSZip.
 * Supports inline strings and numeric values.
 * Returns rows as string[][] from a specific sheet.
 */

function decodeXml(s: string): string {
  return s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'");
}

function colToIndex(col: string): number {
  let idx = 0;
  for (let i = 0; i < col.length; i++) {
    idx = idx * 26 + (col.charCodeAt(i) - 64);
  }
  return idx - 1;
}

function parseSheet(xml: string, sharedStrings: string[]): string[][] {
  const rows: string[][] = [];
  const rowMatches = xml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g);

  for (const rm of rowMatches) {
    const cells: string[] = [];
    const cellMatches = rm[1].matchAll(/<c\s([^>]*?)>([\s\S]*?)<\/c>/g);

    for (const cm of cellMatches) {
      const attrs = cm[1];
      const content = cm[2];
      const colMatch = attrs.match(/r="([A-Z]+)\d+"/);
      if (!colMatch) continue;
      const colStr = colMatch[1];
      const typeMatch = attrs.match(/t="([^"]*)"/);
      const type = typeMatch ? typeMatch[1] : '';
      const colIdx = colToIndex(colStr);

      // Pad with empty cells
      while (cells.length < colIdx) cells.push('');

      let value = '';
      if (type === 'inlineStr') {
        // Extract all <t> values
        const tMatches = content.matchAll(/<t[^>]*>([^<]*)<\/t>/g);
        const parts: string[] = [];
        for (const tm of tMatches) parts.push(decodeXml(tm[1]));
        value = parts.join('');
      } else if (type === 's') {
        // Shared string index
        const vMatch = content.match(/<v>(\d+)<\/v>/);
        if (vMatch) value = sharedStrings[parseInt(vMatch[1])] || '';
      } else {
        // Numeric or other
        const vMatch = content.match(/<v>([^<]+)<\/v>/);
        if (vMatch) value = vMatch[1];
      }

      cells[colIdx] = value.trim();
    }

    if (cells.some((c) => c)) rows.push(cells);
  }
  return rows;
}

function parseSharedStrings(xml: string): string[] {
  const strings: string[] = [];
  const siMatches = xml.matchAll(/<si>([\s\S]*?)<\/si>/g);
  for (const si of siMatches) {
    const tMatches = si[1].matchAll(/<t[^>]*>([^<]*)<\/t>/g);
    const parts: string[] = [];
    for (const tm of tMatches) parts.push(decodeXml(tm[1]));
    strings.push(parts.join(''));
  }
  return strings;
}

export async function readXlsx(base64: string, sheetIndex: number = 0): Promise<string[][]> {
  const zip = await JSZip.loadAsync(base64, { base64: true });

  // Parse shared strings if present
  let sharedStrings: string[] = [];
  const ssFile = zip.file('xl/sharedStrings.xml');
  if (ssFile) {
    const ssXml = await ssFile.async('string');
    sharedStrings = parseSharedStrings(ssXml);
  }

  // Find sheet file
  const sheetFile = zip.file(`xl/worksheets/sheet${sheetIndex + 1}.xml`);
  if (!sheetFile) return [];

  const sheetXml = await sheetFile.async('string');
  return parseSheet(sheetXml, sharedStrings);
}
