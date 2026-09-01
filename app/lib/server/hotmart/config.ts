import "server-only";

export type HotmartEnvironment = "sandbox" | "production";

export type HotmartExternalConfig = {
  environment: HotmartEnvironment;
  oauthUrl: string;
  apiBaseUrl: string;
  clientId: string;
  clientSecret: string;
  basicAuthorization: string;
};

export class HotmartConfigurationError extends Error {}

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new HotmartConfigurationError(`HOTMART_CONFIGURATION_MISSING:${name}`);
  return value;
}

export function getHotmartEnvironment(): HotmartEnvironment {
  const environment = process.env.HOTMART_ENVIRONMENT?.trim().toLowerCase();
  if (environment !== "sandbox" && environment !== "production") throw new HotmartConfigurationError("HOTMART_ENVIRONMENT_INVALID");
  return environment;
}

export function getHotmartExternalConfig(): HotmartExternalConfig {
  const environment = getHotmartEnvironment();
  return {
    environment,
    oauthUrl: "https://api-sec-vlc.hotmart.com/security/oauth/token",
    apiBaseUrl: environment === "sandbox" ? "https://sandbox.hotmart.com" : "https://developers.hotmart.com",
    clientId: required("HOTMART_CLIENT_ID"),
    clientSecret: required("HOTMART_CLIENT_SECRET"),
    basicAuthorization: `Basic ${required("HOTMART_BASIC_TOKEN")}`,
  };
}

export function getHotmartApiBaseUrl() {
  return getHotmartEnvironment() === "sandbox" ? "https://sandbox.hotmart.com" : "https://developers.hotmart.com";
}

export function assertHotmartHomologationFinancialEnvironment() {
  if (getHotmartEnvironment() !== "sandbox") throw new HotmartConfigurationError("HOTMART_HOMOLOGATION_REQUIRES_SANDBOX");
}

export function getHotmartReadiness() {
  const environment = process.env.HOTMART_ENVIRONMENT?.trim().toLowerCase();
  return {
    hottok: Boolean(process.env.HOTMART_HOTTOK?.trim()),
    client_id: Boolean(process.env.HOTMART_CLIENT_ID?.trim()),
    client_secret: Boolean(process.env.HOTMART_CLIENT_SECRET?.trim()),
    basic_token: Boolean(process.env.HOTMART_BASIC_TOKEN?.trim()),
    environment: environment === "sandbox" || environment === "production" ? environment : null,
    resend: Boolean(process.env.RESEND_API_KEY?.trim()),
    registration_token_secret: Boolean(process.env.REGISTRATION_TOKEN_SECRET?.trim()),
  };
}
