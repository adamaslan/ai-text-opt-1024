import type { Decision } from "../types/shared";

export function scorePct(score: number): string {
  return `${(Math.max(0, Math.min(1, score)) * 100).toFixed(0)}%`;
}

export function compactDate(value: string | null | undefined): string {
  if (!value) return "Open";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function relativeTime(value: string | null | undefined): string {
  if (!value) return "No timestamp";
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) return value;
  const seconds = Math.round((time - Date.now()) / 1000);
  const abs = Math.abs(seconds);
  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ["day", 86_400],
    ["hour", 3_600],
    ["minute", 60],
  ];
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  for (const [unit, size] of units) {
    if (abs >= size) {
      return formatter.format(Math.round(seconds / size), unit);
    }
  }
  return formatter.format(seconds, "second");
}

export function decisionLabel(decision: Decision | "all"): string {
  const labels = {
    all: "All",
    accept: "Accepted",
    watchlist: "Watchlist",
    reject: "Rejected",
    needs_review: "Needs Review",
  };
  return labels[decision];
}

export function decisionClass(decision: Decision): string {
  return `decision-${decision.replace("_", "-")}`;
}

export function titleCase(value: string): string {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function parseSymbols(value: string): string[] {
  return value
    .split(",")
    .map((symbol) => symbol.trim().toUpperCase())
    .filter(Boolean);
}
