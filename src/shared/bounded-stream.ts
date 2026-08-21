interface BoundedStreamSuccess {
  ok: true;
  buffer: Buffer;
}

interface BoundedStreamTooLarge {
  ok: false;
  tooLarge: true;
}

export async function collectBoundedStream(
  stream: NodeJS.ReadableStream,
  maxBytes: number,
): Promise<BoundedStreamSuccess | BoundedStreamTooLarge> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let tooLarge = false;

    stream.on('data', (value: Buffer | string) => {
      const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value);
      size += chunk.length;
      if (size > maxBytes) {
        tooLarge = true;
        chunks.length = 0;
        return;
      }
      if (!tooLarge) chunks.push(chunk);
    });
    stream.on('end', () => {
      resolve(tooLarge
        ? { ok: false, tooLarge: true }
        : { ok: true, buffer: Buffer.concat(chunks, size) });
    });
    stream.on('error', reject);
  });
}
