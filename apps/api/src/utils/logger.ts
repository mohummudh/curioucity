const stamp = (): string => new Date().toISOString();

export const logger = {
  info: (message: string, meta?: unknown) => {
    if (meta === undefined) {
      console.log(`[${stamp()}] INFO ${message}`);
      return;
    }

    console.log(`[${stamp()}] INFO ${message}`, meta);
  },
  warn: (message: string, meta?: unknown) => {
    if (meta === undefined) {
      console.warn(`[${stamp()}] WARN ${message}`);
      return;
    }

    console.warn(`[${stamp()}] WARN ${message}`, meta);
  },
  error: (message: string, meta?: unknown) => {
    if (meta === undefined) {
      console.error(`[${stamp()}] ERROR ${message}`);
      return;
    }

    console.error(`[${stamp()}] ERROR ${message}`, meta);
  },
};
