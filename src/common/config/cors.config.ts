export function createCorsOptions(frontendUrl: string | undefined) {
  const origin = frontendUrl?.trim();

  if (!origin) {
    throw new Error(
      'FRONTEND_URL ortam değişkeni tanımlanmalıdır. Örnek: http://localhost:3000',
    );
  }

  return {
    origin,
    credentials: true,
  };
}
