import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { recordAuditLog } from './baseRepository';
import type { StudentReportModel } from './reportService';

let cachedRegularBase64: string | null = null;
let cachedBoldBase64: string | null = null;

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const slice = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...slice);
  }
  if (typeof btoa === 'function') {
    return btoa(binary);
  }
  return Buffer.from(bytes).toString('base64');
}

async function loadFontBase64(publicPath: string): Promise<string> {
  if (typeof window !== 'undefined' && typeof fetch === 'function') {
    const response = await fetch(publicPath);
    if (!response.ok) {
      throw new Error(`Không thể tải phông chữ tiếng Việt (${publicPath}).`);
    }
    const buf = await response.arrayBuffer();
    return arrayBufferToBase64(buf);
  }
  // Node test fallback
  const fs = await import('node:fs');
  const path = await import('node:path');
  const cleanRel = publicPath.replace(/^\/+/, '');
  const fullPath = path.resolve(process.cwd(), 'public', cleanRel);
  const nodeBuf = fs.readFileSync(fullPath);
  return nodeBuf.toString('base64');
}

async function registerVietnameseFonts(doc: jsPDF): Promise<void> {
  if (!cachedRegularBase64) {
    cachedRegularBase64 = await loadFontBase64('/fonts/DejaVuSans.ttf');
  }
  if (!cachedBoldBase64) {
    cachedBoldBase64 = await loadFontBase64('/fonts/DejaVuSans-Bold.ttf');
  }

  doc.addFileToVFS('DejaVuSans.ttf', cachedRegularBase64);
  doc.addFont('DejaVuSans.ttf', 'DejaVuSans', 'normal');

  doc.addFileToVFS('DejaVuSans-Bold.ttf', cachedBoldBase64);
  doc.addFont('DejaVuSans-Bold.ttf', 'DejaVuSans', 'bold');

  doc.setFont('DejaVuSans', 'normal');
}

function drawSchoolHeader(
  doc: jsPDF,
  params: {
    departmentName?: string;
    schoolName: string;
    circularStandard?: string;
    title: string;
    subtitleLines: string[];
  }
): number {
  const pageWidth = doc.internal.pageSize.getWidth();
  const marginX = 14;

  doc.setFont('DejaVuSans', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(71, 85, 105);
  doc.text(
    (params.departmentName || 'PHÒNG GIÁO DỤC VÀ ĐÀO TẠO').toUpperCase(),
    marginX,
    13
  );

  doc.setFont('DejaVuSans', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(15, 23, 42);
  doc.text(params.schoolName.toUpperCase(), marginX, 18.5);

  doc.setFont('DejaVuSans', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);
  const rightTop = params.circularStandard || 'Hệ thống Đánh giá Học sinh Hoa Tâm';
  doc.text(rightTop, pageWidth - marginX, 13, { align: 'right' });

  const now = new Date();
  const dateLine = `Ngày lập báo cáo: ${String(now.getDate()).padStart(2, '0')}/${String(
    now.getMonth() + 1
  ).padStart(2, '0')}/${now.getFullYear()}`;
  doc.text(dateLine, pageWidth - marginX, 18.5, { align: 'right' });

  doc.setDrawColor(15, 118, 110);
  doc.setLineWidth(0.5);
  doc.line(marginX, 22, pageWidth - marginX, 22);

  doc.setFont('DejaVuSans', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(15, 118, 110);
  doc.text(params.title.toUpperCase(), pageWidth / 2, 30, { align: 'center' });

  let y = 37;
  doc.setFont('DejaVuSans', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(51, 65, 85);
  for (const line of params.subtitleLines) {
    const wrapped = doc.splitTextToSize(line, pageWidth - marginX * 2) as string[];
    doc.text(wrapped, marginX, y);
    y += wrapped.length * 4.8;
  }

  return y + 2;
}

function drawSignatureArea(
  doc: jsPDF,
  startY: number,
  params: {
    leftRole?: string;
    leftSignerName?: string;
    rightRole?: string;
    rightSignerName?: string;
  }
): void {
  const pageHeight = doc.internal.pageSize.getHeight();
  const pageWidth = doc.internal.pageSize.getWidth();
  let y = startY + 8;

  if (y + 34 > pageHeight - 10) {
    doc.addPage();
    y = 22;
  }

  const leftX = pageWidth * 0.24;
  const rightX = pageWidth * 0.76;
  const now = new Date();
  const dateText = `Ngày ${String(now.getDate()).padStart(2, '0')} tháng ${String(
    now.getMonth() + 1
  ).padStart(2, '0')} năm ${now.getFullYear()}`;

  doc.setFont('DejaVuSans', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);
  doc.text(dateText, rightX, y, { align: 'center' });

  y += 5.5;
  doc.setFont('DejaVuSans', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text(params.leftRole || 'NGƯỜI LẬP BÁO CÁO / GIÁO VIÊN', leftX, y, { align: 'center' });
  doc.text(params.rightRole || 'HIỆU TRƯỞNG / XÁC NHẬN CHUYÊN MÔN', rightX, y, {
    align: 'center',
  });

  doc.setFont('DejaVuSans', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(100, 116, 139);
  doc.text('(Ký và ghi rõ họ tên)', leftX, y + 4.5, { align: 'center' });
  doc.text('(Ký, đóng dấu và ghi rõ họ tên)', rightX, y + 4.5, { align: 'center' });

  if (params.leftSignerName || params.rightSignerName) {
    doc.setFont('DejaVuSans', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(15, 23, 42);
    if (params.leftSignerName) {
      doc.text(params.leftSignerName, leftX, y + 23, { align: 'center' });
    }
    if (params.rightSignerName) {
      doc.text(params.rightSignerName, rightX, y + 23, { align: 'center' });
    }
  }
}

export interface StructuredPdfReportParams {
  orientation?: 'portrait' | 'landscape';
  departmentName?: string;
  schoolName: string;
  circularStandard?: string;
  principalName?: string;
  teacherSignerName?: string;
  academicYearName: string;
  title: string;
  contextInfoLines: string[];
  columns: string[];
  rows: string[][];
  includeSignatures?: boolean;
  fileName?: string;
  returnBlobOnly?: boolean;
}

export async function exportStructuredVietnamesePdfReport(
  params: StructuredPdfReportParams
): Promise<Blob | void> {
  const doc = new jsPDF({
    orientation: params.orientation ?? 'landscape',
    unit: 'mm',
    format: 'a4',
  });

  await registerVietnameseFonts(doc);

  const startY = drawSchoolHeader(doc, {
    departmentName: params.departmentName,
    schoolName: params.schoolName,
    circularStandard: params.circularStandard,
    title: params.title,
    subtitleLines: [
      `Năm học: ${params.academicYearName}`,
      ...params.contextInfoLines,
    ],
  });

  const bodyRows =
    params.rows.length > 0
      ? params.rows
      : [
          params.columns.map((_, idx) =>
            idx === 1 ? 'Chưa có dữ liệu phù hợp điều kiện lọc' : '—'
          ),
        ];

  autoTable(doc, {
    startY,
    head: [params.columns],
    body: bodyRows,
    styles: {
      font: 'DejaVuSans',
      fontSize: 8.5,
      cellPadding: 2.5,
      textColor: [30, 41, 59],
      lineColor: [226, 232, 240],
      lineWidth: 0.2,
    },
    headStyles: {
      font: 'DejaVuSans',
      fontStyle: 'bold',
      fillColor: [15, 118, 110],
      textColor: [255, 255, 255],
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    margin: { left: 14, right: 14 },
  });

  const finalY = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? startY + 20;

  if (params.includeSignatures !== false) {
    drawSignatureArea(doc, finalY, {
      leftSignerName: params.teacherSignerName,
      rightSignerName: params.principalName,
    });
  }

  if (params.returnBlobOnly) {
    return doc.output('blob');
  }

  const outName = params.fileName || `bao_cao_hoatam_${new Date().toISOString().slice(0, 10)}.pdf`;
  doc.save(outName);
  await recordAuditLog(
    'EXPORT',
    'assessmentResults',
    `Xuất PDF "${params.title}" (${params.rows.length} dòng)`
  );
}

export async function exportStudentProfilePdfReport(params: {
  schoolName: string;
  departmentName?: string;
  circularStandard?: string;
  principalName?: string;
  teacherSignerName?: string;
  report: StudentReportModel;
  returnBlobOnly?: boolean;
}): Promise<Blob | void> {
  const { report } = params;
  if (!report.student) {
    throw new Error('Chưa có thông tin học sinh để xuất PDF.');
  }

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  await registerVietnameseFonts(doc);

  let y = drawSchoolHeader(doc, {
    departmentName: params.departmentName,
    schoolName: params.schoolName,
    circularStandard: params.circularStandard,
    title: 'PHIẾU BÁO CÁO KẾT QUẢ ĐÁNH GIÁ HỌC SINH',
    subtitleLines: [
      `Năm học: ${report.academicYear?.name ?? '—'}   |   Lớp: ${report.schoolClass?.name ?? '—'}   |   Thời gian: ${report.timeRange.label}`,
      `Học sinh: ${report.student.fullName} (Mã HS: ${report.student.studentCode})   |   Ngày sinh: ${report.student.dateOfBirth}`,
    ],
  });

  // 1. Kết quả định kỳ chính thức
  doc.setFont('DejaVuSans', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(15, 23, 42);
  doc.text('1. Kết quả đánh giá định kỳ chính thức', 14, y + 3);
  y += 6;

  const officialRows: string[][] = [
    ...report.officialSubjectResults.map((r) => [
      r.periodName,
      r.subjectName,
      r.ratingLabel,
      r.record.numericScore !== undefined ? String(r.record.numericScore) : '—',
      r.record.summaryComment || '—',
    ]),
    ...report.officialQualityCompetencyResults.map((r) => [
      r.periodName,
      r.criterionName,
      r.ratingLabel,
      '—',
      r.record.summaryComment || '—',
    ]),
  ];

  autoTable(doc, {
    startY: y,
    head: [['Đợt đánh giá', 'Môn học / Phẩm chất - NL', 'Mức đạt', 'Điểm KTĐK', 'Nhận xét']],
    body:
      officialRows.length > 0
        ? officialRows
        : [['—', 'Chưa có kết quả đánh giá định kỳ chính thức trong khoảng lọc', '—', '—', '—']],
    styles: { font: 'DejaVuSans', fontSize: 8.5, cellPadding: 2.3 },
    headStyles: { font: 'DejaVuSans', fontStyle: 'bold', fillColor: [2, 132, 199], textColor: 255 },
    margin: { left: 14, right: 14 },
  });

  y = ((doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y + 16) + 7;

  // 2. Đánh giá thường xuyên (Hằng ngày + Theo tiết)
  doc.setFont('DejaVuSans', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(15, 23, 42);
  doc.text('2. Tổng hợp đánh giá thường xuyên (Hằng ngày & Theo tiết học)', 14, y);
  y += 3;

  const regularRows: string[][] = [
    ...report.dailyHistory.slice(0, 30).map((d) => [
      d.record.assessmentDate,
      'Hằng ngày (GVCN)',
      d.statusLabel,
      [...d.positiveLabels, ...d.supportLabels.map((s) => `Hỗ trợ: ${s}`)].join(', ') || '—',
      d.record.comment || '—',
    ]),
    ...report.lessonHistory.slice(0, 30).map((l) => [
      l.record.lessonDate,
      `Theo tiết (${l.subjectName})`,
      l.record.ratingLevel,
      `${l.record.lessonTopic}${l.record.difficulties ? ` · Cần hỗ trợ: ${l.record.difficulties}` : ''}`,
      l.record.comment || '—',
    ]),
  ].sort((a, b) => b[0].localeCompare(a[0]));

  autoTable(doc, {
    startY: y,
    head: [['Ngày', 'Hình thức', 'Mức / Trạng thái', 'Nội dung / Tiêu chí', 'Nhận xét']],
    body:
      regularRows.length > 0
        ? regularRows
        : [['—', '—', 'Chưa có dữ liệu thường xuyên', '—', '—']],
    styles: { font: 'DejaVuSans', fontSize: 8.5, cellPadding: 2.3 },
    headStyles: { font: 'DejaVuSans', fontStyle: 'bold', fillColor: [15, 118, 110], textColor: 255 },
    margin: { left: 14, right: 14 },
  });

  const finalY = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y + 20;

  drawSignatureArea(doc, finalY, {
    leftRole: 'GIÁO VIÊN CHỦ NHIỆM',
    leftSignerName: params.teacherSignerName,
    rightRole: 'HIỆU TRƯỞNG / PHỤ HUYNH',
    rightSignerName: params.principalName,
  });

  if (params.returnBlobOnly) {
    return doc.output('blob');
  }

  const safeCode = report.student.studentCode.replace(/[^a-zA-Z0-9_-]/g, '_');
  doc.save(`bao_cao_hoc_sinh_${safeCode}_${new Date().toISOString().slice(0, 10)}.pdf`);
  await recordAuditLog(
    'EXPORT',
    'assessmentResults',
    `Xuất phiếu PDF học sinh ${report.student.fullName} (${report.student.studentCode})`
  );
}
