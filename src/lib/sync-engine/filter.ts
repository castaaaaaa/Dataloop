/**
 * Filter evaluator for source/destination records
 * Evaluates filter groups (AND / OR) with up to 5 conditions
 */

import { FilterGroup, FilterCondition } from './types';

export function evaluateCondition(
  recordValues: Record<string, unknown>,
  condition: FilterCondition
): boolean {
  const rawValue = recordValues[condition.field];
  const strVal = rawValue !== null && rawValue !== undefined ? String(rawValue).trim() : '';
  const targetStr = String(condition.value).trim();

  switch (condition.operator) {
    case 'equals':
      return strVal.toLowerCase() === targetStr.toLowerCase();

    case 'not_equals':
      return strVal.toLowerCase() !== targetStr.toLowerCase();

    case 'contains':
      return strVal.toLowerCase().includes(targetStr.toLowerCase());

    case 'not_contains':
      return !strVal.toLowerCase().includes(targetStr.toLowerCase());

    case 'is_empty':
      return rawValue === null || rawValue === undefined || strVal === '';

    case 'is_not_empty':
      return rawValue !== null && rawValue !== undefined && strVal !== '';

    case 'greater_than': {
      const numA = typeof rawValue === 'number' ? rawValue : parseFloat(strVal);
      const numB = typeof condition.value === 'number' ? condition.value : parseFloat(targetStr);
      if (isNaN(numA) || isNaN(numB)) return false;
      return numA > numB;
    }

    case 'less_than': {
      const numA = typeof rawValue === 'number' ? rawValue : parseFloat(strVal);
      const numB = typeof condition.value === 'number' ? condition.value : parseFloat(targetStr);
      if (isNaN(numA) || isNaN(numB)) return false;
      return numA < numB;
    }

    default:
      return true;
  }
}

export function evaluateFilterGroup(
  recordValues: Record<string, unknown>,
  group?: FilterGroup
): boolean {
  if (!group || !group.conditions || group.conditions.length === 0) {
    return true;
  }

  if (group.logic === 'AND') {
    return group.conditions.every((c) => evaluateCondition(recordValues, c));
  } else {
    // OR logic
    return group.conditions.some((c) => evaluateCondition(recordValues, c));
  }
}
