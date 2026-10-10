/** JSON value as emitted into a Lottie (bodymovin) document. */
export type JsonValue = number | string | boolean | null | JsonValue[] | JsonObject;

export interface JsonObject {
  [key: string]: JsonValue;
}

/**
 * Minimal structural type of a Lottie (bodymovin 5.7+) document. Players need more fields
 * than this, but these are the ones the package and its consumers rely on.
 */
export type LottieJson = {
  v: string;
  fr: number;
  ip: number;
  op: number;
  w: number;
  h: number;
  layers: unknown[];
  [k: string]: unknown;
};
