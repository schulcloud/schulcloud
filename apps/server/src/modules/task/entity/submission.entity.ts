import { Entity, ManyToOne, Collection, Property, ManyToMany } from '@mikro-orm/core';
import { BaseEntityWithTimestamps } from '@shared/domain';
import { UserTaskInfo } from './user-task-info.entity';
import { Task } from './task.entity';
import { FileTaskInfo } from './file-task-info.entity';

@Entity({ tableName: 'submissions' })
export class Submission extends BaseEntityWithTimestamps {
	constructor(partial: Partial<Submission>) {
		super();
		Object.assign(this, partial);
	}

	// TODO: this populate the complete task stuff for now
	@ManyToOne({ fieldName: 'homeworkId' })
	homework: Task;

	@ManyToOne({ fieldName: 'studentId' })
	student: UserTaskInfo;

	/* ***** student uploads ***** */
	@Property()
	comment: string;

	@ManyToMany({ fieldName: 'fileIds', type: FileTaskInfo })
	studentFiles = new Collection<FileTaskInfo>(this);

	/* ***** teacher uploads ***** */
	@Property()
	grade: number;

	@Property()
	gradeComment: string;

	@ManyToMany({ fieldName: 'gradeFileIds', type: FileTaskInfo })
	gradeFileIds = new Collection<FileTaskInfo>(this);
}
