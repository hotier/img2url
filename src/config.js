export const API_URL = '';
export const API_DOMAIN = '';

export const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY || '0x4AAAAAACasWM4vLebpu_B7';

const envApiUrl = import.meta.env.VITE_API_URL;
if (envApiUrl) {
  console.log('Using API URL from environment variable:', envApiUrl);
}
