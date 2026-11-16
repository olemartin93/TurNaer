"use client";
import { useEffect, useId, useRef, useState } from "react";
import { searchAddress, type SearchResult } from "@/services/kartverket/geocoding";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { SearchIcon } from "./Icons";
import { Spinner } from "./Spinner";

type Props = {
  onSelect: (result: SearchResult) => void;
  label?: string;
  compact?: boolean;
};

/** Accessible combobox searching Kartverket place names and addresses (debounced). */
export function LocationSearch({ onSelect, label = "Search for a place or address", compact = false }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const debounced = useDebouncedValue(query, 300);
  const inputId = useId();
  const listId = useId();
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (debounced.trim().length < 2) return;
    const controller = new AbortController();
    searchAddress(debounced, controller.signal)
      .then((r) => {
        setResults(r);
        setActive(-1);
        setStatus("done");
        setOpen(true);
      })
      .catch(() => {
        if (!controller.signal.aborted) setStatus("error");
      });
    return () => controller.abort();
  }, [debounced]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const choose = (r: SearchResult) => {
    setQuery(r.name);
    setOpen(false);
    onSelect(r);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((a) => Math.min(results.length - 1, a + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === "Enter") {
      const r = results[active] ?? (results.length > 0 ? results[0] : undefined);
      if (r && open) {
        e.preventDefault();
        choose(r);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  const showList = open && (results.length > 0 || status === "done");

  return (
    <div ref={wrapperRef} className="relative">
      <label htmlFor={inputId} className={compact ? "sr-only" : "mb-1.5 block text-sm font-semibold text-granite-800"}>
        {label}
      </label>
      <div className="relative">
        <SearchIcon className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-lg text-granite-500" />
        <input
          id={inputId}
          type="search"
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
          autoComplete="off"
          placeholder="e.g. Sukkertoppen, Ålesund or Storgata 1"
          value={query}
          onChange={(e) => {
            const value = e.target.value;
            setQuery(value);
            setOpen(true);
            if (value.trim().length < 2) {
              setResults([]);
              setStatus("idle");
            } else {
              setStatus("loading");
            }
          }}
          onFocus={() => results.length > 0 && setOpen(true)}
          onKeyDown={onKeyDown}
          className="min-h-12 w-full rounded-2xl border border-birch-300 bg-white py-3 pl-10 pr-10 text-base text-granite-900 shadow-sm placeholder:text-granite-500 focus:border-pine-600"
        />
        {status === "loading" ? (
          <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-granite-500">
            <Spinner label="Searching" />
          </span>
        ) : null}
      </div>
      {status === "error" ? (
        <p className="mt-1.5 text-sm text-lingon-700" role="alert">
          Search is unavailable right now. You can pick a point on the map instead.
        </p>
      ) : null}
      <ul
        id={listId}
        role="listbox"
        aria-label="Search results"
        hidden={!showList}
        className="absolute z-[1100] mt-1 max-h-80 w-full overflow-auto rounded-2xl bg-white py-1 shadow-card ring-1 ring-birch-200"
      >
        {results.length === 0 ? (
          <li className="px-4 py-3 text-sm text-granite-600" role="option" aria-selected="false" aria-disabled="true">
            No places found.
          </li>
        ) : (
          results.map((r, i) => (
            <li
              key={r.id}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(r)}
              className={`cursor-pointer px-4 py-2.5 ${i === active ? "bg-pine-50" : "hover:bg-birch-100"}`}
            >
              <span className="block font-medium text-granite-900">{r.name}</span>
              <span className="block text-xs text-granite-600">
                {r.kind === "address" ? "Address" : "Place"}
                {r.detail ? ` · ${r.detail}` : ""}
              </span>
            </li>
          ))
        )}
      </ul>
      <p className="sr-only" aria-live="polite">
        {status === "done" ? `${results.length} results` : ""}
      </p>
    </div>
  );
}
