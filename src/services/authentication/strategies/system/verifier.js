class SystemVerifier {
	constructor(app, options = {}) {
		this.app = app;
		this.options = options;

		if (!options.loginStrategy) {
			throw new Error(`You must implement a loginStrategy and pass it as class in the options.`);
		}

		this.loginStrategy = new options.loginStrategy(app);
		this.verify = this.verify.bind(this);
	}

	// either get an existing account or create a new one #SSO
	_getAccount ({username, password, systemId, strategy}) {
		return this.app.service('/accounts').find({
			paginate: false,
			query: {
				username,
				systemId
			}
		}).then(accounts => {
			if(accounts.length) {
				return accounts[0];
			} else {
				// create account
				return this.app.service('/accounts').create({
					username,
					password,
					systemId,
					strategy
				});
			}
		});
	}

	verify (req, done) {
		const {username, password, systemId, strategy} = req.body;

		this.app.service('/systems').get(systemId).then(system => {
			return this.loginStrategy.login({username, password}, system);
		}).then(_ => {
			// credentials are valid at this point => get or create account
			return this._getAccount({
				username,
				password,
				systemId,
				strategy
			}).then(account => {
				const payload = {
					accountId: account._id,
					userId: account.userId
				};
				done(null, account, payload);
			});

		}).catch(err => {
			done();
		});
	}
}

module.exports = SystemVerifier;
