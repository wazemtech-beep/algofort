"use client";
import { useState } from "react";
export default function TrendChart({ title, points, unit = "" }: { title: string; points: { label: string; value: number }[]; unit?: string }) {
  const [selected, setSelected] = useState<number | null>(null);
  const maximum = Math.max(1, ...points.map(point => point.value));
  const current = selected !== null ? points[selected] : undefined;
  return <section className="panel trend-panel"><h2>{title}</h2><div className="trend-chart" aria-label={title}>{points.map((point, index) => <button key={point.label} aria-label={`${point.label}: ${point.value.toLocaleString("en-US")} ${unit}`} className={selected === index ? "trend-column active" : "trend-column"} onClick={() => setSelected(index)}><span className="trend-value">{point.value.toLocaleString("en-US")}</span><span className="trend-bar" style={{ height: Math.max(3, point.value / maximum * 120) }} /><span className="trend-label">{point.label}</span></button>)}</div><p className="muted">{current ? `${current.label}: ${current.value.toLocaleString("en-US")} ${unit}` : `Select a bar for details${unit ? " · " + unit : ""}.`}</p></section>;
}
