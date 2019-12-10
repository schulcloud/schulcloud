const assert = require('assert');
const { decode } = require('jsonwebtoken');

const { expect } = require('chai');
const mockery = require('mockery');

const app = require('../../../../src/app');
const testObjects = require('../../helpers/testObjects')(app);
const redisMock = require('../../../utils/redis/redisMock');


describe('jwtTimer service', () => {
	it('registered the supportJWT service', () => {
		assert.ok(app.service('accounts/jwtTimer'));
	});

	describe('with redis instance', () => {
		let redisHelper;

		before(async () => {
			mockery.enable({
				warnOnReplace: false,
				warnOnUnregistered: false,
				useCleanCache: true,
			});
			mockery.registerMock('redis', redisMock);

			delete require.cache[require.resolve('../../../../src/utils/redis')];
			/* eslint-disable global-require */
			redisHelper = require('../../../../src/utils/redis');
			const { jwtTimerSetup } = require('../../../../src/services/account/services/jwtTimerService');
			app.configure(jwtTimerSetup);
			/* eslint-enable global-require */

			redisHelper.initializeRedisClient({
				Config: { data: { REDIS_URI: '//validHost:6379' } },
			});
		});

		after(async () => {
			mockery.deregisterAll();
			mockery.disable();
			testObjects.cleanup();
		});

		it('FIND returns the whitelist timeToLive on the JWT that is used', async () => {
			const user = await testObjects.createTestUser();
			const params = await testObjects.generateRequestParamsFromUser(user);
			const redisIdentifier = redisHelper.getRedisIdentifier(params.authentication.accessToken);
			await redisHelper.redisSetAsync(redisIdentifier, 'value', 'EX', 1000);

			const result = await app.service('/accounts/jwtTimer').find(params);
			expect(result).to.equal(1000);
		});

		it('CREATE resets the ttl on the jwt that is used', async () => {
			const user = await testObjects.createTestUser();
			const params = await testObjects.generateRequestParamsFromUser(user);
			const redisIdentifier = redisHelper.getRedisIdentifier(params.authentication.accessToken);
			const ttl = app.Config.data.JWT_TIMEOUT_SECONDS;
			await redisHelper.redisSetAsync(redisIdentifier, 'value', 'EX', ttl - 5);

			await app.service('/accounts/jwtTimer').create({}, params);
			const currentTtl = await redisHelper.redisTtlAsync(redisIdentifier);
			expect(currentTtl).to.equal(ttl);
		});
	});

	after(testObjects.cleanup);
});
