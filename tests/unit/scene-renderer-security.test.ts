import { describe, expect, test } from 'vitest';
import {
  escapeGeneratedHtml,
  serializeInlineScriptValue,
} from '../../src/modules/scenes/scenes.renderer';

describe('generated scene HTML escaping', () => {
  test('meng-escape markup pada text dan attribute HTML', () => {
    const escaped = escapeGeneratedHtml('</title><script>alert("x")</script>');

    expect(escaped).not.toContain('<script>');
    expect(escaped).not.toContain('</title>');
    expect(escaped).toContain('&lt;script&gt;');
    expect(escaped).toContain('&quot;x&quot;');
  });

  test('serialisasi inline script tidak dapat menutup elemen script', () => {
    const serialized = serializeInlineScriptValue('</script><script>alert(1)</script>');

    expect(serialized).not.toContain('</script>');
    expect(serialized).toContain('\\u003c/script\\u003e');
  });
});
