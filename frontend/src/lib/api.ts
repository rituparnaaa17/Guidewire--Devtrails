const RAW_API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL?.trim();

const API_BASE_URL = (RAW_API_BASE_URL && RAW_API_BASE_URL.length > 0
  ? RAW_API_BASE_URL
  : "http://localhost:5000").replace(/\/$/, "");

export const apiUrl = (path: string) => {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${API_BASE_URL}${normalizedPath}`;
};
