import { NextResponse } from "next/server";
import * as cheerio from "cheerio";

export const runtime = "nodejs";

const PAGE_SIZE = 200;
const MAX_IMAGES = 10000;
const FETCH_TIMEOUT_MS = 12000;
const ACCEPT_SCHEMES = new Set(["http:", "https:"]);
const IMAGE_EXT_REGEX = /\.(jpe?g|png|gif|webp|avif|svg)$/i;

type ImageItem = {
  thumb: string;
  full: string;
};

type ScrapeResult = {
  images: ImageItem[];
  hasMore: boolean;
  total: number;
};

function resolveUrl(raw: string | undefined, base: URL): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.startsWith("data:") || trimmed.startsWith("blob:")) {
    return null;
  }
  try {
    const url = new URL(trimmed, base);
    if (!ACCEPT_SCHEMES.has(url.protocol)) return null;
    return url.href;
  } catch {
    return null;
  }
}

async function fetchHtml(target: URL): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(target.href, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
        accept: "text/html,application/xhtml+xml"
      },
      cache: "no-store"
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function pickFromSrcset(srcset?: string): { first?: string; last?: string } {
  if (!srcset) return {};
  const parts = srcset.split(",").map((s) => s.trim().split(" ")[0]).filter(Boolean);
  if (parts.length === 0) return {};
  return { first: parts[0], last: parts[parts.length - 1] };
}

function extractImages($: cheerio.CheerioAPI, base: URL): ImageItem[] {
  const found: ImageItem[] = [];

  $("img").each((_, el) => {
    const $el = $(el);
    const src = $el.attr("src");
    const dataSrc = $el.attr("data-src");
    const srcset = pickFromSrcset($el.attr("srcset"));

    const parentLink = $el.closest("a").attr("href");
    const dataFull = $el.attr("data-full") || $el.attr("data-original") || $el.attr("data-large");
    const fullCandidates = [parentLink, dataFull, srcset.last, src, dataSrc];

    let full: string | null = null;
    for (const cand of fullCandidates) {
      const resolved = resolveUrl(cand, base);
      if (resolved && (IMAGE_EXT_REGEX.test(resolved) || resolved.includes("/orig") || resolved.includes("large"))) {
        full = resolved;
        break;
      }
    }
    if (!full) {
      const fallback = resolveUrl(src || dataSrc || srcset.last || srcset.first || "", base);
      if (fallback) full = fallback;
    }

    const thumbCandidates = [src, dataSrc, srcset.first, srcset.last];
    let thumb: string | null = null;
    for (const cand of thumbCandidates) {
      const resolved = resolveUrl(cand, base);
      if (resolved) {
        thumb = resolved;
        break;
      }
    }
    if (!thumb && full) thumb = full;
    if (!full || !thumb) return;

    found.push({ thumb, full });
  });

  return found;
}

export async function POST(req: Request): Promise<NextResponse<ScrapeResult | { error: string }>> {
  const payload = await req.json().catch(() => ({}));
  const urlsInput: unknown = (payload as any).urls ?? (payload as any).url;
  const page = Number(new URL(req.url).searchParams.get("page") ?? "1") || 1;

  const urlList = Array.isArray(urlsInput)
    ? (urlsInput as unknown[])
    : typeof urlsInput === "string"
    ? [urlsInput]
    : [];

  const normalized = urlList
    .map((u) => (typeof u === "string" ? u.trim() : ""))
    .filter(Boolean)
    .slice(0, 5);

  if (normalized.length === 0) {
    return NextResponse.json({ error: "urls are required" }, { status: 400 });
  }

  const allImages: ImageItem[] = [];
  const seenFull = new Set<string>();

  for (const urlStr of normalized) {
    let target: URL;
    try {
      target = new URL(urlStr);
    } catch {
      continue;
    }
    if (!ACCEPT_SCHEMES.has(target.protocol)) continue;

    const html = await fetchHtml(target);
    if (!html) continue;
    const $ = cheerio.load(html);
    const imgs = extractImages($, target);
    for (const img of imgs) {
      if (seenFull.has(img.full)) continue;
      seenFull.add(img.full);
      allImages.push(img);
      if (allImages.length >= MAX_IMAGES) break;
    }
    if (allImages.length >= MAX_IMAGES) break;
  }

  const start = Math.max(0, (page - 1) * PAGE_SIZE);
  const sliced = allImages.slice(start, start + PAGE_SIZE);
  const hasMore = allImages.length > start + PAGE_SIZE;

  return NextResponse.json({ images: sliced, hasMore, total: allImages.length });
}
