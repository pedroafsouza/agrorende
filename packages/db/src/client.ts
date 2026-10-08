import { MongoClient, type Db } from "mongodb";

let clientPromise: Promise<MongoClient> | null = null;
let clientInstance: MongoClient | null = null;
let currentUri: string | null = null;

function resolveUri(uri?: string): string {
  const resolved = uri ?? process.env.MONGODB_URI;
  if (resolved === undefined || resolved.trim().length === 0) {
    throw new Error("MONGODB_URI is required.");
  }
  return resolved;
}

export function getDatabaseName(name?: string): string {
  return name ?? process.env.MONGODB_DB ?? "agrorende";
}

export async function getClient(uri?: string): Promise<MongoClient> {
  const resolvedUri = resolveUri(uri);
  if (clientPromise !== null && currentUri === resolvedUri) {
    return clientPromise;
  }

  currentUri = resolvedUri;
  clientPromise = MongoClient.connect(resolvedUri, {
    appName: "agrorende-db",
    retryReads: true,
    retryWrites: true,
  }).then((client) => {
    clientInstance = client;
    return client;
  });

  return clientPromise;
}

export async function getDb(name?: string): Promise<Db> {
  const client = await getClient();
  return client.db(getDatabaseName(name));
}

export async function closeClient(): Promise<void> {
  const client = clientInstance;
  clientPromise = null;
  clientInstance = null;
  currentUri = null;
  if (client !== null) {
    await client.close();
  }
}
