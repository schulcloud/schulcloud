const mongoose = require('mongoose');
const { NotImplemented } = require('@feathersjs/errors');
const { FileModel } = require('../../fileStorage/model');

/**
 * Just because the route /wopi/files/:id should trigger different
 * actions for a different 'X-WOPI-Override' header value,
 * this helper uses the correct function for a specific header
 */

/** https://wopirest.readthedocs.io/en/latest/files/DeleteFile.html */
const deleteFile = (file, payload, account, app) => {
	console.log('deleteFile', file);
	const fileStorageService = app.service('fileStorage');
	return fileStorageService.remove(null, {
		query: { _id: file._id },
		payload,
		account,
	});
};

/** https://wopirest.readthedocs.io/en/latest/files/Lock.html
  * https://wopirest.readthedocs.io/en/latest/files/RefreshLock.html
  * adoption: the lockId was checked in a hook before
  */
const lock = (file) => {
	console.log('createlock', file);
	file.lockId = mongoose.Types.ObjectId();
	return FileModel.update({ _id: file._id }, file).exec().then(() => Promise.resolve({ lockId: file.lockId }));
};

/** https://wopirest.readthedocs.io/en/latest/files/GetLock.html */
const getLock = file => FileModel.findOne({ _id: file._id })
	.exec()
	.then(() => {console.log('getlock', file)})
	.then(() => Promise.resolve({ lockId: file.lockId }));

/** https://wopirest.readthedocs.io/en/latest/files/Unlock.html */
const unlock = (file) => {
	console.log('unlock', file);
	return FileModel.update({ _id: file._id }, { $unset: { lockId: 1 } }).exec();
};

/** https://wopirest.readthedocs.io/en/latest/files/RenameFile.html */
const renameFile = (file, payload, account, app) => {
	console.log('renameFile', file);
	const fileRenameService = app.service('fileStorage/rename');
	return fileRenameService.create({
		_id: file._id,
		newName: payload.wopiRequestedName,
		userPayload: payload,
		account,
	});
};

/** https://wopirest.readthedocs.io/en/latest/files/GetShareUrl.html */
const shareUrl = (file, payload, account, app) => {
	throw new NotImplemented('This function is currently not implemented!');
};

/** https://wopirest.readthedocs.io/en/latest/files/PutUserInfo.html */
const putUserInfo = (file, payload, account, app) => {
	throw new NotImplemented('This function is currently not implemented!');
};


const actionHeaderMap = {
	DELETE: deleteFile,
	LOCK: lock,
	GET_LOCK: getLock,
	UNLOCK: unlock,
	REFRESH_LOCK: lock,
	RENAME_FILE: renameFile,
	GET_SHARE_URL: shareUrl,
	PUT_USER_INFO: putUserInfo,
};

module.exports = (header) => {
	console.log('header', header);
	return actionHeaderMap[header];
};
