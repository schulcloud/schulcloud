/* eslint-disable no-param-reassign */
/* eslint-disable class-methods-use-this */
const { Forbidden, GeneralError, BadRequest } = require('@feathersjs/errors');
const { authenticate } = require('@feathersjs/authentication').hooks;
const moment = require('moment');
const { v4: uuidv4 } = require('uuid');
const { Configuration } = require('@schul-cloud/commons');
const logger = require('../../../logger');
const { createMultiDocumentAggregation } = require('../utils/aggregations');
const {
	hasSchoolPermission,
} = require('../../../hooks');
const { updateAccountUsername } = require('../hooks/userService');

const { userModel } = require('../model');

const getCurrentUserInfo = (id) => userModel.findById(id)
	.select('schoolId')
	.lean()
	.exec();

const getCurrentYear = (ref, schoolId) => ref.app.service('schools')
	.get(schoolId, {
		query: { $select: ['currentYear'] },
	})
	.then(({ currentYear }) => currentYear.toString());


class AdminUsers {
	constructor(roleName) {
		this.roleName = roleName;
		this.docs = {};
	}

	async find(params) {
		return this.getUsers(undefined, params);
	}

	async get(id, params) {
		return this.getUsers(id, params);
	}

	async getUsers(_id, params) {
		// integration test did not get the role in the setup
		// so here is a workaround set it at first call
		if (!this.role) {
			this.role = (await this.app.service('roles').find({
				query: { name: this.roleName },
			})).data[0];
		}

		try {
			const { query: clientQuery = {}, account } = params;
			const currentUserId = account.userId.toString();

			// fetch base data
			const { schoolId } = await getCurrentUserInfo(currentUserId);
			const schoolYearId = await getCurrentYear(this, schoolId);

			const query = {
				schoolId,
				roles: this.role._id,
				schoolYearId,
				sort: clientQuery.$sort || clientQuery.sort,
				select: [
					'consentStatus',
					'consent',
					'classes',
					'firstName',
					'lastName',
					'email',
					'createdAt',
					'importHash',
					'birthday',
					'preferences.registrationMailSend',
				],
				skip: clientQuery.$skip || clientQuery.skip,
				limit: clientQuery.$limit || clientQuery.limit,
			};
			if (_id) {
				query._id = _id;
			} else if (clientQuery.users) {
				query._id = clientQuery.users;
			}
			if (clientQuery.consentStatus) query.consentStatus = clientQuery.consentStatus;
			if (clientQuery.classes) query.classes = clientQuery.classes;
			if (clientQuery.createdAt) query.createdAt = clientQuery.createdAt;
			if (clientQuery.firstName) query.firstName = clientQuery.firstName;
			if (clientQuery.lastName) query.lastName = clientQuery.lastName;

			return new Promise((resolve, reject) => userModel.aggregate(createMultiDocumentAggregation(query)).option({
				collation: { locale: 'de', caseLevel: true },
			}).exec((err, res) => {
				if (err) reject(err);
				else resolve(res[0] || {});
			}));
		} catch (err) {
			if ((err || {}).code === 403) {
				throw new Forbidden('You have not the permission to execute this.', err);
			}
			if (err && err.code >= 500) {
				const uuid = uuidv4();
				logger.error(uuid, err);
				if (Configuration.get('NODE_ENV') !== 'production') { throw err; }
				throw new GeneralError(uuid);
			}
			throw err;
		}
	}

	async create(data, params) {
		return (await this.changeUserData(null, data, params)).create();
	}

	async update(id, data, params) {
		if (!id) throw new BadRequest('id is required');
		return (await this.changeUserData(id, data, params)).update();
	}

	async patch(id, data, params) {
		if (!id) throw new BadRequest('id is required');
		return (await this.changeUserData(id, data, params)).patch();
	}

	async changeUserData(id, data, params) {
		const currentUserId = params.account.userId.toString();
		const { schoolId } = await getCurrentUserInfo(currentUserId);
		const { isExternal } = await this.app.service('schools').get(schoolId);
		if (isExternal) {
			throw new Forbidden('Creating new students or teachers is only possible in the source system.');
		}

		if (data.email) {
			const accounts = await this.app.service('userModel').find({ query: { email: data.email.toLowerCase() } });
			if (accounts.total !== 0) {
				throw new BadRequest('Email already exists.');
			}
			data.email = data.email.toLowerCase();
			await this.app.service('accountModel').patch(null, { username: data.email }, {
				query: {
					userId: currentUserId,
					username: { $ne: data.email },
				},
			});
		}
		const query = {
			schoolId,
		};

		const filterParams = { query };

		const prepareRoleback = async (fu) => {
			try {
				return fu();
			} catch (err) {
				if (data.email) {
					const { email } = await this.app.service('userModel').get(currentUserId);
					await this.app.service('accountModel').patch(null, { username: email }, {
						query: {
							userId: currentUserId,
						},
					});
				}
				throw err;
			}
		};


		return {
			create: () => prepareRoleback(this.app.service('usersModel').create(data, filterParams)),
			update: () => prepareRoleback(this.app.service('usersModel').update(id, data, filterParams)),
			patch: () => prepareRoleback(this.app.service('usersModel').patch(id, data, filterParams)),
		};
	}

	async remove(id, params) {
		const { _ids } = params.query;
		if (id) {
			return this.app.service('usersModel').remove(id);
		}
		return this.app.service('usersModel').remove(null, { query: { _id: { $in: _ids } } });
	}

	async setup(app) {
		this.app = app;
		this.role = (await this.app.service('roles').find({
			query: { name: this.roleName },
		})).data[0];
	}
}

const formatBirthdayOfUsers = ({ result: { data: users } }) => {
	users.forEach((user) => { user.birthday = moment(user.birthday).format('DD.MM.YYYY'); });
};

const adminHookGenerator = (kind) => ({
	before: {
		all: [authenticate('jwt')],
		find: [hasSchoolPermission(`${kind}_LIST`)],
		get: [hasSchoolPermission(`${kind}_LIST`)],
		create: [hasSchoolPermission(`${kind}_CREATE`), blockDisposableEmail('email')],
		update: [hasSchoolPermission(`${kind}_EDIT`), blockDisposableEmail('email')],
		patch: [hasSchoolPermission(`${kind}_EDIT`), blockDisposableEmail('email')],
		remove: [hasSchoolPermission(`${kind}_DELETE`), validateParams],
	},
	after: {
		find: [formatBirthdayOfUsers],
		patch: [updateAccountUsername],
	},
});


module.exports = {
	AdminUsers,
	adminHookGenerator,
};
