// TypeScript declarations for the shared validator in validate.mjs.
// The implementation lives in validate.mjs so Node tests can import it without a build step.
export interface ValidationResult { valid: boolean; errors: string[] }
export declare const ALLOWED_OPS: string[];
export declare const FORBIDDEN_OPS: string[];
export declare function validatePage(page: unknown, registry: unknown): ValidationResult;
export declare function validateElement(element: unknown, registry: unknown, path?: string): string[];
export declare function validateTemplateSet(templates: unknown, registry: unknown): ValidationResult;
export declare function validateChangePlan(plan: unknown, registry: unknown, options?: { allowDestructive?: boolean }): ValidationResult;
