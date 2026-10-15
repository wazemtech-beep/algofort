"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
export type Option = { value: string; label: string; disabled?: boolean; url?: string | null };
export function SearchSelect({ name, label, options, value, onChange, required, onAdd }: { name: string; label: string; options: Option[]; value: string; onChange: (value: string) => void; required?: boolean; onAdd?: () => void }) {
  const [expanded, setExpanded] = useState(false), [query, setQuery] = useState("");
  const root = useRef<HTMLDivElement>(null), menu = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({left:0,top:0,width:0});
  useEffect(() => {
    if (!expanded) return;
    function place() { const rect = root.current?.querySelector('button')?.getBoundingClientRect(); if (!rect) return; const height=Math.min(300,window.innerHeight-24); setPosition({left:Math.max(12,Math.min(rect.left,window.innerWidth-rect.width-12)),top:rect.bottom+height+8>window.innerHeight?Math.max(12,rect.top-height-6):rect.bottom+6,width:Math.min(rect.width,window.innerWidth-24)}); }
    function outside(event:PointerEvent) { if(!root.current?.contains(event.target as Node)&&!menu.current?.contains(event.target as Node))setExpanded(false); }
    place(); window.addEventListener('resize',place); window.addEventListener('scroll',place,true); document.addEventListener('pointerdown',outside);
    return()=>{window.removeEventListener('resize',place);window.removeEventListener('scroll',place,true);document.removeEventListener('pointerdown',outside);};
  },[expanded]);
  const selected = options.find(option => option.value === value);
  return <div className="search-select" ref={root}><span className="control-label">{label}{required ? " *" : ""}</span><input name={name} type="hidden" value={value} /><button type="button" aria-label={label} aria-expanded={expanded} className="select-trigger" onClick={() => setExpanded(!expanded)}>{selected?.label || `Select ${label.toLowerCase()}`}<span>⌄</span></button>{expanded && createPortal(<div ref={menu} className="select-menu select-overlay" style={position} onKeyDown={e=>{if(e.key==='Escape'){e.stopPropagation();setExpanded(false);}}}><input aria-label={`Search ${label}`} placeholder={`Search ${label.toLowerCase()}…`} value={query} onChange={e => setQuery(e.target.value)} autoFocus /><div role="listbox" aria-label={label}>{options.filter(option => option.label.toLowerCase().includes(query.toLowerCase())).map(option => <button key={option.value} type="button" role="option" aria-selected={option.value === value} disabled={option.disabled} onClick={() => { onChange(option.value); setExpanded(false); setQuery(""); }}>{option.label}{option.disabled ? " · Unavailable" : ""}</button>)}</div>{onAdd && <button className="add-option" type="button" onClick={() => { setExpanded(false); onAdd(); }}>+ Add New {label}</button>}<button type="button" className="text-button" onClick={() => { onChange(""); setExpanded(false); }}>Clear Selection</button></div>,document.body)}</div>;
}
export function MoneyInput({ name, value, currency, required, onChange }: { name: string; value: string; currency: string; required?: boolean; onChange: (value: string) => void }) {
  function format(input: string) { const plain = input.replaceAll(",", ""); if (!/^\d{0,12}(\.\d{0,2})?$/.test(plain)) return; const [whole, fraction] = plain.split("."); const formatted = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + (fraction !== undefined ? "." + fraction : ""); onChange(formatted); }
  const [whole, fraction] = value.replaceAll(",", "").split(".");
  const display = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + (fraction !== undefined ? "." + fraction : "");
  return <div className="money-input"><input type="text" inputMode="decimal" name={name} value={display} onChange={e => format(e.target.value)} required={required} placeholder="0.00" pattern="[0-9,]+([.][0-9]{1,2})?" /><span>{currency}</span></div>;
}
