import { PlaneClause, PlaneFilterInput } from './plane.types';

const FIELDS = new Set([
  'project',
  'state',
  'state_group',
  'priority',
  'assignee',
  'label',
  'cycle',
  'module',
  'created',
  'updated',
  'target',
]);

const DATE_FIELDS = new Set(['created', 'updated', 'target']);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const SORT_FIELDS: Record<string, string> = {
  priority: 'priority',
  updated: 'updated',
  created: 'created',
  target: 'due',
  state: 'state',
  title: 'title',
  sequence: 'sequence',
};

export type ParsedPlaneQuery = {
  clauses: PlaneClause[];
  sort?: string;
};

export function parsePlaneQuery(source: string): { ok: true; value: ParsedPlaneQuery } | { ok: false; error: string } {
  const tokens = tokenize(source);
  if (!tokens.length) return { ok: false, error: 'The query is empty.' };

  const clauses: PlaneClause[] = [];
  let index = 0;

  while (index < tokens.length) {
    if (tokens[index].toUpperCase() === 'ORDER') {
      const sort = readOrder(tokens, index);
      if (sort.ok === false) return { ok: false, error: sort.error };
      if (sort.next !== tokens.length) {
        return { ok: false, error: 'The query has text after ORDER BY.' };
      }
      return { ok: true, value: { clauses, sort: sort.sort } };
    }
    if (clauses.length && tokens[index].toUpperCase() === 'AND') {
      index += 1;
      if (index >= tokens.length) return { ok: false, error: 'Expected a field after AND.' };
    } else if (clauses.length) {
      return { ok: false, error: `Expected AND before "${tokens[index]}".` };
    }

    const field = tokens[index];
    if (!FIELDS.has(field)) return { ok: false, error: `Unknown query field "${field}".` };
    index += 1;
    const opToken = tokens[index];
    if (opToken !== '=' && opToken !== '!=' && opToken?.toUpperCase() !== 'IN') {
      return { ok: false, error: 'Expected =, !=, or IN.' };
    }
    const op = opToken === '=' ? 'eq' : opToken === '!=' ? 'neq' : 'in';
    index += 1;
    const values = readValues(tokens, index, op === 'in');
    if (values.ok === false) return { ok: false, error: values.error };
    index = values.next;
    if (field === 'assignee' && values.values.some((value) => value.toLowerCase() === 'currentuser()')) {
      values.values = values.values.map((value) =>
        value.toLowerCase() === 'currentuser()' ? 'me' : value,
      );
    }
    if (DATE_FIELDS.has(field) && values.values.some((value) => !DATE_RE.test(value))) {
      return { ok: false, error: `Expected a YYYY-MM-DD date for ${field}.` };
    }
    clauses.push({
      field: field === 'state_group' ? 'stateGroup' : field,
      op,
      values: values.values,
    });
  }

  return { ok: true, value: { clauses } };
}

export function projectClauseAllows(
  clauses: PlaneClause[],
  projectId: string,
  identifier: string,
): boolean {
  const clause = clauses.find((item) => item.field === 'project');
  if (!clause) return true;
  const names = [projectId, identifier].filter(Boolean).map((value) => value.toLowerCase());
  const values = clause.values.map((value) => value.toLowerCase());
  const hit = values.some((value) => names.includes(value));
  if (clause.op === 'neq') return !hit;
  return hit;
}

export function queryToFilters(parsed: ParsedPlaneQuery, page?: number, limit?: number): PlaneFilterInput {
  return {
    clauses: parsed.clauses.filter((clause) => clause.field !== 'project'),
    sort: parsed.sort,
    page,
    limit,
  };
}

function tokenize(source: string): string[] {
  const tokens: string[] = [];
  const pattern = /"[^"]*"|'[^']*'|\(|\)|,|!=|=|[A-Za-z_][A-Za-z0-9_]*\(\)|[A-Za-z_][A-Za-z0-9_]*|\d{4}-\d{2}-\d{2}/g;
  for (const match of source.matchAll(pattern)) {
    const token = match[0];
    if (token === ',') continue;
    if ((token.startsWith('"') && token.endsWith('"')) || (token.startsWith("'") && token.endsWith("'"))) {
      tokens.push(token.slice(1, -1));
    } else {
      tokens.push(token);
    }
  }
  return tokens;
}

function readValues(
  tokens: string[],
  index: number,
  list: boolean,
): { ok: true; values: string[]; next: number } | { ok: false; error: string } {
  if (index >= tokens.length) return { ok: false, error: 'Expected a value.' };
  if (list && tokens[index] === '(') {
    const values: string[] = [];
    let cursor = index + 1;
    while (cursor < tokens.length && tokens[cursor] !== ')') {
      values.push(tokens[cursor]);
      cursor += 1;
    }
    if (tokens[cursor] !== ')') return { ok: false, error: 'Expected ) after the value list.' };
    if (!values.length) return { ok: false, error: 'Expected a value.' };
    return { ok: true, values, next: cursor + 1 };
  }
  return { ok: true, values: [tokens[index]], next: index + 1 };
}

function readOrder(
  tokens: string[],
  index: number,
): { ok: true; sort: string; next: number } | { ok: false; error: string } {
  const by = tokens[index + 1];
  const field = tokens[index + 2];
  const direction = tokens[index + 3];
  if (by?.toUpperCase() !== 'BY' || !field) return { ok: false, error: 'Expected ORDER BY and a field.' };
  const mapped = SORT_FIELDS[field.toLowerCase()];
  if (!mapped) return { ok: false, error: `Unknown ORDER BY field "${field}".` };
  const dir = direction?.toUpperCase() === 'ASC' ? 'asc' : 'desc';
  const next = direction && (direction.toUpperCase() === 'ASC' || direction.toUpperCase() === 'DESC')
    ? index + 4
    : index + 3;
  return { ok: true, sort: `${mapped}:${dir}`, next };
}
