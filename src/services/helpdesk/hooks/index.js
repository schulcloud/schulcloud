const { authenticate } = require('@feathersjs/authentication');
const globalHooks = require('../../../hooks');

const restrictToCurrentSchool = globalHooks.ifNotLocal(globalHooks.restrictToCurrentSchool);

function createInfoText(user, data) {
	return `
Ein neues Problem wurde gemeldet.
User: ${user}
Betreff: ${data.subject}
Schaue für weitere Details und zur Bearbeitung bitte in den Helpdesk-Bereich der ${data.cloud}.\n
Mit freundlichen Grüßen
Deine ${data.cloud}
	`;
}

function createFeedbackText(user, data) {
	const device = data.deviceUserAgent ? `${data.device} [auto-detection: ${data.deviceUserAgent}]` : data.device;
	let text = `
ReplyEmail: ${data.replyEmail}
User: ${user}
User-ID: ${data.userId}
Schule: ${data.schoolName}
Schule-ID: ${data.schoolId}
Instanz: ${data.cloud}
Browser: ${data.browserName}
Browser Version: ${data.browserVersion}
Betriebssystem: ${data.os}
Gerät: ${device}
    `;

	if (data.desire && data.desire !== '') {
		text = `
${text}
User schrieb folgendes:
Als ${data.role}
möchte ich ${data.desire},
um ${data.benefit}.
Akzeptanzkriterien: ${data.acceptanceCriteria}
        `;
	} else {
		text = `
${text}
User meldet folgendes:
Problem Kurzbeschreibung: ${data.subject}
IST-Zustand: ${data.currentState}
SOLL-Zustand: ${data.targetState}
        `;
		if (data.notes) {
			text = `
${text}
Anmerkungen: ${data.notes}
            `;
		}
	}
	return text;
}

const denyDbWriteOnType = (hook) => {
	if (hook.data.type === 'contactHPI') {
		hook.result = {}; // interrupts db interaction
	}
	return hook;
};

const feedback = () => (hook) => {
	const data = hook.data || {};
	if (data.type === 'contactAdmin') {
		globalHooks.sendEmail(hook, {
			subject: 'Ein Problem wurde gemeldet.',
			roles: ['helpdesk', 'administrator'],
			content: {
				text: createInfoText(
					(hook.params.account || {}).username || 'nouser', data,
				),
			},
			attachments: data.files,
		});
		// TODO: NOTIFICATION SERVICE
	} else {
		globalHooks.sendEmail(hook, {
			subject: data.title || data.subject || 'nosubject',
			emails: ['ticketsystem@schul-cloud.org'],
			replyEmail: data.replyEmail,
			content: {
				text: createFeedbackText(
					(hook.params.account || {}).username || 'nouser',
					data,
				),
			},
			attachments: data.files,
		});
	}
	return Promise.resolve(hook);
};

exports.before = {
	all: [authenticate('jwt')],
	find: [globalHooks.hasPermission('HELPDESK_VIEW')],
	get: [globalHooks.hasPermission('HELPDESK_VIEW')],
	create: [globalHooks.hasPermission('HELPDESK_CREATE'), restrictToCurrentSchool, denyDbWriteOnType],
	update: [globalHooks.hasPermission('HELPDESK_EDIT'), restrictToCurrentSchool],
	patch: [globalHooks.hasPermission('HELPDESK_EDIT'), globalHooks.permitGroupOperation, restrictToCurrentSchool],
	remove: [
		globalHooks.hasPermission('HELPDESK_CREATE'),
		globalHooks.permitGroupOperation,
		globalHooks.ifNotLocal(globalHooks.checkSchoolOwnership),
	],
};

exports.after = {
	all: [],
	find: [],
	get: [],
	create: [feedback()],
	update: [],
	patch: [],
	remove: [],
};
