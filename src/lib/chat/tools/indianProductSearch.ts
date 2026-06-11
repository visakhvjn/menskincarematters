import { tool } from "langchain";
import { z } from "zod";
import { duckDuckGoSearch } from "@/lib/chat/tools/duckDuckGoSearch";

const INDIAN_STORE_HINTS = [
  "amazon.in",
  "flipkart.com",
  "nykaa.com",
  "nykaaman.com",
  "purplle.com",
  "myntra.com",
  "tira.beauty",
  "maccaron.in",
  "1mg.com",
  "pharmeasy.in",
  "netmeds.com",
  "bigbasket.com",
  "blinkit.com",
  "zepto.",
  "swiggy.com/instamart",
  "jiomart.com",
  "smytten.com",
  "beautybarn.in",
  "kamaayurveda.com",
  "forestessentialsindia.com",
  "mamaearth.in",
  "beardo.in",
  "themancompany.com",
  "bombayshavingcompany.com",
  "mcaffeine.com",
  "plumgoodness.com",
  "minimalist.in",
  "dotandkey.com",
  "dermaco.com",
  "reneeofficial.com",
];

function isIndianStoreUrl(url: string) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    return INDIAN_STORE_HINTS.some((hint) => host.includes(hint));
  } catch {
    return false;
  }
}

function filterIndianPurchaseLinks(text: string) {
  const lines = text.split("\n");
  const filtered: string[] = [];
  let skippingPurchaseBlock = false;

  for (const line of lines) {
    const urlMatch = line.match(/https?:\/\/\S+/);
    if (urlMatch && !isIndianStoreUrl(urlMatch[0])) {
      continue;
    }

    if (line.includes("Where to buy")) {
      skippingPurchaseBlock = true;
      filtered.push(
        "Where to buy in India (only Indian store links are included):"
      );
      continue;
    }

    if (
      skippingPurchaseBlock &&
      line.trim() === "" &&
      filtered.at(-1)?.trim() === ""
    ) {
      continue;
    }

    if (
      skippingPurchaseBlock &&
      !line.includes("Purchase URL:") &&
      !line.match(/^\d+\./) &&
      line.trim() !== "" &&
      !line.includes("Where to buy")
    ) {
      skippingPurchaseBlock = false;
    }

    filtered.push(line);
  }

  const result = filtered.join("\n").trim();
  if (!result.includes("Purchase URL:")) {
    return `${result}\n\nNote: No Indian purchase links were found for this query. Mention that availability should be checked on Amazon India, Flipkart, or Nykaa.`;
  }

  return result;
}

function withIndiaContext(query: string) {
  const trimmed = query.trim();
  if (!trimmed) return trimmed;
  if (/india|indian|₹|inr/i.test(trimmed)) {
    return `${trimmed} buy online India`;
  }
  return `${trimmed} men's skincare buy online India`;
}

export async function searchIndianProducts(
  query: string,
  maxResults = 3,
  maxImages = 2
) {
  const raw = await duckDuckGoSearch(
    withIndiaContext(query),
    maxResults,
    maxImages
  );
  return filterIndianPurchaseLinks(raw);
}

export const indianProductSearchTool = tool(
  async ({ query, maxResults, maxImages }) => {
    try {
      return await searchIndianProducts(query, maxResults, maxImages);
    } catch {
      return "Indian product search failed. Say live search is temporarily unavailable and suggest checking Amazon India, Flipkart, or Nykaa manually.";
    }
  },
  {
    name: "indian_product_search",
    description:
      "Search for men's skincare products available in India. Returns Indian store purchase links (Amazon.in, Flipkart, Nykaa, etc.) and product images.",
    schema: z.object({
      query: z
        .string()
        .describe("Product name or search query for Indian market."),
      maxResults: z
        .number()
        .int()
        .min(1)
        .max(5)
        .default(3)
        .describe("Maximum number of text results."),
      maxImages: z
        .number()
        .int()
        .min(0)
        .max(3)
        .default(2)
        .describe("Maximum number of product images."),
    }),
  }
);
