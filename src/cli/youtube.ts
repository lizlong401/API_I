import { searchYTB } from "../nodes/youtube.ts";

async function main() {
  const query = process.argv.slice(2).join(" ").trim();
  if (!query) {
    console.error('Usage: node --env-file=.env src/cli/youtube.ts "your search text"');
    process.exitCode = 1;
    return;
  }

  const video = await searchYTB(query);
  console.log(JSON.stringify({ video }, null, 2));
}

try {
  await main();
} catch (error) {
  const message = error instanceof Error ? error.message : "YouTube search failed";
  console.error(message);
  process.exitCode = 1;
}
