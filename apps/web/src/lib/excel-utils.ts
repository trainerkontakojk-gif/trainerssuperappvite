import type { QAIndicator } from '@trainers/types';

const TEMPLATE_COLUMNS = [
  { header: 'No Tiket', key: 'no_tiket', width: 20 },
  { header: 'Indikator', key: 'indicator_name', width: 40 },
  { header: 'Nilai (0-3)', key: 'nilai', width: 15 },
  { header: 'Ketidaksesuaian', key: 'ketidaksesuaian', width: 50 },
  { header: 'Sebaiknya', key: 'sebaiknya', width: 50 },
];

export async function generateTemplate(indicators: QAIndicator[], serviceType: string): Promise<ArrayBuffer> {
  const ExcelJS = await import('exceljs');
  const wb = new ExcelJS.default.Workbook();
  const ws = wb.addWorksheet('Input Temuan');
  const refSheet = wb.addWorksheet('_indikator', { state: 'hidden' });

  const filtered = indicators.filter(i => i.service_type === serviceType);
  refSheet.getColumn('A').values = ['Indikator', ...filtered.map(i => i.name)];

  ws.columns = TEMPLATE_COLUMNS.map(c => ({ header: c.header, key: c.key, width: c.width }));

  ws.addRow({ no_tiket: '', indicator_name: '', nilai: '', ketidaksesuaian: '', sebaiknya: '' });
  ws.addRow({ no_tiket: 'CONTOH-001', indicator_name: filtered[0]?.name || '', nilai: 2, ketidaksesuaian: 'Tidak menyebutkan nama', sebaiknya: 'Menyebutkan nama sesuai SOP' });

  ws.getRow(1).eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F46E5' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
  });

  for (let i = 2; i <= 100; i++) {
    ws.getCell(`B${i}`).dataValidation = {
      type: 'list',
      formulae: [`_indikator!$A$2:$A${filtered.length + 1}`],
      showErrorMessage: true,
      errorTitle: 'Indikator tidak valid',
      error: 'Pilih indikator dari dropdown yang tersedia.',
    };
    ws.getCell(`C${i}`).dataValidation = {
      type: 'list',
      formulae: ['0,1,2,3'],
      showErrorMessage: true,
      errorTitle: 'Nilai tidak valid',
      error: 'Nilai harus 0, 1, 2, atau 3.',
    };
  }

  const buf = await wb.xlsx.writeBuffer();
  return buf as ArrayBuffer;
}

export interface ParsedRow {
  row: number;
  no_tiket: string;
  indicator_name: string;
  nilai: number;
  ketidaksesuaian: string;
  sebaiknya: string;
  indicator_id?: string;
  error?: string;
}

export function parseExcel(file: File, indicators: QAIndicator[]): Promise<ParsedRow[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const XLSX = await import('xlsx');
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: 'array' });
        const sheetName = wb.SheetNames.find(n => n === 'Input Temuan') || wb.SheetNames[0];
        const ws = wb.Sheets[sheetName];
        const rows: any[] = XLSX.utils.sheet_to_json(ws, { defval: '' });

        const indicatorMap = new Map(indicators.map(i => [i.name.toLowerCase(), i]));

        const result: ParsedRow[] = [];
        for (let i = 0; i < rows.length; i++) {
          const row = rows[i];
          const parsed: ParsedRow = {
            row: i + 2,
            no_tiket: String(row['No Tiket'] || row['no_tiket'] || '').trim(),
            indicator_name: String(row['Indikator'] || row['indicator_name'] || row['indicator_name'] || '').trim(),
            nilai: parseInt(row['Nilai (0-3)'] || row['nilai'] || '-1', 10),
            ketidaksesuaian: String(row['Ketidaksesuaian'] || row['ketidaksesuaian'] || '').trim(),
            sebaiknya: String(row['Sebaiknya'] || row['sebaiknya'] || '').trim(),
          };

          const errors: string[] = [];
          if (!parsed.no_tiket) errors.push('No Tiket kosong');
          if (!parsed.indicator_name) errors.push('Indikator kosong');
          if (isNaN(parsed.nilai) || parsed.nilai < 0 || parsed.nilai > 3) errors.push('Nilai harus 0-3');

          const matched = indicatorMap.get(parsed.indicator_name.toLowerCase());
          if (matched) {
            parsed.indicator_id = matched.id;
          } else if (parsed.indicator_name) {
            errors.push(`Indikator "${parsed.indicator_name}" tidak ditemukan`);
          }

          if (errors.length > 0) parsed.error = errors.join('; ');
          result.push(parsed);
        }
        resolve(result);
      } catch (err) {
        reject(err);
      }
    };
    reader.readAsArrayBuffer(file);
  });
}

export function validateImportRows(rows: ParsedRow[]): { valid: ParsedRow[]; invalid: ParsedRow[] } {
  const valid: ParsedRow[] = [];
  const invalid: ParsedRow[] = [];
  const seen = new Set<string>();

  for (const row of rows) {
    if (row.error) {
      invalid.push(row);
      continue;
    }
    const key = `${row.no_tiket}|${row.indicator_id}`;
    if (seen.has(key)) {
      invalid.push({ ...row, error: `Duplikat: kombinasi tiket "${row.no_tiket}" + indikator sudah ada` });
      continue;
    }
    seen.add(key);
    valid.push(row);
  }

  return { valid, invalid };
}
