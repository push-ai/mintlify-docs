// generate-tools-mdx.js
const fs = require("fs");
const path = require("path");
const axios = require("axios");

const API_URL = "http://0.0.0.0:8000/integrations/tools/";
const TOOLS_DIR = "tools";
const MAIN_FILE = path.join(TOOLS_DIR, "tools.mdx");
const MINT_JSON = "mint.json";

function sanitizeFileName(name) {
  return name.replace(/[^a-z0-9]/gi, "_");
}

function sanitizeDescription(description) {
  if (!description) return "";

  // Replace HTML line breaks with MDX line breaks
  description = description.replace(/<br\s*\/?>/gi, "\n\n");

  // Remove any unexpected HTML tags
  description = description.replace(/<\/?(description|invoke)[^>]*>/gi, "");

  // Handle code blocks and inline code more carefully
  // First, temporarily replace code blocks to protect them
  const codeBlocks = [];
  description = description.replace(/```([\s\S]*?)```/g, (match, code) => {
    codeBlocks.push(match);
    return `__CODE_BLOCK_${codeBlocks.length - 1}__`;
  });

  // Then handle inline code
  description = description.replace(/`([^`]+)`/g, (match, code) => {
    // Don't escape backticks in inline code
    return match;
  });

  // Handle any curly braces that might be interpreted as expressions
  description = description.replace(/{/g, "\\{").replace(/}/g, "\\}");

  // Escape any remaining HTML-like content
  description = description.replace(/</g, "&lt;").replace(/>/g, "&gt;");

  // Restore code blocks
  description = description.replace(/__CODE_BLOCK_(\d+)__/g, (_, index) => {
    return codeBlocks[parseInt(index)];
  });

  return description;
}

async function main() {
  const { data } = await axios.get(API_URL);

  // Group tools by provider
  const grouped = {};
  data.forEach((item) => {
    if (!grouped[item.provider]) grouped[item.provider] = [];
    grouped[item.provider].push(item);
  });

  // Ensure tools directory exists
  if (!fs.existsSync(TOOLS_DIR)) {
    fs.mkdirSync(TOOLS_DIR, { recursive: true });
  }

  // Generate a file for each provider
  const providerLinks = [];
  const providerPages = [];
  const providerNameToPage = {};
  for (const provider of Object.keys(grouped)) {
    const fileName = `${sanitizeFileName(provider).toLowerCase()}.mdx`;
    const filePath = path.join(TOOLS_DIR, fileName);

    // Use provider_description from the first tool entry and sanitize it
    const providerDescription = sanitizeDescription(
      grouped[provider][0].provider_description || ""
    );
    let mdx = `${providerDescription}\n\n`;
    grouped[provider].forEach((tool) => {
      const sanitizedToolDescription = sanitizeDescription(
        tool.tool_description
      );
      mdx += `<Accordion title=\"${tool.tool}\">\n${sanitizedToolDescription}\n</Accordion>\n\n`;
    });

    fs.writeFileSync(filePath, mdx);
    providerLinks.push(`- [${provider} Tools](./${fileName})`);
    const pagePath = `tools/${fileName.replace(/\.mdx$/, "")}`;
    providerPages.push(pagePath);
    providerNameToPage[provider] = pagePath;
  }

  // Sort providerPages alphabetically by provider name
  const sortedProviderPages = Object.keys(providerNameToPage)
    .sort((a, b) => a.localeCompare(b))
    .map((provider) => providerNameToPage[provider]);

  // Update mint.json navigation
  const mint = JSON.parse(fs.readFileSync(MINT_JSON, "utf8"));

  // Find the Tools group in navigation
  let toolsGroup = null;
  for (const navGroup of mint.navigation) {
    if (navGroup.group === "Documentation") {
      for (const subGroup of navGroup.pages) {
        if (typeof subGroup === "object" && subGroup.group === "Tools") {
          toolsGroup = subGroup;
          break;
        }
      }
    }
  }

  if (toolsGroup) {
    // Keep introduction and any static pages, then add all provider pages (no duplicates)
    const staticPages = toolsGroup.pages.filter(
      (p) => !providerPages.includes(p)
    );
    toolsGroup.pages = [...staticPages, ...sortedProviderPages];
  } else {
    console.error("Could not find Tools group in mint.json navigation.");
    process.exit(1);
  }

  fs.writeFileSync(MINT_JSON, JSON.stringify(mint, null, 2));
  console.log(`Generated provider files and updated mint.json.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
