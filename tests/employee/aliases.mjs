import * as moduleApi from 'node:module';
const hooks = { resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('@/')) {
    const path = specifier.slice(2);
    return nextResolve(new URL(`../../${path}${path.endsWith('.js') ? '' : '.js'}`, import.meta.url).href, context);
  }
  return nextResolve(specifier, context);
} };
if (typeof moduleApi.registerHooks === 'function') moduleApi.registerHooks(hooks);
else moduleApi.register(new URL('./aliases-loader.mjs', import.meta.url), import.meta.url);
