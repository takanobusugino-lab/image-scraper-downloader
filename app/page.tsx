"use client";

import { useCallback, useMemo, useState } from "react";

type ImageItem = {
  thumb: string;
  full: string;
};

type ScrapeResponse = {
  images: ImageItem[];
  hasMore: boolean;
  total: number;
  error?: string;
};

const PAGE_SIZE = 200;
const MAX_INPUTS = 5;

const adLeft = {
  href: "https://amzn.to/4po4zDL",
  imageSrc: "/ads/ad1.png",
  alt: "Amazonおすすめ"
};
const adRight = {
  href: "https://amzn.to/4po4zDL",
  imageSrc: "/ads/ad1.png",
  alt: "Amazonおすすめ"
};

export default function Home() {
  const [inputs, setInputs] = useState<string[]>(Array(MAX_INPUTS).fill(""));
  const [images, setImages] = useState<ImageItem[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);

  const selectedCount = selected.size;

  const urlsPayload = useMemo(
    () => inputs.map((u) => u.trim()).filter(Boolean).slice(0, MAX_INPUTS),
    [inputs]
  );

  const toggleSelect = useCallback((url: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(url)) next.delete(url);
      else next.add(url);
      return next;
    });
  }, []);

  const fetchPage = useCallback(
    async (pageToLoad: number, append: boolean) => {
      if (urlsPayload.length === 0) {
        setError("URLを1つ以上入力してください（最大5件）");
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/scrape?page=${pageToLoad}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ urls: urlsPayload })
        });
        const data = (await res.json()) as ScrapeResponse;
        if (!res.ok || data.error) {
          throw new Error(data.error || "取得に失敗しました");
        }
        setHasMore(data.hasMore);
        setPage(pageToLoad);
        setImages((prev) => (append ? [...prev, ...data.images] : data.images));
      } catch (err: any) {
        setError(err?.message ?? "取得に失敗しました");
      } finally {
        setLoading(false);
      }
    },
    [urlsPayload]
  );

  const onSearch = useCallback(
    async (e?: React.FormEvent) => {
      e?.preventDefault();
      setSelected(new Set());
      await fetchPage(1, false);
    },
    [fetchPage]
  );

  const onLoadMore = useCallback(async () => {
    await fetchPage(page + 1, true);
  }, [fetchPage, page]);

  const onDownload = useCallback(async () => {
    if (selected.size === 0) {
      setError("ダウンロードする画像を選択してください");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ urls: Array.from(selected) })
      });
      if (!res.ok) {
        const msg = await res.json().catch(() => ({}));
        throw new Error(msg.error || "ダウンロードに失敗しました");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "images.zip";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setError(err?.message ?? "ダウンロードに失敗しました");
    } finally {
      setLoading(false);
    }
  }, [selected]);

  const disableActions = loading;
  const hasImages = useMemo(() => images.length > 0, [images.length]);
  const viewerItem = useMemo(
    () => (viewerIndex !== null ? images[viewerIndex] : null),
    [images, viewerIndex]
  );

  const canPrev = viewerIndex !== null && viewerIndex > 0;
  const canNext = viewerIndex !== null && viewerIndex < images.length - 1;
  const closeViewer = () => setViewerIndex(null);
  const goPrev = () => {
    if (!canPrev) return;
    setViewerIndex((idx) => (idx !== null ? Math.max(0, idx - 1) : idx));
  };
  const goNext = () => {
    if (!canNext) return;
    setViewerIndex((idx) => (idx !== null ? Math.min(images.length - 1, idx + 1) : idx));
  };

  return (
    <div className="min-h-screen px-4 py-12">
      <div className="mx-auto flex max-w-6xl flex-col gap-8">
        <header className="space-y-2">
          <p className="text-base uppercase tracking-[0.4em] text-gray-400">
            Image Scraper Downloader
          </p>
          <h1 className="text-5xl font-semibold tracking-tight text-white">
            複数サイトの画像を取得して選択・ダウンロード
          </h1>
          <p className="text-gray-300">
            最大5つのURLから画像を取得し、200件ずつ表示できます（総計最大1万枚）。
          </p>
        </header>

        <form
          onSubmit={onSearch}
          className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/5 p-4 shadow-xl shadow-black/30 backdrop-blur"
        >
          <p className="text-sm text-gray-300">取得したいページのURL（最大5件まで）</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {inputs.map((value, idx) => (
              <input
                key={idx}
                type="url"
                placeholder={`https://example.com (${idx + 1})`}
                value={value}
                onChange={(e) => {
                  const next = [...inputs];
                  next[idx] = e.target.value;
                  setInputs(next);
                }}
                className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-white placeholder:text-gray-500 focus:border-white/30 focus:outline-none"
              />
            ))}
          </div>
          <button
            type="submit"
            disabled={disableActions}
            className="w-full rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 text-black px-4 py-3 text-sm font-semibold transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60 sm:w-40"
          >
            {loading ? "読み込み中..." : "表示"}
          </button>
          {error && <p className="text-sm text-red-300">{error}</p>}
        </form>

        <div className="flex items-center justify-between text-sm text-gray-300">
          <span>
            取得件数: {images.length} {hasMore ? "(さらに取得可能)" : ""}
          </span>
          <span>選択: {selectedCount} 件</span>
        </div>

        <section className="rounded-2xl border border-white/10 bg-white/5 p-4 shadow-lg shadow-black/20 backdrop-blur">
          {hasImages ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {images.map((item, idx) => {
                const checked = selected.has(item.full);
                return (
                  <label
                    key={item.full + idx}
                    className={`group relative block overflow-hidden rounded-xl border ${
                      checked ? "border-emerald-400" : "border-white/10"
                    } bg-black/40 transition hover:border-white/50`}
                  >
                    <input
                      type="checkbox"
                      className="peer absolute left-2 top-2 z-10 h-4 w-4 accent-emerald-400"
                      checked={checked}
                      onChange={() => toggleSelect(item.full)}
                    />
                    <div className="relative flex items-center justify-center bg-black/30">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          setViewerIndex(idx);
                        }}
                        className="absolute right-2 top-2 rounded-full bg-white/80 px-2.5 py-1 text-[11px] font-semibold text-black shadow hover:bg-white"
                      >
                        拡大
                      </button>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={item.thumb}
                        alt=""
                        className="h-auto max-h-[360px] w-full object-contain transition duration-200 peer-checked:opacity-90"
                        loading="lazy"
                        referrerPolicy="no-referrer"
                      />
                    </div>
                    <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent to-black/40 opacity-0 transition group-hover:opacity-100" />
                  </label>
                );
              })}
            </div>
          ) : (
            <div className="flex min-h-[200px] items-center justify-center text-gray-400">
              ここに画像が表示されます
            </div>
          )}

          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={onLoadMore}
              disabled={!hasMore || disableActions}
              className="rounded-xl border border-white/20 bg-white/5 px-4 py-2 text-sm text-white transition hover:border-white/40 disabled:cursor-not-allowed disabled:opacity-50"
            >
              さらに見る
            </button>
          </div>
        </section>
      </div>

      {hasMore && (
        <div className="fixed right-4 bottom-6 z-30 sm:right-6 sm:bottom-8">
          <button
            type="button"
            onClick={onLoadMore}
            disabled={!hasMore || disableActions}
            className="rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-purple-600/30 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
          >
            さらに見る
          </button>
        </div>
      )}

      <div className="fixed bottom-6 left-1/2 z-30 -translate-x-1/2 sm:bottom-8">
        <button
          type="button"
          onClick={onDownload}
          disabled={disableActions || selectedCount === 0}
          className="rounded-full bg-gradient-to-r from-emerald-500 to-cyan-500 px-6 py-3 text-sm font-semibold text-black shadow-lg shadow-emerald-500/30 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
        >
          ダウンロード ({selectedCount})
        </button>
      </div>

      {/* サイド広告（スクロール追従、メイン幅に重ならない） */}
      <div className="pointer-events-none fixed left-2 top-24 hidden w-44 flex-col gap-3 xl:flex">
        <a
          href={adLeft.href}
          target="_blank"
          rel="noreferrer"
          className="pointer-events-auto overflow-hidden rounded-xl border border-white/10 bg-white/5 shadow-lg shadow-black/40 transition hover:border-white/30 hover:bg-white/10"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={adLeft.imageSrc} alt={adLeft.alt} className="h-auto w-full" />
        </a>
      </div>
      <div className="pointer-events-none fixed right-2 top-24 hidden w-44 flex-col gap-3 xl:flex">
        <a
          href={adRight.href}
          target="_blank"
          rel="noreferrer"
          className="pointer-events-auto overflow-hidden rounded-xl border border-white/10 bg-white/5 shadow-lg shadow-black/40 transition hover:border-white/30 hover:bg-white/10"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={adRight.imageSrc} alt={adRight.alt} className="h-auto w-full" />
        </a>
      </div>

      {viewerItem && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4"
          onClick={closeViewer}
        >
          <div
            className="relative flex max-h-[90vh] max-w-[90vw] flex-col overflow-hidden rounded-2xl bg-black/85 p-4 shadow-2xl shadow-black/60"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative flex items-center justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={viewerItem.full || viewerItem.thumb}
                alt=""
                className="max-h-[80vh] max-w-[86vw] object-contain"
                loading="lazy"
                referrerPolicy="no-referrer"
              />
              <div className="pointer-events-none absolute inset-0 flex">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    goPrev();
                  }}
                  disabled={!canPrev}
                  className="pointer-events-auto flex-1 cursor-pointer bg-gradient-to-r from-black/20 to-transparent text-left text-white opacity-70 transition hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-20"
                  aria-label="前の画像"
                />
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    goNext();
                  }}
                  disabled={!canNext}
                  className="pointer-events-auto flex-1 cursor-pointer bg-gradient-to-l from-black/20 to-transparent text-right text-white opacity-70 transition hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-20"
                  aria-label="次の画像"
                />
              </div>
            </div>
            <div className="mt-4 flex justify-between gap-3">
              <a
                href={viewerItem.full || viewerItem.thumb}
                target="_blank"
                rel="noreferrer"
                className="rounded-full bg-white/15 px-4 py-2 text-sm text-white hover:bg-white/25"
              >
                別タブで開く
              </a>
              <button
                type="button"
                onClick={closeViewer}
                className="rounded-full bg-white/15 px-4 py-2 text-sm text-white hover:bg-white/25"
              >
                閉じる
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
