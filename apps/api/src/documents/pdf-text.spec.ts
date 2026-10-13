import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { extractPdfText } from './pdf-text.js';

const SAMPLES = resolve(import.meta.dirname, '../../../../sample-documents/datasheets');

describe('extractPdfText', () => {
  it('keeps a real data sheet readable: identity, property rows with units, handling', async () => {
    const pdf = new Uint8Array(await readFile(resolve(SAMPLES, 'FRT-TIM-GL28H_rev-A.pdf')));
    const before = pdf.slice();

    const text = await extractPdfText(pdf);
    const lines = text.split('\n');

    expect(lines).toContain('Glulam Beam GL28h 140 x 405');
    expect(text).toContain('DS-FRT-TIM-GL28H · Revision A');
    // One table row per line: property, value with unit, standard.
    expect(lines).toContain('Property Value Standard');
    expect(lines).toContain('Characteristic bending strength 28 MPa EN 14080');
    expect(lines).toContain('Characteristic density 425 kg/m³ EN 14080');
    expect(lines).toContain('Moisture content 12 % EN 14080');
    expect(text).toContain('Handling and storage\n- Store under cover, clear of the ground');
    expect(text).toContain('Revision history');

    // Normalised: no garbage characters, no "m3", no blank lines or doubled spaces.
    expect(text).not.toMatch(/kg\/m3|�| {2}|\n\n|^\s|\s$/);
    // The caller's bytes are still intact for storing the file.
    expect(pdf).toEqual(before);
  });

  it('keeps the middle dot and the superscript in the units of an insulation sheet', async () => {
    const pdf = new Uint8Array(await readFile(resolve(SAMPLES, 'FRT-INS-XPS050_rev-A.pdf')));

    const text = await extractPdfText(pdf);

    expect(text).toMatch(/Thermal conductivity [\d.]+ W\/m·K EN \d+/);
    expect(text).toMatch(/Density \d+ kg\/m³ EN \d+/);
  });
});
