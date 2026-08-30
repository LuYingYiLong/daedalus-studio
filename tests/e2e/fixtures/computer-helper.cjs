// Fake native process: exercises real framing and Main supervision, never enumerates Windows.
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
let buffer = Buffer.alloc(0), selected = false, sequence = 0;
process.stdin.on('data', chunk => {
  buffer = Buffer.concat([buffer, chunk]);
  while (buffer.length >= 4 && buffer.length >= buffer.readUInt32LE(0) + 4) {
    const size = buffer.readUInt32LE(0), request = JSON.parse(buffer.subarray(4, 4 + size)); buffer = buffer.subarray(4 + size);
    let result;
    if (request.method === 'list') result = { sources: [{ sourceId: 'fixture-window', title: 'Local perception fixture' }] };
    else if (request.method === 'select') { selected = true; result = { title: 'Local perception fixture' }; }
    else if (request.method === 'validate') result = { valid: selected };
    else if (request.method === 'observe') result = { observationId: `observation-${++sequence}`, capturedAt: '2026-08-30T00:00:00.000Z', uiaCapturedAt: '2026-08-30T00:00:00.000Z', screenBounds: { x: -200, y: 20, width: 1, height: 1 }, width: 1, height: 1, dpi: 144, nodes: [{ id: 'node-1', parentId: null, name: 'Fixture button', automationId: 'fixture', controlType: 'Button', enabled: true, password: false, bounds: { x: 0, y: 0, width: 1, height: 1 } }], texts: [{ id: 'text-1', text: '本地 OCR fixture', confidence: .99, bounds: { x: 0, y: 0, width: 1, height: 1 } }], truncated: false, durationMs: 10, dataUrl: PNG };
    else throw new Error('unexpected_fixture_method');
    const bytes = Buffer.from(JSON.stringify({ version: 1, id: request.id, ok: true, result })); const header = Buffer.alloc(4); header.writeUInt32LE(bytes.length); process.stdout.write(Buffer.concat([header, bytes]));
  }
});
