import { tool } from "langchain";
import { z } from "zod";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36";

const INDIAN_STORES = [
  { label: "Flipkart", domain: "flipkart.com" },
  { label: "Nykaa", domain: "nykaa.com" },
  { label: "Amazon India", domain: "amazon.in" },
  { label: "Nykaa Man", domain: "nykaaman.com" },
  { label: "Purplle", domain: "purplle.com" },
  { label: "Myntra", domain: "myntra.com" },
  { label: "Tira", domain: "tira.beauty" },
  { label: "1mg", domain: "1mg.com" },
  { label: "PharmEasy", domain: "pharmeasy.in" },
  { label: "Maccaron", domain: "maccaron.in" },
] as const;

const BRAND_STORES = [
  { label: "Minimalist", domain: "minimalist.in" },
  { label: "Mamaearth", domain: "mamaearth.in" },
  { label: "The Man Company", domain: "themancompany.com" },
  { label: "Beardo", domain: "beardo.in" },
  { label: "mCaffeine", domain: "mcaffeine.com" },
  { label: "Plum", domain: "plumgoodness.com" },
  { label: "Dot & Key", domain: "dotandkey.com" },
  { label: "Derma Co", domain: "dermaco.com" },
] as const;

type StoreLink = {
  store: string;
  title: string;
  url: string;
};

type ProductImage = {
  title: string;
  imageUrl: string;
  sourceUrl?: string;
};

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

function normalizeHost(url: string) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function storeLabelForUrl(url: string): string | null {
  const host = normalizeHost(url);
  if (!host) return null;

  for (const store of [...INDIAN_STORES, ...BRAND_STORES]) {
    if (host.includes(store.domain)) {
      return store.label;
    }
  }

  return null;
}

function isIndianStoreUrl(url: string) {
  return storeLabelForUrl(url) !== null;
}

function looksLikeProductPage(url: string) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    const path = parsed.pathname.toLowerCase();

    if (host.includes("amazon.") && (path.includes("/dp/") || path.includes("/gp/product"))) {
      return true;
    }
    if (host.includes("flipkart.") && path.includes("/p/")) {
      return true;
    }
    if (
      host.includes("nykaa.") &&
      (path.includes("/p/") || path.includes("/products/"))
    ) {
      return true;
    }
    if (host.includes("purplle.") && path.includes("/product/")) {
      return true;
    }
    if (host.includes("myntra.") && path.includes("/buy")) {
      return true;
    }

    return (
      path.includes("/product") ||
      path.includes("/products/") ||
      path.includes("/dp/") ||
      path.includes("/p/") ||
      path.includes("/buy") ||
      path.includes("/shop/")
    );
  } catch {
    return false;
  }
}

async function serperRequest<T>(endpoint: string, body: Record<string, unknown>) {
  const apiKey = process.env.SERPER_API_KEY;
  if (!apiKey) return null;

  const response = await fetch(`https://google.serper.dev/${endpoint}`, {
    method: "POST",
    headers: {
      "X-API-KEY": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ gl: "in", hl: "en", ...body }),
    cache: "no-store",
  });

  if (!response.ok) {
    return null;
  }

  return (await response.json()) as T;
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

async function ddgWebSearch(query: string, maxResults: number): Promise<SerperOrganic[]> {
  const response = await fetch(
    `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`,
    {
      headers: {
        Accept: "text/html,application/json,text/plain,*/*",
        "User-Agent": USER_AGENT,
      },
      cache: "no-store",
    }
  );

  if (!response.ok) {
    return [];
  }

  const html = await response.text();
  if (!html || html.includes("anomaly-modal")) {
    return [];
  }

  const results: SerperOrganic[] = [];
  const blocks = html.split('class="result results_links');

  for (const block of blocks.slice(1)) {
    const titleMatch = block.match(
      /class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/
    );
    if (!titleMatch) continue;

    results.push({
      title: decodeHtml(titleMatch[2].replace(/<[^>]+>/g, "")),
      link: extractRedirectUrl(titleMatch[1]),
    });

    if (results.length >= maxResults) break;
  }

  return results;
}

async function searchPages(query: string, maxResults: number) {
  const serper = await serperRequest<{ organic?: SerperOrganic[] }>("search", {
    q: query,
    num: maxResults,
  });

  if (serper?.organic?.length) {
    return serper.organic.filter((item) => item.link);
  }

  return ddgWebSearch(query, maxResults);
}

async function searchStoreLink(
  product: string,
  store: { label: string; domain: string }
): Promise<StoreLink | null> {
  const query = `${product} site:${store.domain}`;
  const results = await searchPages(query, 3);

  for (const result of results) {
    const url = result.link ?? "";
    if (!url || !url.includes(store.domain)) continue;
    if (!looksLikeProductPage(url)) continue;

    return {
      store: store.label,
      title: result.title?.trim() || product,
      url,
    };
  }

  return null;
}

async function searchShoppingLinks(product: string): Promise<StoreLink[]> {
  const data = await serperRequest<{ shopping?: SerperShopping[] }>("shopping", {
    q: `${product} buy India`,
    num: 8,
  });

  const links: StoreLink[] = [];
  const seenStores = new Set<string>();

  for (const item of data?.shopping ?? []) {
    if (!item.link || !item.title) continue;
    if (!isIndianStoreUrl(item.link)) continue;

    const store = storeLabelForUrl(item.link);
    if (!store || seenStores.has(store)) continue;

    seenStores.add(store);
    links.push({
      store,
      title: item.price ? `${item.title} (${item.price})` : item.title,
      url: item.link,
    });
  }

  return links;
}

async function searchProductImages(
  product: string,
  maxImages: number
): Promise<ProductImage[]> {
  const data = await serperRequest<{ images?: SerperImage[] }>("images", {
    q: `${product} product packshot`,
    num: maxImages + 2,
  });

  const images: ProductImage[] = [];
  const seen = new Set<string>();

  for (const item of data?.images ?? []) {
    if (!item.imageUrl || seen.has(item.imageUrl)) continue;
    seen.add(item.imageUrl);

    images.push({
      title: item.title?.trim() || product,
      imageUrl: item.imageUrl,
      ...(item.link ? { sourceUrl: item.link } : {}),
    });

    if (images.length >= maxImages) break;
  }

  if (images.length > 0) {
    return images;
  }

  const pageResults = await searchPages(`${product} product image India`, 3);
  for (const result of pageResults) {
    const url = result.link ?? "";
    if (!url || !isIndianStoreUrl(url)) continue;
    if (!looksLikeProductPage(url)) continue;

    images.push({
      title: result.title?.trim() || product,
      imageUrl: url,
      sourceUrl: url,
    });
    break;
  }

  return images;
}

function mergeStoreLinks(...groups: StoreLink[][]) {
  const byStore = new Map<string, StoreLink>();

  for (const group of groups) {
    for (const link of group) {
      if (!byStore.has(link.store)) {
        byStore.set(link.store, link);
      }
    }
  }

  return [...byStore.values()];
}

const STORE_PRIORITY = [
  "Flipkart",
  "Nykaa",
  "Amazon India",
  "Nykaa Man",
  "Purplle",
  "Myntra",
  "Tira",
  "1mg",
  "PharmEasy",
  "Maccaron",
  "Minimalist",
  "Mamaearth",
  "The Man Company",
  "Beardo",
  "mCaffeine",
  "Plum",
  "Dot & Key",
  "Derma Co",
];

function pickBestStoreLink(links: StoreLink[]): StoreLink | null {
  if (links.length === 0) return null;

  for (const store of STORE_PRIORITY) {
    const match = links.find((link) => link.store === store);
    if (match) return match;
  }

  return links[0];
}

function formatIndianProductResponse(input: {
  query: string;
  images: ProductImage[];
  storeLinks: StoreLink[];
}) {
  const lines: string[] = [
    `Product: ${input.query}`,
    `Indian stores searched: Flipkart, Nykaa, Amazon India, Nykaa Man, Purplle, Myntra, Tira, 1mg, brand sites`,
  ];

  if (input.images.length > 0) {
    lines.push(
      "Product images (include these in your answer with markdown image syntax):",
      ...input.images.map(
        (image, index) =>
          `${index + 1}. ![${image.title}](${image.imageUrl})${image.sourceUrl ? `\n   Source page: ${image.sourceUrl}` : ""}`
      )
    );
  }

  if (input.storeLinks.length > 0) {
    const productName = input.query;
    const link = input.storeLinks[0];
    lines.push(
      "Product buy link (include exactly one — use the product name as link text):",
      `[${productName}](${link.url})`
    );
  } else {
    lines.push(
      "No direct product links found. Tell the user to search manually on Flipkart, Nykaa, and Amazon India."
    );
  }

  return lines.join("\n\n");
}

export async function searchIndianProducts(
  query: string,
  maxStores = 6,
  maxImages = 3
) {
  const product = query.trim();
  if (!product) {
    return "No product query provided.";
  }

  const storesToSearch = [...INDIAN_STORES, ...BRAND_STORES].slice(0, maxStores);

  const [images, shoppingLinks, ...perStoreLinks] = await Promise.all([
    searchProductImages(product, maxImages),
    searchShoppingLinks(product),
    ...storesToSearch.map((store) => searchStoreLink(product, store)),
  ]);

  const mergedLinks = mergeStoreLinks(
    shoppingLinks,
    perStoreLinks.filter((link): link is StoreLink => link !== null)
  );
  const bestLink = pickBestStoreLink(mergedLinks);

  return formatIndianProductResponse({
    query: product,
    images: images.slice(0, 1),
    storeLinks: bestLink ? [bestLink] : [],
  });
}

export const indianProductSearchTool = tool(
  async ({ query, maxStores, maxImages }) => {
    try {
      return await searchIndianProducts(query, maxStores, maxImages);
    } catch {
      return "Indian product search failed. Say live search is temporarily unavailable and suggest checking Flipkart, Nykaa, and Amazon India manually.";
    }
  },
  {
    name: "indian_product_search",
    description:
      "Search for a men's skincare product in India. Returns one product image and one best buy link from Indian stores (Flipkart, Nykaa, Amazon.in, etc.).",
    schema: z.object({
      query: z
        .string()
        .describe("Product name or search query for Indian market."),
      maxStores: z
        .number()
        .int()
        .min(3)
        .max(10)
        .default(6)
        .describe("How many Indian stores to check."),
      maxImages: z
        .number()
        .int()
        .min(0)
        .max(2)
        .default(1)
        .describe("Maximum number of product images."),
    }),
  }
);
