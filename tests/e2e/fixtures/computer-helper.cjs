// Fake native process: exercises real framing and Main supervision, never enumerates Windows.
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
let buffer = Buffer.alloc(0), selected = false, sequence = 0, starts = 0;
process.stdin.on('data', chunk => {
  buffer = Buffer.concat([buffer, chunk]);
  while (buffer.length >= 4 && buffer.length >= buffer.readUInt32LE(0) + 4) {
    const size = buffer.readUInt32LE(0), request = JSON.parse(buffer.subarray(4, 4 + size)); buffer = buffer.subarray(4 + size);
    let result;
    if (request.method === 'hello') result = { version: 3, computerControl: true, inputTransports: ["uia", "keyboard"] };
    else if (request.method === 'list') result = { sources: [{ sourceId: 'fixture-window', title: 'Local perception fixture' }] };
    else if (request.method === 'select') { selected = true; result = { title: 'Local perception fixture' }; }
    else if (request.method === 'control.start' && ++starts === 1 && process.env.COMPUTER_FIXTURE_FAIL_ACTIVATION === '1') result = { active: false, code: 'computer_activation_required' };
    else if (request.method.startsWith('control.')) result = { active: true };
    else if (request.method === 'target') result = { screenBounds: { x: 100, y: 100, width: 800, height: 600 } };
    else if (request.method === 'action') {
      const type = request.params.action.type;
      if (type === 'click' || type === 'scroll') throw new Error('coordinate_input_must_not_reach_helper');
      const progress = { version: 3, event: 'control', state: { event: 'progress', code: 'computer_progress', actionId: request.params.actionId, generation: request.params.generation, x: -200, y: 20, phase: 'semantic' } };
      const bytes = Buffer.from(JSON.stringify(progress)); const header = Buffer.alloc(4); header.writeUInt32LE(bytes.length);
      if (!['text', 'key'].includes(type)) process.stdout.write(Buffer.concat([header, bytes]));
      result = { actionId: request.params.actionId, observationId: request.params.observationId, generation: request.params.generation, status: 'dispatched', transport: type.startsWith('uia_') ? 'uia' : 'keyboard', dispatchedAt: new Date().toISOString() };
    }
    else if (request.method === 'validate') result = { valid: selected };
    else if (request.method === 'observe') result = { observationId: `observation-${++sequence}`, capturedAt: '2026-08-30T00:00:00.000Z', uiaCapturedAt: '2026-08-30T00:00:00.000Z', screenBounds: { x: -200, y: 20, width: 1, height: 1 }, width: 1, height: 1, dpi: 144, nodes: [{ id: 'node-1', parentId: null, name: 'Fixture button', automationId: 'fixture', controlType: 'Button', enabled: true, password: false, supportedActions: ['uia_invoke', 'uia_set_value'], bounds: { x: 0, y: 0, width: 1, height: 1 } }], texts: [{ id: 'text-1', text: '本地 OCR fixture', confidence: .99, bounds: { x: 0, y: 0, width: 1, height: 1 } }], truncated: false, durationMs: 10, dataUrl: PNG };
    else throw new Error('unexpected_fixture_method');
    const bytes = Buffer.from(JSON.stringify({ version: 3, id: request.id, ok: true, result })); const header = Buffer.alloc(4); header.writeUInt32LE(bytes.length);
    const send = () => process.stdout.write(Buffer.concat([header, bytes]));
    if (request.method === 'control.start' && process.env.COMPUTER_FIXTURE_START_DELAY_MS) setTimeout(send, Number(process.env.COMPUTER_FIXTURE_START_DELAY_MS));
    else if (request.method === 'observe' && process.env.COMPUTER_FIXTURE_OBSERVE_DELAY_MS) setTimeout(send, Number(process.env.COMPUTER_FIXTURE_OBSERVE_DELAY_MS));
    else send();
  }
});
