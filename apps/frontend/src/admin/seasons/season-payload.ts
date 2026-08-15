export type SeasonFormValues = {
  number: string;
  title: string;
  description: string;
  posterUrl: string;
  published: boolean;
};

export type CreateSeasonPayload = {
  seriesId: string;
  number?: number;
  title?: string;
  description: string;
  posterUrl?: string;
  published: boolean;
};

export type UpdateSeasonPayload = {
  number?: number;
  title?: string;
  description: string;
  posterUrl?: string;
  published: boolean;
};

function editableFields(form: SeasonFormValues): UpdateSeasonPayload {
  return {
    number: form.number ? Number(form.number) : undefined,
    title: form.title || undefined,
    description: form.description,
    posterUrl: form.posterUrl || undefined,
    published: form.published,
  };
}

export function buildCreateSeasonPayload(seriesId: string, form: SeasonFormValues): CreateSeasonPayload {
  return { seriesId, ...editableFields(form) };
}

export function buildUpdateSeasonPayload(form: SeasonFormValues): UpdateSeasonPayload {
  return editableFields(form);
}

export const createSeasonPath = '/admin/seasons';
export const updateSeasonPath = (seasonId: string) => `/admin/seasons/${seasonId}`;

export function seasonSaveErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'No se pudo guardar la temporada.';
}
