import { NextResponse } from "next/server";
import AdmZip from "adm-zip";
import path from "node:path";

export const runtime = "nodejs";

const MAX_COUNT = 100;
const MAX_TOTAL_BYTES = 50 * 1024 * 1024; // 50MB
const ACCEPT_SCHEMES = new Set(["http:", "https:"]);

function safeUrl(raw: string): URL | null {
  try {
    const url = new URL(raw);
    if (!ACCEPT_SCHEMES.has(url.protocol)) return null;
    return url;
  } catch {
    return null;
  }
}

export async function POST(req: Request): Promise<Response> {
  const { urls } = await req.json().catch(() => ({ urls: [] }));

  if (!Array.isArray(urls) || urls.length === 0) {
    return NextResponse.json({ error: "No urls provided" }, { status: 400 });
  }

  if (urls.length > MAX_COUNT) {
    return NextResponse.json({ error: `Too many urls (max ${MAX_COUNT})` }, { status: 400 });
  }

  const zip = new AdmZip();
  let totalBytes = 0;
  let added = 0;

  for (let i = 0; i < urls.length; i += 1) {
    const candidate = urls[i];
    if (typeof candidate !== "string") continue;
    const parsed = safeUrl(candidate);
    if (!parsed) continue;

    const res = await fetch(parsed.href, {
      redirect: "follow",
      cache: "no-store",
      headers: {
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36"
      }
    });

    if (!res.ok) continue;
    const arrayBuffer = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    totalBytes += buffer.length;
    if (totalBytes > MAX_TOTAL_BYTES) {
      return NextResponse.json(
        { error: `Total download exceeds limit (${MAX_TOTAL_BYTES / 1024 / 1024}MB)` },
        { status: 400 }
      );
    }

    const ext = path.extname(parsed.pathname) || ".jpg";
    const filename = `image-${i + 1}${ext}`;
    zip.addFile(filename, buffer);
    added += 1;
  }

  if (added === 0) {
    return NextResponse.json({ error: "Failed to download any image" }, { status: 400 });
  }

  const zipBuffer = zip.toBuffer();
  return new Response(zipBuffer as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": 'attachment; filename="images.zip"',
      "Content-Length": zipBuffer.length.toString()
    }
  });
}
