import type { TokenSource } from './auth.ts';

const API_BASE = 'https://firestore.googleapis.com/v1';
const TIMEOUT_MS = 5_000;

export type DocSnapshot<T> = {
  data: T | null;
  /** Server timestamp used as the optimistic-concurrency token on the next write. */
  updateTime: string | null;
};

export type Firestore = {
  get<T>(collection: string, id: string): Promise<DocSnapshot<T>>;
  /** Resolves false when someone else wrote first, so the caller can retry. */
  set(
    collection: string,
    id: string,
    data: Record<string, unknown>,
    expectedUpdateTime: string | null,
  ): Promise<boolean>;
};

/**
 * Firestore's REST API wraps every value in a type tag. These two functions are the whole
 * translation between that shape and plain JavaScript objects.
 */
export function encodeValue(value: unknown): unknown {
  if (value === null || value === undefined) {
    return { nullValue: null };
  }

  if (typeof value === 'string') {
    return { stringValue: value };
  }

  if (typeof value === 'boolean') {
    return { booleanValue: value };
  }

  if (typeof value === 'number') {
    // Integers must travel as strings: JSON numbers lose precision past 2^53 and
    // Firestore distinguishes integers from doubles.
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  }

  if (Array.isArray(value)) {
    return { arrayValue: { values: value.map(encodeValue) } };
  }

  if (typeof value === 'object') {
    return { mapValue: { fields: encodeFields(value as Record<string, unknown>) } };
  }

  throw new TypeError(`Cannot store a value of type ${typeof value} in Firestore`);
}

export function encodeFields(data: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(data).map(([key, value]) => [key, encodeValue(value)]));
}

export function decodeValue(value: Record<string, unknown>): unknown {
  if ('nullValue' in value) {
    return null;
  }

  if ('stringValue' in value) {
    return value.stringValue;
  }

  if ('booleanValue' in value) {
    return value.booleanValue;
  }

  if ('integerValue' in value) {
    return Number(value.integerValue);
  }

  if ('doubleValue' in value) {
    return value.doubleValue;
  }

  if ('timestampValue' in value) {
    return value.timestampValue;
  }

  if ('arrayValue' in value) {
    const values = (value.arrayValue as { values?: Record<string, unknown>[] }).values ?? [];

    return values.map(decodeValue);
  }

  if ('mapValue' in value) {
    const fields = (value.mapValue as { fields?: Record<string, Record<string, unknown>> }).fields;

    return decodeFields(fields ?? {});
  }

  throw new TypeError(`Unsupported Firestore value: ${JSON.stringify(value)}`);
}

export function decodeFields(fields: Record<string, Record<string, unknown>>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, decodeValue(value)]));
}

function isPreconditionFailure(status: number, body: string): boolean {
  return (
    status === 409 ||
    status === 412 ||
    body.includes('FAILED_PRECONDITION') ||
    body.includes('ABORTED') ||
    // Creating a document that already exists.
    body.includes('ALREADY_EXISTS')
  );
}

export function createFirestore(projectId: string, getToken: TokenSource): Firestore {
  const documentUrl = (collection: string, id: string): string =>
    `${API_BASE}/projects/${projectId}/databases/(default)/documents/${collection}/${id}`;

  return {
    async get<T>(collection: string, id: string): Promise<DocSnapshot<T>> {
      const response = await fetch(documentUrl(collection, id), {
        headers: { Authorization: `Bearer ${await getToken()}` },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });

      // A channel that has never run a rotation simply has no document yet.
      if (response.status === 404) {
        return { data: null, updateTime: null };
      }

      if (!response.ok) {
        throw new Error(`Firestore get failed: ${response.status} ${await response.text()}`);
      }

      const document = (await response.json()) as {
        fields?: Record<string, Record<string, unknown>>;
        updateTime?: string;
      };

      return {
        data: decodeFields(document.fields ?? {}) as T,
        updateTime: document.updateTime ?? null,
      };
    },

    async set(collection, id, data, expectedUpdateTime) {
      const params = new URLSearchParams();
      for (const key of Object.keys(data)) {
        params.append('updateMask.fieldPaths', key);
      }

      // Either the document is untouched since we read it, or it must not exist at all.
      if (expectedUpdateTime === null) {
        params.append('currentDocument.exists', 'false');
      } else {
        params.append('currentDocument.updateTime', expectedUpdateTime);
      }

      const response = await fetch(`${documentUrl(collection, id)}?${params.toString()}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${await getToken()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ fields: encodeFields(data) }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });

      if (response.ok) {
        return true;
      }

      const body = await response.text().catch(() => '');
      if (isPreconditionFailure(response.status, body)) {
        return false;
      }

      throw new Error(`Firestore set failed: ${response.status} ${body.slice(0, 300)}`);
    },
  };
}
