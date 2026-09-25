import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: { port: 5173, host: true },
  build: { target: 'es2022', outDir: 'dist', sourcemap: true, chunkSizeWarningLimit: 2000 },
  // Testes de simulação longa (paridade de missões, determinismo) levam 1–3 s; o limite folgado evita falsos negativos com a máquina carregada
  test: { include: ['tests/**/*.test.ts'], environment: 'node', testTimeout: 30_000 },
});
