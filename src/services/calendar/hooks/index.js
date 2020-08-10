const { authenticate } = require('@feathersjs/authentication');
const globalHooks = require('../../../hooks');
const { courseModel } = require('../../user-group/model');

/* saves the event-ids generated by the Schul-Cloud Calendar-Service to given course
 * in order to handle the events later on
 * todo: maybe refactor later if there are also class and school events
 * @param hook {Object} - contains the created event
 * */
const persistCourseTimesEvent = (hook) => {
	const courseService = hook.app.service('courses');
	return Promise.all(
		hook.result.map((event) => {
			if (event['x-sc-courseId']) {
				const courseId = event['x-sc-courseId'];
				const courseTimeId = event['x-sc-courseTimeId'];

				// find course-time and update eventId
				return courseService.get(courseId).then(() =>
					courseModel.findOneAndUpdate(
						{
							_id: courseId,
							'times._id': courseTimeId,
						},
						{
							$set: {
								'times.$.eventId': event._id,
							},
						},
					),
				);
			}
		}),
	).then(() => Promise.resolve(hook));
};

exports.before = {
	all: [authenticate('jwt'), globalHooks.mapPayload],
	find: [globalHooks.hasPermission('CALENDAR_VIEW')],
	get: [globalHooks.hasPermission('CALENDAR_VIEW')],
	create: [globalHooks.hasPermission('CALENDAR_CREATE')],
	update: [globalHooks.hasPermission('CALENDAR_EDIT')],
	patch: [globalHooks.hasPermission('CALENDAR_EDIT')],
	remove: [globalHooks.hasPermission('CALENDAR_CREATE')],
};

exports.after = {
	all: [],
	find: [],
	get: [],
	create: [persistCourseTimesEvent],
	update: [],
	patch: [],
	remove: [],
};
