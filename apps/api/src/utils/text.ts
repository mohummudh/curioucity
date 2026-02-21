export const clamp = (value: number, min: number, max: number): number => {
  if (value < min) return min;
  if (value > max) return max;
  return value;
};

export const sanitizeForLogs = (text: string): string => {
  return text.replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, "[redacted-email]").replace(/\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g, "[redacted-phone]");
};
