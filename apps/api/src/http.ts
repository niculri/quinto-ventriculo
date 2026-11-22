// What the routes share to answer: the error body, the JSON content type and how long an image is kept.
import type { ApiError } from '@qv/schema';
import type { ErrorCode } from '@qv/schema/http';

export const apiError = (code: ErrorCode, message: string): ApiError => ({ error: code, message });

export const JSON_TYPE = { 'Content-Type': 'application/json; charset=UTF-8' };

/** Short, so that an image taken off the site stops showing soon. */
export const MEDIA_MAX_AGE = 600;
