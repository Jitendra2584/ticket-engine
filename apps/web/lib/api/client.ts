import axios from 'axios';

/**
 * Centralized Axios instance for all API requests.
 * Configured with the API base URL from environment variables.
 */
export const apiClient = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001',
  headers: { 'Content-Type': 'application/json' },
});

/**
 * SWR-compatible fetcher that extracts `.data` from the Axios response.
 */
export const fetcher = (url: string) =>
  apiClient.get(url).then((res) => res.data);
