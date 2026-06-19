const configuredRange = String(process.env.GOOGLE_SHEET_RANGE || "").trim();

if (!configuredRange) {
  process.env.GOOGLE_SHEET_RANGE = "A:S";
} else if (/A:Q$/i.test(configuredRange)) {
  process.env.GOOGLE_SHEET_RANGE = configuredRange.replace(/A:Q$/i, "A:S");
  console.warn(`GOOGLE_SHEET_RANGE expanded to ${process.env.GOOGLE_SHEET_RANGE} for the current 19-column schema.`);
}

await import("./server.js");
