// Declaração mínima do pngjs (MIT) para o lado TypeScript do bake (check.ts); evita depender de @types/pngjs.
declare module 'pngjs' {
  export class PNG {
    constructor(opts?: { width?: number; height?: number; colorType?: number; inputColorType?: number; bitDepth?: number });
    width: number;
    height: number;
    data: Buffer;
    static sync: {
      read(buf: Buffer): PNG;
      write(png: PNG, opts?: { colorType?: number; deflateLevel?: number }): Buffer;
    };
  }
}
