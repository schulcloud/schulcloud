import { ClassSerializerInterceptor, ValidationError, ValidationPipe } from '@nestjs/common';
import { NestFactory, Reflector } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';

// register source-map-support for debugging
import { install } from 'source-map-support';
install();

// application imports
import legacyAppPromise = require('../../../src/app');
import { ApiValidationError } from './core/error/errors/api-validation.error';
import { Logger } from './core/logger/logger.service';
import { ServerModule } from './server.module';
import { DurationLoggingInterceptor } from './shared/interceptor/duration-logging.interceptor';

const ROUTE_PRAEFIX = 'v3';
const API_PATH = 'api';
const PORT = 3030;

async function bootstrap() {
	// load the legacy feathers/express server
	const legacyApp = await legacyAppPromise;
	const adapter = new ExpressAdapter(legacyApp);
	await legacyApp.setup();

	// create the NestJS application adapting the legacy  server
	const app = await NestFactory.create(ServerModule, adapter, {});

	// switch logger
	app.useLogger(new Logger());

	// for all NestJS controller routes, prepend ROUTE_PRAEFIX
	app.setGlobalPrefix(ROUTE_PRAEFIX);

	/** *********************************************
	 * Global Pipe setup
	 * **********************************************
	 * Validation of DTOs will base on type-checking
	 * which is enabled by default. To you might use
	 * the class-validator decorators to extend
	 * validation.
	 */
	// transform and -options enables setting of defaults or initialization of empty arrays
	app.useGlobalPipes(
		// validation pipe ensures DTO validation globally
		new ValidationPipe({
			// enable DTO instance creation for incoming data
			transform: true,
			transformOptions: {
				// enable type coersion, requires transform:true
				enableImplicitConversion: true,
			},
			whitelist: true, // only pass valid @ApiProperty-decorated DTO properties, remove others
			forbidNonWhitelisted: false, // additional params are just skipped (required when extracting multiple DTO from single query)
			exceptionFactory: (errors: ValidationError[]) => {
				return new ApiValidationError(errors);
			},
		})
	);
	/** *********************************************
	 * Global Interceptor setup
	 * **********************************************
	 * Validation of DTOs will base on type-checking
	 * which is enabled by default. To you might use
	 * the class-validator decorators to extend
	 * validation.
	 */
	app.useGlobalInterceptors(new ClassSerializerInterceptor(app.get(Reflector)), new DurationLoggingInterceptor());

	/** *********************************************
	 * OpenAPI docs setup
	 * **********************************************
	 * They will be generated by Controller routes
	 * and DTOs/Entities passed. Their properties
	 * must use @ApiProperty
	 */

	// build default openapi spec, it contains all registered controllers by default
	// DTO's and Entity properties have to use @ApiProperty decorator to add their properties
	const config = new DocumentBuilder()
		.setTitle('HPI Schul-Cloud Server API')
		.setDescription('This is v3 of HPI Schul-Cloud Server. Checkout /docs for v1.')
		.setVersion('3.0')
		/** set authentication for all routes enabled by default */
		.addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' })
		.build();
	const document = SwaggerModule.createDocument(app, config);
	const apiDocsPath = ROUTE_PRAEFIX + '/api';
	SwaggerModule.setup(apiDocsPath, app, document);

	await app.init();

	adapter.listen(PORT);
}
bootstrap();
