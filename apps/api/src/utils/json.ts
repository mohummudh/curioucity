export const extractJsonObject = <T>(raw: string): T | null => {
  const trimmed = raw.trim();

  try {
    return JSON.parse(trimmed) as T;
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) {
      return null;
    }

    try {
      return JSON.parse(trimmed.slice(start, end + 1)) as T;
    } catch {
      return null;
    }
  }
};
