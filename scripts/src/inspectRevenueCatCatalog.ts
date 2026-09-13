import { ReplitConnectors } from '@replit/connectors-sdk';
import { readFile } from 'node:fs/promises';

type JsonRecord = Record<string, unknown>;

async function getUncachableRevenueCatClient() {
  // A fresh connector client is required for every standalone catalog operation.
  return new ReplitConnectors();
}

async function getJson(client: ReplitConnectors, path: string): Promise<JsonRecord> {
  const response = await client.proxy('revenuecat', path);
  const body = await response.text();
  if (!response.ok) throw new Error(`RevenueCat ${response.status} for ${path}`);
  return JSON.parse(body) as JsonRecord;
}

function items(response: JsonRecord): JsonRecord[] {
  return Array.isArray(response.items) ? response.items as JsonRecord[] : [];
}

function stringValue(record: JsonRecord, key: string): string | null {
  return typeof record[key] === 'string' ? record[key] : null;
}

function booleanValue(record: JsonRecord, key: string): boolean | null {
  return typeof record[key] === 'boolean' ? record[key] : null;
}

const SAFE_STORE_STATE_FIELD = /(?:state|status|warning|message|error|available|offer|trial|intro|title|display_name)/i;
const US_TERRITORY_PRICE_PATH = /(?:^|\.)territory_prices\.US(?:\.|$)/;

function safeStoreStateValues(value: unknown, path = ''): Record<string, string | number | boolean | null> {
  const result: Record<string, string | number | boolean | null> = {};
  if (!value || typeof value !== 'object') return result;
  if (Array.isArray(value)) {
    value.forEach((item, index) => Object.assign(result, safeStoreStateValues(item, `${path}[${index}]`)));
    return result;
  }
  const record = value as JsonRecord;
  for (const [key, child] of Object.entries(record)) {
    const childPath = path ? `${path}.${key}` : key;
    if ((SAFE_STORE_STATE_FIELD.test(key) || US_TERRITORY_PRICE_PATH.test(childPath)) && (
      typeof child === 'string'
      || typeof child === 'number'
      || typeof child === 'boolean'
      || child === null
    )) {
      result[childPath] = child;
    } else if (child && typeof child === 'object' && !Array.isArray(child)) {
      Object.assign(result, safeStoreStateValues(child, childPath));
    }
  }
  return result;
}

function storeStateSummary(state: JsonRecord) {
  const safeValues = safeStoreStateValues(state);
  const paths = Object.keys(safeValues);
  return {
    response_fields: Object.keys(state).sort(),
    // Retains the actual nested status, warning, price, and offer paths while
    // excluding credentials and raw API bodies.
    safe_store_values: safeValues,
    price_paths: paths.filter((path) => US_TERRITORY_PRICE_PATH.test(path)),
    offer_paths: paths.filter((path) => /(?:trial|intro|offer)/i.test(path)),
  };
}

function attachedProductIdentifiers(response: JsonRecord): string[] {
  return items(response)
    .map((attachment) => (
      attachment.product && typeof attachment.product === 'object'
        ? attachment.product as JsonRecord
        : attachment
    ))
    .map((product) => {
      const identifier = stringValue(product, 'store_identifier');
      const appId = stringValue(product, 'app_id');
      const productId = stringValue(product, 'id');
      return identifier
        ? `${identifier} [${appId ?? 'unknown-app'}:${productId ?? 'unknown-product'}]`
        : null;
    })
    .filter((identifier): identifier is string => Boolean(identifier));
}

function appBundleIdentifier(app: JsonRecord): string | null {
  const direct = stringValue(app, 'bundle_id')
    ?? stringValue(app, 'bundle_identifier')
    ?? stringValue(app, 'bundleId');
  if (direct) return direct;
  for (const value of Object.values(app)) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
    const nested = value as JsonRecord;
    const bundleIdentifier = stringValue(nested, 'bundle_id')
      ?? stringValue(nested, 'bundle_identifier')
      ?? stringValue(nested, 'bundleId');
    if (bundleIdentifier) return bundleIdentifier;
  }
  return null;
}

async function main() {
  const projectId = process.env.REVENUECAT_PROJECT_ID?.trim();
  if (!projectId) throw new Error('REVENUECAT_PROJECT_ID is not configured');
  const appConfig = JSON.parse(
    await readFile(new URL('../../artifacts/vigil-spend/app.json', import.meta.url), 'utf8'),
  ) as { expo?: { ios?: { bundleIdentifier?: string } } };
  const expectedIosBundleIdentifier = appConfig.expo?.ios?.bundleIdentifier ?? null;

  const client = await getUncachableRevenueCatClient();
  const [apps, products, entitlements, offerings] = await Promise.all([
    getJson(client, `/v2/projects/${projectId}/apps?limit=100`),
    getJson(client, `/v2/projects/${projectId}/products?limit=100`),
    getJson(client, `/v2/projects/${projectId}/entitlements?limit=100`),
    getJson(client, `/v2/projects/${projectId}/offerings?limit=100`),
  ]);

  const appItems = items(apps);
  const offeringItems = items(offerings);
  const productItems = items(products);
  const appTypeById = new Map(
    appItems
      .filter((app) => typeof app.id === 'string')
      .map((app) => [app.id as string, stringValue(app, 'type')]),
  );
  const appStoreProductStates = await Promise.all(
    productItems
      .filter((product) => appTypeById.get(product.app_id as string) === 'app_store')
      .map(async (product) => ({
        store_identifier: product.store_identifier,
        store_state: storeStateSummary(
          await getJson(client, `/v2/projects/${projectId}/products/${product.id}/store_state`),
        ),
      })),
  );
  const offeringPackages = await Promise.all(
    offeringItems.map(async (offering) => ({
      offering: {
        id: offering.id,
        lookup_key: offering.lookup_key,
        display_name: offering.display_name,
        is_current: offering.is_current,
      },
      packages: await (async () => {
        const packages = await getJson(client, `/v2/projects/${projectId}/offerings/${offering.id}/packages?limit=100`);
        return Promise.all(items(packages).map(async (item) => {
          const packageProducts = await getJson(client, `/v2/projects/${projectId}/packages/${item.id}/products?limit=100`);
          return {
            lookup_key: item.lookup_key,
            product_identifiers: attachedProductIdentifiers(packageProducts),
          };
        }));
      })(),
    })),
  );

  const entitlementItems = items(entitlements);
  const entitlementProducts = await Promise.all(
    entitlementItems.map(async (entitlement) => ({
      lookup_key: entitlement.lookup_key,
      product_identifiers: attachedProductIdentifiers(
        await getJson(client, `/v2/projects/${projectId}/entitlements/${entitlement.id}/products?limit=100`),
      ),
    })),
  );

  console.log(JSON.stringify({
    // This is intentionally a catalog health summary; it never emits API keys,
    // connector credentials, or raw RevenueCat responses.
    apps: appItems.map((app) => ({
      type: app.type,
      response_fields: Object.keys(app).sort(),
      bundle_identifier: appBundleIdentifier(app),
    })),
    expected_ios_bundle_identifier: expectedIosBundleIdentifier,
    app_store_bundle_identifier_matches_app_config: appItems
      .filter((app) => app.type === 'app_store')
      .some((app) => (
        appBundleIdentifier(app)
      ) === expectedIosBundleIdentifier),
    products: productItems.map((product) => ({
      id: product.id,
      app_id: product.app_id,
      app_type: appTypeById.get(product.app_id as string) ?? null,
      store_identifier: product.store_identifier,
      type: product.type ?? null,
    })),
    offerings: offeringItems.map((offering) => ({
      id: offering.id,
      lookup_key: offering.lookup_key,
      display_name: offering.display_name,
      is_current: offering.is_current === true,
    })),
    current_offering_packages: offeringPackages
      .filter((item) => item.offering.is_current === true)
      .flatMap((item) => item.packages),
    entitlement_products: entitlementProducts,
    app_store_product_states: appStoreProductStates,
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});