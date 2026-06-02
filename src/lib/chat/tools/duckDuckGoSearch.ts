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
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36";

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

type SerperOrganic = {
  title?: string;
  link?: string;
  snippet?: string;
};

type SerperShopping = {
  title?: string;
  link?: string;
  price?: string;
  source?: string;
};

type SerperImage = {
  title?: string;
  imageUrl?: string;
  link?: string;
};

async function serperRequest<T>(endpoint: string, body: Record<string, unknown>) {
  const apiKey = process.env.SERPER_API_KEY;
  if (!apiKey) return null;

  const response = await fetch(`https://google.serper.dev/${endpoint}`, {
    method: "POST",
    headers: {
      "X-API-KEY": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  if (!response.ok) {
    return null;
  }

  return (await response.json()) as T;
}

async function serperSearch(query: string, maxResults: number, maxImages: number) {
  const [searchData, shoppingData, imageData] = await Promise.all([
    serperRequest<{ organic?: SerperOrganic[] }>("search", {
      q: query,
      num: maxResults,
    }),
    serperRequest<{ shopping?: SerperShopping[] }>("shopping", {
      q: query,
      num: 3,
    }),
    maxImages > 0
      ? serperRequest<{ images?: SerperImage[] }>("images", {
          q: query,
          num: maxImages,
        })
      : Promise.resolve(null),
  ]);

  const webResults: WebSearchResult[] = (searchData?.organic ?? [])
    .filter((item) => item.title && item.link)
    .slice(0, maxResults)
    .map((item) => ({
      title: item.title!,
      url: item.link!,
      snippet: item.snippet ?? "",
    }));

  const purchaseLinks: PurchaseLink[] = (shoppingData?.shopping ?? [])
    .filter((item) => item.title && item.link)
    .slice(0, 3)
    .map((item) => ({
      title: item.price ? `${item.title} (${item.price})` : item.title!,
      url: item.link!,
    }));

  const imageResults: ImageSearchResult[] = (imageData?.images ?? [])
    .filter((item) => item.imageUrl)
    .slice(0, maxImages)
    .map((item) => ({
      title: item.title?.trim() || query,
      imageUrl: item.imageUrl!,
      ...(item.link ? { sourceUrl: item.link } : {}),
    }));

  return formatSearchResponse({
    query,
    freshQuery: query,
    provider: "serper",
    webResults,
    instantSnippets: [],
    instantImageUrls: [],
    purchaseLinks,
    imageResults,
  });
}

function formatSearchResponse(input: {
  query: string;
  freshQuery: string;
  provider: string;
  webResults: WebSearchResult[];
  instantSnippets: string[];
  instantImageUrls: string[];
  purchaseLinks: PurchaseLink[];
  imageResults: ImageSearchResult[];
}) {
  const snippets: string[] = [
    `Search provider: ${input.provider}`,
    `Search query used: ${input.freshQuery}`,
  ];

  if (input.webResults.length > 0) {
    snippets.push(
      "Latest web results:",
      ...input.webResults.map(
        (result, index) =>
          `${index + 1}. ${result.title}\nURL: ${result.url}${result.snippet ? `\nSnippet: ${result.snippet}` : ""}`
      )
    );
  }

  snippets.push(...input.instantSnippets);

  if (input.purchaseLinks.length > 0) {
    snippets.push(
      "Where to buy (include these purchase links in your answer when recommending products):",
      ...input.purchaseLinks.map(
        (link, index) => `${index + 1}. ${link.title}\nPurchase URL: ${link.url}`
      )
    );
  }

  const imageLines: string[] = [];

  for (const image of input.imageResults) {
    imageLines.push(
      `![${image.title}](${image.imageUrl})${image.sourceUrl ? `\nSource: ${image.sourceUrl}` : ""}`
    );
  }

  for (const imageUrl of input.instantImageUrls) {
    if (!input.imageResults.some((result) => result.imageUrl === imageUrl)) {
      imageLines.push(`![${input.query}](${imageUrl})`);
    }
  }

  if (imageLines.length > 0) {
    snippets.push(`Relevant images:\n${imageLines.join("\n\n")}`);
  }

  if (snippets.length <= 2 && imageLines.length === 0) {
    return "No web search results found for this query. Say that live search did not return results and avoid outdated training-data specifics.";
  }

  return snippets.join("\n\n");
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

  if (process.env.SERPER_API_KEY) {
    return serperSearch(freshQuery, maxResults, maxImages);
  }

  const [webResults, purchaseResults, instantAnswer, imageResults] = await Promise.all([
    fetchWebResults(freshQuery, maxResults),
    fetchPurchaseResults(freshQuery, 3),
    fetchInstantAnswer(freshQuery, maxResults),
    maxImages > 0 ? fetchImageResults(freshQuery, maxImages) : Promise.resolve([]),
  ]);

  const purchaseLinks = collectPurchaseLinks(
    [...webResults, ...purchaseResults],
    imageResults
  );

  return formatSearchResponse({
    query,
    freshQuery,
    provider: "duckduckgo",
    webResults,
    instantSnippets: instantAnswer.snippets,
    instantImageUrls: instantAnswer.imageUrls,
    purchaseLinks,
    imageResults,
  });
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
      "Search the web for the latest men's grooming and skincare information, purchase/store URLs, and relevant product images. Uses Serper in production when configured, otherwise DuckDuckGo.",
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
