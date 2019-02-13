const path = require('path');
const serveStatic = require('feathers').static;
const favicon = require('serve-favicon');
const compress = require('compression');
const cors = require('cors');
const feathers = require('feathers');
const configuration = require('feathers-configuration');
const hooks = require('feathers-hooks');
const rest = require('feathers-rest');
const bodyParser = require('body-parser');
const socketio = require('feathers-socketio');
const winston = require('winston');
const middleware = require('./middleware');
const sockets = require('./sockets');
const services = require('./services');
const defaultHeaders = require('./middleware/defaultHeaders');
const handleResponseType = require('./middleware/handleReponseType');
const setupSwagger = require('./swagger');
// const prettyError = require('pretty-error').start();
const allHooks = require('./app.hooks');

require('console-stamp')(console);
require('console-stamp')(winston);

let secrets;
try {
	(['production', 'local'].includes(process.env.NODE_ENV))
		? secrets = require('../config/secrets.js')
		: secrets = require('../config/secrets.json');
} catch(error) {
	secrets = {};
}

const app = feathers();
const config = configuration(path.join(__dirname, '..'));

app.configure(config);
setupSwagger(app);

app.set('secrets', secrets);

app.use(compress())
	.options('*', cors())
	.use(cors())
	.use(favicon(path.join(app.get('public'), 'favicon.ico')))
	.use('/', serveStatic(app.get('public')))
	.use(bodyParser.json())
	.use(bodyParser.urlencoded({ extended: true }))
	.use(bodyParser.raw({ type: () => true, limit: '10mb' }))

	.use(defaultHeaders)
	.get('/system_info/haproxy', (req, res) => { res.send({ timestamp: new Date().getTime() });})
	.get('/ping', (req, res) => { res.send({ message: 'pong', timestamp: new Date().getTime() });})

	.configure(hooks())
	.configure(rest(handleResponseType))
	.configure(socketio())

	// auth is setup in /authentication/
	.configure(services)

	.configure(sockets)
	.configure(middleware)
	.hooks(allHooks);

winston.cli();	// optimize for cli, like using colors
winston.level = 'debug';

module.exports = app;
