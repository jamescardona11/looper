# Looper Mobile

Aplicación móvil React Native con Expo y Convex. La disponibilidad del dictado
depende de la plataforma: Android puede usar el modelo local cuando está
instalado; la extensión de teclado iOS utiliza el proveedor remoto porque no
puede leer el modelo privado de la aplicación host.

## Desarrollo

```sh
pnpm --filter @looper/mobile prebuild
pnpm --filter @looper/mobile ios
```

El teclado y el reconocimiento local contienen código nativo, por lo que requieren
un development build. Expo Go no los incluye.

Configura `EXPO_PUBLIC_CONVEX_URL` antes de abrir la app. El teclado recibe sólo
el refresh token de Convex y la configuración necesaria a través del almacén
compartido del sistema operativo; la app no lo muestra ni lo registra.
