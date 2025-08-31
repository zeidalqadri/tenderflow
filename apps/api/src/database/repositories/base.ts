import { Prisma } from '../../generated/prisma';
import { prisma, transaction } from '../client';
import { 
  TenantIsolation, 
  SearchUtils, 
  ValidationUtils, 
  AuditLogger,
  DatabaseError 
} from '../utils';

// Base repository interface
export interface IBaseRepository<T> {
  findById(id: string, options?: QueryOptions): Promise<T | null>;
  findMany(options?: QueryOptions): Promise<PaginatedResponse<T>>;
  create(data: any, userId?: string): Promise<T>;
  update(id: string, data: any, userId?: string): Promise<T>;
  delete(id: string, userId?: string): Promise<T>;
  count(filters?: FilterOptions): Promise<number>;
}

// Query options interface
export interface QueryOptions {
  include?: Record<string, boolean | object>;
  select?: Record<string, boolean>;
  where?: Record<string, any>;
  orderBy?: Record<string, 'asc' | 'desc'> | Record<string, 'asc' | 'desc'>[];
  skip?: number;
  take?: number;
  cursor?: { id: string };
}

// Pagination response interface
export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
  meta?: {
    query: string;
    filters: Record<string, any>;
    sort: Record<string, string>;
    timestamp: Date;
  };
}

// Filter options interface
export interface FilterOptions {
  search?: string;
  dateRange?: { from: Date; to: Date };
  [key: string]: any;
}

// Base repository implementation
export abstract class BaseRepository<T extends { id: string; createdAt: Date; updatedAt: Date }> 
  implements IBaseRepository<T> {
  
  protected abstract modelName: string;
  protected abstract model: any;
  
  constructor(
    protected readonly auditEnabled: boolean = true,
    protected readonly softDeleteEnabled: boolean = false
  ) {}

  async findById(id: string, options: QueryOptions = {}): Promise<T | null> {
    try {
      ValidationUtils.validateUUID(id);
      
      const query: any = {
        where: { 
          id,
          ...(this.softDeleteEnabled && { deletedAt: null }),
          ...options.where 
        },
        ...options,
      };

      return await this.model.findUnique(query);
    } catch (error) {
      throw DatabaseError.fromPrismaError(error);
    }
  }

  async findMany(options: QueryOptions & {
    page?: number;
    limit?: number;
    search?: string;
    filters?: FilterOptions;
  } = {}): Promise<PaginatedResponse<T>> {
    try {
      const {
        page = 1,
        limit = 25,
        search,
        filters = {},
        ...queryOptions
      } = options;

      const validatedLimit = Math.min(limit, 100); // Max 100 items per page
      const skip = (page - 1) * validatedLimit;

      // Build where conditions
      const whereConditions: any = {
        ...(this.softDeleteEnabled && { deletedAt: null }),
        ...queryOptions.where,
      };

      // Add search conditions
      if (search && this.getSearchFields().length > 0) {
        const searchConditions = SearchUtils.buildFullTextSearch(search, this.getSearchFields());
        if (searchConditions) {
          whereConditions.AND = [...(whereConditions.AND || []), searchConditions];
        }
      }

      // Add filter conditions
      const filterConditions = SearchUtils.buildFilterConditions(filters);
      Object.assign(whereConditions, filterConditions);

      // Build sort conditions
      const orderBy = queryOptions.orderBy || this.getDefaultSort();

      // Execute count and data queries in parallel
      const [total, data] = await Promise.all([
        this.model.count({ where: whereConditions }),
        this.model.findMany({
          where: whereConditions,
          orderBy,
          skip,
          take: validatedLimit,
          include: queryOptions.include,
          select: queryOptions.select,
        }),
      ]);

      const totalPages = Math.ceil(total / validatedLimit);

      return {
        data,
        pagination: {
          page,
          limit: validatedLimit,
          total,
          totalPages,
          hasNext: page < totalPages,
          hasPrev: page > 1,
        },
        meta: {
          query: search || '',
          filters,
          sort: orderBy,
          timestamp: new Date(),
        },
      };
    } catch (error) {
      throw DatabaseError.fromPrismaError(error);
    }
  }

  async create(data: any, userId?: string): Promise<T> {
    try {
      const result = await transaction(async (tx) => {
        const created = await (tx as any)[this.modelName].create({ data });

        if (this.auditEnabled && userId) {
          await AuditLogger.logAction(
            created.tenantId || 'system',
            userId,
            'CREATE',
            this.modelName,
            created.id,
            undefined,
            created
          );
        }

        return created;
      });

      return result;
    } catch (error) {
      throw DatabaseError.fromPrismaError(error);
    }
  }

  async update(id: string, data: any, userId?: string): Promise<T> {
    try {
      ValidationUtils.validateUUID(id);

      const result = await transaction(async (tx) => {
        // Get current record for audit log
        const current = this.auditEnabled 
          ? await (tx as any)[this.modelName].findUnique({ where: { id } })
          : null;

        const updated = await (tx as any)[this.modelName].update({
          where: { 
            id,
            ...(this.softDeleteEnabled && { deletedAt: null })
          },
          data: {
            ...data,
            updatedAt: new Date(),
          },
        });

        if (this.auditEnabled && userId && current) {
          await AuditLogger.logAction(
            updated.tenantId || current.tenantId || 'system',
            userId,
            'UPDATE',
            this.modelName,
            id,
            current,
            updated
          );
        }

        return updated;
      });

      return result;
    } catch (error) {
      throw DatabaseError.fromPrismaError(error);
    }
  }

  async delete(id: string, userId?: string): Promise<T> {
    try {
      ValidationUtils.validateUUID(id);

      if (this.softDeleteEnabled) {
        return await this.softDelete(id, userId);
      }

      const result = await transaction(async (tx) => {
        const current = await (tx as any)[this.modelName].findUnique({ where: { id } });
        
        if (!current) {
          throw new DatabaseError('Record not found', 'RECORD_NOT_FOUND');
        }

        const deleted = await (tx as any)[this.modelName].delete({ where: { id } });

        if (this.auditEnabled && userId) {
          await AuditLogger.logAction(
            current.tenantId || 'system',
            userId,
            'DELETE',
            this.modelName,
            id,
            current,
            undefined
          );
        }

        return deleted;
      });

      return result;
    } catch (error) {
      throw DatabaseError.fromPrismaError(error);
    }
  }

  async softDelete(id: string, userId?: string): Promise<T> {
    try {
      ValidationUtils.validateUUID(id);

      const result = await transaction(async (tx) => {
        const current = await (tx as any)[this.modelName].findUnique({ where: { id } });
        
        if (!current) {
          throw new DatabaseError('Record not found', 'RECORD_NOT_FOUND');
        }

        const deleted = await (tx as any)[this.modelName].update({
          where: { id },
          data: { 
            deletedAt: new Date(),
            updatedAt: new Date(),
          },
        });

        if (this.auditEnabled && userId) {
          await AuditLogger.logAction(
            current.tenantId || 'system',
            userId,
            'DELETE',
            this.modelName,
            id,
            current,
            deleted,
            { softDelete: true }
          );
        }

        return deleted;
      });

      return result;
    } catch (error) {
      throw DatabaseError.fromPrismaError(error);
    }
  }

  async restore(id: string, userId?: string): Promise<T> {
    try {
      ValidationUtils.validateUUID(id);

      if (!this.softDeleteEnabled) {
        throw new DatabaseError('Soft delete not enabled for this model', 'OPERATION_NOT_SUPPORTED');
      }

      const result = await transaction(async (tx) => {
        const current = await (tx as any)[this.modelName].findUnique({ where: { id } });
        
        if (!current) {
          throw new DatabaseError('Record not found', 'RECORD_NOT_FOUND');
        }

        if (!current.deletedAt) {
          throw new DatabaseError('Record is not deleted', 'INVALID_OPERATION');
        }

        const restored = await (tx as any)[this.modelName].update({
          where: { id },
          data: { 
            deletedAt: null,
            updatedAt: new Date(),
          },
        });

        if (this.auditEnabled && userId) {
          await AuditLogger.logAction(
            current.tenantId || 'system',
            userId,
            'UPDATE',
            this.modelName,
            id,
            current,
            restored,
            { restore: true }
          );
        }

        return restored;
      });

      return result;
    } catch (error) {
      throw DatabaseError.fromPrismaError(error);
    }
  }

  async count(filters: FilterOptions = {}): Promise<number> {
    try {
      const whereConditions: any = {
        ...(this.softDeleteEnabled && { deletedAt: null }),
        ...SearchUtils.buildFilterConditions(filters),
      };

      return await this.model.count({ where: whereConditions });
    } catch (error) {
      throw DatabaseError.fromPrismaError(error);
    }
  }

  async exists(id: string): Promise<boolean> {
    try {
      ValidationUtils.validateUUID(id);
      
      const record = await this.model.findUnique({
        where: { 
          id,
          ...(this.softDeleteEnabled && { deletedAt: null })
        },
        select: { id: true },
      });

      return !!record;
    } catch (error) {
      return false;
    }
  }

  // Bulk operations
  async createMany(data: any[], userId?: string): Promise<{ count: number }> {
    try {
      const result = await transaction(async (tx) => {
        const created = await (tx as any)[this.modelName].createMany({ 
          data,
          skipDuplicates: true,
        });

        if (this.auditEnabled && userId) {
          for (const item of data) {
            await AuditLogger.logAction(
              item.tenantId || 'system',
              userId,
              'CREATE',
              this.modelName,
              item.id || 'bulk',
              undefined,
              item,
              { bulk: true }
            );
          }
        }

        return created;
      });

      return result;
    } catch (error) {
      throw DatabaseError.fromPrismaError(error);
    }
  }

  async updateMany(
    where: Record<string, any>,
    data: any,
    userId?: string
  ): Promise<{ count: number }> {
    try {
      const result = await transaction(async (tx) => {
        const updated = await (tx as any)[this.modelName].updateMany({
          where: {
            ...where,
            ...(this.softDeleteEnabled && { deletedAt: null }),
          },
          data: {
            ...data,
            updatedAt: new Date(),
          },
        });

        if (this.auditEnabled && userId) {
          await AuditLogger.logAction(
            'system',
            userId,
            'UPDATE',
            this.modelName,
            'bulk',
            where,
            data,
            { bulk: true, count: updated.count }
          );
        }

        return updated;
      });

      return result;
    } catch (error) {
      throw DatabaseError.fromPrismaError(error);
    }
  }

  async deleteMany(
    where: Record<string, any>,
    userId?: string
  ): Promise<{ count: number }> {
    try {
      if (this.softDeleteEnabled) {
        return await this.updateMany(where, { deletedAt: new Date() }, userId);
      }

      const result = await transaction(async (tx) => {
        const deleted = await (tx as any)[this.modelName].deleteMany({ where });

        if (this.auditEnabled && userId) {
          await AuditLogger.logAction(
            'system',
            userId,
            'DELETE',
            this.modelName,
            'bulk',
            where,
            undefined,
            { bulk: true, count: deleted.count }
          );
        }

        return deleted;
      });

      return result;
    } catch (error) {
      throw DatabaseError.fromPrismaError(error);
    }
  }

  // Abstract methods to be implemented by subclasses
  protected abstract getSearchFields(): string[];
  protected abstract getDefaultSort(): Record<string, 'asc' | 'desc'>;

  // Helper method for building complex queries
  protected buildComplexQuery(options: QueryOptions & FilterOptions): any {
    const query: any = {
      where: {
        ...(this.softDeleteEnabled && { deletedAt: null }),
        ...options.where,
      },
    };

    if (options.include) query.include = options.include;
    if (options.select) query.select = options.select;
    if (options.orderBy) query.orderBy = options.orderBy;
    if (options.skip !== undefined) query.skip = options.skip;
    if (options.take !== undefined) query.take = Math.min(options.take, 100);
    if (options.cursor) query.cursor = options.cursor;

    return query;
  }
}

// Tenant-aware repository base class
export abstract class TenantRepository<T extends { 
  id: string; 
  tenantId: string; 
  createdAt: Date; 
  updatedAt: Date; 
}> extends BaseRepository<T> {

  async findByIdWithTenant(
    id: string, 
    tenantId: string, 
    options: QueryOptions = {}
  ): Promise<T | null> {
    const whereConditions = {
      ...options.where,
      ...TenantIsolation.enforceFilter(tenantId),
    };

    return await this.findById(id, { ...options, where: whereConditions });
  }

  async findManyByTenant(
    tenantId: string,
    options: QueryOptions & {
      page?: number;
      limit?: number;
      search?: string;
      filters?: FilterOptions;
    } = {}
  ): Promise<PaginatedResponse<T>> {
    const whereConditions = {
      ...options.where,
      ...TenantIsolation.enforceFilter(tenantId),
    };

    return await this.findMany({ ...options, where: whereConditions });
  }

  async createWithTenant(tenantId: string, data: any, userId?: string): Promise<T> {
    const dataWithTenant = {
      ...data,
      tenantId,
    };

    return await this.create(dataWithTenant, userId);
  }

  async updateWithTenant(
    id: string, 
    tenantId: string, 
    data: any, 
    userId?: string
  ): Promise<T> {
    // Validate tenant access first
    const hasAccess = await TenantIsolation.validateTenantAccess(
      this.modelName, 
      id, 
      tenantId
    );

    if (!hasAccess) {
      throw new DatabaseError('Access denied to resource', 'ACCESS_DENIED');
    }

    return await this.update(id, data, userId);
  }

  async deleteWithTenant(id: string, tenantId: string, userId?: string): Promise<T> {
    // Validate tenant access first
    const hasAccess = await TenantIsolation.validateTenantAccess(
      this.modelName, 
      id, 
      tenantId
    );

    if (!hasAccess) {
      throw new DatabaseError('Access denied to resource', 'ACCESS_DENIED');
    }

    return await this.delete(id, userId);
  }

  async countByTenant(tenantId: string, filters: FilterOptions = {}): Promise<number> {
    const filtersWithTenant = {
      ...filters,
      tenantId,
    };

    return await this.count(filtersWithTenant);
  }
}