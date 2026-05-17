import { jsPDF } from "jspdf";
import { formatTime } from "./speech";

export interface Segment {
  speaker: number;
  startMs: number;
  text: string;
}

export function transcriptToText(segments: Segment[]): string {
  return segments
    .map((s) => `[${formatTime(s.startMs)}] Speaker ${s.speaker}: ${s.text}`)
    .join("\n\n");
}

export function downloadTxt(segments: Segment[]) {
  const blob = new Blob([transcriptToText(segments)], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `transcript-${new Date().toISOString().slice(0, 10)}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadPdf(segments: Segment[]) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const margin = 48;
  const width = doc.internal.pageSize.getWidth() - margin * 2;
  const pageH = doc.internal.pageSize.getHeight();
  let y = margin;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("Transcript", margin, y);
  y += 14;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(120);
  doc.text(new Date().toLocaleString(), margin, y);
  y += 24;
  doc.setTextColor(20);
  doc.setFontSize(11);

  for (const s of segments) {
    const header = `[${formatTime(s.startMs)}] Speaker ${s.speaker}`;
    doc.setFont("helvetica", "bold");
    if (y + 14 > pageH - margin) { doc.addPage(); y = margin; }
    doc.text(header, margin, y);
    y += 14;
    doc.setFont("helvetica", "normal");
    const bodyLines = doc.splitTextToSize(s.text, width);
    for (const line of bodyLines) {
      if (y + 14 > pageH - margin) { doc.addPage(); y = margin; }
      doc.text(line, margin, y);
      y += 14;
    }
    y += 10;
  }

  doc.save(`transcript-${new Date().toISOString().slice(0, 10)}.pdf`);
}

export function generateSessionCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}
