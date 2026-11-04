import { isRecord } from "../contexts/nestedParsers";

function setPath(
  data: unknown,
  path: string[],
  value: unknown,
): Record<string, unknown> {
  const [key, ...rest] = path;
  const node = isRecord(data)
    ? data
    : Array.isArray(data)
      ? Object.fromEntries(Object.entries(data))
      : {};
  if (key === undefined) return node;
  return {
    ...node,
    [key]: rest.length ? setPath(node[key], rest, value) : value,
  };
}

// Transactions replace a node. Apply only the command's audited update paths
// to the raw node, so parsing never becomes an incidental data migration.
export function applyStateDiff(
  raw: unknown,
  diff: Record<string, unknown>,
): Record<string, unknown> {
  let result = isRecord(raw) ? raw : {};
  for (const [path, value] of Object.entries(diff)) {
    if (value !== undefined) result = setPath(result, path.split("/"), value);
  }
  return result;
}
