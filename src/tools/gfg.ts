export interface GfGLookupResult {
  topic: string;
  source: string | null;
  content: string;
  found: boolean;
}

async function fetchText(url: string) {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
  });
  if (!res.ok) throw new Error(`Fetch failed (${res.status}) for ${url}`);
  return await res.text();
}

export async function searchGfGTopic(topic: string): Promise<string | null> {
  const ddgUrl =
    "https://html.duckduckgo.com/html/?q=site:geeksforgeeks.org+" + encodeURIComponent(topic);
  const html = await fetchText(ddgUrl);

  const m = html.match(/class="result__snippet[^\"]*"[^>]*href="([^"]+)"/i);
  let href = m ? m[1] : null;
  if (href?.startsWith("//duckduckgo.com/l/?uddg=")) {
    href = decodeURIComponent(href.split("uddg=")[1].split("&")[0]);
  }
  return href;
}

function extractMainContent(html: string): string {
  const classRegex = /(?:class="[^\"]*(?:MainArticleContent_articleMainContentCss__b_1_R|article--viewer_content)[^\"]*")/i;
  const match = html.match(
    new RegExp(
      `<div[^>]*${classRegex.source}[^>]*>([\\s\\S]*?)<div[^>]*class="[^\"]*article-right-sidebar[^\"]*"`,
      "i"
    )
  );

  let contentHtml = html;
  if (match && match[1]) {
    contentHtml = match[1];
  } else {
    const divIndex = html.search(classRegex);
    if (divIndex !== -1) {
      contentHtml = html.slice(divIndex, divIndex + 30000);
    }
  }

  const cleanText = contentHtml
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/<\/?(div|p|h[1-6]|br|li|td|th|ul)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n\n")
    .trim()
    .slice(0, 8000);

  return cleanText;
}

export async function lookupGfG(topic: string): Promise<GfGLookupResult> {
  try {
    const href = await searchGfGTopic(topic);
    if (!href) {
      return { topic, source: null, content: "", found: false };
    }

    const articleHtml = await fetchText(href);
    const content = extractMainContent(articleHtml);
    return { topic, source: href, content, found: true };
  } catch (e: any) {
    return { topic, source: null, content: "", found: false };
  }
}
