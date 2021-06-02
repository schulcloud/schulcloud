import { ConflictException, Injectable } from '@nestjs/common';
import { EntityId, IPagination } from '@shared/domain';
import { AuthorizationService, EntityTypeValue } from '../../authorization/authorization.service';
import { Logger } from '../../../core/logger/logger.service';
import { News, NewsTargetModel, NewsTargetModelValue } from '../entity';
import { NewsRepo } from '../repo/news.repo';
import { ICreateNews, INewsScope, IUpdateNews, NewsTarget } from '../entity/news.types';
import { NewsTargetFilter } from '../repo/news-target-filter';

type Permission = 'NEWS_VIEW' | 'NEWS_EDIT';

@Injectable()
export class NewsUc {
	constructor(private newsRepo: NewsRepo, private authorizationService: AuthorizationService, private logger: Logger) {
		this.logger.setContext(NewsUc.name);
	}

	/**
	 *
	 * @param userId
	 * @param schoolId
	 * @param params
	 * @returns
	 */
	async create(userId: EntityId, schoolId: EntityId, params: ICreateNews): Promise<News> {
		this.logger.log(`create news as user ${userId}`);

		await this.checkNewsTargetPermissions(userId, params.target, ['NEWS_CREATE']);

		const { target, ...props } = params;
		const news = new News(
			{
				...props,
				school: schoolId,
				creator: userId,
			},
			target
		);
		await this.newsRepo.save(news);

		this.logger.log(`news ${news.id} created by user ${userId}`);

		return news;
	}

	/**
	 *
	 * @param userId
	 * @param scope
	 * @param pagination
	 * @returns
	 */
	async findAllForUser(userId: EntityId, scope?: INewsScope, pagination?: IPagination): Promise<News[]> {
		this.logger.log(`start find all news for user ${userId}`);

		const unpublished = !!scope?.unpublished;
		const permissions: Permission[] = NewsUc.getRequiredPermissions(unpublished);

		const targets = await this.getPermittedTargets(userId, scope, permissions);
		const newsList = await this.newsRepo.findAll(targets, unpublished, pagination);

		await Promise.all(
			newsList.map(async (news: News) => {
				news.permissions = await this.getNewsPermissions(userId, news);
			})
		);

		this.logger.log(`return ${newsList.length} news for user ${userId}`);

		return newsList;
	}

	/**
	 *
	 * @param id
	 * @param userId
	 * @returns
	 */
	async findOneByIdForUser(id: EntityId, userId: EntityId): Promise<News> {
		const news = await this.newsRepo.findOneById(id);
		const requiredPermissions = NewsUc.getRequiredPermissions(news.displayAt > new Date());
		const newsTarget = NewsUc.getTarget(news);
		await this.authorizationService.checkEntityPermissions(
			userId,
			newsTarget.targetModel as EntityTypeValue,
			newsTarget.targetId,
			requiredPermissions
		);
		news.permissions = await this.getNewsPermissions(userId, news);
		return news;
	}

	async update(id: EntityId, userId: EntityId, params: IUpdateNews): Promise<News> {
		this.logger.log(`start update news ${id}`);
		// TODO replace with real functionality
		const news = await this.findOneByIdForUser(id, userId);
		return news;
	}

	async remove(id: EntityId): Promise<EntityId> {
		this.logger.log(`start remove news ${id}`);
		// TODO replace with real functionality
		await Promise.resolve();
		return id;
	}

	private async getPermittedTargets(userId: EntityId, scope: INewsScope | undefined, permissions: Permission[]) {
		let targets: NewsTargetFilter[];

		if (scope?.target == null) {
			// for all target models
			targets = await this.getTargetFilters(userId, Object.values(NewsTargetModel), permissions);
		} else {
			const { targetModel, targetId } = scope.target;
			if (targetModel && targetId) {
				// for specific news target
				await this.authorizationService.checkEntityPermissions(userId, targetModel, targetId, permissions);
				targets = [{ targetModel, targetIds: [targetId] }];
			} else {
				// for single target model
				targets = await this.getTargetFilters(userId, [targetModel], permissions);
			}
		}
		return targets;
	}

	private async getTargetFilters(
		userId: EntityId,
		targetModels: NewsTargetModelValue[],
		permissions: string[]
	): Promise<NewsTargetFilter[]> {
		const targets = await Promise.all(
			targetModels.map(async (targetModel) => {
				return {
					targetModel,
					targetIds: await this.authorizationService.getPermittedEntities(userId, targetModel, permissions),
				};
			})
		);
		const nonEmptyTargets = targets.filter((target) => target.targetIds.length > 0);

		return nonEmptyTargets;
	}

	private async getNewsPermissions(userId: EntityId, news: News): Promise<string[]> {
		const newsTarget = NewsUc.getTarget(news);
		const permissions = await this.authorizationService.getEntityPermissions(
			userId,
			newsTarget.targetModel as EntityTypeValue,
			newsTarget.targetId
		);
		return permissions.filter((permission) => permission.includes('NEWS'));
	}

	private static getTarget(news: News) {
		const target =
			news.targetModel && news.target
				? { targetModel: news.targetModel, targetId: news.target.id }
				: { targetModel: 'school', targetId: news.school.id };
		return target;
	}

	private static getRequiredPermissions(unpublished: boolean): Permission[] {
		return unpublished ? ['NEWS_EDIT'] : ['NEWS_VIEW'];
	}

	private async checkNewsTargetPermissions(userId: EntityId, target: NewsTarget, permissions: string[]) {
		const { targetModel, targetId } = target;
		if (targetModel && targetId) {
			await this.authorizationService.checkEntityPermissions(userId, targetModel, targetId, permissions);
		} else {
			throw new ConflictException('Invalid news target');
		}
	}
}