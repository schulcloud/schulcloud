import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';

// register source-map-support for debugging
import { install as sourceMapInstall } from 'source-map-support';

import { NestAppHolder } from './legacy/nest-app-holder';

// application imports
import { ServerModule } from './server.module';
import legacyAppPromise = require('../../../src/app');
import { API_DOCS_PATH, PORT, ROUTE_PRAEFIX } from './constants';
import { enableOpenApiDocs } from './shared/controller/swagger';

async function bootstrap() {
	sourceMapInstall();

	// load the legacy feathers/express server
	const legacyApp = await legacyAppPromise;
	const adapter = new ExpressAdapter(legacyApp);
	legacyApp.setup();

	// create the NestJS application adapting the legacy  server
	const app = await NestFactory.create(ServerModule, adapter, {});

	// TODO cleanup /api prefix
	// for all NestJS controller routes, prepend ROUTE_PREFIX
	app.setGlobalPrefix(ROUTE_PRAEFIX);

	const apiDocsPath = `${ROUTE_PRAEFIX}/${API_DOCS_PATH}`;
	enableOpenApiDocs(app, apiDocsPath);

	await app.init();

	NestAppHolder.setInstance(app);

	adapter.listen(PORT);
}
void bootstrap();
