import { ReplitConnectors } from '@replit/connectors-sdk';

type JsonRecord = Record<string, unknown>;

async function getUncachableRevenueCatClient() {
  // Keep management operations isolated from the app runtime and use a fresh
  // connector client so catalog mutations cannot be served from a stale cache.
  return new ReplitConnectors();
}

async function requestJson(
  client: ReplitConnectors,
  path: string,
  init?: { method?: string; body?: string },
): Promise<JsonRecord> {
  const response = await client.proxy('revenuecat', path, {
    method: init?.method ?? 'GET',
    headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
    body: init?.body,
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`RevenueCat ${response.status} for ${path}: ${body}`);
  return body ? JSON.parse(body) as JsonRecord : {};
}

async function main() {
  const projectId = process.env.REVENUECAT_PROJECT_ID?.trim();
  if (!projectId) throw new Error('REVENUECAT_PROJECT_ID is not configured');

  const client = await getUncachableRevenueCatClient();
  const [apps, products, offerings] = await Promise.all([
    requestJson(client, `/v2/projects/${projectId}/apps?limit=100`),
    requestJson(client, `/v2/projects/${projectId}/products?limit=100`),
    requestJson(client, `/v2/projects/${projectId}/offerings?limit=100`),
  ]);

  const appStore = (Array.isArray(apps.items) ? apps.items as JsonRecord[] : [])
    .find((app) => app.type === 'app_store');
  const testStore = (Array.isArray(apps.items) ? apps.items as JsonRecord[] : [])
    .find((app) => app.type === 'test_store');
  if (!appStore?.id || !testStore?.id) {
    throw new Error('The RevenueCat project must have both App Store and Test Store apps');
  }

  const allProducts = Array.isArray(products.items) ? products.items as JsonRecord[] : [];
  const productFor = (appId: string, storeIdentifier: string) => allProducts.find(
    (product) => product.app_id === appId && product.store_identifier === storeIdentifier,
  );

  const currentOffering = (Array.isArray(offerings.items) ? offerings.items as JsonRecord[] : [])
    .find((offering) => offering.is_current === true)
    ?? (Array.isArray(offerings.items) ? offerings.items[0] as JsonRecord | undefined : undefined);
  if (!currentOffering?.id) throw new Error('The RevenueCat project has no offering');

  const packages = await requestJson(
    client,
    `/v2/projects/${projectId}/offerings/${currentOffering.id}/packages?limit=100`,
  );
  const packageItems = Array.isArray(packages.items) ? packages.items as JsonRecord[] : [];

  const targets = [
    {
      lookupKey: '$rc_monthly',
      appStoreIdentifier: 'vigil_unlimited_monthly',
      testStoreIdentifier: 'vigil_unlimited_monthly',
    },
    {
      lookupKey: '$rc_annual',
      appStoreIdentifier: 'vigil_unlimited_yearly',
      testStoreIdentifier: 'vigil_unlimited_yearly',
    },
  ];

  for (const target of targets) {
    const packageItem = packageItems.find((item) => item.lookup_key === target.lookupKey);
    if (!packageItem?.id) throw new Error(`Missing ${target.lookupKey} package`);
    const desiredProducts = [
      productFor(appStore.id as string, target.appStoreIdentifier),
      productFor(testStore.id as string, target.testStoreIdentifier),
    ];
    if (desiredProducts.some((product) => !product?.id)) {
      throw new Error(`Missing package products for ${target.lookupKey}`);
    }

    const attached = await requestJson(
      client,
      `/v2/projects/${projectId}/packages/${packageItem.id}/products?limit=100`,
    );
    const attachedProducts = Array.isArray(attached.items) ? attached.items as JsonRecord[] : [];
    const attachedProductItems = attachedProducts
      .map((item) => item.product)
      .filter((product): product is JsonRecord => Boolean(product && typeof product === 'object'));

    const desiredProductByAppId = new Map(
      desiredProducts.map((product) => [product?.app_id, product?.id]),
    );
    const staleProductIds = attachedProductItems
      .filter((product) => desiredProductByAppId.get(product.app_id) !== product.id)
      .map((product) => product.id)
      .filter((id): id is string => typeof id === 'string');
    if (staleProductIds.length) {
      await requestJson(
        client,
        `/v2/projects/${projectId}/packages/${packageItem.id}/actions/detach_products`,
        {
          method: 'POST',
          body: JSON.stringify({ product_ids: staleProductIds }),
        },
      );
    }

    const attachedProductIds = new Set(
      attachedProductItems
        .filter((product) => !staleProductIds.includes(product.id as string))
        .map((product) => product.id),
    );
    const missingProducts = desiredProducts.filter((product): product is JsonRecord => {
      if (!product?.id) return false;
      return !attachedProductIds.has(product.id);
    });
    if (missingProducts.length) {
      await requestJson(
        client,
        `/v2/projects/${projectId}/packages/${packageItem.id}/actions/attach_products`,
        {
          method: 'POST',
          body: JSON.stringify({
            products: missingProducts.map((product) => ({
              product_id: product.id,
              eligibility_criteria: 'all',
            })),
          }),
        },
      );
    }

    console.log(`${target.lookupKey}: App Store ${target.appStoreIdentifier} + Test Store ${target.testStoreIdentifier}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});