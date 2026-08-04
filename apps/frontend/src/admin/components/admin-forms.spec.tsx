import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { FormError, FormField, FormHint, FormLabel, TextInput, fieldA11y } from './AdminForms';
import { MultiSelect } from './MultiSelect';

describe('formularios administrativos', () => {
  it('asocia label, ayuda y error con el control', () => {
    const markup = renderToStaticMarkup(<FormField><FormLabel htmlFor="title" required>Titulo</FormLabel><TextInput id="title" {...fieldA11y('title', 'hint', 'El titulo es obligatorio.')} /><FormHint id="title-hint">Nombre visible.</FormHint><FormError id="title-error">El titulo es obligatorio.</FormError></FormField>);
    assert.match(markup, /for="title"/);
    assert.match(markup, /aria-describedby="title-hint title-error"/);
    assert.match(markup, /aria-invalid="true"/);
    assert.match(markup, /role="alert"/);
  });

  it('renderiza multiselect con combobox, chips y seleccion accesible', () => {
    const markup = renderToStaticMarkup(<MultiSelect id="genres" label="Generos" options={[{ value: 'action', label: 'Accion' }]} value={['action']} onChange={() => undefined} />);
    assert.match(markup, /role="combobox"/);
    assert.match(markup, /aria-expanded="false"/);
    assert.match(markup, /Quitar Accion/);
  });
});
