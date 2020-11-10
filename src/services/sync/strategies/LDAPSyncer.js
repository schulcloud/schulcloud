const Syncer = require('./Syncer');
const LDAPSchoolSyncer = require('./LDAPSchoolSyncer');

const SchoolYearFacade = require('../../school/logic/year.js');

/**
 * Implements syncing from LDAP servers based on the Syncer interface for a
 * given system / LDAP Config
 * @class LDAPSyncer
 * @implements {Syncer}
 */
class LDAPSyncer extends Syncer {
	constructor(app, stats, logger, system) {
		super(app, stats, logger);
		this.system = system;
		this.stats = Object.assign(this.stats, {
			schools: {},
		});
	}

	prefix() {
		return this.system.alias;
	}

	/**
	 * @see {Syncer#steps}
	 */
	async steps() {
		await super.steps();
		await this.attemptRun();
		const schools = await this.getSchools();
		const activeSchools = schools.filter((s) => !s.inMaintenance);
		for (const school of activeSchools) {
			// eslint-disable-next-line no-await-in-loop
			const stats = await new LDAPSchoolSyncer(this.app, {}, this.logger, this.system, school).sync();
			if (stats.success !== true) {
				this.stats.errors.push(`LDAP sync failed for school "${school.name}" (${school._id}).`);
			}
			this.stats.schools[school.ldapSchoolIdentifier] = stats;
		}
		await this.persistRun();
		return this.stats;
	}

	getSchools() {
		return this.app
			.service('ldap')
			.getSchools(this.system.ldapConfig)
			.then((data) => this.createSchoolsFromLdapData(data));
	}

	getCurrentYearAndFederalState() {
		return Promise.all([
			this.app.service('years').find(),
			this.app.service('federalStates').find({ query: { abbreviation: 'NI' } }),
		]).then(([years, states]) => {
			if (years.total === 0 || states.total === 0) {
				return Promise.reject(new Error('Database should contain at least one year and one valid federal state'));
			}
			const currentYear = new SchoolYearFacade(years.data).defaultYear;
			return Promise.resolve({ currentYear, federalState: states.data[0]._id });
		});
	}

	createSchoolsFromLdapData(data) {
		this.logInfo(`Got ${data.length} schools from the server`);
		const currentLDAPProvider = this.system.ldapConfig.provider;
		let newSchools = 0;
		let updates = 0;
		return Promise.all(
			data.map((ldapSchool) =>
				this.app
					.service('schools')
					.find({
						query: {
							ldapSchoolIdentifier: ldapSchool.ldapOu,
						},
					})
					.then((schools) => {
						if (schools.total !== 0) {
							updates += 1;
							if (currentLDAPProvider === 'univention') {
								return this.app
									.service('schools')
									.update({ _id: schools.data[0]._id }, { $set: { name: ldapSchool.displayName } });
							}
							return this.app
								.service('schools')
								.update({ _id: schools.data[0]._id }, { $set: { name: schools.data[0].name } });
						}

						return this.getCurrentYearAndFederalState().then(({ currentYear, federalState }) => {
							const schoolData = {
								name: ldapSchool.displayName,
								systems: [this.system._id],
								ldapSchoolIdentifier: ldapSchool.ldapOu,
								currentYear,
								federalState,
							};
							newSchools += 1;
							return this.app.service('schools').create(schoolData);
						});
					})
			)
		).then((res) => {
			this.logInfo(`Created ${newSchools} new schools and updated ${updates} schools`);
			return Promise.resolve(res);
		});
	}

	/**
	 * Updates the lastSyncAttempt attribute of the system's ldapConfig
	 * @async
	 */
	async attemptRun() {
		const now = Date.now();
		this.logger.debug(`Setting system.ldapConfig.lastSyncAttempt = ${now}`);
		const update = {
			'ldapConfig.lastSyncAttempt': now,
		};
		await this.app.service('systems').patch(this.system._id, update);
		this.logger.debug('System stats updated.');
	}

	/**
	 * Updates the lastSuccessfulFullSync attribute of the system's ldapConfig if
	 * the sync was successful.
	 * @async
	 */
	async persistRun() {
		this.logger.debug('System-Sync done. Updating system stats...');
		if (this.successful()) {
			const now = Date.now();
			this.logger.debug(`Setting ldapConfig.lastSuccessfulFullSync = ${now}.`);
			const update = {
				'ldapConfig.lastSuccessfulFullSync': now,
			};
			await this.app.service('systems').patch(this.system._id, update);
			this.logger.debug('System stats updated.');
		} else {
			this.logger.debug('Not successful. Skipping...');
		}
	}
}

module.exports = LDAPSyncer;
