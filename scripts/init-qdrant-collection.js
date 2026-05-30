import 'dotenv/config';

const qdrantUrl = process.env.QDRANT_URL ?? 'http://localhost:6333';
const collection = process.env.QDRANT_COLLECTION ?? 'holtkamp_knowledge';
const apiKey = process.env.QDRANT_API_KEY;
const vectorSize = Number(process.env.QDRANT_VECTOR_SIZE ?? 768);
const distance = process.env.QDRANT_DISTANCE ?? 'Cosine';
const timeoutMs = Number(process.env.QDRANT_INIT_TIMEOUT_MS ?? 30000);
const retryDelayMs = Number(process.env.QDRANT_INIT_RETRY_DELAY_MS ?? 1000);

const headers = {
  'content-type': 'application/json',
  ...(apiKey ? { 'api-key': apiKey } : {}),
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function waitForQdrant() {
  const deadline = Date.now() + timeoutMs;
  let lastError = 'not ready';

  while (Date.now() < deadline) {
    try {
      const response = await fetchWithTimeout(`${qdrantUrl}/collections`, { headers });
      if (response.ok) return;
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : 'unknown error';
    }

    await sleep(retryDelayMs);
  }

  throw new Error(`Qdrant did not become ready within ${timeoutMs}ms (${lastError})`);
}

async function collectionExists() {
  const response = await fetchWithTimeout(`${qdrantUrl}/collections/${collection}`, { headers });
  if (response.ok) return true;
  if (response.status === 404) return false;
  throw new Error(`Qdrant collection check failed with HTTP ${response.status}`);
}

async function createCollection() {
  const response = await fetchWithTimeout(`${qdrantUrl}/collections/${collection}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({
      vectors: {
        size: vectorSize,
        distance,
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Qdrant collection creation failed with HTTP ${response.status}`);
  }
}

async function main() {
  if (!Number.isInteger(vectorSize) || vectorSize <= 0) {
    throw new Error(`Invalid QDRANT_VECTOR_SIZE: ${process.env.QDRANT_VECTOR_SIZE}`);
  }

  await waitForQdrant();

  if (await collectionExists()) {
    console.log(`Qdrant collection "${collection}" already exists.`);
    return;
  }

  await createCollection();
  console.log(`Qdrant collection "${collection}" created with size=${vectorSize}, distance=${distance}.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Qdrant init failed');
  process.exit(1);
});
