import { ToolExecutionError } from './toolErrors.js';

function fail(path: string): never { throw new ToolExecutionError('invalid_request', 400, `Invalid tool input at ${path}`); }

function validate(schema: any, value: any, path: string): void {
  if (value === null) { if (!schema?.nullable) fail(path); return; }
  if (schema?.enum && !schema.enum.includes(value)) fail(path);
  if (schema?.type === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) fail(path);
    for (const key of schema.required || []) if (!(key in value)) fail(`${path}.${key}`);
    if (schema.additionalProperties === false) for (const key of Object.keys(value)) if (!schema.properties?.[key]) fail(`${path}.${key}`);
    for (const [key, child] of Object.entries(schema.properties || {})) if (key in value) validate(child, value[key], `${path}.${key}`);
    return;
  }
  if (schema?.type === 'array') {
    if (!Array.isArray(value)) fail(path);
    if (schema.minItems !== undefined && value.length < schema.minItems) fail(path);
    if (schema.maxItems !== undefined && value.length > schema.maxItems) fail(path);
    value.forEach((item, index) => validate(schema.items, item, `${path}[${index}]`)); return;
  }
  if (schema?.type === 'string') {
    if (typeof value !== 'string') fail(path);
    if (schema.minLength !== undefined && value.length < schema.minLength) fail(path);
    if (schema.maxLength !== undefined && value.length > schema.maxLength) fail(path);
    return;
  }
  if (schema?.type === 'number' && (typeof value !== 'number' || !Number.isFinite(value))) fail(path);
  if (schema?.type === 'integer' && !Number.isInteger(value)) fail(path);
  if ((schema?.type === 'number' || schema?.type === 'integer') && schema.minimum !== undefined && value < schema.minimum) fail(path);
  if ((schema?.type === 'number' || schema?.type === 'integer') && schema.maximum !== undefined && value > schema.maximum) fail(path);
  if (schema?.type === 'boolean' && typeof value !== 'boolean') fail(path);
}

export function validateToolInput(schema: any, value: any): any { validate(schema, value, '$'); return value; }
