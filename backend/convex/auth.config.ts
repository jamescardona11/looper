// Convex Auth — `auth.config.ts` registra el deployment de Convex como
// JWT issuer del propio proyecto. Es el archivo que `auth.ts` lee al
// validar tokens.
//
// Los providers de aplicación (Password, Email, OAuth, Phone) NO van acá
// — viven en la config de `convexAuth({ providers: [...] })` en `auth.ts`.
//
// Ver https://labs.convex.dev/auth/setup#auth-config-file
//
// Excepción al patrón centralizado de env (NO importar `./env` acá): Convex
// analiza estáticamente este archivo y exige que TODA `process.env.X` accedida
// esté seteada en el deployment. El `createEnv` de t3env lee de forma eager
// cada key del schema, así que importar `./env` forzaría a setear las 20 vars.
// Por eso leemos `CONVEX_SITE_URL` directo — Convex la provee automáticamente.

export default {
  providers: [
    {
      domain: process.env.CONVEX_SITE_URL,
      applicationID: "convex",
    },
  ],
};
