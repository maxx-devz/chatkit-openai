import { registerHooks } from 'node:module';
registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('@/')) {
    const path = specifier.slice(2);
    return nextResolve(new URL(`../../${path}${path.endsWith('.js') ? '' : '.js'}`, import.meta.url).href, context);
  }
  return nextResolve(specifier, context);
} });
