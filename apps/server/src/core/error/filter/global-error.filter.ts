import { ArgumentsHost, Catch, ExceptionFilter, HttpException, InternalServerErrorException } from '@nestjs/common';
import * as _ from 'lodash';
import { Response } from 'express';
import { BusinessError } from '@shared/error/business.error';
import { Logger } from '../../logger/logger.service';
import { ErrorResponse } from '../dto/error.response';
import { FeathersError } from '../interface';

const isFeathersError = (error: Error): error is FeathersError => {
	if (!(error && 'type' in error)) return false;
	return (error as FeathersError)?.type === 'FeathersError';
};

const isBusinessError = (error: Error): error is BusinessError => {
	return error instanceof BusinessError;
};

/**
 * Compare helper to detect an error is a build in NestJS http exception.
 * @param error
 * @returns
 */
const isTechnicalError = (error: Error): error is HttpException => {
	return error instanceof HttpException;
};

/**
 * Creates ErrorResponse from NestJS build in technical exceptions
 * @param exception
 * @returns {ErrorResponse}
 */
const createErrorResponseForHttpException = (exception: HttpException): ErrorResponse => {
	const code = exception.getStatus();
	const msg = exception.message || 'Some error occurred';
	const exceptionName = exception.constructor.name.replace('Exception', '');
	const type = _.snakeCase(exceptionName).toUpperCase();
	const title = _.startCase(exceptionName);
	return new ErrorResponse(type, title, msg, code);
};

function createErrorResponseForBusinessError(error: BusinessError): ErrorResponse {
	const response = error.getResponse();
	return response;
}

function createErrorResponseForUnknownError(error?: Error): ErrorResponse {
	const unknownError = new InternalServerErrorException(error);
	const response = createErrorResponseForHttpException(unknownError);
	return response;
}

function createErrorResponseForFeathersError(error: FeathersError) {
	const { code, className: type, name: title, message } = error;
	const snakeType = _.snakeCase(type).toUpperCase();
	const startTitle = _.startCase(title);
	return new ErrorResponse(snakeType, startTitle, message, code);
}

const createErrorResponse = (error: any, logger: Logger): ErrorResponse => {
	try {
		if (error instanceof Error) {
			if (isFeathersError(error)) {
				// handles feathers errors only when calling feathers services from nest app
				return createErrorResponseForFeathersError(error);
			}
			if (isBusinessError(error)) {
				// create response from business error using 409/conflict
				return createErrorResponseForBusinessError(error);
			}
			if (isTechnicalError(error)) {
				// create response from technical error
				return createErrorResponseForHttpException(error);
			}
		}
		// create response from unknown error
		return createErrorResponseForUnknownError(error);
	} catch (exception) {
		const stack = exception instanceof Error ? exception.stack : undefined;
		logger.error(exception, stack, 'Response Error');
		return createErrorResponseForUnknownError();
	}
};

const writeErrorLog = (error: any, logger: Logger): void => {
	if (error instanceof Error) {
		if (isFeathersError(error)) {
			logger.error(error, error.stack, 'Feathers Error');
		} else if (isBusinessError(error)) {
			logger.error(error, error.stack, 'Business Error');
		} else if (isTechnicalError(error)) {
			logger.error(error, error.stack, 'Technical Error');
		} else {
			logger.error(error, error.stack, 'Unhandled Error');
		}
	} else {
		logger.error(error, 'Unknown error');
	}
};

@Catch()
export class GlobalErrorFilter<T = any> implements ExceptionFilter<T> {
	private static readonly logger = new Logger('Error');

	// eslint-disable-next-line class-methods-use-this
	catch(error: T, host: ArgumentsHost): void {
		const ctx = host.switchToHttp();
		const response = ctx.getResponse<Response>();
		writeErrorLog(error, GlobalErrorFilter.logger);
		const errorResponse: ErrorResponse = this.createErrorResponse(error);
		response.status(errorResponse.code).json(errorResponse);
	}

	createErrorResponse(error: T): ErrorResponse {
		return createErrorResponse(error, GlobalErrorFilter.logger);
	}
}