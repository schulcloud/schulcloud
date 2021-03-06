const { SubmissionModel, HomeworkModel } = require('./db');
const { validateObjectId } = require('../../helper/validation.helper');
const { updateManyResult, deleteManyResult } = require('../../helper/repo.helper');

/** Homeworks */
const privateHomeworkQuery = (userId) => ({ private: true, teacherId: userId });
const publicHomeworkQuery = (userId) => ({ private: { $ne: true }, teacherId: userId });
const archivedHomeworkQuery = (userId) => ({ archived: userId });

/**
 * @param {BSON|BsonString} userId
 * @return {Array}
 */
const findPrivateHomeworksByUser = async (userId) => {
	validateObjectId({ userId });
	const result = await HomeworkModel.find(privateHomeworkQuery(userId)).lean().exec();
	return result;
};

/**
 * @param {BSON|BsonString} userId
 * @return {Array}
 */
const findArchivedHomeworkIdsByUser = async (userId) => {
	validateObjectId({ userId });
	const select = ['_id'];
	const result = await HomeworkModel.find(archivedHomeworkQuery(userId), select).lean().exec();
	return result;
};

/**
 * @param {BSON|BsonString} userId
 * @return {Array}
 */
const findPublicHomeworkIdsByUser = async (userId) => {
	validateObjectId({ userId });
	const select = ['_id'];
	const result = await HomeworkModel.find(publicHomeworkQuery(userId), select).lean().exec();
	return result;
};

/**
 * @param {BSON|BsonString} userId
 * @return {Boolean}
 */
const deletePrivateHomeworksFromUser = async (userId) => {
	validateObjectId({ userId });
	const result = await HomeworkModel.deleteMany(privateHomeworkQuery(userId)).lean().exec();
	return deleteManyResult(result);
};

/**
 * @param {BSON|BsonString} userId
 * @return {Boolean}
 */
const replaceUserInPublicHomeworks = async (userId, replaceUserId) => {
	validateObjectId({ userId, replaceUserId });
	const result = await HomeworkModel.updateMany(publicHomeworkQuery(userId), { $set: { teacherId: replaceUserId } })
		.lean()
		.exec();
	return updateManyResult(result);
};

const removeUserInArchivedHomeworks = async (userId) => {
	validateObjectId({ userId });
	const result = await HomeworkModel.updateMany(archivedHomeworkQuery(userId), { $pull: { archived: userId } })
		.lean()
		.exec();
	return updateManyResult(result);
};

/** Submissions */

const groupSubmissionQuery = (userId) => ({
	$and: [{ teamMembers: userId }, { teamMembers: { $exists: true, $not: { $size: 0 } } }],
});
const userSubmissionQuery = (userId) => ({
	$and: [{ studentId: userId }, { teamMembers: { $exists: true, $size: 0 } }],
});

/**
 * @param {BSON|BsonString} userId
 * @return {Array}
 */
const findGroupSubmissionIdsByUser = async (userId) => {
	validateObjectId({ userId });
	const select = ['_id'];
	const result = await SubmissionModel.find(groupSubmissionQuery(userId), select).lean().exec();
	return result;
};

const findUserSubmissionsByUser = async (userId) => {
	validateObjectId({ userId });
	const result = await SubmissionModel.find(userSubmissionQuery(userId)).lean().exec();
	return result;
};

const removeGroupSubmissionsConnectionsForUser = async (userId) => {
	validateObjectId({ userId });
	const result = await SubmissionModel.updateMany(groupSubmissionQuery(userId), { $pull: { teamMembers: userId } })
		.lean()
		.exec();
	return updateManyResult(result);
};

const deleteSingleSubmissionsFromUser = async (userId) => {
	validateObjectId({ userId });
	const result = await SubmissionModel.deleteMany(userSubmissionQuery(userId)).lean().exec();
	return deleteManyResult(result);
};

module.exports = {
	findPrivateHomeworksByUser,
	findPublicHomeworkIdsByUser,
	deletePrivateHomeworksFromUser,
	replaceUserInPublicHomeworks,
	findGroupSubmissionIdsByUser,
	findUserSubmissionsByUser,
	removeGroupSubmissionsConnectionsForUser,
	deleteSingleSubmissionsFromUser,
	findArchivedHomeworkIdsByUser,
	removeUserInArchivedHomeworks,
};
