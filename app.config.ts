import type { ConfigContext, ExpoConfig } from "expo/config";

type AppEnvironment = "local" | "demo" | "prod";

function resolveAppEnvironment(value: string | undefined): AppEnvironment {
  const environment = value ?? "prod";
  if (
    environment === "local" ||
    environment === "demo" ||
    environment === "prod"
  ) {
    return environment;
  }

  throw new Error(
    `[app.config] Unsupported APP_ENV "${environment}". Use "local", "demo", or "prod".`,
  );
}

function requireConfigValue(value: string | undefined, key: string): string {
  if (value) return value;
  throw new Error(`[app.config] Missing production ${key} in app.json.`);
}

export default ({ config }: ConfigContext): ExpoConfig => {
  const environment = resolveAppEnvironment(process.env.APP_ENV);
  const isDemo = environment !== "prod";
  const productionName = requireConfigValue(config.name, "name");
  const slug = requireConfigValue(config.slug, "slug");
  const productionScheme = requireConfigValue(
    typeof config.scheme === "string" ? config.scheme : config.scheme?.[0],
    "scheme",
  );
  const productionBundleIdentifier = requireConfigValue(
    config.ios?.bundleIdentifier,
    "ios.bundleIdentifier",
  );
  const productionPackage = requireConfigValue(
    config.android?.package,
    "android.package",
  );
  const projectId = (
    config.extra?.eas as { projectId?: string } | undefined
  )?.projectId;

  if (!projectId) {
    throw new Error("[app.config] Missing extra.eas.projectId in app.json.");
  }

  const runtimeVersion = isDemo
    ? `${config.version ?? "1.0.0"}-demo`
    : (config.version ?? "1.0.0");

  return {
    ...config,
    name: isDemo ? `${productionName} Demo` : productionName,
    slug,
    scheme: isDemo ? `${productionScheme}-demo` : productionScheme,
    ios: {
      ...config.ios,
      bundleIdentifier: isDemo
        ? `${productionBundleIdentifier}.demo`
        : productionBundleIdentifier,
    },
    android: {
      ...config.android,
      package: isDemo ? `${productionPackage}.demo` : productionPackage,
      googleServicesFile: isDemo
        ? process.env.GOOGLE_SERVICES_JSON
        : config.android?.googleServicesFile,
    },
    extra: {
      ...config.extra,
      appEnvironment: environment,
    },
    updates: {
      ...config.updates,
      url: `https://u.expo.dev/${projectId}`,
    },
    runtimeVersion,
  };
};
