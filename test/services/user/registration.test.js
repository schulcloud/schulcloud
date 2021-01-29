const { expect } = require('chai');
const assert = require('assert');
const moment = require('moment');

const appPromise = require('../../../src/app');
const { userModel } = require('../../../src/services/user/model');

const testObjects = require('../helpers/testObjects')(appPromise);
const TestObjectsGenerator = require('../helpers/TestObjectsGenerator');

describe('registration service', () => {
    let server;
    let registrationService;
    let registrationPinService;
    let hashService;
    let tog;

    before(async () => {
        const app = await appPromise;
        registrationService = app.service('registration');
        registrationPinService = app.service('registrationPins');
        hashService = app.service('hash');
        server = await app.listen(0);
        tog = new TestObjectsGenerator(app);
    });

    after(async () => {
        await server.close();
        await tog.cleanup();
    });

    it('registered the registration service', () => {
        assert.ok(registrationService);
    });

    it('processes registration by student correctly', async () => {
        const email = `max${Date.now()}@mustermann.de`;
        const importHash = `${Date.now()}`;
        await tog.createTestUser({
            importHash,
            email,
            firstName: 'Max',
            lastName: 'Mustermann',
            roles: 'student',
        });
        const registrationPin = await registrationPinService.create({ email, silent: true });
        tog.createdEntityIds.registrationPins.push(registrationPin._id);
        const registrationInput = {
            classOrSchoolId: '5f2987e020834114b8efd6f8',
            pin: registrationPin.pin,
            importHash,
            password_1: 'Test123!',
            password_2: 'Test123!',
            birthDate: moment('15.10.1999', 'DD.MM.YYYY'),
            email,
            firstName: 'Max',
            lastName: 'Mustermann',
            privacyConsent: true,
            termsOfUseConsent: true,
        };
        const response = await registrationService.create(registrationInput);
        expect(response.user).to.have.property('_id');
        expect(response.account).to.have.property('_id');
        expect(response.consent).to.have.property('_id');
        expect(response.consent).to.have.property('userConsent');
        tog.createdEntityIds.accounts.push(response.account._id); // account is created while creating "registration"
    });

    it('processes registration by parent correctly', async () => {
        const parentEmail = `moritz${Date.now()}@mustermann.de`;
        const email = `max${Date.now()}@mustermann.de`;
        const importHash = `${Date.now()}`;
        await tog.createTestUser({
            importHash,
            email: parentEmail,
            firstName: 'Max',
            lastName: 'Mustermann',
            roles: 'student',
        });
        const registrationPin = await registrationPinService.create({ email: parentEmail, silent: true });
        tog.createdEntityIds.registrationPins.push(registrationPin._id);
        const registrationInput = {
            classOrSchoolId: '5f2987e020834114b8efd6f8',
            pin: registrationPin.pin,
            importHash,
            password_1: 'Test123!',
            password_2: 'Test123!',
            birthDate: moment('15.10.2014', 'DD.MM.YYYY'),
            email,
            firstName: 'Max',
            lastName: 'Mustermann',
            privacyConsent: true,
            termsOfUseConsent: true,
            parent_email: parentEmail,
            parent_firstName: 'Moritz',
            parent_lastName: 'Mustermann',
        };
        const response = await registrationService.create(registrationInput);
        expect(response.user).to.have.property('_id');
        expect(response.consent).to.have.property('_id');
        expect(response.consent.parentConsents.length).to.be.at.least(1);
        expect(response.user.parents[0]).not.to.be.null;
        expect(response.account).to.have.property('_id');
        tog.createdEntityIds.accounts.push(response.account._id);
    });

    it('fails with invalid pin', async () => {
        const email = `max${Date.now()}@mustermann.de`;
        const importHash = `${Date.now()}`;
        await tog.createTestUser({
            importHash,
            email,
            firstName: 'Max',
            lastName: 'Mustermann',
            roles: 'student',
        });
        const registrationPin = await registrationPinService.create({ email, silent: true });
        tog.createdEntityIds.registrationPins.push(registrationPin._id);
        let pin = Number(registrationPin.pin);
        pin = pin===9999 ? 1000:pin + 1;
        // make sure we pass a wrong pin
        try {
            await registrationService.create({
                classOrSchoolId: '5f2987e020834114b8efd6f8',
                pin: String(pin),
                importHash,
                birthDate: moment('15.10.1999', 'DD.MM.YYYY'),
                email,
                firstName: 'Max',
                lastName: 'Mustermann',
            });
            throw new Error('previous call should have failed');
        } catch (err) {
            expect(err).to.not.equal(undefined);
            expect(err.message).to.equal('Der eingegebene Code konnte leider nicht verfiziert werden. Versuch es doch noch einmal.');
        }
    });

    it('fails if parent and student email are the same', async () => {
        const currentTS = Date.now();
        const email = `max${currentTS}@mustermann.de`;
        const importHash = `${currentTS}`;
        await tog.createTestUser({
            importHash,
            email,
            firstName: 'Max',
            lastName: 'Mustermann',
            roles: ['student']
        });
        try {
            await registrationService.create({
                importHash,
                classOrSchoolId: '5f2987e020834114b8efd6f8',
                email,
                parent_email: email,
                birthDate: moment('18.02.2015', 'DD.MM.YYYY'),
            });
            expect.fail('previous call should have failed');
        } catch (err) {
            expect(err.message).to.equal('Bitte gib eine unterschiedliche E-Mail-Adresse für dein Kind an.');
        }
    });

    it('fails if parent and student email are the same (case insensitive)', async () => {
        const currentTS = Date.now();
        const email = `max${currentTS}@mustermann.de`;
        const parentEmail = `MAX${currentTS}@mustermann.DE`;
        const importHash = `${currentTS}`;
        await tog.createTestUser({
            importHash,
            email,
            firstName: 'Max',
            lastName: 'Mustermann',
            roles: ['student']
        });
        try {
            await registrationService.create({
                importHash,
                classOrSchoolId: '5f2987e020834114b8efd6f8',
                email,
                parent_email: parentEmail,
                birthDate: moment('18.02.2015', 'DD.MM.YYYY'),
            });
            expect.fail('previous call should have failed');
        } catch (err) {
            expect(err.message).to.equal('Bitte gib eine unterschiedliche E-Mail-Adresse für dein Kind an.');
        }
    });

    it('fails if user is trying to register with roles other than student/employee/expert', async () => {
        const email = `max${Date.now()}@mustermann.de`;
        let hash;
        let user;
        const hashData = {
            toHash: email,
            save: true,
        };
        const newHash = await hashService.create(hashData);
        hash = newHash;
        user = await tog.createTestUser({
            email,
            firstName: 'Max',
            lastName: 'Mustermann',
            schoolId: '5f2987e020834114b8efd6f8',
            roles: ['5b45f8d28c8dba65f8871e19'],
            importHash: hash,
        });
        const registrationPin = await registrationPinService.create({ email, silent: true });
        tog.createdEntityIds.registrationPins.push(registrationPin._id);
        const registrationInput = {
            classOrSchoolId: '5f2987e020834114b8efd6f8',
            pin: registrationPin.pin,
            password_1: 'Test123!',
            password_2: 'Test123!',
            email,
            firstName: 'Max',
            lastName: 'Mustermann',
            importHash: hash,
            userId: user._id,
            privacyConsent: true,
            termsOfUseConsent: true,
        };
        try {
            await registrationService.create(registrationInput);
            expect.fail('previous call should have failed');
        } catch (e) {
            expect(e.message).to.not.equal('should have failed');
            expect(e.message).to.equal('You are not allowed to register!');
        }
    });

    it('succeed if user is trying to register with admin role', async () => {
        const email = `max${Date.now()}@mustermann.de`;
        let hash;
        let user;
        const hashData = {
            toHash: email,
            save: true,
        };
        hash = await hashService.create(hashData);
        user = await tog.createTestUser({
            email,
            firstName: 'Max',
            lastName: 'Mustermann',
            schoolId: '5f2987e020834114b8efd6f8',
            roles: ['0000d186816abba584714c96'], // admin
            importHash: hash,
        });
        const registrationPin = await registrationPinService.create({ email, silent: true });
        tog.createdEntityIds.registrationPins.push(registrationPin._id);
        const registrationInput = {
            classOrSchoolId: '5f2987e020834114b8efd6f8',
            pin: registrationPin.pin,
            password_1: 'Test123!',
            password_2: 'Test123!',
            email,
            firstName: 'Max',
            lastName: 'Mustermann',
            importHash: hash,
            userId: user._id,
            privacyConsent: true,
            termsOfUseConsent: true,
        };
        const response = await registrationService.create(registrationInput);
        expect(response.user).to.have.property('_id');
        expect(response.account).to.have.property('_id');
        expect(response.consent).to.have.property('_id');
        expect(response.consent).to.have.property('userConsent');
        tog.createdEntityIds.accounts.push(response.account._id);
    });

    it('undoes changes on fail', async () => {
        const email = `max${Date.now()}@mustermann.de`;
        const importHash = `${Date.now()}`;
        await tog.createTestUser({
            importHash,
            email,
            firstName: 'Max',
            lastName: 'Mustermann',
            roles: 'student',
        });
        const registrationPin = await registrationPinService.create({ email, silent: true });
        tog.createdEntityIds.registrationPins.push(registrationPin._id);
        const registrationInput = {
            importHash,
            classOrSchoolId: '5f2987e020834114b8efd6f8',
            pin: registrationPin.pin,
            birthDate: moment('15.10.1999', 'DD.MM.YYYY'),
            email,
            firstName: 'Max',
            lastName: 'Mustermann',
            privacyConsent: true,
            termsOfUseConsent: true,
        };
        try {
            await registrationService.create(registrationInput);
            throw new Error('should have failed');
        } catch (err) {
            expect(err.message).to.not.equal('should have failed');
            // no password given, should result in an error.
            expect(err.message).to.equal('Fehler beim Erstellen des Accounts.');
            // the user should not have been modified during the attempt
            const userCheck = await userModel.findOne({ email });
            expect(userCheck.birthday).to.equal(undefined);
            expect(userCheck.importHash).to.equal(importHash);
        }
    });

    it('processes teachers correctly', async () => {
        const email = `max${Date.now()}@mustermann.de`;
        const hash = await hashService.create({
            toHash: email,
            save: true,
        });
        const user = await tog.createTestUser({
            email,
            firstName: 'Max',
            lastName: 'Mustermann',
            schoolId: '5f2987e020834114b8efd6f8',
            roles: ['0000d186816abba584714c98'], // teacher
            importHash: hash,
        });
        const registrationPin = await registrationPinService.create({ email, silent: true });
        tog.createdEntityIds.registrationPins.push(registrationPin._id);
        const registrationInput = {
            classOrSchoolId: '5f2987e020834114b8efd6f8',
            pin: registrationPin.pin,
            password_1: 'Test123!',
            password_2: 'Test123!',
            email,
            firstName: 'Max',
            lastName: 'Mustermann',
            importHash: hash,
            userId: user._id,
            privacyConsent: true,
            termsOfUseConsent: true,
        };
        const response = await registrationService.create(registrationInput);
        expect(response.user).to.have.property('_id');
        expect(response.account).to.have.property('_id');
        expect(response.consent).to.have.property('_id');
        expect(response.consent).to.have.property('userConsent');
        tog.createdEntityIds.accounts.push(response.account._id);
    });

    it('hashService returns a string', async () => {
        const res = await hashService.create({
            toHash: `max${Date.now()}@mustermann.de`,
            save: true,
            patchUser: true,
        });
        expect(res).to.be.a('string');
    });

    it('hashService returns bad request without toHash parameter', async () => {
        try {
            await hashService.create({
                save: true,
                patchUser: true,
            });
            expect.fail('BadRequest: Please set toHash key.');
        } catch (e) {
            expect(e.type).to.equal('FeathersError');
            expect(e.className).to.equal('bad-request');
        }
    });
});
