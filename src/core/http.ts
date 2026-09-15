/** The transport shapes the app deals in, independent of Node's http module. */

export type HttpRequest = {
  method: string;
  path: string;
  headers: Record<string, string | undefined>;
  rawBody: string;
};

export type HttpResponse = {
  status: number;
  body?: unknown;
};
