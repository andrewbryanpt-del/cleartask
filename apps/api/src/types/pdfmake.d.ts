// pdfmake ships no TypeScript types for its server-side printer entry.
// Minimal declarations for the two pieces we use.

declare module "pdfmake" {
  interface FontDescriptor {
    normal?: string | Buffer;
    bold?: string | Buffer;
    italics?: string | Buffer;
    bolditalics?: string | Buffer;
  }
  class PdfPrinter {
    constructor(fonts: Record<string, FontDescriptor>);
    createPdfKitDocument(
      docDefinition: Record<string, unknown>,
      options?: Record<string, unknown>,
    ): NodeJS.ReadableStream & { end(): void };
  }
  export = PdfPrinter;
}

declare module "pdfmake/build/vfs_fonts.js" {
  // Map of font file name to base64-encoded TTF.
  const vfs: Record<string, string>;
  export = vfs;
}
