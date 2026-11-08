/**
 * Pure field transformations engine
 * Implements Section 7.3 fixed transformation list
 */

import { TransformConfig } from './types';

export function applyTransformation(
  value: unknown,
  recordValues: Record<string, unknown>,
  config?: TransformConfig
): unknown {
  if (!config) return value;

  const { type, params = {} } = config;

  switch (type) {
    case 'default_value': {
      if (value === null || value === undefined || value === '') {
        return params.defaultValue !== undefined ? params.defaultValue : '';
      }
      return value;
    }

    case 'trim_whitespace': {
      if (typeof value === 'string') {
        return value.trim();
      }
      return value;
    }

    case 'lowercase': {
      if (typeof value === 'string') {
        return value.toLowerCase();
      }
      return value;
    }

    case 'uppercase': {
      if (typeof value === 'string') {
        return value.toUpperCase();
      }
      return value;
    }

    case 'text_to_number': {
      if (typeof value === 'number') return value;
      if (typeof value === 'string') {
        const cleaned = value.replace(/[^0-9.-]/g, '');
        const parsed = parseFloat(cleaned);
        return isNaN(parsed) ? 0 : parsed;
      }
      return 0;
    }

    case 'number_to_currency': {
      const num = typeof value === 'number' ? value : parseFloat(String(value).replace(/[^0-9.-]/g, ''));
      if (isNaN(num)) return '$0.00';
      const symbol = params.currencySymbol || '$';
      return `${symbol}${num.toFixed(2)}`;
    }

    case 'date_format': {
      if (!value) return '';
      const date = new Date(String(value));
      if (isNaN(date.getTime())) return String(value);

      const target = params.toFormat || 'YYYY-MM-DD';
      const year = date.getUTCFullYear();
      const month = String(date.getUTCMonth() + 1).padStart(2, '0');
      const day = String(date.getUTCDate()).padStart(2, '0');

      if (target === 'YYYY-MM-DD') return `${year}-${month}-${day}`;
      if (target === 'MM/DD/YYYY') return `${month}/${day}/${year}`;
      if (target === 'DD/MM/YYYY') return `${day}/${month}/${year}`;
      if (target === 'ISO') return date.toISOString();
      return `${year}-${month}-${day}`;
    }

    case 'split_name': {
      const str = String(value || '').trim();
      const parts = str.split(/\s+/);
      if (params.targetPart === 'last') {
        return parts.length > 1 ? parts.slice(1).join(' ') : '';
      }
      // default is first name
      return parts[0] || '';
    }

    case 'combine_fields': {
      const first = String(value || '').trim();
      const secondaryVal = params.secondaryField ? recordValues[params.secondaryField] : '';
      const second = String(secondaryVal || '').trim();
      const sep = params.separator !== undefined ? params.separator : ' ';
      if (!first && !second) return '';
      if (!first) return second;
      if (!second) return first;
      return `${first}${sep}${second}`;
    }

    case 'map_select_values': {
      const strVal = String(value || '').trim();
      const map = params.valueMap || {};
      if (strVal in map) {
        return map[strVal];
      }
      // Case-insensitive lookup fallback
      const lower = strVal.toLowerCase();
      for (const [k, v] of Object.entries(map)) {
        if (k.toLowerCase() === lower) {
          return v;
        }
      }
      return params.fallbackValue !== undefined ? params.fallbackValue : strVal;
    }

    default:
      return value;
  }
}
