/**
 * Parses CSV as password managers export it (RFC 4180): commas, "quoted" fields, "" for a quote
 * inside quotes, line breaks inside quoted fields (multi-line notes), \n or \r\n line endings,
 * and an optional byte-order mark at the start. Returns one array of fields per row.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const input = text.startsWith("﻿") ? text.slice(1) : text;

  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (inQuotes) {
      if (char === '"' && input[i + 1] === '"') {
        field += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && input[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  // A trailing line break leaves no empty row behind, and blank lines are skipped.
  return rows.filter((r) => r.some((value) => value.trim() !== ""));
}
