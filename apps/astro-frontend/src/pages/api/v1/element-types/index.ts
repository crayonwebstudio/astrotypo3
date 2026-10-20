import { readFile, writeFile, mkdir } from 'node:fs/promises';
import registry from '../../../../data/registry.json';
import { registryToElementTypes, createElementType, mergeElementTypes } from '../../../../lib/elementTypes.mjs';
// Demo implementation of the TYPO3 element types contract.
//
//   GET  /api/v1/element-types  core types from the shared registry plus
//                                types created through this endpoint
//   POST /api/v1/element-types  validate and register a new element type
//
// In production the TYPO3 extension serves the same contract
// (ElementTypeApiController + ElementTypeRegistry): core types come from the
// registry, created types are rows in tx_astrobuilder_element_type and are
// registered as real tt_content CTypes. Here, created types persist to a
// local JSON file (runtime data, gitignored) and every response is labelled
// demoMode. There is no authentication in the demo.

const storeFile = () => process.cwd() + '/data/element-types.json';
const memoryCustom: any[] = [];

async function loadCustomTypes(): Promise<any[]> {
  try {
    const parsed = JSON.parse(await readFile(storeFile(), 'utf8'));
    if (Array.isArray(parsed)) {
      memoryCustom.splice(0, memoryCustom.length, ...parsed);
    }
  } catch { /* no file yet: memory only */ }
  return memoryCustom;
}

async function persistCustomTypes(types: any[]) {
  try {
    await mkdir(process.cwd() + '/data', { recursive: true });
    await writeFile(storeFile(), JSON.stringify(types, null, 2));
    return true;
  } catch { return false; }
}

const json = (body: any, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

export const GET = async () => {
  const custom = await loadCustomTypes();
  const types = mergeElementTypes(registryToElementTypes(registry as any), custom);
  return json({ demoMode: true, notice: 'Demo element types store. In production TYPO3 serves this contract and registers created types as tt_content CTypes.', types });
};

export const POST = async ({ request }: any) => {
  let body: any = {};
  try { body = await request.json(); } catch { return json({ error: { code: 'invalid_json', message: 'Request body must be JSON.' } }, 400); }
  const custom = await loadCustomTypes();
  const existingIds = mergeElementTypes(registryToElementTypes(registry as any), custom).map((t: any) => t.id);
  const result = createElementType(body, existingIds);
  if (!result.valid || !result.type) {
    return json({ error: { code: 'validation_failed', message: 'The element type did not validate.', details: result.errors } }, 422);
  }
  custom.push(result.type);
  const fileSaved = await persistCustomTypes(custom);
  return json({ demoMode: true, fileSaved, notice: 'Demo mode: element type stored in the demo store only. In production TYPO3 registers it as CType ' + result.type.ctype + '.', type: result.type }, 201);
};
