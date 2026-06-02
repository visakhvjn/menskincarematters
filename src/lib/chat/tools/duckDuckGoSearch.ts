import { tool } from "langchain";
import { z } from "zod";

type DuckDuckGoIcon = {
  URL?: string;
};

type DuckDuckGoTopic = {
  Text?: string;
  FirstURL?: string;
  Name?: string;
  Icon?: DuckDuckGoIcon;
  Topics?: DuckDuckGoTopic[];
};

type DuckDuckGoResponse = {
  AbstractText?: string;
  AbstractURL?: string;
  AbstractSource?: string;
  Image?: string;
  Icon?: DuckDuckGoIcon;
  Results?: DuckDuckGoTopic[];
  RelatedTopics?: DuckDuckGoTopic[];
};

type DuckDuckGoImageResult = {
  title?: string;
  image?: string;
  thumbnail?: string;
  url?: string;
};

type DuckDuckGoImageResponse = {
  results?: DuckDuckGoImageResult[];
};

type ImageSearchResult = {
  title: string;
  imageUrl: string;
  sourceUrl?: string;
};

const MIN_SEARCH_INTERVAL_MS = 2500;
const USER_AGENT = "Mozilla/5.0 (compatible; MenGroomingAssistant/1.0)";

let lastSearchAt = 0;

function getCurrentYear() {
  return new Date().getFullYear();
}

function withFreshnessQuery(query: string) {
  const trimmed = query.trim();
  if (!trimmed) return trimmed;
  if (/\b20\d{2}\b/.test(trimmed)) {
    return trimmed;
  }
  return `${trimmed} ${getCurrentYear()}`;
}

function decodeHtml(text: string) {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function extractRedirectUrl(rawUrl: string) {
  try {
    const parsed = new URL(rawUrl, "https://duckduckgo.com");
    const direct = parsed.searchParams.get("uddg");
    return direct ? decodeURIComponent(direct) : parsed.toString();
  } catch {
    return rawUrl;
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function throttleSearchRequests() {
  const now = Date.now();
  const waitMs = MIN_SEARCH_INTERVAL_MS - (now - lastSearchAt);
  if (waitMs > 0) {
    await sleep(waitMs);
  }
  lastSearchAt = Date.now();
}

function normalizeImageUrl(url?: string): string | null {
  if (!url?.trim()) return null;
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  if (url.startsWith("//")) return `https:${url}`;
  if (url.startsWith("/")) return `https://duckduckgo.com${url}`;
  return null;
}

function flattenTopics(topics: DuckDuckGoTopic[] = []): DuckDuckGoTopic[] {
  return topics.flatMap((topic) => {
    if (topic.Topics?.length) {
      return flattenTopics(topic.Topics);
    }
    if (topic.Text && topic.FirstURL) {
      return [topic];
    }
    return [];
  });
}

async function fetchJson<T>(url: string): Promise<T | null> {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json,text/plain,*/*",
      "User-Agent": USER_AGENT,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    return null;
  }

  return (await response.json()) as T;
}

async function fetchText(url: string): Promise<string | null> {
  const response = await fetch(url, {
    headers: {
      Accept: "text/html,application/json,text/plain,*/*",
      "User-Agent": USER_AGENT,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    return null;
  }

  return response.text();
}

async function fetchInstantAnswer(query: string, maxResults: number) {
  const url = new URL("https://api.duckduckgo.com/");
  url.searchParams.set("q", query);
  url.searchParams.set("format", "json");
  url.searchParams.set("no_html", "1");
  url.searchParams.set("skip_disambig", "1");

  const data = await fetchJson<DuckDuckGoResponse>(url.toString());
  if (!data) {
    return { snippets: [] as string[], imageUrls: [] as string[] };
  }

  const snippets: string[] = [];
  const imageUrls = new Set<string>();

  const mainImage = normalizeImageUrl(data.Image);
  if (mainImage) imageUrls.add(mainImage);

  const mainIcon = normalizeImageUrl(data.Icon?.URL);
  if (mainIcon) imageUrls.add(mainIcon);

  if (data.AbstractText?.trim()) {
    snippets.push(
      `Summary: ${data.AbstractText.trim()}${data.AbstractURL ? `\nURL: ${data.AbstractURL}` : ""}${data.AbstractSource ? `\nSource: ${data.AbstractSource}` : ""}`
    );
  }

  const linkedResults = [
    ...(data.Results ?? []),
    ...flattenTopics(data.RelatedTopics ?? []),
  ]
    .filter((item) => item.Text && item.FirstURL)
    .slice(0, maxResults);

  for (const [index, item] of linkedResults.entries()) {
    snippets.push(`${index + 1}. ${item.Text}\nURL: ${item.FirstURL}`);
    const icon = normalizeImageUrl(item.Icon?.URL);
    if (icon) imageUrls.add(icon);
  }

  return { snippets, imageUrls: [...imageUrls] };
}

async function fetchImageResults(query: string, maxImages: number): Promise<ImageSearchResult[]> {
  const searchPageUrl = `https://duckduckgo.com/?q=${encodeURIComponent(query)}&iax=images&ia=images`;
  const html = await fetchText(searchPageUrl);
  if (!html) return [];

  const vqdMatch = html.match(/vqd=["']?([\d-]+)/);
  const vqd = vqdMatch?.[1];
  if (!vqd) return [];

  await sleep(400);

  const imageApiUrl = `https://duckduckgo.com/i.js?o=json&q=${encodeURIComponent(query)}&vqd=${encodeURIComponent(vqd)}&p=1`;
  const data = await fetchJson<DuckDuckGoImageResponse>(imageApiUrl);
  if (!data?.results?.length) return [];

  const images: ImageSearchResult[] = [];

  for (const result of data.results) {
    const imageUrl = normalizeImageUrl(result.image ?? result.thumbnail);
    if (!imageUrl) continue;

    images.push({
      title: result.title?.trim() || query,
      imageUrl,
      ...(result.url ? { sourceUrl: result.url } : {}),
    });

    if (images.length >= maxImages) break;
  }

  return images;
}

type WebSearchResult = {
  title: string;
  url: string;
  snippet: string;
};

type PurchaseLink = {
  title: string;
  url: string;
};

const PURCHASE_DOMAIN_HINTS = [
  "amazon.",
  "flipkart.",
  "nykaa.",
  "sephora.",
  "ulta.",
  "target.com",
  "walmart.",
  "iherb.",
  "lookfantastic.",
  "cultbeauty.",
  "boots.com",
  "superdrug.",
  "chemistwarehouse.",
  "purplle.",
  "myntra.",
  "maccaron.",
  "dermstore.",
  "yesstyle.",
];

function isPurchaseUrl(url: string) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    const path = parsed.pathname.toLowerCase();

    if (PURCHASE_DOMAIN_HINTS.some((hint) => host.includes(hint))) {
      return true;
    }

    return (
      path.includes("/product") ||
      path.includes("/products/") ||
      path.includes("/dp/") ||
      path.includes("/buy") ||
      path.includes("/shop/")
    );
  } catch {
    return false;
  }
}

function collectPurchaseLinks(
  webResults: WebSearchResult[],
  imageResults: ImageSearchResult[]
): PurchaseLink[] {
  const links: PurchaseLink[] = [];
  const seen = new Set<string>();

  for (const result of [...webResults, ...imageResults.map((image) => ({
    title: image.title,
    url: image.sourceUrl ?? "",
    snippet: "",
  }))]) {
    if (!result.url || !isPurchaseUrl(result.url) || seen.has(result.url)) {
      continue;
    }

    seen.add(result.url);
    links.push({ title: result.title, url: result.url });
  }

  return links;
}

async function fetchPurchaseResults(query: string, maxResults: number) {
  return fetchWebResults(`${query} buy online`, maxResults);
}

async function fetchWebResults(query: string, maxResults: number): Promise<WebSearchResult[]> {
  const html = await fetchText(
    `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`
  );

  if (!html || html.includes("anomaly-modal")) {
    return [];
  }

  const results: WebSearchResult[] = [];
  const resultBlocks = html.split('class="result results_links');

  for (const block of resultBlocks.slice(1)) {
    const titleMatch = block.match(/class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
    const snippetMatch = block.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>/);

    if (!titleMatch) continue;

    results.push({
      title: decodeHtml(titleMatch[2].replace(/<[^>]+>/g, "")),
      url: extractRedirectUrl(titleMatch[1]),
      snippet: decodeHtml((snippetMatch?.[1] ?? "").replace(/<[^>]+>/g, "")),
    });

    if (results.length >= maxResults) break;
  }

  return results;
}

async function duckDuckGoSearch(query: string, maxResults: number, maxImages: number) {
  await throttleSearchRequests();

  const freshQuery = withFreshnessQuery(query);
  const webResults = await fetchWebResults(freshQuery, maxResults);
  await sleep(500);

  const purchaseResults = await fetchPurchaseResults(freshQuery, 3);
  await sleep(500);

  const instantAnswer = await fetchInstantAnswer(freshQuery, maxResults);
  await sleep(500);

  const imageResults = await fetchImageResults(freshQuery, maxImages);
  const purchaseLinks = collectPurchaseLinks(
    [...webResults, ...purchaseResults],
    imageResults
  );

  const snippets: string[] = [`Search query used: ${freshQuery}`];

  if (webResults.length > 0) {
    snippets.push(
      "Latest web results:",
      ...webResults.map(
        (result, index) =>
          `${index + 1}. ${result.title}\nURL: ${result.url}${result.snippet ? `\nSnippet: ${result.snippet}` : ""}`
      )
    );
  }

  snippets.push(...instantAnswer.snippets);

  if (purchaseLinks.length > 0) {
    snippets.push(
      "Where to buy (include these purchase links in your answer when recommending products):",
      ...purchaseLinks.map(
        (link, index) => `${index + 1}. ${link.title}\nPurchase URL: ${link.url}`
      )
    );
  }

  const imageLines: string[] = [];

  for (const image of imageResults) {
    imageLines.push(
      `![${image.title}](${image.imageUrl})${image.sourceUrl ? `\nSource: ${image.sourceUrl}` : ""}`
    );
  }

  for (const imageUrl of instantAnswer.imageUrls) {
    if (!imageResults.some((result) => result.imageUrl === imageUrl)) {
      imageLines.push(`![${query}](${imageUrl})`);
    }
  }

  if (imageLines.length > 0) {
    snippets.push(`Relevant images:\n${imageLines.join("\n\n")}`);
  }

  if (snippets.length <= 1 && imageLines.length === 0) {
    return "No DuckDuckGo results found for this query. Say that live search did not return results and avoid outdated training-data specifics.";
  }

  return snippets.join("\n\n");
}

export const duckDuckGoSearchTool = tool(
  async ({ query, maxResults, maxImages }) => {
    try {
      return await duckDuckGoSearch(query, maxResults, maxImages);
    } catch {
      return "Search failed. Say live search is temporarily unavailable and avoid citing outdated year-specific product recommendations.";
    }
  },
  {
    name: "duckduckgo_search",
    description:
      "Search DuckDuckGo for the latest men's grooming and skincare information, purchase/store URLs, and relevant product images.",
    schema: z.object({
      query: z.string().describe("The search query."),
      maxResults: z
        .number()
        .int()
        .min(1)
        .max(5)
        .default(3)
        .describe("Maximum number of related text results to return."),
      maxImages: z
        .number()
        .int()
        .min(0)
        .max(3)
        .default(2)
        .describe("Maximum number of relevant image URLs to return."),
    }),
  }
);
